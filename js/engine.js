// UNDERSTORY — AudioWorklet engine
// A pool of spatial voices. Every voice is a generator (modal, drone, grain,
// tick, chirp, noise) followed by a 3D spatialiser: each ear reads the voice
// from its own delay line at (distance to that ear / speed of sound), so
// interaural time difference and doppler fall out of the geometry. Head
// shadow, rear and below darkening, air absorption and a distance-dependent
// reverb send give direction and depth. Master: FDN reverb, look-ahead
// limiter, recorder tap.

const TAU = Math.PI * 2;
const SR = sampleRate;
const C_SOUND = 343;
const BUF = 8192, BMASK = BUF - 1;
const MAXV = 56;
const EAR = 0.0875;
const BLK = 128;

let rs = 0x9e3779b9 | 0;
function rnd() { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; }
function nrnd() { return rnd() * 2 - 1; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function arr4(a, d) { const o = new Float32Array(4); for (let i = 0; i < 4; i++) o[i] = (a && isFinite(a[i])) ? a[i] : d[i]; return o; }

const MAT = [new Float32Array(SR), new Float32Array(SR)];
const LAYERS = new Float32Array([1, 1, 1, 1, 1, 1]);

// ---------------------------------------------------------------- generators
class Voice {
  constructor() {
    this.buf = new Float32Array(BUF);
    this.w = 0;
    this.out = new Float32Array(BLK);
    this.grains = [];
    for (let i = 0; i < 12; i++) this.grains.push({ on: false, ph: 0, inc: 1, len: 1, t: 0, amp: 0, pan: 0 });
    this.mre = new Float32Array(4); this.mim = new Float32Array(4);
    this.mcr = new Float32Array(4); this.mci = new Float32Array(4); this.ma = new Float32Array(4);
    this.ph = new Float64Array(8);
    this.reset();
  }
  reset() {
    this.on = false; this.id = -1; this.k = 0; this.age = 0; this.env = 0; this.gate = 0;
    this.buf.fill(0); this.w = 0;
    this.px = 0; this.py = 0; this.pz = 0; this.tx = 0; this.ty = 0; this.tz = 0;
    this.dL = 0; this.dR = 0; this.gL = 0; this.gR = 0; this.cL = 0.5; this.cR = 0.5;
    this.lL = 0; this.lR = 0; this.rv = 0; this.rvL = 0; this.rvR = 0; this.first = true;
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0; this.n1 = 0; this.n2 = 0;
    this.mre.fill(0); this.mim.fill(0); this.ph.fill(0);
    for (const g of this.grains) g.on = false;
  }
  start(id, k, p) {
    this.reset();
    this.on = true; this.id = id; this.k = k; this.gate = 1;
    this.gain = num(p.gain, 0.3); this.layer = clamp(num(p.layer, 0) | 0, 0, 5);
    this.att = Math.max(0.001, num(p.att, 0.01)); this.rel = Math.max(0.005, num(p.rel, 0.4));
    this.dur = num(p.dur, 0); this.send = num(p.send, 0.5);
    this.tx = this.px = num(p.x, 0); this.ty = this.py = num(p.y, 0); this.tz = this.pz = num(p.z, 0);
    this.prio = num(p.prio, 1);
    this.cg = this.gain; this.p = {};
    this.set(p, true);
    if (k === 0) this.strike(num(p.hard, 0.5), 1);
    if (k === 4) { this.spk = 0; this.nextSpk = 0; this.blipT = -1; }
  }
  set(p, init) {
    const q = this.p;
    if (p.gain !== undefined) this.gain = num(p.gain, this.gain);
    if (p.send !== undefined) this.send = num(p.send, this.send);
    switch (this.k) {
      case 0: // MODAL
        if (init) {
          q.f = num(p.f, 220); q.r = arr4(p.r, [1, 2.76, 5.4, 8.93]); q.d = arr4(p.d, [1.2, 0.6, 0.3, 0.15]);
          q.a = arr4(p.a, [1, 0.5, 0.25, 0.12]);
          let life = 0;
          for (let i = 0; i < 4; i++) {
            const f = q.f * q.r[i];
            const R = Math.exp(-1 / (Math.max(0.005, q.d[i]) * SR));
            const w = TAU * f / SR;
            if (f > SR * 0.45 || f < 15) { this.ma[i] = 0; } else { this.ma[i] = q.a[i]; life = Math.max(life, q.d[i]); }
            this.mcr[i] = R * Math.cos(w); this.mci[i] = R * Math.sin(w);
          }
          q.life = life * 7 + 0.05;
          q.ex = 0; q.exL = 1; q.exA = 0; q.exLp = 0.5; q.exS = 0;
        }
        if (p.strike) this.strike(num(p.hard, 0.5), num(p.strike, 1));
        break;
      case 1: // DRONE
        if (init) {
          q.f = num(p.f, 110); q.ft = q.f; q.r = arr4(p.r, [1, 2, 3, 4]); q.a = arr4(p.a, [1, 0.4, 0.2, 0.1]);
          q.ac = new Float32Array(q.a); q.det = num(p.det, 4); q.breath = num(p.breath, 0.1); q.bq = num(p.bq, 6);
          q.trate = num(p.trate, 0.1); q.tdep = num(p.tdep, 0.1); q.bright = num(p.bright, 0.5); q.inh = num(p.inh, 0);
          q.inhc = q.inh; q.brc = q.bright; q.glide = num(p.glide, 2); q.sw = 1; q.swt = 1; q.swT = 0; q.tph = rnd();
          q.vib = num(p.vib, 0.002); q.vph = rnd(); q.flash = 0;
          for (let i = 0; i < 8; i++) this.ph[i] = rnd();
        } else {
          if (p.f !== undefined) q.ft = num(p.f, q.ft);
          if (p.glide !== undefined) q.glide = num(p.glide, q.glide);
          if (p.a) q.a = arr4(p.a, q.a);
          if (p.r) q.r = arr4(p.r, q.r);
          for (const k of ['breath', 'bq', 'trate', 'tdep', 'bright', 'inh', 'det', 'vib']) if (p[k] !== undefined) q[k] = num(p[k], q[k]);
          if (p.flash) q.flash = Math.min(1.5, q.flash + num(p.flash, 0));
        }
        break;
      case 2: // GRAIN
        if (init) {
          q.slot = clamp(num(p.slot, 0) | 0, 0, 1); q.dens = num(p.dens, 12); q.size = num(p.size, 0.12);
          q.pitch = num(p.pitch, 1); q.ps = Array.isArray(p.ps) && p.ps.length ? p.ps.map(x => num(x, 1)) : [1];
          q.pos = num(p.pos, rnd()); q.pj = num(p.pj, 0.05); q.scan = num(p.scan, 0.01); q.lp = num(p.lp, 0.6);
          q.rev = num(p.rev, 0); q.acc = 0; q.lps = 0; q.lps2 = 0;
        } else {
          for (const k of ['dens', 'size', 'pitch', 'pj', 'scan', 'lp', 'rev', 'pos']) if (p[k] !== undefined) q[k] = num(p[k], q[k]);
          if (Array.isArray(p.ps) && p.ps.length) q.ps = p.ps.map(x => num(x, 1));
          if (p.slot !== undefined) q.slot = clamp(num(p.slot, 0) | 0, 0, 1);
        }
        break;
      case 3: // TICK
        if (init) { q.rate = num(p.rate, 6); q.f = num(p.f, 3000); q.q = num(p.q, 8); q.jit = num(p.jit, 0.3); q.burst = num(p.burst, 0.2); q.imp = 0; q.cf = q.f; q.pend = 0; }
        else for (const k of ['rate', 'f', 'q', 'jit', 'burst']) if (p[k] !== undefined) q[k] = num(p[k], q[k]);
        break;
      case 4: // CHIRP (spike word)
        if (init) {
          q.f0 = num(p.f0, 800); q.f1 = num(p.f1, 1200); q.mr = num(p.mr, 1.41); q.mi = num(p.mi, 1);
          q.n = clamp(num(p.n, 3) | 0, 1, 24); q.isi = Math.max(0.01, num(p.isi, 0.09)); q.bd = Math.max(0.004, num(p.bd, 0.04));
          q.sw = num(p.sw, 0.15); q.cp = 0; q.mp = 0;
        }
        break;
      case 5: // NOISE
        if (init) {
          q.bf = num(p.bf, 800); q.bq = num(p.bq, 1); q.lp = num(p.lp, 0.5); q.srate = num(p.srate, 0.05); q.sdep = num(p.sdep, 0.5);
          q.gust = num(p.gust, 0.3); q.drops = num(p.drops, 0); q.df = num(p.df, 2000); q.crk = num(p.crk, 0);
          q.sph = rnd(); q.gv = 1; q.gt = 1; q.gT = 0; q.dph = 0; q.denv = 0; q.dfr = 0; q.dglide = 0; q.b0 = 0; q.b1 = 0; q.b2 = 0;
          q.cr = 0; q.crs1 = 0; q.crs2 = 0;
        } else for (const k of ['bf', 'bq', 'lp', 'srate', 'sdep', 'gust', 'drops', 'df', 'crk']) if (p[k] !== undefined) q[k] = num(p[k], q[k]);
        break;
    }
  }
  strike(hard, amt) {
    const q = this.p;
    q.exL = Math.max(8, Math.round((0.0004 + (1 - hard) * 0.006) * SR));
    q.ex = q.exL; q.exA = clamp(amt, 0, 2) / Math.sqrt(q.exL) * 0.9; q.exLp = 0.08 + hard * 0.9;
    q.life = Math.max(q.life, this.age / SR + 0.1);
    if (this.k === 0) q.lifeEnd = this.age / SR + q.life;
  }
  release(t) { this.gate = 0; if (t !== undefined) this.rel = Math.max(0.005, t); }

  render(n) {
    const o = this.out, q = this.p;
    switch (this.k) {
      case 0: {
        for (let i = 0; i < n; i++) {
          let x = 0;
          if (q.ex > 0) {
            const t = 1 - q.ex / q.exL; const w = Math.sin(Math.PI * t);
            q.exS += q.exLp * (nrnd() - q.exS); x = q.exS * w * q.exA; q.ex--;
          }
          let y = 0;
          for (let m = 0; m < 4; m++) {
            if (this.ma[m] === 0) continue;
            const re = this.mre[m], im = this.mim[m];
            const nr = re * this.mcr[m] - im * this.mci[m] + x;
            const ni = re * this.mci[m] + im * this.mcr[m];
            this.mre[m] = nr; this.mim[m] = ni; y += ni * this.ma[m];
          }
          o[i] = y * 0.35;
        }
        if (q.lifeEnd === undefined) q.lifeEnd = q.life;
        if (this.age / SR > q.lifeEnd) this.gate = 0, this.rel = 0.02;
        break;
      }
      case 1: {
        const gk = 1 - Math.exp(-n / (Math.max(0.01, q.glide) * SR));
        q.f += (q.ft - q.f) * gk;
        const sk = 1 - Math.exp(-n / (0.6 * SR));
        q.inhc += (q.inh - q.inhc) * sk; q.brc += (q.bright - q.brc) * sk;
        for (let i = 0; i < 4; i++) q.ac[i] += (q.a[i] - q.ac[i]) * sk;
        q.swT -= n / SR;
        if (q.swT <= 0) { q.swt = 0.55 + rnd() * 0.6; q.swT = 2 + rnd() * 6; }
        q.sw += (q.swt - q.sw) * (1 - Math.exp(-n / (2.5 * SR)));
        q.flash *= Math.exp(-n / (1.2 * SR));
        const br = clamp(q.brc + q.flash * 0.4, 0, 1);
        const lpc = 1 - Math.exp(-TAU * (180 + br * br * 9000) / SR);
        const det = Math.pow(2, q.det / 1200) - 1;
        const bF = clamp(q.f * q.r[0] * 2, 40, SR * 0.42);
        const bg = Math.tan(Math.PI * bF / SR), bk = 1 / clamp(q.bq, 0.5, 30), ba1 = 1 / (1 + bg * (bg + bk)), ba2 = bg * ba1;
        for (let i = 0; i < n; i++) {
          q.vph += 0.21 / SR; q.tph += q.trate / SR;
          const vib = 1 + q.vib * Math.sin(TAU * q.vph);
          const trem = 1 - q.tdep * (0.5 + 0.5 * Math.sin(TAU * q.tph));
          let y = 0;
          for (let m = 0; m < 4; m++) {
            const rr = Math.pow(q.r[m], 1 + q.inhc * 0.12) * (1 + q.inhc * 0.02 * m);
            const f = q.f * rr * vib;
            if (f > SR * 0.45) continue;
            this.ph[m] += f / SR; if (this.ph[m] > 1) this.ph[m] -= 1;
            this.ph[m + 4] += f * (1 + det * (m + 1)) / SR; if (this.ph[m + 4] > 1) this.ph[m + 4] -= 1;
            y += q.ac[m] * (Math.sin(TAU * this.ph[m]) + 0.6 * Math.sin(TAU * this.ph[m + 4]));
          }
          // breath: band-passed noise
          const nz = nrnd();
          const v3 = nz - this.s2, v1 = ba1 * this.s1 + ba2 * v3, v2 = this.s2 + bg * v1;
          this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
          y = y * 0.32 + v1 * bk * q.breath * 1.4;
          this.s3 += lpc * (y - this.s3);
          o[i] = this.s3 * trem * q.sw * (1 + q.flash * 0.5);
        }
        break;
      }
      case 2: {
        const m = MAT[q.slot], L = m.length;
        if (L < 64) { o.fill(0, 0, n); break; }
        const gl = Math.max(32, Math.round(q.size * SR));
        const lpc = 1 - Math.exp(-TAU * (200 + q.lp * q.lp * 15000) / SR);
        for (let i = 0; i < n; i++) {
          q.acc += q.dens / SR;
          if (q.acc >= 1) {
            q.acc -= 1 + (rnd() - 0.5) * 0.6;
            for (const g of this.grains) if (!g.on) {
              const r = q.ps[(rnd() * q.ps.length) | 0] * q.pitch;
              g.on = true; g.t = 0; g.len = Math.round(gl * (0.7 + rnd() * 0.6));
              g.inc = r * (q.rev > 0 && rnd() < q.rev ? -1 : 1);
              g.ph = ((q.pos + nrnd() * q.pj) % 1 + 1) % 1 * L; g.amp = 0.6 + rnd() * 0.4; break;
            }
          }
          let y = 0;
          for (const g of this.grains) {
            if (!g.on) continue;
            const t = g.t / g.len; const w = Math.sin(Math.PI * t); const ww = w * w;
            let p = g.ph; p = ((p % L) + L) % L;
            const i0 = p | 0, fr = p - i0; const s = m[i0] + (m[(i0 + 1) % L] - m[i0]) * fr;
            y += s * ww * g.amp;
            g.ph += g.inc; g.t++;
            if (g.t >= g.len) g.on = false;
          }
          q.lps += lpc * (y - q.lps); q.lps2 += lpc * (q.lps - q.lps2);
          o[i] = q.lps2 * 0.55;
        }
        q.pos = (q.pos + q.scan * n / SR + 1) % 1;
        break;
      }
      case 3: {
        const tk = 1 / clamp(q.q, 0.5, 40);
        if (q.tg === undefined) q.tg = Math.tan(Math.PI * Math.min(0.42, q.cf / SR));
        for (let i = 0; i < n; i++) {
          let x = 0;
          if (rnd() < q.rate / SR) { q.pend = 1 + ((rnd() < q.burst) ? (2 + (rnd() * 5) | 0) : 0); }
          if (q.pend > 0 && rnd() < 0.004 * 48000 / SR + (q.pend > 1 ? 0.002 : 0)) {
            q.cf = clamp(q.f * (1 + nrnd() * q.jit), 30, SR * 0.42); q.tg = Math.tan(Math.PI * q.cf / SR);
            x = (rnd() * 0.6 + 0.4) * (rnd() < 0.5 ? -1 : 1); q.pend--;
          }
          const g = q.tg, a1 = 1 / (1 + g * (g + tk)), a2 = g * a1;
          const v3 = x - this.s2, v1 = a1 * this.s1 + a2 * v3, v2 = this.s2 + g * v1;
          this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
          o[i] = v1 * 1.6;
        }
        break;
      }
      case 4: {
        const tail = q.bd * 3;
        for (let i = 0; i < n; i++) {
          const t = (this.age + i) / SR;
          if (this.spk < q.n && t >= this.nextSpk) {
            this.blipT = 0; this.spk++;
            this.nextSpk = t + q.isi * (0.7 + rnd() * 0.6);
          }
          let y = 0;
          if (this.blipT >= 0) {
            const bt = this.blipT / q.bd;
            if (bt > 3) this.blipT = -1;
            else {
              const env = bt < 0.08 ? bt / 0.08 : Math.exp(-(bt - 0.08) * 2.6);
              const gl = Math.min(1, bt);
              const f = q.f0 + (q.f1 - q.f0) * gl;
              q.mp += f * q.mr / SR; if (q.mp > 1) q.mp -= 1;
              q.cp += (f + Math.sin(TAU * q.mp) * f * q.mi * env) / SR; q.cp -= Math.floor(q.cp);
              y = Math.sin(TAU * q.cp) * env;
              this.blipT += 1 / SR;
            }
          }
          o[i] = y * 0.5;
        }
        if (this.spk >= q.n && this.blipT < 0 && (this.age / SR) > this.nextSpk - q.isi + tail) { this.gate = 0; this.rel = 0.01; }
        break;
      }
      case 5: {
        q.gT -= n / SR;
        if (q.gT <= 0) { q.gt = 1 - q.gust + rnd() * q.gust * 1.6; q.gT = 0.5 + rnd() * 3; }
        q.gv += (q.gt - q.gv) * (1 - Math.exp(-n / (0.9 * SR)));
        q.sph += q.srate * n / SR;
        const bf = clamp(q.bf * Math.pow(2, q.sdep * Math.sin(TAU * q.sph) * 1.5) * (0.8 + 0.4 * q.gv), 30, SR * 0.4);
        const ng = Math.tan(Math.PI * Math.min(0.42, bf / SR)), nk = 1 / clamp(q.bq, 0.4, 30), na1 = 1 / (1 + ng * (ng + nk)), na2 = ng * na1;
        const lpc = 1 - Math.exp(-TAU * (100 + q.lp * q.lp * 14000) / SR);
        for (let i = 0; i < n; i++) {
          // pinkish noise
          const w = nrnd();
          q.b0 = 0.997 * q.b0 + 0.029591 * w; q.b1 = 0.985 * q.b1 + 0.032534 * w; q.b2 = 0.95 * q.b2 + 0.048056 * w;
          const pk = q.b0 + q.b1 + q.b2 + w * 0.05;
          const v3 = pk - this.s2, v1 = na1 * this.s1 + na2 * v3, v2 = this.s2 + ng * v1;
          this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
          this.s3 += lpc * (v1 * nk * 1.5 - this.s3);
          let y = this.s3 * q.gv * 1.6;
          if (q.drops > 0) {
            if (q.denv < 0.001 && rnd() < q.drops / SR) { q.denv = 0.3 + rnd() * 0.7; q.dfr = q.df * (0.5 + rnd()); q.dglide = 1 + rnd() * 2.5; }
            if (q.denv > 0.001) {
              q.dfr *= 1 + q.dglide / SR; q.dph += q.dfr / SR; q.dph -= Math.floor(q.dph);
              y += Math.sin(TAU * q.dph) * q.denv * 0.35; q.denv *= 1 - 70 / SR;
            }
          }
          if (q.crk > 0) {
            let x = 0; if (rnd() < q.crk / SR) x = nrnd();
            const c = 0.8; q.crs1 += c * (x - q.crs1); const hpx = x - q.crs1; y += hpx * 0.7;
          }
          o[i] = y;
        }
        break;
      }
      default: o.fill(0, 0, n);
    }
  }
}

// ---------------------------------------------------------------- reverb
class FDN {
  constructor() {
    this.N = 8; this.cap = 14000;
    this.lines = []; for (let i = 0; i < 8; i++) this.lines.push(new Float32Array(this.cap));
    this.idx = new Int32Array(8); this.len = new Int32Array(8); this.g = new Float32Array(8); this.lp = new Float32Array(8);
    this.pre = new Float32Array(8192); this.pw = 0; this.preLen = 1200;
    this.v = new Float32Array(8); this.ph = 0; this.hpL = 0; this.hpR = 0;
    this.base = [1123, 1291, 1447, 1613, 1777, 1949, 2129, 2311];
    this.configure(1, 3, 0.5, 0.03);
  }
  configure(size, rt, damp, pre) {
    this.size = clamp(size, 0.3, 2.6); this.rt = clamp(rt, 0.3, 14); this.dampV = clamp(damp, 0, 1);
    for (let i = 0; i < 8; i++) {
      this.len[i] = Math.min(this.cap - 20, Math.round(this.base[i] * this.size * SR / 48000));
      this.g[i] = Math.pow(10, -3 * this.len[i] / (SR * this.rt));
    }
    this.dc = 1 - Math.exp(-TAU * (1200 + (1 - this.dampV) * 11000) / SR);
    this.preLen = clamp(Math.round(clamp(pre, 0, 0.08) * SR), 1, 4000);
  }
  clear() { for (const l of this.lines) l.fill(0); this.pre.fill(0); this.lp.fill(0); this.hpL = this.hpR = 0; }
  process(inL, inR, oL, oR, n) {
    const v = this.v;
    for (let s = 0; s < n; s++) {
      // pre-delay (mono-ish mid + side kept)
      // L at [0..4095], R at [4096..8191]
      this.pre[this.pw] = inL[s]; this.pre[4096 + this.pw] = inR[s];
      const rp = (this.pw - this.preLen + 4096 * 4) & 4095;
      const rl = this.pre[rp], rr = this.pre[4096 + rp];
      this.pw = (this.pw + 1) & 4095;
      this.ph += 0.37 / SR; if (this.ph > 1) this.ph -= 1;
      const mod = Math.sin(TAU * this.ph) * 6;
      for (let i = 0; i < 8; i++) {
        const L = this.len[i]; let rpos = this.idx[i] - L;
        if (i === 0 || i === 5) {
          let fp = this.idx[i] - L - (i === 0 ? mod : -mod) - 8; while (fp < 0) fp += this.cap;
          const i0 = fp | 0, fr = fp - i0; const a = this.lines[i][i0 % this.cap], b = this.lines[i][(i0 + 1) % this.cap];
          v[i] = a + (b - a) * fr;
        } else { if (rpos < 0) rpos += this.cap; v[i] = this.lines[i][rpos]; }
        this.lp[i] += this.dc * (v[i] - this.lp[i]); v[i] = this.lp[i] * this.g[i];
      }
      // fast Hadamard
      for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) { const a = v[j], b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
      const k = 0.35355339;
      for (let i = 0; i < 8; i++) {
        const inj = (i & 1) ? rr * (i & 2 ? -1 : 1) : rl * (i & 4 ? -1 : 1);
        const val = v[i] * k + inj * 0.5;
        this.lines[i][this.idx[i]] = val; this.idx[i] = (this.idx[i] + 1) % this.cap;
      }
      let ol = (v[0] - v[2] + v[4] - v[6] + v[1] * 0.5 - v[7] * 0.5) * k;
      let or = (v[1] - v[3] + v[5] - v[7] + v[2] * 0.5 - v[6] * 0.5) * k;
      // high-pass ~90 Hz
      this.hpL += 0.0118 * (ol - this.hpL); this.hpR += 0.0118 * (or - this.hpR);
      oL[s] = ol - this.hpL; oR[s] = or - this.hpR;
    }
  }
}

// ---------------------------------------------------------------- processor
class UnderstoryEngine extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = []; for (let i = 0; i < MAXV; i++) this.voices.push(new Voice());
    this.map = new Map();
    this.rev = new FDN();
    this.lis = { x: 0, y: 0, z: 1.6, yaw: 0, tx: 0, ty: 0, tz: 1.6, tyaw: 0 };
    this.under = 0; this.underT = 0; this.absorb = 0; this.absorbT = 0;
    this.mode = 0; this.depth = 1; this.wet = 0.35; this.master = 0.8; this.fade = 0; this.fadeT = 1; this.fadeRate = 1 / (1.5 * SR);
    this.revInL = new Float32Array(BLK); this.revInR = new Float32Array(BLK);
    this.revOL = new Float32Array(BLK); this.revOR = new Float32Array(BLK);
    this.mixL = new Float32Array(BLK); this.mixR = new Float32Array(BLK);
    this.LA = Math.round(0.004 * SR); this.laL = new Float32Array(1024); this.laR = new Float32Array(1024); this.law = 0;
    this.lHeld = 1; this.lHold = 0; this.lEnv = 1; this.ceil = 0.891; this.attC = 1 - Math.exp(-4.6 / this.LA); this.relC = 1 - Math.exp(-1 / (0.18 * SR));
    this.dcL = 0; this.dcR = 0; this.dcxL = 0; this.dcxR = 0;
    this.rec = false; this.recL = new Float32Array(16384); this.recR = new Float32Array(16384); this.recN = 0;
    this.mPeakL = 0; this.mPeakR = 0; this.mGR = 1; this.mCnt = 0; this.mRmsL = 0; this.mRmsR = 0;
    this.freed = [];
    this.port.onmessage = (e) => this.onMsg(e.data);
  }
  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'spawn': {
        let v = this.voices.find(v => !v.on);
        if (!v) {
          // steal lowest priority / oldest voice, never one of higher priority
          let best = null, bs = Infinity;
          for (const c of this.voices) { const sc = c.prio * 1e6 - c.age / SR + (c.gate ? 0 : -1e5); if (sc < bs) { bs = sc; best = c; } }
          if (best && best.prio <= num(m.p && m.p.prio, 1)) { this.map.delete(best.id); this.freed.push(best.id); v = best; }
        }
        if (!v) { this.freed.push(m.id); return; }
        v.start(m.id, m.k | 0, m.p || {}); this.map.set(m.id, v); break;
      }
      case 'set': { const v = this.map.get(m.id); if (v) v.set(m.p || {}, false); break; }
      case 'rel': { const v = this.map.get(m.id); if (v) v.release(m.r); break; }
      case 'pos': {
        const a = m.a; if (!a) return;
        for (let i = 0; i + 3 < a.length; i += 4) { const v = this.map.get(a[i]); if (v) { v.tx = num(a[i + 1], v.tx); v.ty = num(a[i + 2], v.ty); v.tz = num(a[i + 3], v.tz); } }
        break;
      }
      case 'lis': { const l = this.lis; l.tx = num(m.x, l.tx); l.ty = num(m.y, l.ty); l.tz = num(m.z, l.tz); l.tyaw = num(m.yaw, l.tyaw); break; }
      case 'mat': { if (m.data instanceof Float32Array && m.data.length > 64) MAT[clamp(m.slot | 0, 0, 1)] = m.data; break; }
      case 'g': {
        if (m.mode !== undefined) this.mode = m.mode | 0;
        if (m.depth !== undefined) this.depth = clamp(num(m.depth, 1), 0.2, 2.5);
        if (m.wet !== undefined) this.wet = clamp(num(m.wet, 0.3), 0, 1.5);
        if (m.master !== undefined) this.master = clamp(num(m.master, 0.8), 0, 1.5);
        if (m.under !== undefined) this.underT = clamp(num(m.under, 0), 0, 1);
        if (m.absorb !== undefined) this.absorbT = clamp(num(m.absorb, 0), 0, 1);
        if (m.layers) for (let i = 0; i < 6; i++) LAYERS[i] = clamp(num(m.layers[i], 1), 0, 2);
        if (m.rev) this.rev.configure(num(m.rev.size, 1), num(m.rev.rt, 3), num(m.rev.damp, 0.5), num(m.rev.pre, 0.03));
        break;
      }
      case 'fade': this.fadeT = clamp(num(m.to, 1), 0, 1); this.fadeRate = 1 / (Math.max(0.01, num(m.time, 1)) * SR); break;
      case 'kill': for (const v of this.voices) if (v.on) { this.freed.push(v.id); v.on = false; v.reset(); } this.map.clear(); break;
      case 'calm': this.rev.clear(); for (const v of this.voices) { v.buf.fill(0); } this.fade = 0; this.fadeT = 1; this.fadeRate = 1 / (2 * SR); break;
      case 'rec': this.rec = !!m.on; if (!this.rec) this.flushRec(true); break;
      case 'seedrng': rs = (num(m.s, 1) | 0) || 1; break;
    }
  }
  flushRec(final) {
    if (this.recN > 0) {
      const l = this.recL.slice(0, this.recN), r = this.recR.slice(0, this.recN);
      this.port.postMessage({ t: 'rec', l, r, final }, [l.buffer, r.buffer]); this.recN = 0;
    } else if (final) this.port.postMessage({ t: 'rec', l: new Float32Array(0), r: new Float32Array(0), final: true });
  }
  hardReset() {
    for (const v of this.voices) if (v.on) { this.freed.push(v.id); v.reset(); }
    this.map.clear(); this.rev.clear(); this.laL.fill(0); this.laR.fill(0); this.lEnv = 1; this.lHeld = 1;
    this.dcL = this.dcR = this.dcxL = this.dcxR = 0; this.fade = 0; this.fadeT = 1;
    this.port.postMessage({ t: 'reset' });
  }
  process(inputs, outputs) {
    const out = outputs[0]; const OL = out[0], OR = out[1] || out[0]; const n = OL.length;
    const mixL = this.mixL, mixR = this.mixR, rvL = this.revInL, rvR = this.revInR;
    mixL.fill(0); mixR.fill(0); rvL.fill(0); rvR.fill(0);
    // listener smoothing
    const l = this.lis; const lk = 0.12;
    l.x += (l.tx - l.x) * lk; l.y += (l.ty - l.y) * lk; l.z += (l.tz - l.z) * lk;
    let dy = l.tyaw - l.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); l.yaw += dy * lk;
    const cy = Math.cos(l.yaw), sy = Math.sin(l.yaw);
    const depth = this.depth, bin = this.mode === 0;
    // listener underground: the world above is muffled through soil; snow cover absorbs highs and reverb
    this.under += (this.underT - this.under) * 0.01; this.absorb += (this.absorbT - this.absorb) * 0.004;
    const un = this.under, ab = this.absorb;
    for (const v of this.voices) {
      if (!v.on) continue;
      v.render(n);
      // envelope
      const o = v.out; v.cg += (v.gain - v.cg) * 0.08; const ga = v.cg * LAYERS[v.layer];
      const up = n / (v.att * SR), dn = n / (v.rel * SR);
      if (v.dur > 0 && v.age / SR >= v.dur) v.gate = 0;
      const e0 = v.env;
      v.env = v.gate ? Math.min(1, v.env + up) : Math.max(0, v.env - dn);
      const e1 = v.env;
      // position smoothing
      const pk = v.first ? 1 : 0.18;
      v.px += (v.tx - v.px) * pk; v.py += (v.ty - v.py) * pk; v.pz += (v.tz - v.pz) * pk;
      const dx = v.px - l.x, dyy = v.py - l.y, dz = v.pz - l.z;
      const rx = dx * cy - dyy * sy, ry = dx * sy + dyy * cy;
      const ex = rx * depth, ey = ry * depth, ez = dz * depth;
      const d = Math.max(0.25, Math.sqrt(ex * ex + ey * ey + ez * ez));
      const lat = clamp(ex / d, -1, 1), back = Math.max(0, -ey / d), below = Math.max(0, -ez / d);
      const dist = Math.min(d, 55);
      let dLt, dRt, gLt, gRt, fL, fR;
      const aboveGround = v.pz > 0.05 ? 1 : 0;
      const g = Math.pow(1.2 / Math.max(1.2, dist), 0.9) * (1 - 0.5 * un * aboveGround) * (1 + 0.6 * un * (1 - aboveGround));
      const air = 1 / (1 + dist / 35);
      const tone = (1 - 0.45 * back) * (1 - 0.3 * below) * air * (1 - 0.45 * ab) * (1 - 0.9 * un * aboveGround);
      if (bin) {
        const dl = Math.sqrt((ex + EAR) * (ex + EAR) + ey * ey + ez * ez), dr = Math.sqrt((ex - EAR) * (ex - EAR) + ey * ey + ez * ez);
        dLt = Math.min(dl, 55) / C_SOUND * SR; dRt = Math.min(dr, 55) / C_SOUND * SR;
        const sL = Math.max(0, lat), sR = Math.max(0, -lat);
        gLt = g * (1 - 0.42 * sL) * 0.78; gRt = g * (1 - 0.42 * sR) * 0.78;
        fL = 17000 * (1 - 0.82 * Math.pow(sL, 1.3)) * tone; fR = 17000 * (1 - 0.82 * Math.pow(sR, 1.3)) * tone;
      } else {
        dLt = dRt = dist / C_SOUND * SR;
        const th = (lat + 1) * Math.PI / 4;
        gLt = g * Math.cos(th); gRt = g * Math.sin(th);
        fL = fR = 17000 * tone;
      }
      dLt = clamp(dLt, 1, BUF - 4); dRt = clamp(dRt, 1, BUF - 4);
      const cLt = 1 - Math.exp(-TAU * Math.max(120, fL) / SR), cRt = 1 - Math.exp(-TAU * Math.max(120, fR) / SR);
      const rvt = v.send * Math.pow(1.2 / Math.max(1.2, dist), 0.35) * (0.3 + 0.7 * Math.min(1, dist / 18)) * (1 - 0.55 * ab) * (1 - 0.6 * un);
      if (v.first) { v.dL = dLt; v.dR = dRt; v.gL = gLt; v.gR = gRt; v.cL = cLt; v.cR = cRt; v.rv = rvt; v.first = false; }
      const ddL = (dLt - v.dL) / n, ddR = (dRt - v.dR) / n, dgL = (gLt - v.gL) / n, dgR = (gRt - v.gR) / n;
      const dcL = (cLt - v.cL) / n, dcR = (cRt - v.cR) / n, drv = (rvt - v.rv) / n, de = (e1 - e0) / n;
      let dL = v.dL, dR = v.dR, gL = v.gL, gR = v.gR, cL = v.cL, cR = v.cR, rv = v.rv, en = e0;
      const buf = v.buf; let w = v.w; let lL = v.lL, lR = v.lR;
      const pl = 0.5 - 0.4 * lat, pr = 0.5 + 0.4 * lat;
      for (let i = 0; i < n; i++) {
        en += de; dL += ddL; dR += ddR; gL += dgL; gR += dgR; cL += dcL; cR += dcR; rv += drv;
        const s = o[i] * ga * en * en;
        buf[w] = s;
        let p = w - dL; if (p < 0) p += BUF; let i0 = p | 0, fr = p - i0;
        const a = buf[i0 & BMASK], b = buf[(i0 + 1) & BMASK]; const sl = a + (b - a) * fr;
        p = w - dR; if (p < 0) p += BUF; i0 = p | 0; fr = p - i0;
        const c = buf[i0 & BMASK], dd = buf[(i0 + 1) & BMASK]; const sr = c + (dd - c) * fr;
        lL += cL * (sl - lL); lR += cR * (sr - lR);
        mixL[i] += lL * gL; mixR[i] += lR * gR;
        const rs_ = (sl + sr) * 0.5 * rv; rvL[i] += rs_ * pl; rvR[i] += rs_ * pr;
        w = (w + 1) & BMASK;
      }
      v.w = w; v.lL = lL; v.lR = lR; v.dL = dLt; v.dR = dRt; v.gL = gLt; v.gR = gRt; v.cL = cLt; v.cR = cRt; v.rv = rvt;
      v.age += n;
      if (!v.gate && v.env <= 0) { this.freed.push(v.id); this.map.delete(v.id); v.on = false; }
    }
    this.rev.process(rvL, rvR, this.revOL, this.revOR, n);
    const wet = this.wet, mg = this.master;
    let pkL = 0, pkR = 0, sqL = 0, sqR = 0, bad = false;
    for (let i = 0; i < n; i++) {
      let L = mixL[i] + this.revOL[i] * wet, R = mixR[i] + this.revOR[i] * wet;
      // DC block
      const yL = L - this.dcxL + 0.9995 * this.dcL; this.dcxL = L; this.dcL = yL;
      const yR = R - this.dcxR + 0.9995 * this.dcR; this.dcxR = R; this.dcR = yR;
      if (this.fade < this.fadeT) this.fade = Math.min(this.fadeT, this.fade + this.fadeRate); else if (this.fade > this.fadeT) this.fade = Math.max(this.fadeT, this.fade - this.fadeRate);
      const f = this.fade * this.fade * mg * 5.6;
      L = yL * f; R = yR * f;
      if (!(L === L) || !(R === R) || Math.abs(L) > 1e6 || Math.abs(R) > 1e6) { bad = true; L = R = 0; }
      // look-ahead limiter
      const pk = Math.max(Math.abs(L), Math.abs(R));
      const tgt = pk > this.ceil ? this.ceil / pk : 1;
      if (tgt < this.lHeld) { this.lHeld = tgt; this.lHold = this.LA; }
      else if (this.lHold > 0) this.lHold--;
      else this.lHeld += (1 - this.lHeld) * this.relC;
      if (this.lHeld < this.lEnv) this.lEnv += (this.lHeld - this.lEnv) * this.attC; else this.lEnv = this.lHeld;
      const ri = (this.law - this.LA + 1024) & 1023;
      this.laL[this.law] = L; this.laR[this.law] = R; this.law = (this.law + 1) & 1023;
      let oL = this.laL[ri] * this.lEnv, oR = this.laR[ri] * this.lEnv;
      oL = oL > 0.98 ? 0.98 : oL < -0.98 ? -0.98 : oL; oR = oR > 0.98 ? 0.98 : oR < -0.98 ? -0.98 : oR;
      OL[i] = oL; if (OR !== OL) OR[i] = oR;
      const aL = Math.abs(oL), aR = Math.abs(oR); if (aL > pkL) pkL = aL; if (aR > pkR) pkR = aR; sqL += oL * oL; sqR += oR * oR;
      if (this.rec) { this.recL[this.recN] = oL; this.recR[this.recN] = oR; this.recN++; if (this.recN >= this.recL.length) this.flushRec(false); }
    }
    if (bad) this.hardReset();
    this.mPeakL = Math.max(this.mPeakL, pkL); this.mPeakR = Math.max(this.mPeakR, pkR); this.mGR = Math.min(this.mGR, this.lEnv);
    this.mRmsL += sqL; this.mRmsR += sqR;
    if (++this.mCnt >= 12) {
      let nv = 0; for (const v of this.voices) if (v.on) nv++;
      this.port.postMessage({ t: 'm', pl: this.mPeakL, pr: this.mPeakR, gr: this.mGR, rl: Math.sqrt(this.mRmsL / (n * this.mCnt)), rr: Math.sqrt(this.mRmsR / (n * this.mCnt)), nv, freed: this.freed });
      this.freed = []; this.mPeakL = this.mPeakR = 0; this.mGR = 1; this.mCnt = 0; this.mRmsL = this.mRmsR = 0;
    } else if (this.freed.length > 24) { this.port.postMessage({ t: 'f', freed: this.freed }); this.freed = []; }
    return true;
  }
}
registerProcessor('understory-engine', UnderstoryEngine);
