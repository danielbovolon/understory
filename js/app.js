// UNDERSTORY — interface, 3D view, audio bridge, archive
'use strict';
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette
let PAL = {};
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  PAL = { soil: g('--soil'), humus: g('--humus'), line: g('--line'), bone: g('--bone'), dim: g('--dim'), hypha: g('--hypha'), spore: g('--spore'), alarm: g('--alarm'), geo: g('--geo'), night: g('--night'), dark: g('--glow') === '1' };
  paintPageLattice();
}
function paintPageLattice() {
  // a repeating flower-of-life lattice behind the whole page
  const r = 26, w = r, h = r * Math.sqrt(3); let c = '';
  for (let i = -2; i <= 3; i++) for (let j = -2; j <= 3; j++) { const x = i * w + (j % 2 ? w / 2 : 0); const y = j * h / 2; c += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}"/>`; }
  const col = encodeURIComponent(PAL.geo || '#888');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h.toFixed(3)}'><g fill='none' stroke='${col}' stroke-opacity='${PAL.dark ? 0.06 : 0.12}' stroke-width='0.7'>${c.replace(/"/g, "'")}</g></svg>`;
  document.body.style.backgroundImage = `url("data:image/svg+xml,${svg.replace(/#/g, '%23')}")`;
}

// ---------------------------------------------------------------- audio bridge
const audio = {
  ctx: null, node: null, started: false, mute: false, live: new Set(), nextId: 1, moves: [], meter: { pl: 0, pr: 0, rl: 0, rr: 0, gr: 1, nv: 0 }, onRec: null,
  get ready() { return this.started && !this.mute; },
  async ensureCtx() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC({ latencyHint: 'playback' }); }
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) { } }
    return this.ctx;
  },
  async start() {
    await this.ensureCtx();
    if (this.node) return;
    // single-file builds carry the engine inline; the repo version loads js/engine.js
    const inline = document.getElementById('engine-src');
    const url = inline ? URL.createObjectURL(new Blob([inline.textContent], { type: 'application/javascript' })) : new URL('js/engine.js', location.href).href;
    await this.ctx.audioWorklet.addModule(url);
    this.node = new AudioWorkletNode(this.ctx, 'understory-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => this.onMsg(e.data);
    this.post({ t: 'seedrng', s: (Math.random() * 2 ** 31) | 0 });
    this.started = true;
  },
  onMsg(m) {
    if (m.freed) for (const id of m.freed) this.live.delete(id);
    if (m.t === 'm') Object.assign(this.meter, m);
    else if (m.t === 'rec' && this.onRec) this.onRec(m);
    else if (m.t === 'reset') { this.live.clear(); if (world) world.dropVoices(); logLine('The engine caught an unstable value and reset itself.', 'weather'); }
  },
  post(m, tr) { if (this.node) this.node.port.postMessage(m, tr || []); },
  spawn(k, p) { if (!this.ready) return null; const id = this.nextId++; this.live.add(id); this.post({ t: 'spawn', id, k, p }); return id; },
  set(id, p) { if (id && this.live.has(id)) this.post({ t: 'set', id, p }); },
  rel(id, r) { if (id && this.live.has(id)) this.post({ t: 'rel', id, r }); },
  alive(id) { return !!id && this.live.has(id); },
  move(id, x, y, z) { if (id && this.live.has(id)) this.moves.push(id, x, y, z); },
  flush() { if (this.moves.length && this.node) { const a = new Float32Array(this.moves); this.post({ t: 'pos', a }, [a.buffer]); } this.moves.length = 0; },
  kill() { this.post({ t: 'kill' }); this.live.clear(); },
};

// ---------------------------------------------------------------- state
const P = { time: 1, growth: 1, chatter: 1, bloom: 1, mutation: 1, moisture: 0.5, wind: 0.4, depth: 1, spin: 0, wet: 0.45, room: 0.5, master: 0.8, layers: [1, 1, 1, 1, 0.8] };
const state = { running: false, everStarted: false, seed: null, mode: 0, follow: true, drift: false, tool: 'listen', matB: false, matBName: '', pregrow: false, walk: null, driftT: 0, recording: false };
let world = null;
const listener = { x: 0, y: 0, yaw: 0 };

function sendGlobals() {
  if (!audio.node || !state.seed) return;
  const rv = state.seed.rev;
  audio.post({ t: 'g', mode: state.mode, depth: P.depth, wet: P.wet, master: P.master, layers: P.layers, rev: { size: rv.size * (0.55 + P.room * 0.9), rt: rv.rt * (0.35 + P.room * 1.3), damp: rv.damp, pre: rv.pre } });
}
function sendMaterials() {
  if (!audio.ctx || !audio.node || !state.seed) return;
  const m = makeMaterial(state.seed, audio.ctx.sampleRate);
  audio.post({ t: 'mat', slot: 0, data: m }, [m.buffer]);
  if (!state.matB) { const m2 = makeMaterial({ ...state.seed, matParams: { ...state.seed.matParams, seed: state.seed.matParams.seed ^ 0x5bd1e995, mix: 1 - state.seed.matParams.mix } }, audio.ctx.sampleRate); audio.post({ t: 'mat', slot: 1, data: m2 }, [m2.buffer]); }
}

async function loadSeed(code) {
  const seed = makeSeed(code);
  if (audio.node) { audio.post({ t: 'fade', to: 0, time: 0.5 }); await new Promise(r => setTimeout(r, 560)); audio.kill(); }
  state.seed = seed;
  world = new World(seed, audio, { log: logLine, params: P });
  world.matB = state.matB;
  listener.x = 0; listener.y = 0; world.listener = listener; state.walk = null;
  // grow a few silent seconds so the first view already shows a young network
  state.pregrow = true; audio.mute = true;
  for (let i = 0; i < 520; i++) world.step(0.05);
  audio.mute = false; state.pregrow = false; world.dropVoices();
  $('log').innerHTML = '';
  $('seedCode').textContent = code;
  $('seedName').textContent = `${seed.name}, ${seed.mood}`;
  $('seedMeta').textContent = `${seed.tun.name} on ${seed.root.toFixed(1)} Hz · ${FAMILY_NAMES[seed.matParams.fams[0]]} + ${FAMILY_NAMES[seed.matParams.fams[1]]} · ${seed.species.length} fungal ${seed.species.length > 1 ? 'species' : 'species'} · room ${seed.rev.rt.toFixed(1)} s`;
  try { history.replaceState(null, '', '#' + code); } catch (e) { }
  if (audio.node) { sendGlobals(); sendMaterials(); if (state.running) audio.post({ t: 'fade', to: 1, time: 2.5 }); }
  logLine(`New seed ${code}: ${seed.nTrees} trees planted on the flower of life, ${seed.species.length} fungal individual${seed.species.length > 1 ? 's' : ''} in the soil.`, 'tree');
}

async function setRunning(on) {
  if (on) {
    try { await audio.start(); } catch (e) { setStatus('Audio could not start in this browser: ' + e.message); return; }
    if (!state.everStarted) { sendGlobals(); sendMaterials(); state.everStarted = true; }
    await audio.ensureCtx();
    audio.post({ t: 'fade', to: 1, time: 2.5 });
    state.running = true; $('hint').hidden = true;
  } else {
    state.running = false; audio.post({ t: 'fade', to: 0, time: 1.2 });
  }
  $('grow').setAttribute('aria-pressed', String(state.running));
  $('grow').textContent = state.running ? 'Pause' : 'Grow';
}

// ---------------------------------------------------------------- log + hud
const LOGC = { bond: 'hypha', fuse: 'hypha', touch: 'hypha', carbon: 'spore', fruit: 'spore', spore: 'spore', alarm: 'alarm', clash: 'alarm', cut: 'alarm', weather: 'dim', death: 'dim', tree: 'geo' };
let lastLog = {};
function logLine(text, cat) {
  if (state.pregrow) return;
  const now = performance.now();
  const gap = (cat === 'fuse' || cat === 'clash') ? 15000 : 2500;
  if (lastLog[cat] && now - lastLog[cat] < gap && cat !== 'tree' && cat !== 'touch') return;
  lastLog[cat] = now;
  const box = $('log'); const p = document.createElement('p');
  p.textContent = text; p.style.setProperty('--c', `var(--${LOGC[cat] || 'dim'})`);
  box.appendChild(p);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  [...box.children].forEach((c, i, a) => { c.style.opacity = String(0.35 + 0.65 * (i + 1) / a.length); });
}
function setStatus(t) { $('status').textContent = t || ''; }
function dayWord(ph) { const s = Math.sin(ph * TAU); if (Math.abs(s) < 0.2) return ph < 0.5 ? (ph < 0.25 ? 'dawn' : 'dusk') : (ph > 0.75 ? 'dawn' : 'dusk'); return s > 0 ? 'day' : 'night'; }
function updateHud() {
  if (!world) return;
  const w = world; const h = (6 + w.dayPhase * 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const wdeg = ((w.windDir * 180 / Math.PI) % 360 + 360) % 360; const wn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(wdeg / 45) % 8];
  let sig = w.signals.length;
  $('hud').innerHTML = `<span class="clock">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>
  <span>${dayWord(w.dayPhase)} · light <b>${Math.round(w.light * 100)}%</b></span>
  <span>${w.rainT > 0 ? '<b>raining</b> · ' : ''}moisture <b>${Math.round(Math.min(1, w.moist) * 100)}%</b></span>
  <span>wind <b>${(w.windStr * 3).toFixed(1)} m/s</b> from ${wn}</span>
  <span><b>${w.trees.length}</b> trees · <b>${w.genets.size}</b> fungi · <b>${w.edges.size}</b> hyphae · <b>${w.tips.length}</b> tips</span>
  <span><b>${sig}</b> signals · <b>${w.carbon.length}</b> sugar · <b>${w.fruits.length}</b> fruit · <b>${w.spores.length}</b> spores</span>
  <span>voices <b>${audio.started ? audio.meter.nv : 0}</b>/56</span>`;
}
function drawMeter() {
  const c = $('meter'), g = c.getContext('2d'); const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  const m = audio.meter; const db = (v) => clamp01((20 * Math.log10(Math.max(1e-5, v)) + 60) / 60);
  const bars = [[m.rl, m.pl], [m.rr, m.pr]];
  bars.forEach(([r, p], i) => {
    const y = 6 + i * 18; g.fillStyle = PAL.line; g.fillRect(0, y, W, 12);
    g.fillStyle = PAL.hypha; g.fillRect(0, y, W * db(r), 12);
    g.fillStyle = p > 0.85 ? PAL.alarm : PAL.spore; g.fillRect(W * db(p) - 2, y, 3, 12);
  });
  const gr = -20 * Math.log10(Math.max(1e-4, m.gr)); if (gr > 0.1) { g.fillStyle = PAL.alarm; g.fillRect(W - 4, 6, 4, Math.min(30, gr * 6)); }
  m.pl *= 0.85; m.pr *= 0.85; m.rl *= 0.9; m.rr *= 0.9;
}
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

// ---------------------------------------------------------------- camera
const cam = {
  yaw: 0, pitch: 0.92, dist: 36, tx: 0, ty: 0, tz: 0, f: 600, cx: 0, cy: 0,
  update(w, h) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), fx = Math.sin(this.yaw), fy = Math.cos(this.yaw);
    this.px = this.tx - fx * cp * this.dist; this.py = this.ty - fy * cp * this.dist; this.pz = this.tz + sp * this.dist;
    let Fx = this.tx - this.px, Fy = this.ty - this.py, Fz = this.tz - this.pz; let L = Math.hypot(Fx, Fy, Fz); Fx /= L; Fy /= L; Fz /= L;
    let Rx = Fy, Ry = -Fx; L = Math.hypot(Rx, Ry) || 1; Rx /= L; Ry /= L;
    this.F = [Fx, Fy, Fz]; this.R = [Rx, Ry, 0]; this.U = [Ry * Fz, -Rx * Fz, Rx * Fy - Ry * Fx];
    this.f = Math.min(w, h * 1.25) * 0.95; this.cx = w / 2; this.cy = h * 0.5;
  },
  proj(x, y, z) {
    const vx = x - this.px, vy = y - this.py, vz = z - this.pz; const F = this.F, R = this.R, U = this.U;
    const zc = vx * F[0] + vy * F[1] + vz * F[2]; if (zc < 0.5) return null;
    const s = this.f / zc;
    return [this.cx + (vx * R[0] + vy * R[1]) * s, this.cy - (vx * U[0] + vy * U[1] + vz * U[2]) * s, s, zc];
  },
  ground(sx, sy) {
    const a = (sx - this.cx) / this.f, b = -(sy - this.cy) / this.f; const F = this.F, R = this.R, U = this.U;
    const dx = F[0] + R[0] * a + U[0] * b, dy = F[1] + R[1] * a + U[1] * b, dz = F[2] + U[2] * b;
    if (dz > -1e-4) return null; const t = -this.pz / dz; return [this.px + dx * t, this.py + dy * t];
  },
};

// ---------------------------------------------------------------- scene
const scene = { cv: null, g: null, w: 0, h: 0, dpr: 1, motes: [], cutLine: null };
function resize() {
  const cv = scene.cv, r = cv.getBoundingClientRect(); scene.dpr = Math.min(2, window.devicePixelRatio || 1);
  scene.w = Math.max(10, r.width); scene.h = Math.max(10, r.height);
  cv.width = Math.round(scene.w * scene.dpr); cv.height = Math.round(scene.h * scene.dpr);
}
function hsl(h, s, l, a = 1) { return `hsla(${h.toFixed(0)},${s}%,${l}%,${a})`; }
function gcol(g, a = 1, boost = 0) { const h = g ? g.sp.hue : 150; return PAL.dark ? hsl(h, 70, 64 + boost * 12, a) : hsl(h, 70, 32 + boost * 6, a); }
function kinCol(t, a = 1) { const h = state.seed.kinHue + t.kin * 32; return PAL.dark ? hsl(h, 42, 62, a) : hsl(h, 50, 34, a); }

function groundCircle(g, x, y, r, z = 0, n = 64) {
  let first = true; g.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * TAU; const p = cam.proj(x + Math.sin(a) * r, y + Math.cos(a) * r, z); if (!p) { first = true; continue; } if (first) { g.moveTo(p[0], p[1]); first = false; } else g.lineTo(p[0], p[1]); }
}
function polyline(g, pts, z) {
  let first = true; g.beginPath();
  for (const q of pts) { const p = cam.proj(q[0], q[1], z); if (!p) { first = true; continue; } if (first) { g.moveTo(p[0], p[1]); first = false; } else g.lineTo(p[0], p[1]); }
}
function glowDot(g, x, y, r, col, glow) {
  if (glow && PAL.dark) { const gr = g.createRadialGradient(x, y, 0, x, y, r * 4); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 4, 0, TAU); g.fill(); }
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function draw(now) {
  const g = scene.g, w = world; if (!w) return;
  g.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  g.fillStyle = PAL.soil; g.fillRect(0, 0, scene.w, scene.h);
  cam.update(scene.w, scene.h);
  const add = PAL.dark ? 'lighter' : 'source-over';
  // ground disc
  groundCircle(g, 0, 0, PLOT_R + 0.6, 0, 96);
  g.fillStyle = PAL.dark ? 'rgba(40,52,34,0.28)' : 'rgba(255,255,255,0.45)'; g.fill();
  // flower of life
  g.lineWidth = 1;
  const fc = flowerCenters(PETAL);
  fc.forEach((c, i) => { groundCircle(g, c[0], c[1], PETAL, 0, 64); g.strokeStyle = PAL.geo; g.globalAlpha = i < 7 ? 0.32 : 0.2; g.stroke(); });
  g.globalAlpha = 0.3; groundCircle(g, 0, 0, PETAL * 3, 0, 120); g.stroke(); groundCircle(g, 0, 0, PETAL * 3 + 0.6, 0, 120); g.stroke(); g.globalAlpha = 1;
  // litter
  for (const l of w.litter) { groundCircle(g, l.x, l.y, 0.6 + l.a * 0.7, 0, 24); g.fillStyle = PAL.dark ? `rgba(120,90,50,${0.08 + l.a * 0.06})` : `rgba(110,80,40,${0.08 + l.a * 0.06})`; g.fill(); }
  // hyphae
  g.globalCompositeOperation = add; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const e of w.edges.values()) {
    const gn = w.genets.get(e.g); const mid = e.pts[(e.pts.length / 2) | 0]; const pm = cam.proj(mid[0], mid[1], -0.05); if (!pm) continue;
    const young = Math.min(1, (w.t - e.born) / 3);
    g.lineWidth = Math.max(0.5, (0.025 + 0.05 * Math.min(3, e.D)) * pm[2]);
    g.strokeStyle = gcol(gn, Math.min(1, (0.22 + 0.25 * Math.min(1, e.D) + 0.5 * e.act) * young * (PAL.dark ? 1 : 1.7)), e.act);
    polyline(g, e.pts, -0.05); g.stroke();
  }
  for (const tip of w.tips) {
    const gn = w.genets.get(tip.g); g.strokeStyle = gcol(gn, 0.55); const p0 = cam.proj(tip.x, tip.y, -0.05); if (!p0) continue;
    g.lineWidth = Math.max(0.5, 0.03 * p0[2]); polyline(g, tip.pts.length > 40 ? tip.pts.slice(-40) : tip.pts, -0.05); g.lineTo(p0[0], p0[1]); g.stroke();
    glowDot(g, p0[0], p0[1], Math.max(1.2, 0.07 * p0[2]), gcol(gn, 0.95, 1), true);
  }
  // nodes that fired
  for (const n of w.nodes.values()) {
    if (n.fl < 0.05 && n.edges.size < 3) continue; const p = cam.proj(n.x, n.y, -0.05); if (!p) continue;
    const gn = w.genets.get(n.genet);
    if (n.fl > 0.05) { g.strokeStyle = gcol(gn, n.fl * 0.8, 1); g.lineWidth = 1.2; g.beginPath(); g.arc(p[0], p[1], (0.2 + (1 - n.fl) * 0.9) * p[2], 0, TAU); g.stroke(); }
    if (n.edges.size >= 3 && n.type !== 'tree') { g.fillStyle = gcol(gn, 0.6); g.beginPath(); g.arc(p[0], p[1], Math.max(1, 0.06 * p[2]), 0, TAU); g.fill(); }
  }
  // signals and sugar
  for (const s of w.signals) { const p = cam.proj(s.x, s.y, -0.05); if (!p) continue; glowDot(g, p[0], p[1], Math.max(1.6, (s.alarm ? 0.14 : 0.1) * p[2]), s.alarm ? PAL.alarm : gcol(w.genets.get(s.g), 1, 1.5), true); }
  for (const c of w.carbon) { const p = cam.proj(c.x, c.y, 0); if (!p) continue; glowDot(g, p[0], p[1], Math.max(2, 0.17 * p[2]), PAL.spore, true); }
  g.globalCompositeOperation = 'source-over';
  // flashes
  for (const f of w.flashes) { groundCircle(g, f.x, f.y, 0.5 + (2 - f.t) * 1.5, 0, 32); g.strokeStyle = f.c === 'alarm' ? PAL.alarm : PAL.hypha; g.globalAlpha = Math.min(1, f.t) * 0.7; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1; }
  // sprites sorted by depth
  const spr = [];
  for (const t of w.trees) { const p = cam.proj(t.x, t.y, 0); if (p) spr.push([p[3], 'tree', t]); }
  for (const f of w.fruits) { const p = cam.proj(f.x, f.y, 0); if (p) spr.push([p[3], 'fruit', f]); }
  for (const s of w.spores) { const p = cam.proj(s.x, s.y, s.z); if (p) spr.push([p[3], 'spore', s]); }
  { const p = cam.proj(listener.x, listener.y, 0); if (p) spr.push([p[3], 'me', listener]); }
  spr.sort((a, b) => b[0] - a[0]);
  g.font = '500 10px "Martian Mono", ui-monospace, monospace'; g.textAlign = 'center';
  for (const [, k, o] of spr) {
    if (k === 'tree') drawTree(g, o, w);
    else if (k === 'fruit') drawFruit(g, o, w);
    else if (k === 'spore') { const p = cam.proj(o.x, o.y, o.z), q = cam.proj(o.x, o.y, 0); if (!p) continue; if (q) { g.strokeStyle = PAL.spore; g.globalAlpha = 0.18; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); g.globalAlpha = 1; } glowDot(g, p[0], p[1], Math.max(1.3, 0.07 * p[2]), PAL.spore, true); }
    else drawListener(g);
  }
  // wind motes
  const wx = Math.sin(w.windDir) * w.windStr * 3, wy = Math.cos(w.windDir) * w.windStr * 3;
  if (scene.motes.length < 46) for (let i = 0; i < 46; i++) scene.motes.push({ x: listener.x + (Math.random() - 0.5) * 40, y: listener.y + (Math.random() - 0.5) * 40, z: 1 + Math.random() * 6 });
  g.strokeStyle = PAL.bone; g.lineWidth = 1;
  for (const m of scene.motes) {
    const dt = 1 / 60; m.x += wx * dt; m.y += wy * dt;
    if (Math.hypot(m.x - listener.x, m.y - listener.y) > 22) { const a = Math.random() * TAU; m.x = listener.x - Math.sin(w.windDir) * 18 + Math.sin(a) * 10; m.y = listener.y - Math.cos(w.windDir) * 18 + Math.cos(a) * 10; }
    const p = cam.proj(m.x, m.y, m.z), q = cam.proj(m.x - wx * 0.25, m.y - wy * 0.25, m.z); if (!p || !q) continue;
    g.globalAlpha = 0.08 + w.windStr * 0.12; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
  g.globalAlpha = 1;
  // rain streaks
  if (w.rainT > 0) {
    g.strokeStyle = PAL.dark ? 'rgba(180,200,230,0.18)' : 'rgba(40,60,90,0.18)';
    g.beginPath(); for (let i = 0; i < 90; i++) { const x = Math.random() * scene.w, y = Math.random() * scene.h; g.moveTo(x, y); g.lineTo(x - 2, y + 9); } g.stroke();
  }
  // night
  const night = 1 - w.light; if (night > 0.02) { g.fillStyle = PAL.night; g.globalAlpha = night * (PAL.dark ? 0.32 : 0.14); g.fillRect(0, 0, scene.w, scene.h); g.globalAlpha = 1; }
  // cut line
  if (scene.cutLine) { const [a, b] = scene.cutLine; g.strokeStyle = PAL.alarm; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); }
  // compass
  drawCompass(g);
}
function drawTree(g, t, w) {
  const h = 1.8 + t.size * 2.6, rc = 0.7 + t.size * 0.9;
  const pg = cam.proj(t.x, t.y, 0), pt = cam.proj(t.x, t.y, h); if (!pg || !pt) return;
  // roots zone and rings
  for (let i = 1; i <= 3; i++) { groundCircle(g, t.x, t.y, t.size * 0.32 * i, 0, 28); g.strokeStyle = kinCol(t, 0.5 - i * 0.1); g.lineWidth = 1; g.stroke(); }
  if (t.hub) { groundCircle(g, t.x, t.y, 1.35, 0, 40); g.strokeStyle = PAL.spore; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
  // trunk
  g.strokeStyle = kinCol(t, 0.75); g.lineWidth = Math.max(1, 0.12 * t.size * pg[2]); g.beginPath(); g.moveTo(pg[0], pg[1]); g.lineTo(pt[0], pt[1]); g.stroke();
  // canopy
  groundCircle(g, t.x, t.y, rc, h, 36);
  const sug = clamp01(t.sugar / 2);
  g.fillStyle = kinCol(t, 0.12 + sug * 0.22 + t.flash * 0.25); g.fill();
  g.strokeStyle = t.defense > 0.2 ? PAL.alarm : kinCol(t, 0.9); g.lineWidth = 1 + t.flash * 1.5 + t.defense; g.stroke();
  if (t.stress > 0.1) { groundCircle(g, t.x, t.y, rc + 0.3 + Math.sin(performance.now() / 90) * 0.1, h, 36); g.strokeStyle = PAL.alarm; g.globalAlpha = t.stress; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1; }
  if (t.flash > 0.1 && PAL.dark) { g.globalCompositeOperation = 'lighter'; glowDot(g, pt[0], pt[1], Math.max(2, 0.2 * pt[2]), kinCol(t, t.flash * 0.6), true); g.globalCompositeOperation = 'source-over'; }
  g.fillStyle = PAL.dim; g.globalAlpha = 0.9; g.fillText((t.hub ? 'HUB · ' : '') + 'T' + t.id + (t.dying > 0 ? ' †' : ''), pt[0], pt[1] - Math.max(6, rc * pt[2] * 0.35) - 4); g.globalAlpha = 1;
}
function drawFruit(g, f, w) {
  const gn = w.genets.get(f.g); const s = 0.25 + f.size * 0.55;
  const pb = cam.proj(f.x, f.y, 0), pc = cam.proj(f.x, f.y, s); if (!pb || !pc) return;
  g.strokeStyle = PAL.bone; g.globalAlpha = 0.8; g.lineWidth = Math.max(1, 0.08 * pb[2]); g.beginPath(); g.moveTo(pb[0], pb[1]); g.lineTo(pc[0], pc[1]); g.stroke(); g.globalAlpha = 1;
  const r = (0.2 + f.size * 0.4) * pc[2];
  g.fillStyle = gcol(gn, 0.9, 0.5); g.beginPath(); g.ellipse(pc[0], pc[1], r, r * 0.55, 0, Math.PI, 0); g.fill();
  if (f.phase === 'spore') { g.strokeStyle = PAL.spore; g.lineWidth = 1; g.beginPath(); g.arc(pc[0], pc[1], r * (1.4 + Math.sin(performance.now() / 200) * 0.2), 0, TAU); g.stroke(); }
}
function drawListener(g) {
  const L = listener; const pg = cam.proj(L.x, L.y, 0), ph = cam.proj(L.x, L.y, 1.6); if (!pg || !ph) return;
  groundCircle(g, L.x, L.y, 3, 0, 48); g.strokeStyle = PAL.bone; g.globalAlpha = 0.18; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = PAL.bone; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(pg[0], pg[1]); g.lineTo(ph[0], ph[1]); g.stroke(); g.globalAlpha = 1;
  const r = Math.max(5, 0.32 * ph[2]);
  const fx = Math.sin(L.yaw), fy = Math.cos(L.yaw);
  const pn = cam.proj(L.x + fx * 0.9, L.y + fy * 0.9, 1.6);
  const pl = cam.proj(L.x - fy * 0.34, L.y + fx * 0.34, 1.6), pr = cam.proj(L.x + fy * 0.34, L.y - fx * 0.34, 1.6);
  g.fillStyle = PAL.soil; g.strokeStyle = PAL.bone; g.lineWidth = 1.6; g.beginPath(); g.arc(ph[0], ph[1], r, 0, TAU); g.fill(); g.stroke();
  if (pn) { g.beginPath(); g.moveTo(ph[0], ph[1]); g.lineTo(pn[0], pn[1]); g.stroke(); }
  g.fillStyle = PAL.hypha; for (const q of [pl, pr]) if (q) { g.beginPath(); g.arc(q[0], q[1], Math.max(2, r * 0.3), 0, TAU); g.fill(); }
  scene.head = [ph[0], ph[1], r];
}
function drawCompass(g) {
  const x = scene.w - 34, y = 28; const pN = cam.proj(cam.tx, cam.ty + 5, 0), p0 = cam.proj(cam.tx, cam.ty, 0); if (!pN || !p0) return;
  const a = Math.atan2(pN[0] - p0[0], -(pN[1] - p0[1]));
  g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = PAL.dim; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.stroke();
  g.fillStyle = PAL.spore; g.beginPath(); g.moveTo(0, -11); g.lineTo(3.5, 0); g.lineTo(-3.5, 0); g.closePath(); g.fill();
  g.fillStyle = PAL.dim; g.font = '500 9px "Martian Mono", monospace'; g.textAlign = 'center'; g.fillText('N', 0, -15); g.restore();
}

// ---------------------------------------------------------------- input
const TOOLS = [
  ['listen', 'Listen', 'Drag the floor to turn your head. Drag your head to walk. Click the floor to walk there.'],
  ['touch', 'Touch', 'Click a tree, node or hypha: it fires a spike train into the network.'],
  ['wound', 'Wound', 'Click a tree to wound it. It sends an alarm; trees that hear it harden their sound.'],
  ['plant', 'Plant', 'Click the floor to plant a seedling. It needs fungal partners to survive.'],
  ['sow', 'Sow spores', 'Click the floor to sow a new, mutated fungal individual.'],
  ['cut', 'Cut', 'Drag a line across hyphae to cut them. Click a tree to fell it: it pours its sugar into the network as it dies.'],
];
function buildTools() {
  const box = $('tools');
  TOOLS.forEach(([id, label, help], i) => {
    const b = document.createElement('button'); b.className = 'tool'; b.id = 'tool-' + id; b.title = help; b.setAttribute('aria-pressed', String(id === state.tool));
    b.innerHTML = `<kbd>${i + 1}</kbd>${label}`; b.onclick = () => setTool(id); box.appendChild(b);
  });
}
function setTool(id) {
  state.tool = id; $('stage').dataset.tool = id;
  for (const [t] of TOOLS) $('tool-' + t).setAttribute('aria-pressed', String(t === id));
  const t = TOOLS.find(x => x[0] === id); if (t) logHelp(t[2]);
}
let helpTimer = 0;
function logHelp(t) { const st = $('status'); void st; const box = $('log'); const p = document.createElement('p'); p.textContent = t; p.style.setProperty('--c', 'var(--bone)'); box.appendChild(p); while (box.children.length > 5) box.removeChild(box.firstChild); clearTimeout(helpTimer); }

function initInput() {
  const cv = scene.cv; let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); const p = pos(e);
    const tilt = e.button === 2 || e.shiftKey;
    const onHead = scene.head && Math.hypot(p[0] - scene.head[0], p[1] - scene.head[1]) < scene.head[2] + 12;
    drag = { x0: p[0], y0: p[1], x: p[0], y: p[1], moved: 0, tilt, head: onHead && state.tool === 'listen' && !tilt, yaw0: listener.yaw };
    if (state.tool === 'cut' && !tilt) scene.cutLine = [p, p];
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return; const p = pos(e); const dx = p[0] - drag.x, dy = p[1] - drag.y; drag.x = p[0]; drag.y = p[1]; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.tilt) { cam.pitch = Math.max(0.3, Math.min(1.5, cam.pitch + dy * 0.006)); if (!state.follow) cam.yaw += dx * 0.006; return; }
    if (state.tool === 'cut') { scene.cutLine = [[drag.x0, drag.y0], p]; return; }
    if (state.tool === 'listen') {
      if (drag.head) { const gp = cam.ground(p[0], p[1]); if (gp && Math.hypot(gp[0], gp[1]) < PLOT_R + 3) { listener.x = gp[0]; listener.y = gp[1]; state.walk = null; } }
      else listener.yaw -= dx * 0.007;
    }
  });
  const end = (e) => {
    if (!drag) return; const p = pos(e); const click = drag.moved < 6; const d = drag; drag = null;
    if (d.tilt) return;
    const gp = cam.ground(p[0], p[1]);
    if (state.tool === 'cut') {
      const a = cam.ground(d.x0, d.y0); scene.cutLine = null;
      if (click && gp) { const t = world.treeAt(gp[0], gp[1], 1.6); if (t) world.fell(t); }
      else if (a && gp) world.cut(a[0], a[1], gp[0], gp[1]);
      return;
    }
    if (!click || !gp) return;
    if (state.tool === 'listen' && !d.head) { if (Math.hypot(gp[0], gp[1]) < PLOT_R + 2) state.walk = { x: gp[0], y: gp[1] }; }
    else if (state.tool === 'touch') world.touch(gp[0], gp[1]);
    else if (state.tool === 'wound') { const t = world.treeAt(gp[0], gp[1], 1.8); if (t) world.stressTree(t, 'user'); }
    else if (state.tool === 'plant') { if (!world.plantAt(gp[0], gp[1])) logHelp('A seedling needs open ground inside the circle, away from other trunks (at most 12 trees).'); }
    else if (state.tool === 'sow') { if (!world.inoculate(gp[0], gp[1])) logHelp('Sow inside the circle. The soil holds at most 8 fungal individuals.'); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', () => { drag = null; scene.cutLine = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(10, Math.min(80, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  // keyboard
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); setRunning(!state.running); return; }
    if (k === 'n') { newSeed(); return; }
    if (k === 'r' && !e.metaKey && !e.ctrlKey) { toggleRec(); return; }
    if (k === 'h') { toggleMode(); return; }
    if (k >= '1' && k <= '6') { setTool(TOOLS[+k - 1][0]); return; }
    if ('wasdqe'.includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  state.keys = keys;
  // drop files onto the stage
  const st = $('stage');
  st.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').hidden = false; });
  st.addEventListener('dragleave', () => { $('drop').hidden = true; });
  st.addEventListener('drop', (e) => { e.preventDefault(); $('drop').hidden = true; const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) sowFile(f); });
}

// ---------------------------------------------------------------- sliders
function slider(box, o) {
  const row = document.createElement('div'); row.className = 'sl';
  const id = 'sl-' + o.id;
  row.innerHTML = `<label for="${id}">${o.label}</label><input type="range" id="${id}" min="${o.min}" max="${o.max}" step="${o.step || 0.01}" value="${o.get()}"><output for="${id}"></output>`;
  if (o.color) row.style.setProperty('--lc', o.color);
  row.title = o.help || '';
  const inp = row.querySelector('input'), out = row.querySelector('output');
  const show = () => { const v = +inp.value; out.textContent = o.fmt ? o.fmt(v) : v.toFixed(2); inp.style.setProperty('--p', ((v - o.min) / (o.max - o.min) * 100) + '%'); };
  inp.addEventListener('input', () => { o.set(+inp.value); show(); });
  inp.addEventListener('dblclick', () => { if (o.def !== undefined) { inp.value = o.def; o.set(o.def); show(); } });
  show(); box.appendChild(row);
}
const pct = (v) => Math.round(v * 100) + '%';
const mul = (v) => v.toFixed(2) + '×';
function buildSliders() {
  const eco = $('ecoS'), sp = $('spaceS'), la = $('layerS');
  const S = (box, id, label, min, max, def, fmt, help, after) => slider(box, { id, label, min, max, def, fmt, help, get: () => P[id], set: (v) => { P[id] = v; if (after) after(v); } });
  S(eco, 'time', 'Time', 0.25, 4, 1, mul, 'How fast the forest lives. Sound stays in real time; growth, flow and weather speed up.');
  S(eco, 'growth', 'Growth', 0, 2.5, 1, mul, 'Speed and branching of hyphal tips.');
  S(eco, 'chatter', 'Chatter', 0, 3, 1, mul, 'How often fungi fire spike trains on their own.');
  S(eco, 'bloom', 'Bloom', 0, 3, 1, mul, 'How readily fungi fruit when they are fed and the soil is wet.');
  S(eco, 'mutation', 'Mutation', 0, 3, 1, mul, 'How far a spore\'s offspring drifts from its parent in growth and voice.');
  S(eco, 'moisture', 'Moisture', 0, 1, 0.5, pct, 'Base soil moisture. Wet soil speeds growth and allows fruiting.');
  S(eco, 'wind', 'Wind', 0, 1, 0.4, pct, 'Wind strength: the wind voice and how far spores travel.');
  S(sp, 'depth', 'Distance', 0.3, 2.2, 1, mul, 'Scales every distance you hear: small makes the forest intimate, large makes it vast (more delay, doppler and reverb).', sendGlobals);
  S(sp, 'spin', 'Autopan', -1, 1, 0, (v) => (v === 0 ? 'off' : (v > 0 ? '↻ ' : '↺ ') + Math.abs(v * 14.3).toFixed(1) + '°/s'), 'Turns your head continuously so the whole field revolves around you.');
  S(sp, 'wet', 'Reverb', 0, 1.2, 0.45, pct, 'Level of the forest room.', sendGlobals);
  S(sp, 'room', 'Room', 0, 1, 0.5, pct, 'Size and decay of the room, around the seed\'s own character.', sendGlobals);
  S(sp, 'master', 'Volume', 0, 1.2, 0.8, pct, 'Master level, before the limiter.', sendGlobals);
  const names = [['Trees', 'spore'], ['Signals & sugar', 'hypha'], ['Growth', 'geo'], ['Fruit & spores', 'spore'], ['Weather & soil', 'dim']];
  names.forEach(([n, c], i) => slider(la, { id: 'layer' + i, label: n.split(' ')[0], min: 0, max: 1.5, def: 1, fmt: pct, help: n, color: `var(--${c})`, get: () => P.layers[i], set: (v) => { P.layers[i] = v; sendGlobals(); } }));
}

// ---------------------------------------------------------------- recording
const rec = { chunks: [], frames: 0, peaks: [], t0: 0, sr: 48000, pending: false };
function toggleRec() {
  if (!state.recording) {
    if (!audio.started) { setRunning(true).then(() => { if (audio.started) toggleRec(); }); return; }
    rec.chunks = []; rec.frames = 0; rec.peaks = []; rec.t0 = performance.now(); rec.sr = audio.ctx.sampleRate; rec.pending = true;
    audio.onRec = onRecChunk; audio.post({ t: 'rec', on: true }); state.recording = true;
  } else { audio.post({ t: 'rec', on: false }); state.recording = false; setStatus('Saving the take…'); }
  $('rec').setAttribute('aria-pressed', String(state.recording)); $('recTxt').textContent = state.recording ? 'Stop' : 'Record';
}
function onRecChunk(m) {
  const l = m.l, r = m.r, n = l.length;
  if (n) {
    const b = new Uint8Array(n * 6); let o = 0, pk = 0;
    for (let i = 0; i < n; i++) {
      for (const v of [l[i], r[i]]) { const s = Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607))); b[o++] = s & 255; b[o++] = (s >> 8) & 255; b[o++] = (s >> 16) & 255; }
      pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
      if ((rec.frames + i) % 1024 === 1023) { rec.peaks.push(pk); pk = 0; }
    }
    rec.chunks.push(b); rec.frames += n;
    if (rec.frames / rec.sr > 20 * 60 && state.recording) { toggleRec(); setStatus('Recording stopped at 20 minutes.'); }
  }
  if (m.final && rec.pending) { rec.pending = false; finishTake(); }
}
function wavHeader(frames, sr) {
  const data = frames * 6, b = new ArrayBuffer(44), v = new DataView(b); const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + data, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 6, true); v.setUint16(32, 6, true); v.setUint16(34, 24, true); s(36, 'data'); v.setUint32(40, data, true); return b;
}
async function finishTake() {
  if (rec.frames < rec.sr * 0.3) { setStatus('Take too short, not saved.'); return; }
  const blob = new Blob([wavHeader(rec.frames, rec.sr), ...rec.chunks], { type: 'audio/wav' });
  const peaks = new Array(600).fill(0); const pp = rec.peaks; for (let i = 0; i < pp.length; i++) { const j = Math.floor(i / pp.length * 600); peaks[j] = Math.max(peaks[j], pp[i]); }
  const n = takes.length + 1; const d = new Date();
  const t = { id: Date.now(), name: `${state.seed.name} ${String(n).padStart(2, '0')}`, created: d.toISOString(), seedCode: state.seed.code, seedName: `${state.seed.name}, ${state.seed.mood}`, tuning: state.seed.tun.name, dur: rec.frames / rec.sr, sr: rec.sr, peaks, blob, mode: state.mode ? 'speakers' : 'binaural' };
  rec.chunks = [];
  await db.put(t); takes.unshift(t); renderLib(); selectTake(t.id);
  setStatus(`Saved “${t.name}” (${fmtTime(t.dur)}, ${(blob.size / 1048576).toFixed(1)} MB).`);
}
function fmtTime(s) { const m = Math.floor(s / 60), ss = s - m * 60; return `${String(m).padStart(2, '0')}:${ss.toFixed(1).padStart(4, '0')}`; }

// ---------------------------------------------------------------- archive (IndexedDB, falls back to memory)
const db = {
  h: null, mem: [],
  async open() { try { this.h = await new Promise((res, rej) => { const r = indexedDB.open('understory', 1); r.onupgradeneeded = () => r.result.createObjectStore('takes', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { this.h = null; } },
  tx(mode) { return this.h.transaction('takes', mode).objectStore('takes'); },
  async all() { if (!this.h) return this.mem.slice(); try { return await new Promise((res, rej) => { const r = this.tx('readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); } catch (e) { return this.mem.slice(); } },
  async put(t) { if (!this.h) { this.mem = this.mem.filter(x => x.id !== t.id); this.mem.push(t); return; } try { await new Promise((res, rej) => { const r = this.tx('readwrite').put(t); r.onsuccess = res; r.onerror = () => rej(r.error); }); } catch (e) { this.mem.push(t); setStatus('This browser would not store the take; it is kept until you close the page. Save it now.'); } },
  async del(id) { this.mem = this.mem.filter(x => x.id !== id); if (!this.h) return; try { await new Promise((res) => { const r = this.tx('readwrite').delete(id); r.onsuccess = res; r.onerror = res; }); } catch (e) { } },
};
let takes = [];
const player = { id: null, buf: null, src: null, startAt: 0, offset: 0, playing: false, gain: null };
async function loadArchive() { await db.open(); takes = (await db.all()).sort((a, b) => b.id - a.id); renderLib(); if (takes[0]) selectTake(takes[0].id); }
function renderLib() {
  const lib = $('lib'); lib.innerHTML = '';
  $('saveAll').hidden = takes.length < 2 || !saver.ok;
  if (!takes.length) { lib.innerHTML = '<div class="empty">No takes yet. Press Record while the forest grows; the take lands here when you stop.</div>'; return; }
  for (const t of takes) {
    const el = document.createElement('div'); el.className = 'take'; el.setAttribute('aria-current', String(t.id === player.id));
    const d = new Date(t.created);
    el.innerHTML = `<input class="tn" id="tn-${t.id}" value="" aria-label="Take name"><div class="tm"></div><div class="ta"></div>`;
    const nm = el.querySelector('.tn'); nm.value = t.name; nm.addEventListener('change', async () => { t.name = nm.value.trim() || t.name; await db.put(t); if (player.id === t.id) drawPlayer(); });
    el.querySelector('.tm').textContent = `${fmtTime(t.dur)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · seed ${t.seedCode}`;
    el.querySelector('.tm').title = `${t.seedName} · ${t.tuning} · ${t.mode}`;
    const acts = el.querySelector('.ta');
    const B = (label, title, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.title = title; b.onclick = fn; acts.appendChild(b); return b; };
    B('Open', 'Show this take in the player', () => selectTake(t.id));
    if (saver.ok) B('Save', 'Save as 24-bit stereo WAV', () => saveTake(t));
    B('Soil', 'Feed this take back into the soil: fruit and bark voices will grow from it', () => takeToSoil(t));
    B('Regrow', `Plant seed ${t.seedCode} again`, () => { loadSeed(t.seedCode); });
    const del = B('✕', 'Delete this take', () => {
      if (del.dataset.arm) { db.del(t.id); takes = takes.filter(x => x.id !== t.id); if (player.id === t.id) { stopPlayer(); player.id = null; player.buf = null; drawPlayer(); } renderLib(); }
      else { del.dataset.arm = '1'; del.textContent = 'Delete?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.arm; del.textContent = '✕'; } }, 2500); }
    });
    lib.appendChild(el);
  }
}
function selectTake(id) { stopPlayer(); player.id = id; player.buf = null; player.offset = 0; renderLib(); drawPlayer(); $('pPlay').disabled = false; $('pSave').disabled = !saver.ok; }
async function decodeTake(t) { const ctx = await audio.ensureCtx(); const ab = await t.blob.arrayBuffer(); return await ctx.decodeAudioData(ab); }
async function togglePlay() {
  const t = takes.find(x => x.id === player.id); if (!t) return;
  if (player.playing) { player.offset += audio.ctx.currentTime - player.startAt; stopPlayer(true); return; }
  try { if (!player.buf) player.buf = await decodeTake(t); } catch (e) { setStatus('Could not decode this take.'); return; }
  const ctx = audio.ctx; if (!player.gain) { player.gain = ctx.createGain(); player.gain.connect(ctx.destination); }
  if (player.offset >= player.buf.duration) player.offset = 0;
  const s = ctx.createBufferSource(); s.buffer = player.buf; s.connect(player.gain); s.start(0, player.offset);
  s.onended = () => { if (player.src === s) { player.playing = false; player.offset = 0; $('pPlay').textContent = 'Play'; } };
  player.src = s; player.startAt = ctx.currentTime; player.playing = true; $('pPlay').textContent = 'Pause';
}
function stopPlayer(keep) { if (player.src) { const s = player.src; player.src = null; try { s.stop(); } catch (e) { } } player.playing = false; if (!keep) player.offset = 0; $('pPlay').textContent = 'Play'; }
function playerPos() { if (!player.playing) return player.offset; return player.offset + audio.ctx.currentTime - player.startAt; }
function drawPlayer() {
  const c = $('pwave'), r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(64 * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); const W = r.width, H = 64; g.clearRect(0, 0, W, H);
  const t = takes.find(x => x.id === player.id);
  if (!t) { $('pTime').textContent = 'no take selected'; g.strokeStyle = PAL.line; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); return; }
  const pos = playerPos(), frac = clamp01(pos / t.dur);
  for (let i = 0; i < W; i++) { const v = t.peaks[Math.floor(i / W * t.peaks.length)] || 0; const hh = Math.max(1, v * (H / 2 - 4)); g.fillStyle = i / W < frac ? PAL.spore : PAL.dim; g.globalAlpha = i / W < frac ? 0.95 : 0.55; g.fillRect(i, H / 2 - hh, 1, hh * 2); }
  g.globalAlpha = 1; g.fillStyle = PAL.bone; g.fillRect(frac * W, 0, 1, H);
  $('pTime').textContent = `${fmtTime(pos)} / ${fmtTime(t.dur)}`;
}
function seekPlayer(e) {
  const t = takes.find(x => x.id === player.id); if (!t) return; const r = $('pwave').getBoundingClientRect(); const f = clamp01((e.clientX - r.left) / r.width);
  const was = player.playing; stopPlayer(); player.offset = f * t.dur; if (was) togglePlay(); drawPlayer();
}

// ---------------------------------------------------------------- saving files (artifact: downloads capability; elsewhere: normal download)
const saver = { ok: true, dl: null, inArtifact: false };
async function initSaver() {
  if (window.claude && typeof window.claude.use === 'function') {
    saver.inArtifact = true; saver.ok = false; renderLib();
    try { saver.dl = await window.claude.use('downloads'); } catch (e) { saver.dl = null; }
    saver.ok = !!saver.dl; renderLib(); if (player.id) $('pSave').disabled = !saver.ok;
    if (!saver.ok) setStatus('Saving files is not available in this view. Your takes stay in the archive.');
  }
}
async function offerFile(filename, blob) {
  if (saver.inArtifact) {
    if (!saver.dl) return;
    let name = filename, data = blob;
    if (/\.wav$/i.test(filename)) { data = await zipStore([{ name: filename, blob }]); name = filename.replace(/\.wav$/i, '.zip'); }
    try { await saver.dl.save({ filename: name, data }); setStatus(`Saved ${name}` + (name !== filename ? ' (the WAV is inside the zip).' : '.')); }
    catch (e) { setStatus(e && e.code === 'declined' ? 'Save cancelled.' : 'Could not save: ' + ((e && e.message) || 'unavailable')); }
    return;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000);
  setStatus(`Saved ${filename}.`);
}
const safeName = (s) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'take';
function saveTake(t) { offerFile(`understory_${safeName(t.name)}_${t.seedCode}.wav`, t.blob); }
async function saveAll() {
  const files = takes.map(t => ({ name: `understory_${safeName(t.name)}_${t.seedCode}.wav`, blob: t.blob }));
  const manifest = takes.map(t => ({ file: `understory_${safeName(t.name)}_${t.seedCode}.wav`, name: t.name, created: t.created, seconds: +t.dur.toFixed(2), sampleRate: t.sr, bits: 24, channels: 2, seed: t.seedCode, forest: t.seedName, tuning: t.tuning, spatial: t.mode }));
  files.push({ name: 'understory-manifest.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) });
  const z = await zipStore(files);
  if (saver.inArtifact) { try { await saver.dl.save({ filename: 'understory-archive.zip', data: z }); setStatus('Saved understory-archive.zip.'); } catch (e) { setStatus('Save cancelled.'); } }
  else offerFile('understory-archive.zip', z);
}
let CRC_T = null;
function crc32(u8) { if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function zipStore(files) {
  const parts = [], central = []; let off = 0; const enc = new TextEncoder();
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()); const nm = enc.encode(f.name); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, nm, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, nm); off += 30 + nm.length + data.length;
  }
  let csize = 0; for (const c of central) csize += c.byteLength;
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

// ---------------------------------------------------------------- feeding sound into the soil
async function bufferToSoil(buf, label) {
  await audio.start();
  const sr = audio.ctx.sampleRate; const ch = buf.numberOfChannels; let n = buf.length; let start = 0;
  const maxN = sr * 24; if (n > maxN) { start = Math.floor((n - maxN) / 2); n = maxN; }
  const m = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) m[i] += d[start + i] / ch; }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(m[i])); const g = pk > 0 ? 0.85 / pk : 0; const fl = Math.min(n >> 2, Math.floor(sr * 0.05));
  for (let i = 0; i < n; i++) { let w = 1; if (i < fl) w = i / fl; else if (i > n - fl) w = (n - i) / fl; m[i] *= g * w; }
  audio.post({ t: 'mat', slot: 1, data: m }, [m.buffer]);
  state.matB = true; state.matBName = label; if (world) world.matB = true;
  // half of the bark-voiced trees switch to the new material now
  if (world) for (const t of world.trees) if (t.type === 'grain' && Math.random() < 0.6) audio.set(world.v.trees.get(t.id), { slot: 1 });
  logLine(`“${label}” is now in the soil. New fruit and bark voices grow from it.`, 'fruit');
}
async function sowFile(file) {
  try { const ctx = await audio.ensureCtx(); const buf = await ctx.decodeAudioData(await file.arrayBuffer()); await bufferToSoil(buf, file.name.replace(/\.[^.]+$/, '')); if (!state.running) setRunning(true); }
  catch (e) { setStatus('Could not read that file as audio.'); }
}
async function takeToSoil(t) { try { const buf = await decodeTake(t); await bufferToSoil(buf, t.name); } catch (e) { setStatus('Could not decode this take.'); } }

// ---------------------------------------------------------------- misc controls
function toggleMode() { state.mode = state.mode ? 0 : 1; $('modeBtn').textContent = state.mode ? 'Speakers stereo' : 'Headphones 3D'; sendGlobals(); }
function newSeed() { loadSeed(randomCode()); }

// ---------------------------------------------------------------- main loop
let last = 0, hudT = 0;
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (world) {
    if (state.running) {
      let sdt = dt * P.time; while (sdt > 0) { const s = Math.min(0.05, sdt); world.step(s); sdt -= s; }
      listener.yaw += P.spin * 0.25 * dt;
      // walking
      const k = state.keys || new Set(); const fx = Math.sin(listener.yaw), fy = Math.cos(listener.yaw);
      let mx = 0, my = 0; if (k.has('w')) { mx += fx; my += fy; } if (k.has('s')) { mx -= fx; my -= fy; } if (k.has('d')) { mx += fy; my -= fx; } if (k.has('a')) { mx -= fy; my += fx; }
      if (k.has('q')) listener.yaw -= 1.2 * dt; if (k.has('e')) listener.yaw += 1.2 * dt;
      if (mx || my) { listener.x += mx * 3 * dt; listener.y += my * 3 * dt; state.walk = null; }
      if (state.drift) driftStep(dt);
      if (state.walk) {
        const dx = state.walk.x - listener.x, dy = state.walk.y - listener.y, d = Math.hypot(dx, dy);
        if (d < 0.2) state.walk = null; else { const sp = Math.min(d, (state.drift ? 0.8 : 2.4) * dt); listener.x += dx / d * sp; listener.y += dy / d * sp; if (state.drift) { let a = Math.atan2(dx, dy) - listener.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); listener.yaw += a * 0.25 * dt; } }
      }
      const r = Math.hypot(listener.x, listener.y); if (r > PLOT_R + 3) { listener.x *= (PLOT_R + 3) / r; listener.y *= (PLOT_R + 3) / r; }
    }
    world.frameVoices();
    audio.post({ t: 'lis', x: listener.x, y: listener.y, z: 1.6, yaw: listener.yaw });
    audio.flush();
    // camera follows the head
    cam.tx += (listener.x - cam.tx) * 0.08; cam.ty += (listener.y - cam.ty) * 0.08;
    if (state.follow) { let a = listener.yaw - cam.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); cam.yaw += a * 0.12; }
    draw(ts);
  }
  hudT += dt; if (hudT > 0.25) { hudT = 0; updateHud(); }
  drawMeter();
  if (state.recording) $('rtime').textContent = fmtTime((performance.now() - rec.t0) / 1000);
  if (player.playing || hudT === 0) drawPlayer();
  requestAnimationFrame(frame);
}
function driftStep(dt) {
  state.driftT -= dt;
  if (state.driftT <= 0 || !state.walk) {
    state.driftT = 14 + Math.random() * 16;
    const w = world; const cands = [];
    for (const f of w.fruits) cands.push([f.x, f.y]);
    for (const s of w.signals.slice(0, 6)) cands.push([s.x, s.y]);
    const hub = w.trees.find(t => t.hub); if (hub) cands.push([hub.x, hub.y]);
    for (const t of w.trees) if (t.flash > 0.4 || t.stress > 0.3) cands.push([t.x, t.y]);
    if (!cands.length) { const a = Math.random() * TAU, d = Math.random() * PLOT_R * 0.7; cands.push([Math.sin(a) * d, Math.cos(a) * d]); }
    const c = cands[Math.floor(Math.random() * cands.length)]; const a = Math.random() * TAU;
    state.walk = { x: c[0] + Math.sin(a) * 3, y: c[1] + Math.cos(a) * 3 };
  }
}

// ---------------------------------------------------------------- boot
function boot() {
  readPalette();
  const mq = window.matchMedia('(prefers-color-scheme: light)'); mq.addEventListener && mq.addEventListener('change', readPalette);
  new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  scene.cv = $('scene'); scene.g = scene.cv.getContext('2d'); resize(); new ResizeObserver(resize).observe(scene.cv);
  buildTools(); buildSliders(); initInput();
  $('grow').onclick = () => setRunning(!state.running); $('hintGrow').onclick = () => setRunning(true);
  $('newSeed').onclick = newSeed; $('rec').onclick = toggleRec; $('modeBtn').onclick = toggleMode;
  $('seedCode').onclick = async () => { const c = state.seed.code; try { await navigator.clipboard.writeText(c); setStatus(`Seed code ${c} copied.`); } catch (e) { setStatus(`Seed code: ${c}`); } };
  $('rainBtn').onclick = () => world && world.startRain(45);
  $('deerBtn').onclick = () => world && world.trees.length && world.stressTree(world.trees[Math.floor(Math.random() * world.trees.length)], 'deer');
  $('sowBtn').onclick = () => $('sowFile').click(); $('sowFile').onchange = (e) => { const f = e.target.files[0]; if (f) sowFile(f); e.target.value = ''; };
  $('driftBtn').onclick = () => { state.drift = !state.drift; $('driftBtn').setAttribute('aria-pressed', String(state.drift)); state.walk = null; state.driftT = 0; };
  $('centreBtn').onclick = () => { state.walk = { x: 0, y: 0 }; state.drift = false; $('driftBtn').setAttribute('aria-pressed', 'false'); };
  $('calmBtn').onclick = () => { audio.post({ t: 'calm' }); logLine('Calm: reverb tails cleared, fading back in.', 'weather'); };
  $('followBtn').onclick = () => { state.follow = !state.follow; $('followBtn').setAttribute('aria-pressed', String(state.follow)); if (!state.follow) cam.yaw = 0; };
  $('zoomIn').onclick = () => { cam.dist = Math.max(10, cam.dist / 1.2); }; $('zoomOut').onclick = () => { cam.dist = Math.min(80, cam.dist * 1.2); };
  $('pPlay').onclick = togglePlay; $('pSave').onclick = () => { const t = takes.find(x => x.id === player.id); if (t) saveTake(t); };
  $('pwave').addEventListener('click', seekPlayer); $('saveAll').onclick = saveAll;
  const h = (location.hash || '').replace('#', '').toUpperCase();
  loadSeed(/^[A-Z0-9]{4,10}$/.test(h) ? h : randomCode());
  loadArchive(); initSaver();
  requestAnimationFrame(frame);
}
boot();
