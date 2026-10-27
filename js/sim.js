// UNDERSTORY — the living system
// Seeds, materials, and the ecology: trees photosynthesise, fungi grow
// hyphal tips that branch, fuse and bond to roots; sugar flows through the
// network by pressure (Physarum-style), used cords thicken and unused ones
// are pruned; nodes fire spike trains that travel along hyphae; stressed
// trees send alarms; fungi fruit, release spores on the wind, and spores
// germinate as new, mutated individuals.

const K = { MODAL: 0, DRONE: 1, GRAIN: 2, TICK: 3, CHIRP: 4, NOISE: 5 };
const LAYER = { TREES: 0, SIGNALS: 1, GROWTH: 2, FRUIT: 3, WEATHER: 4 };
const PLOT_R = 21, PETAL = 7;

// ------------------------------------------------------------ randomness
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function makeRng(seed) {
  const r = mulberry32(seed);
  const o = () => r();
  o.range = (a, b) => a + (b - a) * r();
  o.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  o.pick = (arr) => arr[Math.floor(r() * arr.length)];
  o.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  o.chance = (p) => r() < p;
  o.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return o;
}
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

// ------------------------------------------------------------ flower of life
function flowerCenters(r) {
  const c = [[0, 0]];
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.push([Math.sin(a) * r, Math.cos(a) * r]); }
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.push([Math.sin(a) * r * Math.sqrt(3), Math.cos(a) * r * Math.sqrt(3)]); }
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.push([Math.sin(a) * r * 2, Math.cos(a) * r * 2]); }
  return c;
}

// ------------------------------------------------------------ seeds
const TREE_NAMES = ['Larch', 'Stone pine', 'Beech', 'Birch', 'Alder', 'Spruce', 'Silver fir', 'Sessile oak', 'Hazel', 'Rowan', 'Yew', 'Chestnut', 'Juniper', 'Aspen', 'Hornbeam', 'Linden', 'Mountain ash', 'Dwarf pine'];
const PLACES = ['Moor', 'Hollow', 'Ridge', 'Scree', 'Bog', 'Gorge', 'Terrace', 'Clearing', 'Ravine', 'Meadow edge', 'Firn line', 'Talus', 'Riverbank', 'Cirque', 'Old orchard', 'Charcoal pit', 'Larch meadow'];
const MOODS = ['after rain', 'at first frost', 'in fog', 'in late light', 'under snow-melt', 'in high summer', 'at dusk', 'in thaw', 'in still air', 'in föhn wind', 'after fire', 'in moss'];
const FAMILIES = ['bark', 'rain', 'creek', 'wind', 'glass', 'choir', 'insects', 'stone', 'bowed', 'cave'];
const FAMILY_NAMES = { bark: 'knocked bark', rain: 'rain on needles', creek: 'meltwater creek', wind: 'wind in reeds', glass: 'ice and glass', choir: 'distant voices', insects: 'stridulation', stone: 'struck stones', bowed: 'bowed branch', cave: 'cave drips' };
const PARTIAL_SETS = {
  harmonic: [1, 2, 3, 4], odd: [1, 3, 5, 7], stretched: [1, 2.02, 3.07, 4.16], bell: [1, 2.76, 5.4, 8.93],
  fifths: [1, 1.5, 2, 3], hollow: [1, 2.4, 4.1, 6.3], septimal: [1, 1.75, 2, 3.5],
};
const PING_SETS = { wood: [1, 2.57, 4.1, 6.9], glass: [1, 2.32, 4.25, 6.63], marimba: [1, 3.99, 9.0, 15.4], bell: [1, 2.76, 5.4, 8.93], string: [1, 2, 3, 4.01], membrane: [1, 1.59, 2.14, 2.3] };
const JI = [1, 16 / 15, 9 / 8, 7 / 6, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8];

function makeTuning(r) {
  const kind = r.pick(['just', 'just', 'harmonic', 'edo', 'edo', 'bp', 'phi', 'slendro', 'pelog']);
  let ratios, period = 2, name;
  if (kind === 'just') {
    const n = r.int(5, 7); const pool = JI.slice(1); r.shuffle(pool);
    ratios = [1, ...pool.slice(0, n - 1)].sort((a, b) => a - b); name = `just intonation, ${n} notes`;
  } else if (kind === 'harmonic') {
    const s = r.pick([8, 10, 12, 16]); const hs = []; for (let h = s; h < 2 * s; h++) hs.push(h);
    r.shuffle(hs); const n = r.int(5, 8); ratios = [1, ...hs.filter(h => h !== s).slice(0, n - 1).map(h => h / s)].sort((a, b) => a - b);
    name = `harmonics ${s}–${2 * s - 1}`;
  } else if (kind === 'edo') {
    const e = r.pick([5, 7, 9, 10, 11, 13, 15, 17, 19, 22]); const steps = []; for (let i = 1; i < e; i++) steps.push(i);
    r.shuffle(steps); const n = Math.min(e, r.int(5, 7)); ratios = [1, ...steps.slice(0, n - 1).sort((a, b) => a - b).map(i => Math.pow(2, i / e))];
    name = `${e}-tone equal`;
  } else if (kind === 'bp') {
    period = 3; const steps = []; for (let i = 1; i < 13; i++) steps.push(i); r.shuffle(steps);
    ratios = [1, ...steps.slice(0, r.int(5, 7)).sort((a, b) => a - b).map(i => Math.pow(3, i / 13))]; name = 'Bohlen–Pierce tritave';
  } else if (kind === 'phi') {
    const phi = (1 + Math.sqrt(5)) / 2; const n = r.int(5, 7); ratios = [];
    for (let k = 0; k < n; k++) { let x = Math.pow(phi, k); while (x >= 2) x /= 2; ratios.push(x); }
    ratios.sort((a, b) => a - b); name = 'golden-ratio spiral';
  } else if (kind === 'slendro') {
    ratios = [1]; for (let k = 1; k < 5; k++) ratios.push(Math.pow(2, (k * 240 + r.range(-25, 25)) / 1200)); name = 'slendro-like';
  } else {
    const c = [0, 120, 270, 540, 670, 790, 950]; ratios = c.map(x => Math.pow(2, (x + (x ? r.range(-20, 20) : 0)) / 1200)); name = 'pelog-like';
  }
  return { ratios, period, name };
}
function ratioOf(tun, deg) {
  const L = tun.ratios.length; const o = Math.floor(deg / L); const i = ((deg % L) + L) % L;
  return tun.ratios[i] * Math.pow(tun.period, o);
}

function makeSpecies(r, tun, hue) {
  const pingKey = r.pick(Object.keys(PING_SETS));
  return {
    hue: hue === undefined ? r.range(0, 360) : hue,
    speed: r.range(0.28, 0.85), branch: r.range(0.12, 0.42), bangle: r.range(0.45, 1.1), wander: r.range(0.25, 1.1), trop: r.range(0.3, 1.5),
    life: r.range(28, 80), sigSpeed: r.range(1.6, 5.5), prop: r.range(0.45, 0.85), word: r.range(2, 7), reg: r.int(2, 4), degOff: r.int(0, tun.ratios.length - 1),
    mr: r.pick([0.5, 1, 1.41, 2, 2.76, 3.5]) * r.range(0.98, 1.02), mi: r.range(0, 2.8), glide: r.range(-0.6, 0.9), bd: r.range(0.012, 0.06),
    ping: PING_SETS[pingKey].slice(), pingName: pingKey, pdec: r.range(0.25, 2.4), hard: r.range(0.2, 0.9),
    tickF: r.range(1400, 6500), tickQ: r.range(3, 14), burst: r.range(0.05, 0.4),
    fSize: r.range(0.05, 0.32), fOct: r.int(-1, 2), fDens: r.range(6, 36), fRev: r.range(0, 0.5),
    spore: r.chance(0.5) ? 'grain' : 'tick', fruitCost: r.range(0.9, 1.6),
  };
}
function mutateSpecies(g, r, amt) {
  const m = { ...g, ping: g.ping.slice() };
  const jig = (v, s, a, b) => clamp(v * Math.exp(r.gauss() * s * amt), a, b);
  m.hue = (g.hue + r.gauss() * 30 * amt + 360) % 360;
  m.speed = jig(g.speed, 0.2, 0.15, 1.2); m.branch = jig(g.branch, 0.25, 0.06, 0.6); m.bangle = jig(g.bangle, 0.2, 0.3, 1.4);
  m.wander = jig(g.wander, 0.25, 0.15, 1.6); m.trop = jig(g.trop, 0.25, 0.1, 2.2); m.life = jig(g.life, 0.2, 15, 120);
  m.sigSpeed = jig(g.sigSpeed, 0.2, 0.8, 9); m.prop = clamp(g.prop + r.gauss() * 0.08 * amt, 0.3, 0.92); m.word = jig(g.word, 0.25, 1, 12);
  if (r.chance(0.25 * amt)) m.reg = clamp(g.reg + (r.chance(0.5) ? 1 : -1), 1, 5);
  if (r.chance(0.4 * amt)) m.degOff = g.degOff + r.pick([-2, -1, 1, 2]);
  m.mr = jig(g.mr, 0.15, 0.25, 6); m.mi = clamp(g.mi + r.gauss() * 0.5 * amt, 0, 5); m.glide = clamp(g.glide + r.gauss() * 0.3 * amt, -1.2, 1.5);
  m.bd = jig(g.bd, 0.2, 0.006, 0.1); m.ping = g.ping.map((x, i) => i === 0 ? 1 : x * Math.exp(r.gauss() * 0.05 * amt));
  m.pdec = jig(g.pdec, 0.25, 0.1, 4); m.hard = clamp(g.hard + r.gauss() * 0.1 * amt, 0.05, 1);
  m.tickF = jig(g.tickF, 0.2, 600, 9000); m.tickQ = jig(g.tickQ, 0.2, 1.5, 25); m.burst = clamp(g.burst + r.gauss() * 0.08 * amt, 0, 0.8);
  m.fSize = jig(g.fSize, 0.25, 0.02, 0.6); if (r.chance(0.2 * amt)) m.fOct = clamp(g.fOct + r.pick([-1, 1]), -2, 3);
  m.fDens = jig(g.fDens, 0.25, 3, 60); m.fRev = clamp(g.fRev + r.gauss() * 0.1 * amt, 0, 0.9);
  if (r.chance(0.1 * amt)) m.spore = g.spore === 'grain' ? 'tick' : 'grain';
  m.fruitCost = jig(g.fruitCost, 0.15, 0.6, 2.2);
  return m;
}

function makeSeed(code) {
  const r = makeRng(hashStr(code));
  const tun = makeTuning(r);
  const root = r.range(38, 96);
  const fams = r.shuffle(FAMILIES.slice()).slice(0, 2);
  const climate = { dayLen: r.range(140, 380), moist: r.range(0.3, 0.8), wind: r.range(0.1, 0.65), raininess: r.range(0, 1), dawn: r.range(0, 1) };
  const rev = { size: r.range(0.55, 2.4), rt: r.range(1.4, 9), damp: r.range(0.2, 0.85), pre: r.range(0.008, 0.06) };
  const partialKeys = r.shuffle(Object.keys(PARTIAL_SETS)).slice(0, r.int(1, 2));
  const grainTrees = r.range(0.1, 0.55);
  const nTrees = r.int(5, 9);
  const nSpecies = r.int(1, 3);
  const hue0 = r.range(0, 360);
  const species = []; for (let i = 0; i < nSpecies; i++) species.push(makeSpecies(r, tun, (hue0 + i * r.range(70, 150)) % 360));
  const name = `${r.pick(TREE_NAMES)} ${r.pick(PLACES)}`;
  const mood = r.pick(MOODS);
  const matParams = { fams, mix: r.range(0.25, 0.75), seed: hashStr(code + 'm'), bright: r.range(0.2, 1) };
  return { code, name, mood, tun, root, climate, rev, partialKeys, grainTrees, nTrees, species, matParams, kinHue: r.range(15, 60), rngSeed: hashStr(code + 'w') };
}

// ------------------------------------------------------------ materials (procedural field recordings)
function makeMaterial(seed, sr, secs = 6) {
  const N = Math.floor(sr * secs); const out = new Float32Array(N);
  const r = makeRng(seed.matParams.seed);
  const tun = seed.tun, root = seed.root;
  const scaleF = (oct) => root * ratioOf(tun, r.int(0, tun.ratios.length * 2)) * Math.pow(2, oct);
  const add = (buf, w) => { let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(buf[i])); const g = pk > 0 ? w / pk : 0; for (let i = 0; i < N; i++) out[i] += buf[i] * g; };
  const TAU = Math.PI * 2;
  const modal = (b, t0, f, ratios, decs, amps, hard) => {
    const i0 = Math.floor(t0 * sr); const len = Math.min(N - i0, Math.floor(Math.max(...decs) * 6 * sr));
    for (let m = 0; m < ratios.length; m++) {
      const fr = f * ratios[m]; if (fr > sr * 0.45) continue; const w = TAU * fr / sr, d = Math.exp(-1 / (decs[m] * sr)); let a = amps[m];
      const ph = r() * TAU;
      for (let i = 0; i < len; i++) { b[i0 + i] += Math.sin(w * i + ph) * a; a *= d; }
    }
    const nl = Math.floor((0.001 + (1 - hard) * 0.004) * sr); for (let i = 0; i < nl && i0 + i < N; i++) b[i0 + i] += (r() * 2 - 1) * 0.3 * hard * (1 - i / nl);
  };
  const svfBP = (b, fFn, q) => { let s1 = 0, s2 = 0; const k = 1 / q; for (let i = 0; i < N; i++) { const g = Math.tan(Math.PI * Math.min(0.42, fFn(i) / sr)); const a1 = 1 / (1 + g * (g + k)), a2 = g * a1; const v3 = b[i] - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + g * v1; s1 = 2 * v1 - s1; s2 = 2 * v2 - s2; b[i] = v1; } };
  const noise = () => { const b = new Float32Array(N); for (let i = 0; i < N; i++) b[i] = r() * 2 - 1; return b; };
  const lp1 = (b, f) => { const c = 1 - Math.exp(-TAU * f / sr); let y = 0; for (let i = 0; i < N; i++) { y += c * (b[i] - y); b[i] = y; } };
  const gen = {
    bark: () => { const b = new Float32Array(N); let t = 0.02; while (t < secs - 0.3) { modal(b, t, scaleF(r.int(1, 2)), PING_SETS.wood, [0.12, 0.07, 0.04, 0.02].map(x => x * r.range(0.5, 1.6)), [1, 0.5, 0.3, 0.15], r.range(0.3, 1)); t += r.range(0.06, 0.45) * (r.chance(0.2) ? 0.3 : 1); } return b; },
    rain: () => { const b = new Float32Array(N); for (let k = 0; k < secs * 160; k++) { const t = r() * (secs - 0.1); const f = r.range(1800, 7000); const i0 = Math.floor(t * sr); const len = Math.floor(r.range(0.004, 0.02) * sr); const a = r.range(0.1, 1); let ph = 0; for (let i = 0; i < len && i0 + i < N; i++) { ph += TAU * f * (1 + i / len * 0.6) / sr; b[i0 + i] += Math.sin(ph) * a * Math.exp(-i / len * 4); } } const n = noise(); lp1(n, 3000); for (let i = 0; i < N; i++) b[i] += n[i] * 0.15; return b; },
    creek: () => { const b = noise(); svfBP(b, (i) => 500 + 300 * Math.sin(i / sr * 0.7), 0.8); for (let i = 0; i < N; i++) b[i] *= 0.4; for (let k = 0; k < secs * 25; k++) { const t = r() * (secs - 0.1); const f0 = r.range(300, 1600); const i0 = Math.floor(t * sr); const len = Math.floor(r.range(0.01, 0.05) * sr); let ph = 0; for (let i = 0; i < len && i0 + i < N; i++) { ph += TAU * f0 * (1 + 1.5 * i / len) / sr; b[i0 + i] += Math.sin(ph) * Math.exp(-i / len * 3) * 0.7; } } return b; },
    wind: () => { const n = noise(); const b = new Float32Array(N); const fs = [r.range(300, 700), r.range(900, 1500), r.range(2000, 3200)]; for (let j = 0; j < 3; j++) { const c = n.slice(); const rate = r.range(0.05, 0.3), ph = r() * 6; svfBP(c, (i) => fs[j] * Math.pow(2, 0.6 * Math.sin(TAU * rate * i / sr + ph)), r.range(4, 12)); for (let i = 0; i < N; i++) b[i] += c[i] * (0.6 + 0.4 * Math.sin(TAU * 0.13 * i / sr + j)); } return b; },
    glass: () => { const b = new Float32Array(N); let t = 0.05; while (t < secs - 1) { modal(b, t, scaleF(r.int(2, 4)), PING_SETS.glass, [1.6, 1.1, 0.7, 0.4].map(x => x * r.range(0.4, 1.2)), [1, 0.45, 0.3, 0.2], r.range(0.6, 1)); t += r.range(0.2, 1.2); } return b; },
    choir: () => { const b = new Float32Array(N); const notes = [scaleF(1), scaleF(1), scaleF(2)]; const formants = r.pick([[730, 1090, 2440], [570, 840, 2410], [300, 870, 2240], [440, 1020, 2240]]); for (const f of notes) { const c = new Float32Array(N); let ph = 0; for (let i = 0; i < N; i++) { ph += f * (1 + 0.004 * Math.sin(TAU * 5 * i / sr)) / sr; ph -= Math.floor(ph); c[i] = (ph * 2 - 1); } for (const fm of formants) { const d = c.slice(); svfBP(d, () => fm, 9); for (let i = 0; i < N; i++) b[i] += d[i] * (0.5 + 0.5 * Math.sin(Math.PI * i / N)); } } return b; },
    insects: () => { const b = new Float32Array(N); for (let k = 0; k < secs * 3; k++) { const t = r() * (secs - 0.6); const f = r.range(3500, 8000); const rate = r.range(20, 70); const i0 = Math.floor(t * sr); const len = Math.floor(r.range(0.15, 0.5) * sr); for (let i = 0; i < len && i0 + i < N; i++) { const am = Math.max(0, Math.sin(TAU * rate * i / sr)); b[i0 + i] += Math.sin(TAU * f * i / sr) * am * am * Math.sin(Math.PI * i / len) * 0.6; } } return b; },
    stone: () => { const b = new Float32Array(N); let t = 0.03; while (t < secs - 0.3) { modal(b, t, scaleF(r.int(2, 3)), PING_SETS.marimba, [0.05, 0.03, 0.02, 0.01].map(x => x * r.range(0.6, 2)), [1, 0.6, 0.3, 0.2], 1); modal(b, t, r.range(60, 140), [1, 1.5, 2.2, 3], [0.06, 0.04, 0.03, 0.02], [0.6, 0.3, 0.2, 0.1], 0.5); t += r.range(0.15, 0.9); } return b; },
    bowed: () => { const b = new Float32Array(N); const f = scaleF(1); for (let m = 1; m <= 6; m++) { let ph = r() * 6; const a = 1 / m; for (let i = 0; i < N; i++) { ph += TAU * f * m * (1 + 0.003 * Math.sin(TAU * 0.4 * i / sr + m)) / sr; b[i] += Math.sin(ph) * a * (0.6 + 0.4 * Math.sin(TAU * 0.2 * i / sr)); } } const n = noise(); svfBP(n, () => f * 3, 2); for (let i = 0; i < N; i++) b[i] += n[i] * 0.15; return b; },
    cave: () => { const b = new Float32Array(N); let t = 0.1; while (t < secs - 0.5) { const f = r.range(700, 2200); const i0 = Math.floor(t * sr); const len = Math.floor(0.25 * sr); let ph = 0; for (let i = 0; i < len && i0 + i < N; i++) { ph += TAU * f * (1 + 0.8 * Math.exp(-i / (0.01 * sr))) / sr; b[i0 + i] += Math.sin(ph) * Math.exp(-i / (0.05 * sr)); } t += r.range(0.25, 1.4); } return b; },
  };
  const [fa, fb] = seed.matParams.fams;
  add(gen[fa](), 1 - seed.matParams.mix * 0.6); add(gen[fb](), 0.4 + seed.matParams.mix * 0.6);
  lp1(out, 2000 + seed.matParams.bright * 14000);
  // normalise and crossfade ends so grains can loop
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i])); const g = pk > 0 ? 0.85 / pk : 0;
  const fl = Math.floor(sr * 0.05); for (let i = 0; i < N; i++) { let w = 1; if (i < fl) w = i / fl; else if (i > N - fl) w = (N - i) / fl; out[i] *= g * w; }
  return out;
}

// ------------------------------------------------------------ world
class World {
  constructor(seed, audio, opts = {}) {
    this.seed = seed; this.audio = audio; this.log = opts.log || (() => { }); this.r = makeRng(seed.rngSeed);
    this.p = Object.assign({ growth: 1, chatter: 1, bloom: 1, mutation: 1, moisture: 0.5, wind: 0.5 }, opts.params || {});
    this.t = 0; this.dayPhase = seed.climate.dawn; this.light = 0;
    this.moist = seed.climate.moist; this.rainT = 0; this.rainCool = 30; this.windDir = this.r.range(0, Math.PI * 2); this.windStr = seed.climate.wind;
    this.nodes = new Map(); this.edges = new Map(); this.tips = []; this.trees = []; this.genets = new Map();
    this.signals = []; this.carbon = []; this.fruits = []; this.spores = []; this.litter = []; this.flashes = [];
    this.nid = 1; this.eid = 1; this.tid = 1; this.gid = 1; this.tipid = 1;
    this.hash = new Map(); this.hashDirty = true;
    this.listener = { x: 0, y: 0, yaw: 0 };
    this.v = { trees: new Map(), ticks: [], rain: [], wind: null, soil: null };
    this.budget = { ping: new Set(), sig: new Set(), spore: new Set(), carbon: new Set(), fruit: new Set(), fx: new Set() };
    this.flowT = 0; this.voiceT = 0; this.tickT = 0; this.carbonT = 3; this.grazeT = this.r.range(50, 120); this.decomp = 0;
    this.stats = { born: 0, fused: 0, bonds: 0, fruits: 0, germ: 0 };
    this.plant();
  }
  // ---------------------------------------------------------- setup
  plant() {
    const s = this.seed, r = this.r;
    const centers = flowerCenters(PETAL).slice(1); r.shuffle(centers);
    for (let i = 0; i < s.nTrees; i++) {
      const [x, y] = centers[i];
      this.addTree(x + r.range(-0.4, 0.4), y + r.range(-0.4, 0.4), { size: r.range(0.7, 1.5), kin: r.int(0, 2), deg: r.int(0, s.tun.ratios.length * 2 - 1), sugar: r.range(0.6, 1.4) }, true);
    }
    // the largest tree takes the lowest note
    const big = this.trees.reduce((a, b) => (b.size > a.size ? b : a)); big.deg = 0;
    s.species.forEach((sp, i) => {
      const host = this.trees[i % this.trees.length];
      const g = this.addGenet(sp, null);
      g.energy = 1.2;
      const n0 = 3 + (i === 0 ? 1 : 0);
      for (let k = 0; k < n0; k++) this.addTip(g, host.node, host.x, host.y, r.range(0, Math.PI * 2), 1.0);
      host.links.set(g.id, 1);
    });
  }
  addTree(x, y, o, initial) {
    const s = this.seed, r = this.r;
    const node = this.addNode(x, y, 'tree', 0); node.deg = (o.deg || 0) + s.tun.ratios.length;
    const pk = r.pick(s.partialKeys);
    const t = {
      id: this.tid++, x, y, node: node.id, size: o.size, sugar: o.sugar === undefined ? 0.6 : o.sugar, kin: o.kin, deg: o.deg, age: initial ? r.range(50, 300) : 0,
      partials: PARTIAL_SETS[pk].slice(), amps: [1, r.range(0.2, 0.6), r.range(0.05, 0.35), r.range(0, 0.2)], type: r.chance(s.grainTrees) ? 'grain' : 'drone',
      breath: r.range(0.02, 0.25), det: r.range(1, 9), links: new Map(), stress: 0, defense: 0, flash: 0, hunger: 0, dying: 0, hub: false, alive: true, light: 0,
    };
    node.tree = t.id; this.trees.push(t); return t;
  }
  addGenet(sp, parent) {
    const g = { id: this.gid++, sp, energy: 0.6, parent: parent ? parent.id : null, born: this.t, alive: true, gen: parent ? parent.gen + 1 : 0, name: '' };
    g.name = (parent ? parent.name.split('·')[0] : 'M') + (parent ? '·' + g.gen : '') + String.fromCharCode(65 + ((g.id - 1) % 26));
    g.name = `G${g.id}`;
    this.genets.set(g.id, g); this.stats.born++; return g;
  }
  addNode(x, y, type, genet) { const n = { id: this.nid++, x, y, type, genet, edges: new Set(), u: 0, refr: 0, deg: 0, tree: 0, fl: 0 }; this.nodes.set(n.id, n); return n; }
  addTip(g, fromNode, x, y, heading, off = 0) {
    if (this.tips.length >= 42) return null;
    const n = this.nodes.get(fromNode);
    const sx = x + Math.sin(heading) * off, sy = y + Math.cos(heading) * off;
    const tip = { id: this.tipid++, g: g.id, x: sx, y: sy, h: heading, from: fromNode, pts: [[n.x, n.y], [sx, sy]], len: off, sinceB: 0, age: 0, life: g.sp.life * this.r.range(0.6, 1.4), dormant: false, deg: n.deg };
    this.tips.push(tip); return tip;
  }
  // ---------------------------------------------------------- graph helpers
  addEdge(a, b, pts, genet) {
    let len = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(len); }
    const e = { id: this.eid++, a, b, pts, cum, len: Math.max(0.05, len), D: 0.45, Q: 0, g: genet, age: 0, act: 0, born: this.t };
    this.edges.set(e.id, e); this.nodes.get(a).edges.add(e.id); this.nodes.get(b).edges.add(e.id); this.hashDirty = true; return e;
  }
  removeEdge(e, recycle) {
    if (!this.edges.has(e.id)) return;
    this.edges.delete(e.id);
    for (const nid of [e.a, e.b]) { const n = this.nodes.get(nid); if (n) { n.edges.delete(e.id); if (n.edges.size === 0 && n.type !== 'tree' && !this.fruits.some(f => f.node === n.id) && !this.tips.some(t => t.from === n.id)) this.nodes.delete(nid); } }
    if (recycle) { const g = this.genets.get(e.g); if (g) g.energy += 0.02 * e.len; const m = e.pts[(e.pts.length / 2) | 0]; this.addLitter(m[0], m[1], 0.05 * e.len); }
    this.signals = this.signals.filter(s => s.e !== e.id || (this.stopVoice(s.voice), false));
    this.hashDirty = true;
  }
  splitEdge(e, k) {
    k = clamp(k, 1, e.pts.length - 2);
    const p = e.pts[k]; const n = this.addNode(p[0], p[1], 'j', e.g);
    const na = this.nodes.get(e.a), nb = this.nodes.get(e.b);
    n.deg = Math.round(((na ? na.deg : 0) + (nb ? nb.deg : 0)) / 2);
    const D = e.D;
    this.edges.delete(e.id); na && na.edges.delete(e.id); nb && nb.edges.delete(e.id);
    const e1 = this.addEdge(e.a, n.id, e.pts.slice(0, k + 1), e.g), e2 = this.addEdge(n.id, e.b, e.pts.slice(k), e.g);
    e1.D = e2.D = D; e1.born = e2.born = e.born;
    for (const s of this.signals) if (s.e === e.id) { // reroute travelling signals onto the half they are on
      const pos = s.dir > 0 ? s.s : e.len - s.s; const cut = e.cum[k];
      if (pos <= cut) { s.e = e1.id; s.dir = s.dir > 0 ? 1 : -1; s.s = s.dir > 0 ? pos : cut - pos; s.len = e1.len; }
      else { s.e = e2.id; s.s = s.dir > 0 ? pos - cut : e.len - pos; s.len = e2.len; }
    }
    return n;
  }
  rebuildHash() {
    this.hash.clear();
    for (const e of this.edges.values()) for (let i = 0; i < e.pts.length; i++) {
      const p = e.pts[i]; const key = (Math.floor(p[0]) + 64) * 256 + (Math.floor(p[1]) + 64);
      let c = this.hash.get(key); if (!c) { c = []; this.hash.set(key, c); } c.push(e.id, i);
    }
    this.hashDirty = false;
  }
  nearPoint(x, y, rad, filter) {
    if (this.hashDirty) this.rebuildHash();
    let best = null, bd = rad * rad;
    const x0 = Math.floor(x - rad), x1 = Math.floor(x + rad), y0 = Math.floor(y - rad), y1 = Math.floor(y + rad);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.hash.get((cx + 64) * 256 + (cy + 64)); if (!c) continue;
      for (let j = 0; j < c.length; j += 2) {
        const e = this.edges.get(c[j]); if (!e) continue; const p = e.pts[c[j + 1]]; if (!p) continue;
        const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < bd && (!filter || filter(e, c[j + 1]))) { bd = d; best = { e, i: c[j + 1], d: Math.sqrt(d) }; }
      }
    }
    return best;
  }
  pointAlong(e, s) {
    const c = e.cum; s = clamp(s, 0, e.len);
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const seg = c[hi] - c[lo] || 1; const t = (s - c[lo]) / seg; const a = e.pts[lo], b = e.pts[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  treeAt(x, y, rad) { let best = null, bd = rad; for (const t of this.trees) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } } return best; }
  treeById(id) { return this.trees.find(t => t.id === id); }
  addLitter(x, y, a) { const l = this.litter.find(l => Math.hypot(l.x - x, l.y - y) < 1.5); if (l) l.a = Math.min(3, l.a + a); else if (this.litter.length < 40) this.litter.push({ x, y, a: Math.min(3, a) }); }
  freq(deg, oct) { return this.seed.root * ratioOf(this.seed.tun, deg) * Math.pow(2, oct || 0); }
  scaleRatios(n, center) { const out = []; for (let i = 0; i < n; i++) out.push(ratioOf(this.seed.tun, (center || 0) + i) / ratioOf(this.seed.tun, center || 0)); return out; }

  // ---------------------------------------------------------- audio helpers
  stopVoice(id, r) { if (id) this.audio.rel(id, r); }
  canSpawn(set, max) { for (const id of set) if (!this.audio.alive(id)) set.delete(id); return this.audio.ready && set.size < max; }
  ping(x, y, z, node, sp, amt, budget = 8) {
    if (!this.canSpawn(this.budget.ping, budget)) return;
    const f = this.freq(node.deg + sp.degOff, sp.reg - 1);
    const id = this.audio.spawn(K.MODAL, { x, y, z, f, r: sp.ping, d: sp.ping.map((_, i) => sp.pdec / (1 + i * 1.3)), a: [1, 0.55, 0.3, 0.18], hard: sp.hard, gain: 0.6 * amt, layer: LAYER.SIGNALS, send: 0.7, prio: 1 });
    if (id) this.budget.ping.add(id);
  }
  fx(kind, p, max = 6) { if (!this.canSpawn(this.budget.fx, max)) return null; const id = this.audio.spawn(kind, p); if (id) this.budget.fx.add(id); return id; }

  // ---------------------------------------------------------- main step
  step(dt) {
    this.t += dt;
    this.weather(dt);
    this.growTips(dt);
    this.flowT += dt; if (this.flowT > 0.25) { this.flow(this.flowT); this.flowT = 0; }
    this.treesStep(dt);
    this.signalStep(dt);
    this.carbonStep(dt);
    this.fruitStep(dt);
    this.sporeStep(dt);
    this.prune(dt);
    this.events(dt);
    this.voiceT += dt; if (this.voiceT > 0.4) { this.updateVoices(this.voiceT); this.voiceT = 0; }
    for (const n of this.nodes.values()) { n.u *= Math.exp(-dt / 2.5); if (n.refr > 0) n.refr -= dt; n.fl *= Math.exp(-dt * 3); }
    for (const e of this.edges.values()) e.act *= Math.exp(-dt * 1.5);
    this.flashes = this.flashes.filter(f => (f.t -= dt) > 0);
  }
  weather(dt) {
    const c = this.seed.climate, r = this.r, P = this.p;
    this.dayPhase = (this.dayPhase + dt / c.dayLen) % 1;
    const sun = Math.sin(this.dayPhase * Math.PI * 2);
    this.light = clamp(sun * 1.3, 0, 1) * (this.rainT > 0 ? 0.45 : 1);
    if (this.rainT > 0) { this.rainT -= dt; if (this.rainT <= 0) this.log('The rain passes. The soil holds the water for a while.', 'weather'); }
    else { this.rainCool -= dt; if (this.rainCool < 0 && r.chance(dt * 0.006 * (0.3 + c.raininess))) this.startRain(r.range(30, 90)); }
    const target = clamp(P.moisture + (this.rainT > 0 ? 0.45 : 0), 0, 1.2);
    this.moist += (target - this.moist) * (1 - Math.exp(-dt / (this.rainT > 0 ? 8 : 40)));
    this.windDir += r.gauss() * 0.05 * Math.sqrt(dt);
    this.windStr += ((c.wind * 0.4 + P.wind) * (0.6 + 0.6 * Math.sin(this.t * 0.05)) - this.windStr) * (1 - Math.exp(-dt / 6));
  }
  startRain(len) { this.rainT = len; this.rainCool = 60; this.log('Rain arrives. Moisture rises; hyphae speed up and fungi get ready to fruit.', 'weather'); }

  growTips(dt) {
    const P = this.p, r = this.r;
    const mf = clamp(0.25 + this.moist * 1.1, 0.2, 1.4);
    const born = [];
    for (let ti = this.tips.length - 1; ti >= 0; ti--) {
      const tip = this.tips[ti]; const g = this.genets.get(tip.g); if (!g) { this.tips.splice(ti, 1); continue; }
      const sp = g.sp; tip.age += dt;
      const starving = g.energy <= 0.02;
      const v = sp.speed * mf * P.growth * (starving ? 0.15 : 1);
      // tropism toward root zones this genet has not reached
      let tgt = null, td = 13;
      for (const t of this.trees) { if ((t.links.get(g.id) || 0) >= 2) continue; const d = Math.hypot(t.x - tip.x, t.y - tip.y); if (d < td && t.node !== tip.from) { td = d; tgt = t; } }
      let dh = r.gauss() * sp.wander * Math.sqrt(dt);
      const steer = (ax, ay, k) => { const want = Math.atan2(ax, ay); let d = want - tip.h; d = Math.atan2(Math.sin(d), Math.cos(d)); dh += d * k * dt; };
      if (tgt) steer(tgt.x - tip.x, tgt.y - tip.y, sp.trop * (1.4 - td / 13));
      const litter = this.litter.find(l => Math.hypot(l.x - tip.x, l.y - tip.y) < 4);
      if (litter) steer(litter.x - tip.x, litter.y - tip.y, 0.5);
      const rr = Math.hypot(tip.x, tip.y); if (rr > PLOT_R - 2.5) steer(-tip.x, -tip.y, 1.2);
      tip.h += dh;
      const step = v * dt; tip.x += Math.sin(tip.h) * step; tip.y += Math.cos(tip.h) * step; tip.len += step; tip.sinceB += step;
      g.energy -= step * 0.006;
      if (litter) { const take = Math.min(litter.a, dt * 0.02); litter.a -= take; g.energy += take; this.decomp += take; }
      const last = tip.pts[tip.pts.length - 1];
      if (Math.hypot(tip.x - last[0], tip.y - last[1]) >= 0.3) tip.pts.push([tip.x, tip.y]);
      // 1. root contact → mycorrhizal bond
      const tree = this.treeAt(tip.x, tip.y, 1.35);
      if (tree && tree.node !== tip.from && tip.len > 0.8 && (tree.links.get(g.id) || 0) < 2) {
        tip.pts.push([tree.x, tree.y]); this.finish(tip, tree.node); this.tips.splice(ti, 1);
        tree.links.set(g.id, (tree.links.get(g.id) || 0) + 1); this.stats.bonds++;
        this.bondSound(tree, g);
        this.log(`${g.name} reached the roots of tree ${tree.id}. A new mycorrhizal bond: sugar can now flow.`, 'bond');
        continue;
      }
      // 2. contact with another hypha → fuse (same individual) or clash (stranger)
      if (tip.len > 0.8) {
        const hit = this.nearPoint(tip.x, tip.y, 0.42, (e, i) => !(e.a === tip.from && i < 4) && !(e.b === tip.from && i > e.pts.length - 5));
        if (hit) {
          if (hit.e.g === g.id) {
            const n = (hit.i === 0) ? this.nodes.get(hit.e.a) : (hit.i === hit.e.pts.length - 1) ? this.nodes.get(hit.e.b) : this.splitEdge(hit.e, hit.i);
            if (n && n.id !== tip.from) {
              tip.pts.push([n.x, n.y]); this.finish(tip, n.id); this.tips.splice(ti, 1); this.stats.fused++;
              this.ping(n.x, n.y, -0.2, n, sp, 0.6);
              if (this.stats.fused % 6 === 1) this.log(`${g.name} fused with itself (anastomosis): a loop closes, the network gets more resilient.`, 'fuse');
              continue;
            }
          } else {
            const end = this.addNode(tip.x, tip.y, 'j', g.id); end.deg = tip.deg;
            this.finish(tip, end.id); this.tips.splice(ti, 1);
            this.fx(K.TICK, { x: tip.x, y: tip.y, z: -0.2, rate: 40, f: sp.tickF * 0.6, q: 4, jit: 0.6, burst: 0.9, gain: 0.25, layer: LAYER.GROWTH, dur: 0.9, rel: 0.3, send: 0.4 });
            this.flashes.push({ x: tip.x, y: tip.y, t: 1.2, c: 'alarm' });
            const other = this.genets.get(hit.e.g);
            if (r.chance(0.3)) this.log(`${g.name} met ${other ? other.name : 'a stranger'} and walled itself off. Different individuals do not fuse.`, 'clash');
            continue;
          }
        }
        // tip-tip fusion
        for (const o of this.tips) if (o !== tip && o.g === tip.g && o.len > 0.8 && Math.hypot(o.x - tip.x, o.y - tip.y) < 0.35) {
          const n = this.addNode(tip.x, tip.y, 'j', g.id); n.deg = tip.deg;
          this.finish(tip, n.id); o.pts.push([n.x, n.y]); this.finish(o, n.id);
          this.tips.splice(ti, 1); const oi = this.tips.indexOf(o); if (oi >= 0) { this.tips.splice(oi, 1); if (oi < ti) ti--; }
          this.stats.fused++; this.ping(n.x, n.y, -0.2, n, sp, 0.5); break;
        }
        if (!this.tips.includes(tip)) continue;
      }
      // 3. leaving the plot or dying of age
      if (Math.hypot(tip.x, tip.y) > PLOT_R + 0.5 || tip.age > tip.life) {
        const end = this.addNode(tip.x, tip.y, 'j', g.id); end.deg = tip.deg; this.finish(tip, end.id); this.tips.splice(ti, 1); continue;
      }
      // 4. branching (apical): close the strand at a branch node and grow two tips
      const pb = sp.branch * step * P.growth * (1 - this.tips.length / 42) * (starving ? 0 : 1) * (this.edges.size > 520 ? 0 : 1);
      if (tip.sinceB > 0.9 && r.chance(pb)) {
        const n = this.addNode(tip.x, tip.y, 'j', g.id); n.deg = clamp(tip.deg + r.pick([-2, -1, 1, 1, 2]), 0, this.seed.tun.ratios.length * 3);
        this.finish(tip, n.id); this.tips.splice(ti, 1);
        const side = r.chance(0.5) ? 1 : -1;
        born.push([g, n.id, n.x, n.y, tip.h + r.gauss() * 0.15]);
        born.push([g, n.id, n.x, n.y, tip.h + side * sp.bangle * r.range(0.7, 1.3)]);
      }
    }
    for (const b of born) { const t = this.addTip(b[0], b[1], b[2], b[3], b[4], 0.05); if (t) t.deg = this.nodes.get(b[1]).deg; }
  }
  finish(tip, endNode) {
    if (tip.pts.length < 2) return;
    if (endNode === tip.from) return;
    if (!this.nodes.has(tip.from) || !this.nodes.has(endNode)) return;
    this.addEdge(tip.from, endNode, tip.pts, tip.g);
  }
  bondSound(tree, g) {
    const sp = g.sp;
    this.ping(tree.x, tree.y, 0.4, { deg: tree.deg + this.seed.tun.ratios.length }, sp, 1, 9);
    // the tree takes in a little of the fungus: one partial grows
    const k = 1 + (tree.links.size % 3); tree.amps[k] = Math.min(0.9, tree.amps[k] + 0.12);
    tree.flash = 1;
  }

  // Physarum-style transport: tree sugar sets pressure at tree nodes,
  // junction pressures relax to the conductance-weighted mean, flow follows
  // the pressure gradient, and conductance grows with use.
  flow(dt) {
    const nodes = this.nodes, edges = this.edges;
    for (const n of nodes.values()) if (n.type === 'tree') { const t = this.treeById(n.tree); n.p = t ? t.sugar : 0; } else if (n.p === undefined) n.p = 0;
    for (let it = 0; it < 14; it++) {
      for (const n of nodes.values()) {
        if (n.type === 'tree' && this.treeById(n.tree)) continue;
        let s = 0, w = 0; for (const eid of n.edges) { const e = edges.get(eid); if (!e) continue; const o = nodes.get(e.a === n.id ? e.b : e.a); if (!o) continue; const c = e.D / e.len; s += c * o.p; w += c; }
        n.p = w > 0 ? s / w : n.p * 0.9;
      }
    }
    const P = this.p;
    for (const e of edges.values()) {
      const a = nodes.get(e.a), b = nodes.get(e.b); if (!a || !b) continue;
      e.Q = (e.D / e.len) * (a.p - b.p) * 2.2;
      const q = Math.abs(e.Q) * 14; const f = Math.pow(q, 1.6) / (1 + Math.pow(q, 1.6));
      e.D += (f * 0.9 - 0.03 * e.D) * dt; e.D = clamp(e.D, 0.01, 3.2); e.age += dt;
      e.act = Math.max(e.act, Math.min(1, Math.abs(e.Q) * 6));
    }
    for (const t of this.trees) {
      const n = nodes.get(t.node); if (!n) continue; let out = 0;
      for (const eid of n.edges) { const e = edges.get(eid); if (!e) continue; out += e.a === n.id ? e.Q : -e.Q; }
      t.sugar -= out * dt * 0.5;
      // the fungus takes its share of whatever moves through it
      for (const eid of n.edges) { const e = edges.get(eid); if (!e) continue; const g = this.genets.get(e.g); if (g) { const tax = Math.abs(e.Q) * dt * 0.08 + 0.002 * dt; g.energy += tax; if (out > 0) t.sugar -= tax * 0.5; } }
      t.flow = out;
    }
    void P;
  }

  treesStep(dt) {
    const r = this.r, s = this.seed;
    for (const t of this.trees) {
      t.age += dt;
      let shade = 0; for (const o of this.trees) if (o !== t) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < 6 && o.size > t.size) shade += (o.size - t.size) * (1 - d / 6); }
      t.light = this.light * t.size / (t.size + shade * 1.6);
      t.sugar += (t.light * 0.085 * (t.sugar > 2 ? 0.4 : 1) - 0.009 * t.size * (0.6 + 0.4 * this.light)) * dt;
      if (t.dying > 0) { t.dying -= dt; t.sugar = Math.max(t.sugar, 2.6); if (t.dying <= 0) { this.killTree(t); continue; } }
      if (t.sugar > 1.3 && t.size < 1.7) { t.size += 0.004 * dt; t.sugar -= 0.003 * dt; }
      t.sugar = clamp(t.sugar, -0.5, 3);
      if (t.sugar < -0.3) t.hunger += dt; else t.hunger = Math.max(0, t.hunger - dt * 2);
      if (t.hunger > 120 && t.dying <= 0) { this.log(`Tree ${t.id} starved: it had too little light and too few links. It dies back into the soil.`, 'death'); t.dying = 6; }
      t.stress *= Math.exp(-dt / 12); t.defense *= Math.exp(-dt / 28); t.flash *= Math.exp(-dt * 1.5);
      // reproduction: a well-fed mature tree drops a seedling of its own kin nearby
      if (t.size > 1.15 && t.sugar > 1.6 && this.trees.length < 12 && r.chance(dt * 0.004)) {
        const a = r.range(0, Math.PI * 2), d = r.range(2.8, 5.5); const x = t.x + Math.sin(a) * d, y = t.y + Math.cos(a) * d;
        if (Math.hypot(x, y) < PLOT_R - 1.5 && !this.treeAt(x, y, 2.2)) {
          const c = this.addTree(x, y, { size: 0.3, kin: t.kin, deg: clamp(t.deg + r.pick([-2, -1, 1, 2, s.tun.ratios.length]), 0, s.tun.ratios.length * 3), sugar: 0.5 });
          t.sugar -= 0.4; this.log(`Tree ${t.id} dropped a seedling (tree ${c.id}). It grows in the shade and depends on the network.`, 'tree');
        }
      }
    }
    // hub trees: the most connected large tree
    let hub = null, hd = 2; for (const t of this.trees) { const n = this.nodes.get(t.node); const d = n ? n.edges.size : 0; if (d > hd && t.size > 0.9) { hd = d; hub = t; } }
    for (const t of this.trees) { const was = t.hub; t.hub = t === hub; if (t.hub && !was) this.log(`Tree ${t.id} is now the hub of the network (${hd} links).`, 'tree'); }
  }
  killTree(t) {
    const v = this.v.trees.get(t.id); if (v) { this.audio.set(v, { f: this.freq(t.deg, -1), glide: 5 }); this.audio.rel(v, 6); this.v.trees.delete(t.id); }
    this.addLitter(t.x, t.y, 1.5 * t.size);
    const n = this.nodes.get(t.node); if (n) { n.type = 'j'; n.tree = 0; if (n.edges.size === 0) this.nodes.delete(n.id); }
    this.trees.splice(this.trees.indexOf(t), 1);
  }

  // ---------------------------------------------------------- signals
  fire(node, alarm, fromEdge, hops, gid) {
    if (!node || node.refr > 0) return;
    node.refr = alarm ? 1.2 : 2.4; node.u = 0; node.fl = 1;
    let g = this.genets.get(gid || node.genet);
    if (!g) { for (const eid of node.edges) { const e = this.edges.get(eid); if (e) { g = this.genets.get(e.g); if (g) break; } } }
    if (!g) return;
    const sp = g.sp;
    if (node.type === 'tree') {
      const t = this.treeById(node.tree);
      if (t) { t.flash = Math.min(1.5, t.flash + 0.7); if (alarm && hops > 0) { t.defense = Math.min(1.5, t.defense + 0.45); } }
    } else this.ping(node.x, node.y, -0.2, node, sp, alarm ? 0.9 : 0.55);
    const maxH = alarm ? 12 : 7; if (hops >= maxH) return;
    for (const eid of node.edges) {
      if (eid === fromEdge) continue; const e = this.edges.get(eid); if (!e) continue;
      const eg = this.genets.get(e.g) || g;
      const pp = alarm ? 0.95 : eg.sp.prop * Math.min(1, 0.35 + e.D);
      if (!this.r.chance(pp) || this.signals.length > 40) continue;
      const n = Math.max(1, Math.round(eg.sp.word * this.r.range(0.6, 1.5) * (alarm ? 1.5 : 1)));
      const sig = { e: e.id, dir: e.a === node.id ? 1 : -1, s: 0, len: e.len, speed: eg.sp.sigSpeed * (alarm ? 1.6 : 1), n, alarm, g: eg.id, hops: hops + 1, voice: null, x: node.x, y: node.y };
      this.signals.push(sig);
      if (this.canSpawn(this.budget.sig, 10)) {
        const tt = e.len / sig.speed; const isi = clamp(tt / n, 0.04, 0.6);
        const f0 = this.freq(node.deg + eg.sp.degOff, eg.sp.reg) * (alarm ? 1.5 : 1);
        const id = this.audio.spawn(K.CHIRP, { x: node.x, y: node.y, z: -0.3, f0, f1: f0 * Math.pow(2, eg.sp.glide), mr: eg.sp.mr, mi: eg.sp.mi * (alarm ? 2 : 1), n, isi, bd: eg.sp.bd, gain: alarm ? 0.75 : 0.5, layer: LAYER.SIGNALS, send: 0.55, prio: 1 });
        if (id) { sig.voice = id; this.budget.sig.add(id); }
      }
    }
  }
  signalStep(dt) {
    for (let i = this.signals.length - 1; i >= 0; i--) {
      const s = this.signals[i]; const e = this.edges.get(s.e); if (!e) { this.signals.splice(i, 1); continue; }
      s.s += s.speed * dt; e.act = Math.max(e.act, s.alarm ? 1 : 0.7);
      const pos = this.pointAlong(e, s.dir > 0 ? s.s : e.len - s.s); s.x = pos[0]; s.y = pos[1];
      if (s.voice) this.audio.move(s.voice, s.x, s.y, -0.3);
      if (s.s >= e.len) {
        this.signals.splice(i, 1);
        const n = this.nodes.get(s.dir > 0 ? e.b : e.a); if (!n) continue;
        n.u += s.alarm ? 1.1 : 0.42 + 0.08 * s.n;
        if (n.type === 'tree') {
          const t = this.treeById(n.tree);
          if (t) {
            t.flash = Math.min(1.5, t.flash + 0.5);
            if (s.alarm) { t.defense = Math.min(1.5, t.defense + 0.4); if (t.defense > 0.35 && this.r.chance(0.25)) this.log(`Tree ${t.id} received the alarm and raised its defences.`, 'alarm'); }
            else if (this.r.chance(0.3 * this.p.chatter)) n.u += 0.6; // trees answer
          }
        }
        if (n.u >= 1) this.fire(n, s.alarm, e.id, s.hops, s.g);
      }
    }
    // spontaneous activity: fungi spike on their own, more at dawn and dusk
    const twilight = 1 + 1.5 * Math.exp(-Math.pow(Math.sin(this.dayPhase * Math.PI * 2) * 3, 2));
    const rate = 0.09 * this.p.chatter * twilight;
    if (this.nodes.size && this.r.chance(rate * dt * Math.min(12, this.nodes.size / 6))) {
      const arr = [...this.nodes.values()]; const n = arr[Math.floor(this.r() * arr.length)];
      if (n.edges.size) this.fire(n, false, 0, 0);
    }
  }
  stressTree(t, src) {
    if (!t) return;
    t.stress = 1; t.defense = Math.min(1.5, t.defense + 0.6); t.flash = 1.5;
    const n = this.nodes.get(t.node); if (n) { n.refr = 0; this.fire(n, true, 0, 0); setTimeoutSim(this, 2.5, () => { if (n) { n.refr = 0; this.fire(n, true, 0, 0); } }); }
    this.flashes.push({ x: t.x, y: t.y, t: 2, c: 'alarm' });
    this.log(src === 'user' ? `You wounded tree ${t.id}. It sends an alarm through the network.` : `Deer are browsing tree ${t.id}. An alarm runs through the hyphae.`, 'alarm');
  }

  // ---------------------------------------------------------- carbon packets
  carbonStep(dt) {
    for (let i = this.carbon.length - 1; i >= 0; i--) {
      const c = this.carbon[i]; c.s += c.speed * dt;
      if (c.s >= c.len) { this.carbon.splice(i, 1); const t = this.treeById(c.dst); if (t) t.flash = Math.min(1.5, t.flash + 0.6); continue; }
      let k = c.k; while (k < c.cum.length - 2 && c.cum[k + 1] < c.s) k++; c.k = k;
      const a = c.pts[k], b = c.pts[k + 1]; const t = (c.s - c.cum[k]) / ((c.cum[k + 1] - c.cum[k]) || 1);
      c.x = a[0] + (b[0] - a[0]) * t; c.y = a[1] + (b[1] - a[1]) * t;
      if (c.voice) this.audio.move(c.voice, c.x, c.y, 0.2);
    }
    this.carbonT -= dt;
    if (this.carbonT > 0) return;
    this.carbonT = this.r.range(3, 8);
    // trace the strongest flow from a sugar-rich tree toward a hungry one
    let best = null, bq = 0.002;
    for (const t of this.trees) { const n = this.nodes.get(t.node); if (!n) continue; for (const eid of n.edges) { const e = this.edges.get(eid); if (!e) continue; const q = e.a === n.id ? e.Q : -e.Q; if (q > bq) { bq = q; best = { t, e, n }; } } }
    if (!best) return;
    const pts = [[best.n.x, best.n.y]]; let cur = best.n, edge = best.e, guard = 0; const used = new Set();
    while (edge && guard++ < 14) {
      used.add(edge.id);
      const fwd = edge.a === cur.id; const seq = fwd ? edge.pts : edge.pts.slice().reverse();
      for (let i = 1; i < seq.length; i++) pts.push(seq[i]);
      cur = this.nodes.get(fwd ? edge.b : edge.a); if (!cur) break;
      if (cur.type === 'tree' && cur.id !== best.n.id) break;
      let nx = null, nq = 0; for (const eid of cur.edges) { if (used.has(eid)) continue; const e = this.edges.get(eid); if (!e) continue; const q = e.a === cur.id ? e.Q : -e.Q; if (q > nq) { nq = q; nx = e; } }
      edge = nx;
    }
    if (!cur || cur.type !== 'tree' || cur.id === best.n.id) return;
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const dst = this.treeById(cur.tree); if (!dst) return;
    const c = { pts, cum, len: cum[cum.length - 1], s: 0, k: 0, speed: 2.2, src: best.t.id, dst: dst.id, x: pts[0][0], y: pts[0][1], voice: null };
    this.carbon.push(c);
    if (this.canSpawn(this.budget.carbon, 2)) {
      const T = c.len / c.speed;
      const id = this.audio.spawn(K.DRONE, { x: c.x, y: c.y, z: 0.2, f: this.freq(best.t.deg, 1), r: [1, 2, 3, 5], a: [1, 0.3, 0.12, 0.05], breath: 0.15, bq: 3, bright: 0.45, det: 6, trate: 0.4, tdep: 0.2, glide: T * 0.8, gain: 0.4, att: 0.8, rel: 1.2, dur: T, layer: LAYER.SIGNALS, send: 0.5, prio: 2 });
      if (id) { this.audio.set(id, { f: this.freq(dst.deg, 1), glide: T * 0.8 }); c.voice = id; this.budget.carbon.add(id); }
    }
    if (this.r.chance(0.35)) this.log(`Sugar moves from tree ${best.t.id} to tree ${dst.id} through ${used.size} hyphal cords.`, 'carbon');
  }

  // ---------------------------------------------------------- fruiting & spores
  fruitStep(dt) {
    const r = this.r;
    for (const g of this.genets.values()) {
      if (this.fruits.length >= 4) break;
      if (g.energy < g.sp.fruitCost || this.moist < 0.42) continue;
      if (!r.chance(dt * 0.03 * this.p.bloom * (this.moist - 0.3))) continue;
      const cands = [...this.nodes.values()].filter(n => n.type === 'j' && n.edges.size >= 1 && [...n.edges].some(eid => { const e = this.edges.get(eid); return e && e.g === g.id; }) && !this.treeAt(n.x, n.y, 2.2) && !this.fruits.some(f => Math.hypot(f.x - n.x, f.y - n.y) < 3));
      if (!cands.length) continue;
      const n = cands.reduce((a, b) => (b.edges.size + r() > a.edges.size + r() ? b : a));
      g.energy -= g.sp.fruitCost;
      const f = { id: this.stats.fruits++, node: n.id, x: n.x, y: n.y, g: g.id, phase: 'emerge', t: 0, size: 0, voice: null, spores: 0, maxSpores: r.int(3, 7) };
      this.fruits.push(f);
      if (this.canSpawn(this.budget.fruit, 4)) {
        const sp = g.sp;
        const id = this.audio.spawn(K.GRAIN, { x: n.x, y: n.y, z: 0.15, slot: this.matB && r.chance(0.6) ? 1 : 0, dens: sp.fDens * 0.3, size: sp.fSize, pitch: Math.pow(2, sp.fOct), ps: this.scaleRatios(4, n.deg + sp.degOff), pos: r(), pj: 0.08, scan: r.range(-0.03, 0.03), lp: 0.35, rev: sp.fRev, gain: 0.0, att: 3, rel: 4, layer: LAYER.FRUIT, send: 0.6, prio: 2 });
        if (id) { f.voice = id; this.budget.fruit.add(id); }
      }
      this.log(`${g.name} is fruiting near the ${this.compass(n.x, n.y)}. A mushroom pushes up through the litter.`, 'fruit');
    }
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i]; f.t += dt; const g = this.genets.get(f.g); const sp = g ? g.sp : this.seed.species[0];
      if (f.phase === 'emerge') {
        f.size = Math.min(1, f.t / 12);
        if (f.voice) this.audio.set(f.voice, { gain: 0.5 * f.size, dens: sp.fDens * (0.3 + f.size * 0.7), lp: 0.3 + f.size * 0.5 });
        if (f.t > 12) { f.phase = 'mature'; f.t = 0; const n = this.nodes.get(f.node) || { deg: 0 }; this.ping(f.x, f.y, 0.5, { deg: n.deg + 2 }, sp, 1.1, 10); }
      } else if (f.phase === 'mature') { if (f.t > 6) { f.phase = 'spore'; f.t = 0; } }
      else if (f.phase === 'spore') {
        if (f.spores < f.maxSpores && f.t > f.spores * 1.1) { f.spores++; this.releaseSpore(f, sp); }
        if (f.t > f.maxSpores * 1.1 + 2) { f.phase = 'decay'; f.t = 0; if (f.voice) this.audio.set(f.voice, { pitch: Math.pow(2, sp.fOct - 1), lp: 0.15, dens: sp.fDens * 0.3 }); }
      } else if (f.phase === 'decay') {
        f.size = Math.max(0, 1 - f.t / 10);
        if (f.voice) this.audio.set(f.voice, { gain: 0.4 * f.size });
        if (f.t > 10) { if (f.voice) this.audio.rel(f.voice, 2); this.addLitter(f.x, f.y, 0.6); this.fruits.splice(i, 1); }
      }
    }
  }
  releaseSpore(f, sp) {
    const r = this.r, a = this.windDir + r.gauss() * 0.8, sp0 = r.range(0.4, 1.4);
    const s = { x: f.x, y: f.y, z: 0.5, vx: Math.sin(a) * sp0, vy: Math.cos(a) * sp0, vz: r.range(1.2, 2.6), age: 0, life: r.range(8, 22), g: f.g, sp, voice: null };
    this.spores.push(s);
    if (this.canSpawn(this.budget.spore, 8)) {
      const id = sp.spore === 'grain'
        ? this.audio.spawn(K.GRAIN, { x: s.x, y: s.y, z: s.z, slot: 0, dens: r.range(10, 26), size: r.range(0.015, 0.05), pitch: Math.pow(2, r.int(1, 3)), ps: this.scaleRatios(3, sp.degOff), pj: 0.3, lp: 0.9, gain: 0.3, att: 0.3, rel: 1.5, layer: LAYER.FRUIT, send: 0.8, prio: 1 })
        : this.audio.spawn(K.TICK, { x: s.x, y: s.y, z: s.z, rate: r.range(3, 9), f: sp.tickF * 1.4, q: sp.tickQ * 1.5, jit: 0.15, burst: 0.1, gain: 0.45, att: 0.2, rel: 1, layer: LAYER.FRUIT, send: 0.8, prio: 1 });
      if (id) { s.voice = id; this.budget.spore.add(id); }
    }
  }
  sporeStep(dt) {
    const r = this.r; const wx = Math.sin(this.windDir) * this.windStr * 3, wy = Math.cos(this.windDir) * this.windStr * 3;
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i]; s.age += dt;
      s.vx += ((wx - s.vx) * 0.6 + r.gauss() * 1.2) * dt; s.vy += ((wy - s.vy) * 0.6 + r.gauss() * 1.2) * dt; s.vz += (-0.35 - s.vz * 0.3 + r.gauss() * 0.6) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.voice) this.audio.move(s.voice, s.x, s.y, s.z);
      if (s.z <= 0 || s.age > s.life) {
        this.spores.splice(i, 1); if (s.voice) this.audio.rel(s.voice, 0.6);
        const parent = this.genets.get(s.g);
        const inside = Math.hypot(s.x, s.y) < PLOT_R - 1;
        if (inside && s.z <= 0.05 && this.genets.size < 7 && r.chance(0.18 + this.moist * 0.25) && !this.nearPoint(s.x, s.y, 1.2)) {
          const child = this.addGenet(mutateSpecies(s.sp, r, this.p.mutation), parent);
          child.energy = 0.8;
          const n = this.addNode(s.x, s.y, 'j', child.id); n.deg = s.sp.degOff + r.int(0, 4);
          const k = r.int(2, 3); for (let j = 0; j < k; j++) this.addTip(child, n.id, s.x, s.y, r.range(0, Math.PI * 2), 0.1);
          this.stats.germ++;
          this.ping(s.x, s.y, 0, n, child.sp, 0.8, 10);
          this.log(`A spore of ${parent ? parent.name : 'the forest'} germinated: ${child.name}, a new individual with mutated growth and voice.`, 'spore');
        }
      }
    }
  }

  // ---------------------------------------------------------- pruning & death
  prune(dt) {
    this._pr = (this._pr || 0) + dt; if (this._pr < 1) return; this._pr = 0;
    for (const e of [...this.edges.values()]) {
      if (e.D < 0.035 && e.age > 25 && !this.fruits.some(f => f.node === e.a || f.node === e.b)) this.removeEdge(e, true);
    }
    for (const g of [...this.genets.values()]) {
      g.energy = Math.min(g.energy, 4);
      const hasTips = this.tips.some(t => t.g === g.id); let hasEdges = false; for (const e of this.edges.values()) if (e.g === g.id) { hasEdges = true; break; }
      if (!hasTips && !hasEdges && this.t - g.born > 10) { this.genets.delete(g.id); this.log(`${g.name} has died out. Its matter returns to the soil.`, 'death'); continue; }
      // a fed individual keeps exploring: new tips from strong nodes
      if (g.energy > 0.35 && this.tips.filter(t => t.g === g.id).length < (g.energy > 2.5 ? 9 : 5) && this.r.chance(0.45 * this.p.growth)) {
        const ns = [...this.nodes.values()].filter(n => [...n.edges].some(eid => { const e = this.edges.get(eid); return e && e.g === g.id; }));
        if (ns.length) { const n = this.r.pick(ns); this.addTip(g, n.id, n.x, n.y, this.r.range(0, Math.PI * 2), 0.1); g.energy -= 0.05; }
      }
    }
    for (const l of this.litter) l.a -= 0.002; this.litter = this.litter.filter(l => l.a > 0.02);
    for (const t of this.trees) for (const gid of [...t.links.keys()]) if (!this.genets.has(gid)) t.links.delete(gid);
  }
  events(dt) {
    this.grazeT -= dt;
    if (this.grazeT <= 0) { this.grazeT = this.r.range(70, 200); if (this.trees.length) this.stressTree(this.r.pick(this.trees), 'deer'); }
    if (this._timers) { for (let i = this._timers.length - 1; i >= 0; i--) { const tm = this._timers[i]; tm.t -= dt; if (tm.t <= 0) { this._timers.splice(i, 1); tm.fn(); } } }
  }

  // ---------------------------------------------------------- persistent voices
  updateVoices(dt) {
    const A = this.audio; if (!A.ready) return;
    const s = this.seed, L = this.listener;
    // trees
    for (const t of this.trees) {
      let id = this.v.trees.get(t.id);
      const day = 0.55 + 0.45 * this.light;
      const vigor = clamp(0.4 + 0.35 * t.sugar, 0.15, 1.2);
      const gain = 1.8 * (0.07 + 0.09 * t.size) * day * vigor * (t.hub ? 1.35 : 1) * (t.dying > 0 ? t.dying / 6 : 1);
      if (!id || !A.alive(id)) {
        const f = this.freq(t.deg, 0);
        id = t.type === 'grain'
          ? A.spawn(K.GRAIN, { x: t.x, y: t.y, z: 1.5 + t.size * 2, slot: this.matB && this.r.chance(0.5) ? 1 : 0, dens: 10 + t.size * 8, size: 0.2 + this.r() * 0.3, pitch: f / 220, ps: this.scaleRatios(3, t.deg), pos: this.r(), pj: 0.04, scan: 0.006, lp: 0.45, gain, att: 4, rel: 4, layer: LAYER.TREES, send: 0.55, prio: 3 })
          : A.spawn(K.DRONE, { x: t.x, y: t.y, z: 1.5 + t.size * 2, f, r: t.partials, a: t.amps, breath: t.breath, bq: 4, det: t.det, bright: 0.35, trate: 0.07 + this.r() * 0.1, tdep: 0.15, glide: 3, gain, att: 5, rel: 4, layer: LAYER.TREES, send: 0.55, prio: 3 });
        if (id) this.v.trees.set(t.id, id);
        continue;
      }
      if (t.type === 'grain') A.set(id, { gain, pj: 0.04 + t.defense * 0.25, lp: clamp(0.3 + this.light * 0.3 + t.defense * 0.3 + t.flash * 0.2, 0, 1), dens: 8 + t.size * 8 + t.flash * 12 + t.stress * 20 });
      else A.set(id, { gain, a: t.amps, bright: clamp(0.2 + this.light * 0.35 + t.defense * 0.35, 0, 1), inh: clamp(t.defense * 0.7, 0, 1), trate: 0.08 + t.stress * 6, tdep: 0.12 + t.stress * 0.45, flash: t.flash > 0.3 ? t.flash * 0.5 : 0, breath: t.breath + t.stress * 0.25 });
    }
    for (const [tid, id] of this.v.trees) if (!this.treeById(tid)) { A.rel(id, 4); this.v.trees.delete(tid); }
    // growth: tick voices follow the tips nearest to you
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 2;
      const near = this.tips.slice().sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)).slice(0, 4);
      for (let i = 0; i < 4; i++) {
        const tip = near[i]; let tv = this.v.ticks[i];
        if (!tip) { if (tv) { A.rel(tv.id, 1); this.v.ticks[i] = null; } continue; }
        const g = this.genets.get(tip.g); if (!g) continue;
        const rate = 2 + g.sp.speed * this.p.growth * 10 * clamp(this.moist, 0.2, 1.2);
        if (!tv || !A.alive(tv.id)) {
          const id = A.spawn(K.TICK, { x: tip.x, y: tip.y, z: -0.25, rate, f: g.sp.tickF, q: g.sp.tickQ, jit: 0.35, burst: g.sp.burst, gain: 0.9, att: 1, rel: 1.5, layer: LAYER.GROWTH, send: 0.3, prio: 1 });
          this.v.ticks[i] = id ? { id, tip: tip.id } : null;
        } else { tv.tip = tip.id; A.set(tv.id, { rate, f: g.sp.tickF, q: g.sp.tickQ, burst: g.sp.burst }); }
      }
    }
    // weather and soil
    const raining = this.rainT > 0;
    if (raining && this.v.rain.length === 0) {
      for (let i = 0; i < 3; i++) { const id = A.spawn(K.NOISE, { x: L.x, y: L.y, z: 5, bf: 3000 + i * 1200, bq: 0.7, lp: 0.75, srate: 0.03, sdep: 0.3, gust: 0.3, drops: 14, df: 2600 + i * 600, gain: 0.0, att: 6, rel: 8, layer: LAYER.WEATHER, send: 0.5, prio: 3 }); if (id) this.v.rain.push({ id, a: i * Math.PI * 2 / 3 }); }
    } else if (!raining && this.v.rain.length) { for (const v of this.v.rain) A.rel(v.id, 10); this.v.rain = []; }
    for (const v of this.v.rain) A.set(v.id, { gain: 0.08 * clamp(this.rainT / 4, 0, 1), drops: 10 + this.moist * 14 });
    if (!this.v.wind || !A.alive(this.v.wind)) this.v.wind = A.spawn(K.NOISE, { x: L.x, y: L.y + 12, z: 8, bf: 600, bq: 1.8, lp: 0.5, srate: 0.04, sdep: 0.7, gust: 0.6, gain: 0.05, att: 6, rel: 4, layer: LAYER.WEATHER, send: 0.6, prio: 3 });
    else A.set(this.v.wind, { gain: 0.02 + this.windStr * 0.07, bf: 350 + this.windStr * 900, gust: 0.3 + this.windStr * 0.6 });
    if (!this.v.soil || !A.alive(this.v.soil)) this.v.soil = A.spawn(K.NOISE, { x: L.x, y: L.y, z: -2, bf: 140, bq: 0.8, lp: 0.12, srate: 0.02, sdep: 0.4, gust: 0.2, crk: 2, gain: 0.05, att: 6, rel: 4, layer: LAYER.WEATHER, send: 0.25, prio: 3 });
    else { this.decomp *= 0.8; A.set(this.v.soil, { crk: 1 + this.tips.length * 0.4 + this.decomp * 200, gain: 0.03 + this.moist * 0.03 }); }
  }
  // per-frame movement of persistent moving voices
  frameVoices() {
    const A = this.audio, L = this.listener; if (!A.ready) return;
    for (const tv of this.v.ticks) if (tv) { const tip = this.tips.find(t => t.id === tv.tip); if (tip) A.move(tv.id, tip.x, tip.y, -0.25); }
    for (const v of this.v.rain) { v.a += 0.002; A.move(v.id, L.x + Math.sin(v.a) * 6, L.y + Math.cos(v.a) * 6, 5); }
    if (this.v.wind) { const a = this.windDir + Math.PI + Math.sin(this.t * 0.1) * 0.6; A.move(this.v.wind, L.x + Math.sin(a) * 13, L.y + Math.cos(a) * 13, 8); }
    if (this.v.soil) A.move(this.v.soil, L.x, L.y, -2);
  }
  dropVoices() { this.v = { trees: new Map(), ticks: [], rain: [], wind: null, soil: null }; for (const k in this.budget) this.budget[k].clear(); for (const s of this.signals) s.voice = null; for (const s of this.spores) s.voice = null; for (const f of this.fruits) f.voice = null; for (const c of this.carbon) c.voice = null; }

  // ---------------------------------------------------------- interaction
  compass(x, y) { const a = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360; return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8]; }
  pick(x, y) {
    const t = this.treeAt(x, y, 1.6); if (t) return { type: 'tree', obj: t };
    let bn = null, bd = 1.2; for (const n of this.nodes.values()) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; bn = n; } }
    if (bn) return { type: 'node', obj: bn };
    const hp = this.nearPoint(x, y, 0.8); if (hp) return { type: 'edge', obj: hp.e, i: hp.i };
    return null;
  }
  touch(x, y) {
    const p = this.pick(x, y); if (!p) return false;
    if (p.type === 'tree') { const n = this.nodes.get(p.obj.node); if (n && n.edges.size) { n.refr = 0; this.fire(n, false, 0, 0); } p.obj.flash = 1.2; this.log(`You touched tree ${p.obj.id}. It speaks into the network.`, 'touch'); return true; }
    if (p.type === 'node') { p.obj.refr = 0; this.fire(p.obj, false, 0, 0); return true; }
    if (p.type === 'edge') { const n = this.nodes.get(p.obj.a); if (n) { n.refr = 0; this.fire(n, false, 0, 0); } return true; }
    return false;
  }
  plantAt(x, y) {
    if (Math.hypot(x, y) > PLOT_R - 1 || this.treeAt(x, y, 2) || this.trees.length >= 12) return false;
    const near = this.treeAt(x, y, 12);
    const t = this.addTree(x, y, { size: 0.35, kin: near ? near.kin : this.r.int(0, 2), deg: near ? clamp(near.deg + this.r.pick([-1, 1, 2]), 0, 20) : this.r.int(0, this.seed.tun.ratios.length * 2), sugar: 0.7 });
    this.log(`You planted a seedling (tree ${t.id}). It will need fungal partners to survive in the shade.`, 'tree'); return true;
  }
  inoculate(x, y) {
    if (Math.hypot(x, y) > PLOT_R - 0.5 || this.genets.size >= 8) return false;
    const base = this.genets.size ? this.r.pick([...this.genets.values()]).sp : this.seed.species[0];
    const g = this.addGenet(mutateSpecies(base, this.r, 1.5 * this.p.mutation + 0.5), null); g.energy = 1;
    const n = this.addNode(x, y, 'j', g.id); n.deg = g.sp.degOff + this.r.int(0, 4);
    for (let j = 0; j < 3; j++) this.addTip(g, n.id, x, y, this.r.range(0, Math.PI * 2), 0.1);
    this.ping(x, y, 0, n, g.sp, 0.9, 10);
    this.log(`You sowed spores. ${g.name}, a new individual, starts to grow.`, 'spore'); return true;
  }
  cut(x1, y1, x2, y2) {
    let n = 0;
    for (const e of [...this.edges.values()]) {
      for (let i = 1; i < e.pts.length; i++) { if (segX(x1, y1, x2, y2, e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1])) { const m = e.pts[i]; this.removeEdge(e, true); n++; this.fx(K.MODAL, { x: m[0], y: m[1], z: -0.2, f: this.freq(this.r.int(4, 10), 2), r: PING_SETS.wood, d: [0.08, 0.05, 0.03, 0.02], a: [1, 0.6, 0.4, 0.3], hard: 1, gain: 0.25, layer: LAYER.GROWTH, send: 0.4 }); break; } }
    }
    for (const tip of [...this.tips]) { const a = tip.pts[tip.pts.length - 2] || tip.pts[0]; if (segX(x1, y1, x2, y2, a[0], a[1], tip.x, tip.y)) { this.tips.splice(this.tips.indexOf(tip), 1); n++; } }
    if (n) this.log(`You cut ${n} hyph${n > 1 ? 'ae' : 'a'}. The network will reroute around the wound.`, 'cut');
    return n;
  }
  fell(t) { if (!t || t.dying > 0) return; t.dying = 10; this.log(`Tree ${t.id} is dying. It pours its sugar into the network for its neighbours.`, 'death'); }
}
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}
function setTimeoutSim(w, t, fn) { (w._timers || (w._timers = [])).push({ t, fn }); }

if (typeof module !== 'undefined') module.exports = { World, makeSeed, makeMaterial, randomCode, flowerCenters, ratioOf, mutateSpecies, makeRng, hashStr, K, LAYER, PLOT_R, PETAL, FAMILY_NAMES };
