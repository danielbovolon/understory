// UNDERSTORY — the living system
//
// Two clocks. The SKY runs on the real local clock (scaled by Time): sun,
// temperature, season, weather. LIFE is compressed. A forest never stops:
// pioneers age and fall, gaps open, other species take over, and over long
// runs a forest can change its whole character.
//
// Succession: the forest starts as bare soil with a seed bank. Seedlings
// germinate one by one on the centres of the flower of life. Spores of
// early-stage ectomycorrhizal fungi drift in on the wind and germinate only
// near host roots. Late-stage fungi arrive once there is a canopy;
// saprotrophs arrive once there is litter.
//
// Biology modelled (see docs/how-it-lives.md):
//  - hyphal tips: persistent random walk, chemotropism, apical branching,
//    anastomosis, vegetative incompatibility, exploration types (Agerer)
//  - Physarum-style transport: pressure flow, use-dependent cord thickening
//  - a biological market: fungi forage nutrients and trade them for carbon;
//    trees pay in proportion to delivery (Kiers et al. 2011)
//  - electrical spike trains along hyphae (Adamatzky), boosted after rain
//    and by warmth (Fukasawa et al. 2023)
//  - hydraulic redistribution: water lifted by deep roots at night and
//    passed to mycorrhizal partners (Querejeta et al. 2003)
//  - plant stress sounds: xylem clicks, ~1/h when fine, up to ~35/h when
//    drought-stressed (Khait et al. 2023), transposed into hearing range
//  - fruiting at the colony margin (fairy rings), ballistospore discharge,
//    evaporative updraft under the cap (Dressaire et al. 2016), spores on the
//    wind, mutation
//  - saprotrophs decompose litter into nutrient patches; some glow at night
//    under circadian control (Oliveira et al. 2015)

const K = { MODAL: 0, DRONE: 1, GRAIN: 2, TICK: 3, CHIRP: 4, NOISE: 5 };
const LAYER = { TREES: 0, SIGNALS: 1, GROWTH: 2, FRUIT: 3, WEATHER: 4, FAUNA: 5 };
const FG_MAX = 14; // most foreground sounds allowed at once, so the forest never gets crowded
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const CHAR_DEFAULT = () => ({ trees: { reg: 0, tone: 0 }, signals: { pace: 0, reg: 0 }, growth: { density: 0, tone: 0 }, fruit: { grain: 0, reg: 0 }, weather: { tone: 0, width: 0 }, fauna: { activity: 0, dist: 0 } });
const CONIFERS = /pine|larch|spruce|fir|juniper|yew/i;
const PLOT_R = 21, PETAL = 7;
const LAT = 46.5; // latitude used for day length (Alpine valley)

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

// ------------------------------------------------------------ sky
const MONTH_T = [0, 3, 8, 12, 17, 20, 23, 22, 18, 12, 6, 1]; // monthly mean °C, Alpine valley floor
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }
function sunTimes(doy, dst) {
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365) * Math.PI / 180;
  const c = clamp(-Math.tan(LAT * Math.PI / 180) * Math.tan(decl), -1, 1);
  const len = 2 * Math.acos(c) * 180 / Math.PI / 15;
  const noon = 12.3 + (dst ? 1 : 0);
  return { rise: noon - len / 2, set: noon + len / 2, len };
}

// ------------------------------------------------------------ seeds
// Tree species of an Alpine valley forest. Niches (0..1): site wetness,
// soil acidity, fertility, shade tolerance, tolerance of stony ground.
// Colours [hue, sat, light] for spring, summer, autumn and winter.
// leaf: 'ever' evergreen, 'decid' deciduous, 'marc' keeps dry leaves through winter (marcescence).
// soil: how its litter changes the ground beneath it (needles acidify, alder fixes nitrogen).
const TREE_SPECIES = {
  larch: { life: 51000, name: 'European larch', short: 'Larch', leaf: 'decid', conifer: true, wet: 0.45, acid: 0.4, rich: 0.35, shade: 0.15, stone: 0.6, partials: 'fifths', regDeg: 0, col: [[95, 60, 58], [110, 42, 42], [44, 85, 55], [30, 22, 46]], soil: { acid: 1 } },
  stonepine: { life: 90000, name: 'Swiss stone pine', short: 'Stone pine', leaf: 'ever', conifer: true, wet: 0.4, acid: 0.7, rich: 0.25, shade: 0.35, stone: 0.8, partials: 'hollow', regDeg: -2, col: [[150, 32, 38], [155, 32, 34], [158, 28, 33], [165, 22, 34]], soil: { acid: 1.4 } },
  spruce: { life: 54000, name: 'Norway spruce', short: 'Spruce', leaf: 'ever', conifer: true, wet: 0.65, acid: 0.75, rich: 0.4, shade: 0.75, stone: 0.4, partials: 'odd', regDeg: -3, col: [[145, 38, 34], [150, 38, 30], [152, 34, 29], [160, 26, 30]], soil: { acid: 1.6 } },
  fir: { life: 66000, name: 'Silver fir', short: 'Silver fir', leaf: 'ever', conifer: true, wet: 0.65, acid: 0.45, rich: 0.6, shade: 0.9, stone: 0.3, partials: 'harmonic', regDeg: -1, col: [[165, 34, 36], [168, 34, 33], [170, 30, 32], [175, 24, 33]], soil: { acid: 0.6 } },
  beech: { life: 69000, name: 'European beech', short: 'Beech', leaf: 'marc', conifer: false, wet: 0.55, acid: 0.35, rich: 0.65, shade: 0.9, stone: 0.3, partials: 'stretched', regDeg: 0, col: [[88, 62, 60], [105, 45, 40], [22, 72, 46], [28, 45, 40]], soil: { rich: 0.6 } },
  birch: { life: 22500, name: 'Silver birch', short: 'Birch', leaf: 'decid', conifer: false, wet: 0.5, acid: 0.6, rich: 0.3, shade: 0.1, stone: 0.6, partials: 'bell', regDeg: 3, col: [[80, 62, 62], [92, 48, 46], [52, 88, 58], [40, 8, 72]], soil: {} },
  alder: { life: 28500, name: 'Black alder', short: 'Alder', leaf: 'decid', conifer: false, wet: 0.95, acid: 0.35, rich: 0.5, shade: 0.3, stone: 0.2, partials: 'septimal', regDeg: 1, col: [[100, 48, 48], [118, 42, 34], [85, 28, 36], [25, 15, 34]], soil: { rich: 1.4 } },
  oak: { life: 84000, name: 'Sessile oak', short: 'Oak', leaf: 'marc', conifer: false, wet: 0.35, acid: 0.45, rich: 0.5, shade: 0.45, stone: 0.4, partials: 'harmonic', regDeg: -2, col: [[72, 58, 56], [98, 42, 38], [34, 62, 42], [30, 38, 36]], soil: { rich: 0.4 } },
};
const TREE_KEYS = Object.keys(TREE_SPECIES);
// Fungal genera with their ecology:
// [genus, guild, stage, exploration type, hosts ('any' or tree keys), preferred acidity, preferred wetness,
//  tolerance of nitrogen-rich soil (many ectomycorrhizal fungi decline on rich soil), fruiting months [from, to] (0 = January; wraps) or null, chance to glow]
const FUNGI = [
  ['Laccaria', 'ecm', 'early', 'medium', 'any', 0.5, 0.6, 0.7, [6, 10], 0],
  ['Inocybe', 'ecm', 'early', 'short', 'any', 0.4, 0.5, 0.6, [5, 9], 0],
  ['Hebeloma', 'ecm', 'early', 'medium', 'any', 0.35, 0.5, 0.8, [8, 11], 0],
  ['Thelephora', 'ecm', 'early', 'medium', 'any', 0.6, 0.4, 0.6, [6, 10], 0],
  ['Cortinarius', 'ecm', 'late', 'medium', 'any', 0.6, 0.5, 0.2, [7, 10], 0],
  ['Russula', 'ecm', 'late', 'contact', 'any', 0.6, 0.5, 0.3, [5, 9], 0],
  ['Lactarius', 'ecm', 'late', 'contact', 'any', 0.55, 0.6, 0.35, [7, 10], 0],
  ['Amanita', 'ecm', 'late', 'medium', 'any', 0.5, 0.45, 0.4, [6, 10], 0],
  ['Boletus', 'ecm', 'late', 'long', 'any', 0.45, 0.45, 0.4, [5, 9], 0],
  ['Tricholoma', 'ecm', 'late', 'medium', 'any', 0.5, 0.4, 0.3, [8, 11], 0],
  ['Hygrophorus', 'ecm', 'late', 'medium', 'any', 0.5, 0.6, 0.3, [2, 4], 0],
  ['Cenococcum', 'ecm', 'late', 'short', 'any', 0.5, 0.2, 0.6, null, 0],
  ['Suillus', 'ecm', 'host', 'long', ['larch', 'stonepine'], 0.6, 0.5, 0.5, [6, 10], 0],
  ['Rhizopogon', 'ecm', 'host', 'long', ['stonepine'], 0.6, 0.35, 0.5, [6, 9], 0],
  ['Leccinum', 'ecm', 'host', 'long', ['birch'], 0.6, 0.6, 0.5, [6, 10], 0],
  ['Alnicola', 'ecm', 'host', 'short', ['alder'], 0.3, 0.9, 0.7, [7, 10], 0],
  ['Mycena', 'sapro', 'litter', 'short', 'any', 0.6, 0.7, 0.6, [8, 11], 0.7],
  ['Panellus', 'sapro', 'litter', 'short', 'any', 0.5, 0.6, 0.6, [9, 0], 0.8],
  ['Armillaria', 'sapro', 'litter', 'long', 'any', 0.4, 0.6, 0.6, [8, 10], 0.6],
  ['Marasmius', 'sapro', 'litter', 'medium', 'any', 0.3, 0.3, 0.7, [5, 9], 0],
  ['Gymnopus', 'sapro', 'litter', 'medium', 'any', 0.5, 0.5, 0.6, [5, 10], 0.1],
  ['Flammulina', 'sapro', 'litter', 'medium', 'any', 0.4, 0.6, 0.7, [10, 2], 0],
];
const FUNGUS = Object.fromEntries(FUNGI.map(f => [f[0], { genus: f[0], guild: f[1], stage: f[2], expl: f[3], hosts: f[4], pAcid: f[5], pWet: f[6], nitro: f[7], months: f[8], lumP: f[9] }]));
const COVER = ['bare', 'grass', 'moss', 'fern', 'heath', 'sedge', 'stone', 'litter'];
const SOIL_N = 28, SOIL_CELL = (2 * (PLOT_R + 1)) / SOIL_N;
const MAX_TREES = 32, MAX_FUNGI = 64, WILD_TREES = 24, WILD_FUNGI = 26;
function inMonths(m, w) { if (!w) return false; const [a, b] = w; return a <= b ? m >= a && m <= b : m >= a || m <= b; }
function fruitSeason(sp, m) { if (!sp.months) return 0; if (inMonths(m, sp.months)) return 1; if (inMonths((m + 1) % 12, sp.months) || inMonths((m + 11) % 12, sp.months)) return 0.3; return 0; }

const PLACES = ['Moor', 'Hollow', 'Ridge', 'Scree', 'Bog', 'Gorge', 'Terrace', 'Clearing', 'Ravine', 'Meadow edge', 'Firn line', 'Talus', 'Riverbank', 'Cirque', 'Old orchard', 'Charcoal pit', 'Larch meadow', 'Glacier foreland', 'Burnt slope'];
const FAMILIES = ['bark', 'rain', 'creek', 'wind', 'glass', 'choir', 'insects', 'stone', 'bowed', 'cave'];
const FAMILY_NAMES = { bark: 'knocked bark', rain: 'rain on needles', creek: 'meltwater creek', wind: 'wind in reeds', glass: 'ice and glass', choir: 'distant voices', insects: 'stridulation', stone: 'struck stones', bowed: 'bowed branch', cave: 'cave drips' };
const PARTIAL_SETS = {
  harmonic: [1, 2, 3, 4], odd: [1, 3, 5, 7], stretched: [1, 2.02, 3.07, 4.16], bell: [1, 2.76, 5.4, 8.93],
  fifths: [1, 1.5, 2, 3], hollow: [1, 2.4, 4.1, 6.3], septimal: [1, 1.75, 2, 3.5],
};
const PING_SETS = { wood: [1, 2.57, 4.1, 6.9], glass: [1, 2.32, 4.25, 6.63], marimba: [1, 3.99, 9.0, 15.4], bell: [1, 2.76, 5.4, 8.93], string: [1, 2, 3, 4.01], membrane: [1, 1.59, 2.14, 2.3] };
const JI = [1, 16 / 15, 9 / 8, 7 / 6, 6 / 5, 5 / 4, 4 / 3, 7 / 5, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 15 / 8];

// Ectomycorrhizal exploration types (Agerer 2001): how far and how densely
// the extramatrical mycelium reaches out from the root tip.
const EXPLORATION = {
  contact: { label: 'contact', speed: [0.05, 0.09], branch: [0.5, 0.8], wander: [0.9, 1.4], life: [60, 120], cost: 0.5, cord: 0.6, cond: 0.7, orgN: 0.3, water: 0.2, reg: [3, 4] },
  short: { label: 'short-distance', speed: [0.07, 0.13], branch: [0.4, 0.65], wander: [0.7, 1.1], life: [80, 160], cost: 0.7, cord: 0.8, cond: 0.85, orgN: 0.45, water: 0.35, reg: [3, 4] },
  medium: { label: 'medium-distance', speed: [0.1, 0.2], branch: [0.25, 0.45], wander: [0.4, 0.8], life: [120, 240], cost: 1, cord: 1, cond: 1, orgN: 0.65, water: 0.6, reg: [2, 3] },
  long: { label: 'long-distance', speed: [0.18, 0.3], branch: [0.1, 0.22], wander: [0.15, 0.4], life: [200, 380], cost: 1.5, cord: 1.4, cond: 1.5, orgN: 1, water: 1, reg: [1, 2] },
};

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

function makeSpecies(r, tun, hue, def) {
  const genus = def.genus, ex = def.expl, role = def;
  const E = EXPLORATION[ex];
  const pingKey = r.pick(Object.keys(PING_SETS));
  return {
    genus, guild: def.guild, stage: def.stage, expl: ex, lum: def.lumP ? r.chance(def.lumP) : false,
    hosts: def.hosts, pAcid: def.pAcid, pWet: def.pWet, nitro: def.nitro, months: def.months,
    hue: hue === undefined ? r.range(0, 360) : hue,
    speed: r.range(...E.speed), branch: r.range(...E.branch), bangle: r.range(0.45, 1.1), wander: r.range(...E.wander), trop: r.range(0.4, 1.4),
    life: r.range(...E.life), cost: E.cost, cord: E.cord, cond: E.cond, orgN: E.orgN, water: E.water,
    sigSpeed: r.range(1.4, 3.6) * E.cond, prop: r.range(0.45, 0.85), word: r.range(2, 7), reg: r.int(...E.reg), degOff: r.int(0, tun.ratios.length - 1),
    mr: r.pick([0.5, 1, 1.41, 2, 2.76, 3.5]) * r.range(0.98, 1.02), mi: r.range(0, 2.8), glide: r.range(-0.6, 0.9), bd: r.range(0.012, 0.05) * (ex === 'long' ? 1.6 : 1),
    ping: PING_SETS[pingKey].slice(), pingName: pingKey, pdec: r.range(0.25, 2.4), hard: r.range(0.2, 0.9),
    tickF: r.range(1400, 6500) * (ex === 'contact' ? 1.4 : ex === 'long' ? 0.6 : 1), tickQ: r.range(3, 14), burst: r.range(0.05, 0.4),
    fSize: r.range(0.05, 0.32), fOct: r.int(-1, 2), fDens: r.range(6, 36), fRev: r.range(0, 0.5),
    spore: r.chance(0.5) ? 'grain' : 'tick', fruitCost: r.range(1.2, 2.2) * (role.guild === 'sapro' ? 0.6 : 1),
    trade: r.range(0.6, 1.2), greed: r.chance(0.25) ? r.range(0.3, 0.6) : r.range(0, 0.15),
  };
}
function mutateSpecies(g, r, amt) {
  const m = { ...g, ping: g.ping.slice() };
  const jig = (v, s, a, b) => clamp(v * Math.exp(r.gauss() * s * amt), a, b);
  m.hue = (g.hue + r.gauss() * 30 * amt + 360) % 360;
  m.speed = jig(g.speed, 0.2, 0.03, 0.45); m.branch = jig(g.branch, 0.25, 0.05, 0.9); m.bangle = jig(g.bangle, 0.2, 0.3, 1.4);
  m.wander = jig(g.wander, 0.25, 0.1, 1.8); m.trop = jig(g.trop, 0.25, 0.1, 2.2); m.life = jig(g.life, 0.2, 40, 500);
  m.sigSpeed = jig(g.sigSpeed, 0.2, 0.6, 8); m.prop = clamp(g.prop + r.gauss() * 0.08 * amt, 0.3, 0.92); m.word = jig(g.word, 0.25, 1, 12);
  if (r.chance(0.25 * amt)) m.reg = clamp(g.reg + (r.chance(0.5) ? 1 : -1), 1, 5);
  if (r.chance(0.4 * amt)) m.degOff = g.degOff + r.pick([-2, -1, 1, 2]);
  m.mr = jig(g.mr, 0.15, 0.25, 6); m.mi = clamp(g.mi + r.gauss() * 0.5 * amt, 0, 5); m.glide = clamp(g.glide + r.gauss() * 0.3 * amt, -1.2, 1.5);
  m.bd = jig(g.bd, 0.2, 0.006, 0.1); m.ping = g.ping.map((x, i) => i === 0 ? 1 : x * Math.exp(r.gauss() * 0.05 * amt));
  m.pdec = jig(g.pdec, 0.25, 0.1, 4); m.hard = clamp(g.hard + r.gauss() * 0.1 * amt, 0.05, 1);
  m.tickF = jig(g.tickF, 0.2, 600, 9000); m.tickQ = jig(g.tickQ, 0.2, 1.5, 25); m.burst = clamp(g.burst + r.gauss() * 0.08 * amt, 0, 0.8);
  m.fSize = jig(g.fSize, 0.25, 0.02, 0.6); if (r.chance(0.2 * amt)) m.fOct = clamp(g.fOct + r.pick([-1, 1]), -2, 3);
  m.fDens = jig(g.fDens, 0.25, 3, 60); m.fRev = clamp(g.fRev + r.gauss() * 0.1 * amt, 0, 0.9);
  if (r.chance(0.1 * amt)) m.spore = g.spore === 'grain' ? 'tick' : 'grain';
  if (g.pAcid !== undefined) { m.pAcid = clamp(g.pAcid + r.gauss() * 0.05 * amt, 0, 1); m.pWet = clamp(g.pWet + r.gauss() * 0.05 * amt, 0, 1); }
  m.fruitCost = jig(g.fruitCost, 0.15, 0.5, 3); m.trade = jig(g.trade, 0.2, 0.2, 2); m.greed = clamp(g.greed + r.gauss() * 0.1 * amt, 0, 0.8);
  return m;
}

function makeSeed(code) {
  const r = makeRng(hashStr(code));
  const tun = makeTuning(r);
  const root = r.range(38, 96);
  const fams = r.shuffle(FAMILIES.slice()).slice(0, 2);
  const climate = { moist: r.range(0.35, 0.8), wind: r.range(0.1, 0.65), raininess: r.range(0.2, 1), warm: r.range(-3, 3) };
  const rev = { size: r.range(0.55, 2.4), rt: r.range(1.4, 9), damp: r.range(0.2, 0.85), pre: r.range(0.008, 0.06) };
  const partialKeys = r.shuffle(Object.keys(PARTIAL_SETS)).slice(0, r.int(1, 2));
  const grainTrees = r.range(0.1, 0.55);
  const nTrees = r.int(5, 9);
  const hue0 = r.range(0, 360);
  // the trees of this place: a main species and its companions
  const main = r.pick(TREE_KEYS);
  const treeSpecies = [main, ...r.shuffle(TREE_KEYS.filter(k => k !== main)).slice(0, r.int(2, 3))];
  // the species pool: who may arrive on the wind, and when
  const gen = FUNGI.map(f => FUNGUS[f[0]]);
  const defs = [
    ...r.shuffle(gen.filter(f => f.stage === 'early')).slice(0, 2),
    ...r.shuffle(gen.filter(f => f.stage === 'late')).slice(0, 3),
    ...r.shuffle(gen.filter(f => f.stage === 'host' && f.hosts.some(h => treeSpecies.includes(h)))).slice(0, 2),
    ...r.shuffle(gen.filter(f => f.guild === 'sapro')).slice(0, 2),
  ];
  const species = defs.map((d, i) => makeSpecies(r, tun, (hue0 + i * 47 * r.range(0.8, 1.2)) % 360, d));
  // the ground: a wet seep, a stony ridge, a base acidity and fertility
  const soil = { seed: hashStr(code + 's'), seep: [r.range(0, 6.28), r.range(-8, 8), r.range(0.4, 1)], ridge: [r.range(0, 6.28), r.range(-10, 10), r.range(0.3, 0.9)], baseAcid: r.range(0.3, 0.6), baseRich: r.range(0.3, 0.55) };
  const patches = []; const np = r.int(8, 14);
  for (let i = 0; i < np; i++) { const a = r.range(0, Math.PI * 2), d = Math.sqrt(r()) * (PLOT_R - 2); patches.push({ x: Math.sin(a) * d, y: Math.cos(a) * d, a: r.range(0.6, 2), org: r.chance(0.5) }); }
  const name = `${TREE_SPECIES[main].short} ${r.pick(PLACES)}`;
  const matParams = { fams, mix: r.range(0.25, 0.75), seed: hashStr(code + 'm'), bright: r.range(0.2, 1) };
  // the resident songbirds of this forest: each has its own phrase shape
  const birds = []; for (let i = 0; i < 3; i++) birds.push({ f0: r.range(2000, 4600), ratio: Math.pow(2, r.range(-0.6, 0.5)), n: [r.int(3, 6), r.int(7, 14)], isi: r.range(0.05, 0.15), bd: r.range(0.025, 0.07), mi: r.range(0, 1.2), mr: r.pick([1, 2, 3, 0.5]), phrases: r.int(1, 3) });
  const owl = { f0: r.range(360, 520), n: r.int(2, 4), isi: r.range(0.45, 0.8) };
  const cacher = treeSpecies.includes('stonepine') || TREE_SPECIES[main].conifer ? 'nutcrackers' : 'jays';
  return { treeSpecies, soil, birds, owl, cacher, code, name, tun, root, climate, rev, partialKeys, grainTrees, nTrees, species, patches, matParams, kinHue: r.range(15, 60), rngSeed: hashStr(code + 'w') };
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
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i])); const g = pk > 0 ? 0.85 / pk : 0;
  const fl = Math.floor(sr * 0.05); for (let i = 0; i < N; i++) { let w = 1; if (i < fl) w = i / fl; else if (i > N - fl) w = (N - i) / fl; out[i] *= g * w; }
  return out;
}

// ------------------------------------------------------------ world
const STAGES = [
  ['Bare soil', 'Seeds lie in the soil. Only wind and the soil itself are audible.'],
  ['Germination', 'Seedlings break the surface. They live on the reserves of their seeds.'],
  ['First partners', 'Fungal spores have found young roots. The first mycorrhizal bonds form.'],
  ['Network', 'Several trees share fungal partners. Sugar, nutrients and signals start to move.'],
  ['Young forest', 'Trees put on height. Fungi have stored enough to fruit when it rains.'],
  ['Closing canopy', 'Shade spreads. Late-stage fungi arrive, litter builds up, decomposers move in.'],
  ['Old growth', 'A mature forest: hub trees, dense cords, seedlings raised in the shade.'],
];

class World {
  constructor(seed, audio, opts = {}) {
    this.seed = seed; this.audio = audio; this.log = opts.log || (() => { }); this.r = makeRng(seed.rngSeed);
    this.p = opts.params || { growth: 1, chatter: 1, bloom: 1, mutation: 1, moisture: 0.5, wind: 0.5, change: 0.5 };
    const now = opts.now || new Date();
    const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset(), jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
    this.dst = now.getTimezoneOffset() < Math.max(jan, jul);
    this.clockH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    this.doy = dayOfYear(now); this.month = opts.month !== undefined ? opts.month : now.getMonth();
    if (opts.month !== undefined) this.doy = Math.round(opts.month * 30.4 + 15);
    this.t = 0; this.light = 0; this.temp = 10; this.dayAvg = 0.35;
    this.moist = clamp(seed.climate.moist * 0.6 + this.p.moisture * 0.4, 0, 1); this.rainT = 0; this.rainCool = this.r.range(240, 900); this.afterRain = 0;
    this.windDir = this.r.range(0, Math.PI * 2); this.windStr = seed.climate.wind * 0.6;
    this.nodes = new Map(); this.edges = new Map(); this.tips = []; this.trees = []; this.genets = new Map();
    this.signals = []; this.carbon = []; this.water = []; this.fruits = []; this.spores = []; this.litter = []; this.flashes = [];
    this.patches = seed.patches.map(p => ({ ...p, a0: p.a, found: false }));
    this.nid = 1; this.eid = 1; this.tid = 1; this.gid = 1; this.tipid = 1;
    this.hash = new Map(); this.hashDirty = true;
    this.listener = { x: 0, y: 0, yaw: 0 };
    this.v = { trees: new Map(), ticks: [], rain: [], wind: null, soil: null, fox: null };
    this.budget = { ping: new Set(), sig: new Set(), spore: new Set(), carbon: new Set(), fruit: new Set(), fx: new Set(), click: new Set(), fauna: new Set() };
    for (const k of ['ping', 'sig', 'fx', 'click', 'fauna']) this.budget[k].fg = true;
    this.char = opts.char || CHAR_DEFAULT();
    this.snow = 0; this.snowing = false; this.stormT = 0; this.dryT = 0;
    this.rootMul = 1; this.rootTarget = 1; this.keyT = this.r.range(600, 1200); this.tide = 0.5; this.somaT = this.r.range(240, 480);
    this.ev = { rain: 0, deer: 0, storm: 0, dry: 0, cache: 0, squirrel: 0 };
    this.evMax = { rain: 300, deer: 20, storm: 120, dry: 600, cache: 90, squirrel: 75 };
    this.auto = { storm: this.r.range(2400, 4800), dry: this.r.range(2000, 4000), cache: this.r.range(1500, 2600), squirrel: this.r.range(1200, 2400) };
    this.snags = []; this.critters = []; this.calls = []; this.deposits = [];
    this.thunderT = 30;
    this.flowT = 0; this.voiceT = 0; this.tickT = 0; this.carbonT = 20; this.waterT = 30; this.grazeT = this.r.range(600, 1200); this.decomp = 0; this.sporeRainT = this.r.range(20, 45);
    this.stage = 0; this.stats = { born: 0, fused: 0, bonds: 0, fruits: 0, germ: 0, clicks: 0, trades: 0 };
    this.logs = []; this.coverT = 0; this.lightT = 0;
    if (!this.seed.soil) this.seed.soil = { seed: hashStr(this.seed.code + 's'), seep: [1, 0, 0.7], ridge: [2.5, 4, 0.6], baseAcid: 0.45, baseRich: 0.42 };
    if (!this.seed.treeSpecies) this.seed.treeSpecies = ['larch', 'spruce', 'birch'];
    this.makeSoil(); this.updateCover(0);
    this.seedbank = this.makeSeedbank();
    this.updateSky(0);
  }
  // ---------------------------------------------------------- the ground: soil, light and cover
  makeSoil() {
    const S0 = this.seed.soil, r = makeRng(S0.seed), N = SOIL_N;
    const lat = (k) => { const g = []; for (let i = 0; i < k * k; i++) g.push(r() * 2 - 1); return g; };
    const L1 = lat(6), L2 = lat(6), L3 = lat(6), L4 = lat(11);
    const sm = (t) => t * t * (3 - 2 * t);
    const sample = (g, k, u, v) => { const x = u * (k - 1), y = v * (k - 1); const i = Math.min(k - 2, Math.floor(x)), j = Math.min(k - 2, Math.floor(y)); const fx = sm(x - i), fy = sm(y - j); return lerp(lerp(g[j * k + i], g[j * k + i + 1], fx), lerp(g[(j + 1) * k + i], g[(j + 1) * k + i + 1], fx), fy); };
    const wet = new Float32Array(N * N), rich = new Float32Array(N * N), acid = new Float32Array(N * N), stone = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, u = i / (N - 1), v = j / (N - 1); const [x, y] = this.cellXY(i, j);
      const sd = Math.sin(S0.seep[0]) * x + Math.cos(S0.seep[0]) * y - S0.seep[1], seep = Math.exp(-sd * sd / 18) * S0.seep[2];
      const rd = Math.sin(S0.ridge[0]) * x + Math.cos(S0.ridge[0]) * y - S0.ridge[1], ridge = Math.exp(-rd * rd / 14) * S0.ridge[2];
      wet[k] = clamp(sample(L1, 6, u, v) * 0.35 + seep * 0.9 - ridge * 0.5, -1, 1);
      stone[k] = clamp(ridge * 0.9 + Math.max(0, sample(L4, 11, u, v)) * 0.3 - 0.1, 0, 1);
      rich[k] = clamp(S0.baseRich + sample(L2, 6, u, v) * 0.25 + seep * 0.15 - ridge * 0.25, 0, 1);
      acid[k] = clamp(S0.baseAcid + sample(L3, 6, u, v) * 0.25 + ridge * 0.1, 0, 1);
    }
    this.soil = { wet, rich, acid, stone, light: new Float32Array(N * N).fill(1), cover: new Uint8Array(N * N), coverD: new Float32Array(N * N), base: { wet: wet.slice(), rich: rich.slice(), acid: acid.slice(), stone: stone.slice() } };
  }
  cellXY(i, j) { return [-(PLOT_R + 1) + (i + 0.5) * SOIL_CELL, -(PLOT_R + 1) + (j + 0.5) * SOIL_CELL]; }
  cellOf(x, y) { const i = clamp(Math.floor((x + PLOT_R + 1) / SOIL_CELL), 0, SOIL_N - 1), j = clamp(Math.floor((y + PLOT_R + 1) / SOIL_CELL), 0, SOIL_N - 1); return j * SOIL_N + i; }
  place(x, y) {
    const S = this.soil, k = this.cellOf(x, y);
    const cover = S.cover[k];
    return { k, site: clamp(0.5 + S.wet[k] * 0.5, 0, 1), moist: clamp(this.moist + S.wet[k] * 0.35 + (cover === 2 ? 0.05 : 0), 0, 1.2), rich: S.rich[k], acid: S.acid[k], stone: S.stone[k], light: S.light[k], cover, coverD: S.coverD[k] };
  }
  treeFit(key, x, y) {
    const T = TREE_SPECIES[key] || TREE_SPECIES.birch, p = this.place(x, y);
    const g = (v, m, w) => Math.exp(-((v - m) * (v - m)) / w);
    return clamp(g(p.site, T.wet, 0.09) * g(p.acid, T.acid, 0.18) * (0.55 + 0.45 * g(p.rich, T.rich, 0.15)) * (p.stone > T.stone ? g(p.stone, T.stone, 0.06) : 1) * (p.light + (1 - p.light) * T.shade), 0, 1);
  }
  fungusFit(sp, x, y) {
    const p = this.place(x, y), g = (v, m, w) => Math.exp(-((v - m) * (v - m)) / w);
    const nitro = sp.nitro === undefined ? 1 : sp.nitro;
    return clamp(g(p.acid, sp.pAcid === undefined ? 0.5 : sp.pAcid, 0.2) * g(p.site, sp.pWet === undefined ? 0.5 : sp.pWet, 0.2) * (p.rich > nitro ? g(p.rich, nitro, 0.06) : 1) * (1 - 0.5 * p.stone) * (p.cover === 2 ? 1.1 : 1), 0, 1);
  }
  bestTree(x, y, keys) {
    keys = keys || this.seed.treeSpecies || TREE_KEYS;
    let best = keys[0], bw = -1;
    for (const k of keys) { const w = Math.pow(this.treeFit(k, x, y), 2) * this.r.range(0.7, 1.3); if (w > bw) { bw = w; best = k; } }
    return best;
  }
  hostOk(sp, t) { return !sp.hosts || sp.hosts === 'any' || !t || sp.hosts.includes(t.sp); }
  updateLight() {
    const S = this.soil, N = SOIL_N; S.light.fill(1);
    for (const t of this.trees) {
      const rc = 0.9 + t.size * 1.6, dens = (0.2 + 0.65 * (t.leaf === undefined ? 1 : t.leaf)) * clamp(t.size / 1.2, 0, 1);
      const i0 = Math.floor((t.x - rc + PLOT_R + 1) / SOIL_CELL), i1 = Math.floor((t.x + rc + PLOT_R + 1) / SOIL_CELL), j0 = Math.floor((t.y - rc + PLOT_R + 1) / SOIL_CELL), j1 = Math.floor((t.y + rc + PLOT_R + 1) / SOIL_CELL);
      for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const [x, y] = this.cellXY(i, j), d = Math.hypot(x - t.x, y - t.y); if (d > rc) continue;
        S.light[j * N + i] *= 1 - dens * (1 - d / rc) * 0.9;
      }
    }
  }
  // the herb and moss layer follows light, wetness, acidity and stone
  updateCover(dt) {
    const S = this.soil, N = SOIL_N, age = clamp(this.t / 600, 0.15, 1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, [x, y] = this.cellXY(i, j); if (Math.hypot(x, y) > PLOT_R + 1) continue;
      const light = S.light[k], site = clamp(0.5 + S.wet[k] * 0.5, 0, 1), acid = S.acid[k], rich = S.rich[k], stone = S.stone[k];
      let c, d;
      if (stone > 0.55) { c = 6; d = stone; }
      else if (site > 0.85) { c = 5; d = site; }
      else if (light < 0.45 && site > 0.45) { c = rich > 0.5 && light > 0.15 ? 3 : 2; d = 1 - light * 0.8; }
      else if (acid > 0.62 && light > 0.3) { c = 4; d = acid; }
      else if (light > 0.5) { c = 1; d = light * (1 - acid * 0.5); }
      else { c = 7; d = 0.6; }
      S.cover[k] = c; S.coverD[k] = clamp(d, 0, 1) * age;
      // soil slowly returns to its own character
      S.wet[k] += (S.base.wet[k] - S.wet[k]) * 0.002 * dt; S.rich[k] += (S.base.rich[k] - S.rich[k]) * 0.002 * dt; S.acid[k] += (S.base.acid[k] - S.acid[k]) * 0.002 * dt;
    }
    // trees change the ground beneath them: needles acidify, alder fixes nitrogen, broadleaf litter enriches
    for (const t of this.trees) {
      const T = TREE_SPECIES[t.sp]; if (!T || t.size < 0.5) continue; const k = this.cellOf(t.x, t.y);
      if (T.soil.acid) { S.base.acid[k] = clamp(S.base.acid[k] + T.soil.acid * 0.0006 * t.size * dt, 0, 1); }
      if (T.soil.rich) { S.base.rich[k] = clamp(S.base.rich[k] + T.soil.rich * 0.0006 * t.size * dt, 0, 1); }
    }
    for (const lg of this.logs) { lg.t += dt; const k = this.cellOf(lg.x, lg.y); S.base.rich[k] = clamp(S.base.rich[k] + 0.0004 * dt, 0, 1); if (this.r.chance(dt * 0.004)) this.addLitter(lg.x + this.r.range(-1.5, 1.5), lg.y + this.r.range(-1.5, 1.5), 0.2); }
    this.logs = this.logs.filter(l => l.t < l.life);
  }
  // shaping the ground (the Shape tool)
  paint(x, y, kind, rad = 2.6, amt = 0.08) {
    const S = this.soil, N = SOIL_N;
    if (kind === 'log') return this.addLog(x, y);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const [cx, cy] = this.cellXY(i, j), d = Math.hypot(cx - x, cy - y); if (d > rad) continue;
      const k = j * N + i, w = amt * (1 - d / rad);
      if (kind === 'wet') S.base.wet[k] = clamp(S.base.wet[k] + w * 1.6, -1, 1);
      else if (kind === 'dry') S.base.wet[k] = clamp(S.base.wet[k] - w * 1.6, -1, 1);
      else if (kind === 'rich') { S.base.rich[k] = clamp(S.base.rich[k] + w, 0, 1); S.base.stone[k] = clamp(S.base.stone[k] - w, 0, 1); }
      else if (kind === 'acid') S.base.acid[k] = clamp(S.base.acid[k] + w, 0, 1);
      else if (kind === 'stone') { S.base.stone[k] = clamp(S.base.stone[k] + w * 1.4, 0, 1); S.base.rich[k] = clamp(S.base.rich[k] - w * 0.5, 0, 1); }
      for (const key of ['wet', 'rich', 'acid', 'stone']) S[key][k] = S.base[key][k];
    }
    if (kind === 'rich' && this.r.chance(0.15)) this.addPatch(x, y, 0.4, true);
    if (kind === 'stone' && this.r.chance(0.1)) this.addPatch(x, y, 0.3, false);
    return true;
  }
  addLog(x, y) {
    if (this.logs.length >= 16 || Math.hypot(x, y) > PLOT_R - 1) return false;
    if (this.logs.some(l => Math.hypot(l.x - x, l.y - y) < 2.5)) return false;
    const a = this.r.range(0, Math.PI);
    this.logs.push({ x, y, a, len: this.r.range(2.5, 4.5), t: 0, life: this.r.range(2400, 4800) });
    for (let k = -1; k <= 1; k++) this.addLitter(x + Math.sin(a) * k * 1.2, y + Math.cos(a) * k * 1.2, 1.2);
    this.log('You laid a dead log on the ground. Decomposers will find it, and as it rots the soil around it grows rich.', 'tree');
    return true;
  }
  coverName(p, winter) {
    const s = this.snow > 0.3 ? 'snow over ' : '';
    const n = ['bare soil', winter ? 'dry grass' : 'grass', 'moss', winter ? 'dead bracken' : 'ferns', 'blueberry heath', 'sedge', 'lichen on stone', 'leaf litter'][p.cover];
    return s + n;
  }
  placeInfo(x, y) {
    const p = this.place(x, y), winter = this.season() === 'winter';
    const wet = p.site > 0.85 ? 'boggy' : p.site > 0.62 ? 'wet' : p.site > 0.4 ? 'moist' : p.site > 0.22 ? 'dry' : 'parched';
    const soil = `${wet}${p.rich > 0.6 ? ', rich' : p.rich < 0.3 ? ', poor' : ''}${p.acid > 0.62 ? ', acid' : p.acid < 0.3 ? ', neutral' : ''}${p.stone > 0.45 ? ', stony' : ''} soil`;
    const light = p.light > 0.7 ? 'open sky' : p.light > 0.4 ? 'half shade' : 'deep shade';
    const fits = TREE_KEYS.map(k => [k, this.treeFit(k, x, y)]).sort((a, b) => b[1] - a[1]).filter(f => f[1] > 0.25).slice(0, 2).map(f => TREE_SPECIES[f[0]].short.toLowerCase());
    return { text: `${this.coverName(p, winter)} on ${soil} · ${light}`, suits: fits.length ? `suits ${fits.join(' and ')}` : 'hard ground for any tree', p };
  }
  // deciduous phenology: budburst late April to mid May, colour in October, bare from November
  phen(key) {
    const T = TREE_SPECIES[key]; if (!T) return { leaf: 1, sen: 0 };
    if (T.leaf === 'ever') return { leaf: this.temp < -3 ? 0.55 : 1, sen: 0 };
    const late = key === 'larch' ? 12 : key === 'beech' || key === 'oak' ? 6 : 0, d = this.doy;
    const up = clamp((d - 108) / 25, 0, 1), down = clamp((d - (282 + late)) / 28, 0, 1);
    const sen = d > 250 + late && d < 330 + late ? clamp((d - (250 + late)) / 38, 0, 1) : 0;
    return { leaf: up * (1 - down), sen };
  }

  // ---------------------------------------------------------- seed bank
  makeSeedbank() {
    const s = this.seed, r = this.r;
    const centers = flowerCenters(PETAL).slice(1); r.shuffle(centers);
    const bank = []; let t = r.range(14, 35);
    for (let i = 0; i < s.nTrees; i++) {
      const [x, y] = centers[i];
      const bx = x + r.range(-0.4, 0.4), by = y + r.range(-0.4, 0.4);
      bank.push({ x: bx, y: by, t, kin: r.int(0, 2), deg: i === 0 ? 0 : r.int(0, s.tun.ratios.length * 2 - 1), sp: this.bestTree(bx, by), done: false });
      t += r.range(30, 80);
    }
    return bank;
  }
  // ---------------------------------------------------------- entities
  addTree(x, y, o) {
    const s = this.seed, r = this.r;
    const node = this.addNode(x, y, 'tree', 0); node.deg = (o.deg || 0) + s.tun.ratios.length;
    const key = TREE_SPECIES[o.sp] ? o.sp : this.bestTree(x, y); const T = TREE_SPECIES[key];
    const pk = r.chance(0.75) ? T.partials : r.pick(s.partialKeys);
    const t = {
      sp: key, leaf: 1, sen: 0, fit: this.treeFit(key, x, y), life: (TREE_SPECIES[key].life || 30000) * this.r.range(0.7, 1.3),
      id: this.tid++, x, y, node: node.id, size: o.size, sugar: o.sugar === undefined ? 0.8 : o.sugar, nut: 0.25, water: 0.7, hyd: 0, kin: o.kin, deg: o.deg, age: 0,
      partials: PARTIAL_SETS[pk].slice(), amps: [1, r.range(0.2, 0.6), r.range(0.05, 0.35), r.range(0, 0.2)], type: r.chance(s.grainTrees) ? 'grain' : 'drone',
      breath: r.range(0.02, 0.25) + (T.conifer ? 0.06 : 0), det: r.range(1, 9), links: new Map(), stress: 0, defense: 0, drought: 0, flash: 0, hunger: 0, dying: 0, hub: false, alive: true, light: 0, paid: 0,
    };
    t.deg = (o.deg || 0) + T.regDeg; node.deg = t.deg + s.tun.ratios.length;
    node.tree = t.id; this.trees.push(t); return t;
  }
  addGenet(sp, parent, x, y) {
    const g = { id: this.gid++, sp, energy: 0.5, nut: 0, parent: parent ? parent.id : null, born: this.t, alive: true, gen: parent ? parent.gen + 1 : 0, ox: x, oy: y, len: 0, glow: 0 };
    const same = [...this.genets.values()].filter(o => o.sp.genus === sp.genus).length + (this.stats.born || 0) * 0;
    g.name = `${sp.genus} ${String.fromCharCode(945 + ((this.gid - 2) % 24))}${parent ? '′' : ''}`; void same;
    this.genets.set(g.id, g); this.stats.born++; return g;
  }
  addNode(x, y, type, genet) { const n = { id: this.nid++, x, y, type, genet, edges: new Set(), u: 0, refr: 0, deg: 0, tree: 0, fl: 0 }; this.nodes.set(n.id, n); return n; }
  addTip(g, fromNode, x, y, heading, off = 0) {
    if (this.tips.length >= 150) return null;
    const n = this.nodes.get(fromNode); if (!n) return null;
    const sx = x + Math.sin(heading) * off, sy = y + Math.cos(heading) * off;
    const tip = { id: this.tipid++, g: g.id, x: sx, y: sy, h: heading, from: fromNode, pts: [[n.x, n.y], [sx, sy]], len: off, sinceB: 0, age: 0, life: g.sp.life * this.r.range(0.6, 1.4), deg: n.deg };
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
    if (recycle) { const g = this.genets.get(e.g); if (g) g.energy += 0.01 * e.len; const m = e.pts[(e.pts.length / 2) | 0]; this.addLitter(m[0], m[1], 0.03 * e.len); }
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
    for (const s of this.signals) if (s.e === e.id) {
      const pos = s.dir > 0 ? s.s : e.len - s.s; const cut = e.cum[k];
      if (pos <= cut) { s.e = e1.id; s.s = s.dir > 0 ? pos : cut - pos; s.len = e1.len; }
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
  addLitter(x, y, a) { const l = this.litter.find(l => Math.hypot(l.x - x, l.y - y) < 1.5); if (l) l.a = Math.min(3, l.a + a); else if (this.litter.length < 120) this.litter.push({ x, y, a: Math.min(3, a) }); }
  addPatch(x, y, a, org) { const p = this.patches.find(p => Math.hypot(p.x - x, p.y - y) < 1.5); if (p) p.a = Math.min(3, p.a + a); else if (this.patches.length < 80) this.patches.push({ x, y, a, a0: a, org, found: false }); }
  freq(deg, oct) { return this.seed.root * this.rootMul * ratioOf(this.seed.tun, deg) * Math.pow(2, oct || 0); }
  scaleRatios(n, center) { const out = []; for (let i = 0; i < n; i++) out.push(ratioOf(this.seed.tun, (center || 0) + i) / ratioOf(this.seed.tun, center || 0)); return out; }
  meanSize() { return this.trees.length ? this.trees.reduce((a, t) => a + t.size, 0) / this.trees.length : 0; }
  // breadth-first path between two nodes through the hyphal graph
  path(fromId, toId, maxN = 900) {
    const prev = new Map([[fromId, null]]); const q = [fromId]; let k = 0;
    while (k < q.length && k < maxN) {
      const id = q[k++]; if (id === toId) break; const n = this.nodes.get(id); if (!n) continue;
      for (const eid of n.edges) { const e = this.edges.get(eid); if (!e) continue; const o = e.a === id ? e.b : e.a; if (!prev.has(o)) { prev.set(o, [id, e]); q.push(o); } }
    }
    if (!prev.has(toId)) return null;
    const segs = []; let cur = toId; while (prev.get(cur)) { const [p, e] = prev.get(cur); segs.push([p, e]); cur = p; }
    segs.reverse(); const pts = [];
    for (const [p, e] of segs) { const seq = e.a === p ? e.pts : e.pts.slice().reverse(); for (let i = pts.length ? 1 : 0; i < seq.length; i++) pts.push(seq[i]); }
    return pts.length > 1 ? pts : null;
  }

  // ---------------------------------------------------------- audio helpers
  stopVoice(id, r) { if (id) this.audio.rel(id, r); }
  canSpawn(set, max) {
    for (const id of set) if (!this.audio.alive(id)) set.delete(id);
    if (!this.audio.ready || set.size >= max) return false;
    if (!set.fg) return true;
    // the forest's own events share 10 foreground places; animals get a little room of their own
    return set === this.budget.fauna ? this.fgLoad() < FG_MAX + 1 : this.fgLoad(true) < FG_MAX - 4;
  }
  fgLoad(noFauna) { let n = 0; for (const k of noFauna ? ['ping', 'sig', 'fx', 'click'] : ['ping', 'sig', 'fx', 'click', 'fauna']) { const s = this.budget[k]; for (const id of s) if (!this.audio.alive(id)) s.delete(id); n += s.size; } return n; }
  quiet() { return clamp(1 - this.fgLoad() / FG_MAX, 0, 1); }
  // the listener's gentle nudges: biases on top of the forest's own choices
  ch(layer, key) { const c = this.char && this.char[layer]; return c ? clamp(+c[key] || 0, -1, 1) : 0; }
  dshift(layer) { return Math.round(this.ch(layer, 'reg') * this.seed.tun.ratios.length * 0.6); }
  season() { return SEASON_OF[this.month]; }
  ping(x, y, z, node, sp, amt, budget = 6) {
    if (!this.canSpawn(this.budget.ping, budget)) return;
    const f = this.freq(node.deg + sp.degOff + this.dshift('signals'), sp.reg - 1);
    const id = this.audio.spawn(K.MODAL, { x, y, z, f, r: sp.ping, d: sp.ping.map((_, i) => sp.pdec / (1 + i * 1.3)), a: [1, 0.55, 0.3, 0.18], hard: sp.hard, gain: 0.6 * amt, layer: LAYER.SIGNALS, send: 0.7, prio: 1 });
    if (id) this.budget.ping.add(id);
  }
  fx(kind, p, max = 6, set = this.budget.fx) { if (!this.canSpawn(set, max)) return null; const id = this.audio.spawn(kind, p); if (id) set.add(id); return id; }

  // ---------------------------------------------------------- main step
  step(dt) {
    this.t += dt;
    this.updateSky(dt);
    this.lightT -= dt; if (this.lightT <= 0) { this.lightT = 3; this.updateLight(); }
    this.coverT -= dt; if (this.coverT <= 0) { this.coverT = 4; this.updateCover(4); }
    this.germinate();
    this.seedRain(dt);
    this.sporeRain(dt);
    this.growTips(dt);
    this.flowT += dt; if (this.flowT > 0.25) { this.flow(this.flowT); this.trade(this.flowT); this.flowT = 0; }
    this.treesStep(dt);
    this.signalStep(dt);
    this.carbonStep(dt);
    this.waterStep(dt);
    this.fruitStep(dt);
    this.sporeStep(dt);
    this.prune(dt);
    this.events(dt);
    this.soundDrift(dt);
    this.happenings(dt);
    this.fauna(dt);
    this.seasonal(dt);
    this.critterStep(dt);
    this.calls = this.calls.filter(c => (c.t -= dt) > 0);
    this.stageCheck();
    this.voiceT += dt; if (this.voiceT > 0.4) { this.updateVoices(this.voiceT); this.voiceT = 0; }
    for (const n of this.nodes.values()) { n.u *= Math.exp(-dt / 2.5); if (n.refr > 0) n.refr -= dt; n.fl *= Math.exp(-dt * 3); }
    for (const e of this.edges.values()) e.act *= Math.exp(-dt * 1.5);
    this.flashes = this.flashes.filter(f => (f.t -= dt) > 0);
  }
  updateSky(dt) {
    const c = this.seed.climate, r = this.r, P = this.p;
    this.clockH += dt / 3600; if (this.clockH >= 24) { this.clockH -= 24; this.doy = this.doy % 365 + 1; }
    const sun = sunTimes(this.doy, this.dst); this.sun = sun;
    const h = this.clockH; let L = 0;
    if (h > sun.rise - 0.6 && h < sun.set + 0.6) { const x = (h - sun.rise) / sun.len; L = x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), 0.7); const tw = Math.min(h - (sun.rise - 0.6), sun.set + 0.6 - h) / 0.6; L = Math.max(L, clamp(tw, 0, 1) * 0.06); }
    this.light = clamp(L, 0, 1) * (this.rainT > 0 ? 0.45 : 1) * (this.stormT > 0 ? 0.7 : 1);
    this.dayAvg = sun.len / 24 * 0.64;
    const mt = MONTH_T[Math.floor((this.doy / 30.5)) % 12] + c.warm;
    this.temp = mt + 5 * Math.sin(2 * Math.PI * (h - 9) / 24) - (this.rainT > 0 ? 3 : 0);
    if (this.rainT > 0) { this.rainT -= dt; if (this.rainT <= 0) this.log(this.snowing ? 'The snowfall stops. The snow cover keeps the forest hushed.' : 'The rain passes. The soil holds the water for a while.', 'weather'); }
    else { this.rainCool -= dt; if (this.dryT <= 0 && this.rainCool < 0 && r.chance(dt * 0.0012 * (0.3 + c.raininess))) this.startRain(r.range(150, 480)); }
    if (this.dryT > 0) { this.dryT -= dt; this.ev.dry = Math.max(0, this.dryT); if (this.dryT <= 0) { this.rainCool = r.range(60, 240); this.log('The dry spell breaks.', 'weather'); } }
    // precipitation falls as snow below freezing; a snow cover builds up and melts in warmth
    this.snowing = this.rainT > 0 && this.temp < 1.5;
    const snow0 = this.snow;
    if (this.snowing) this.snow = Math.min(1, this.snow + dt * 0.0011);
    else if (this.temp > 1) this.snow = Math.max(0, this.snow - dt * 0.00022 * (this.temp - 1) * (this.rainT > 0 ? 3 : 1));
    if (this.snow < snow0) this.moist = Math.min(1.1, this.moist + (snow0 - this.snow) * 1.5);
    this.afterRain *= Math.exp(-dt / 900);
    // soil moisture: rain wets it quickly, sun and warmth dry it slowly
    const dry = 0.3 * this.light * clamp(this.temp / 20, 0, 1.5) * (1 - 0.5 * clamp(this.meanSize() / 1.4, 0, 1));
    let target = this.rainT > 0 ? (this.snowing ? this.moist : 1.1) : clamp((0.25 + 0.75 * P.moisture) * (0.6 + 0.4 * c.moist / 0.6) * (1 - dry), 0.05, 1);
    if (this.dryT > 0) target *= 0.3;
    this.moist += (target - this.moist) * (1 - Math.exp(-dt / (this.rainT > 0 ? 150 : this.dryT > 0 ? 500 : 1500))); this.moist = clamp(this.moist, 0.05, 1.15);
    this.windDir += r.gauss() * 0.02 * Math.sqrt(dt);
    const wt = this.stormT > 0 ? 1.5 + 0.4 * Math.sin(this.t * 0.7) + 0.3 * Math.sin(this.t * 1.9) : (c.wind * 0.4 + P.wind) * (0.6 + 0.6 * Math.sin(this.t * 0.01));
    this.windStr += (wt - this.windStr) * (1 - Math.exp(-dt / (this.stormT > 0 ? 4 : 20)));
  }
  startRain(len, src) {
    if (this.rainT > 0) return false;
    this.rainT = len; this.evMax.rain = len; this.ev.rain = len; this.rainCool = this.r.range(600, 1500); this.afterRain = 1; this.dryT = 0;
    if (this.temp < 1.5) this.log(`${src === 'user' ? 'You call the snow' : 'Snow begins to fall'}. A snow cover absorbs sound: the forest grows quieter, closer and drier in its echoes.`, 'weather');
    else this.log(`${src === 'user' ? 'You call the rain' : 'Rain arrives'}. Moisture rises, and electrical activity in the mycelium increases after rain (Fukasawa 2023).${this.season() === 'summer' ? ' Thunder rolls somewhere far off.' : ''}`, 'weather');
    return true;
  }
  get absorb() { return clamp(this.snow * 0.85 + (this.snowing ? 0.2 : 0), 0, 1); }
  get dayPhase() { return ((this.clockH - 6) / 24 + 1) % 1; }
  growthT() { return clamp(0.45 + 0.05 * this.temp, 0.25, 1.35) * (this.temp > 30 ? 0.6 : 1) * (this.season() === 'spring' ? 1.15 : 1) * (this.snow > 0.3 ? 0.75 : 1); }

  germinate() {
    for (const b of this.seedbank) {
      if (b.done || this.t < b.t) continue; b.done = true;
      if (this.treeAt(b.x, b.y, 2) || this.trees.length >= MAX_TREES) continue;
      // establishment: dense grass, heath and bracken smother seedlings; winter delays germination
      const p = this.place(b.x, b.y), key = b.sp || this.bestTree(b.x, b.y);
      const est = (p.cover === 1 ? 1 - 0.5 * p.coverD : p.cover === 4 ? 0.6 : p.cover === 3 ? 0.7 : 1) * (0.35 + 0.65 * this.treeFit(key, b.x, b.y)) * (this.season() === 'winter' ? 0.65 : 1);
      if (!this.r.chance(est)) { if ((b.tries = (b.tries || 0) + 1) < 5) { b.done = false; b.t = this.t + this.r.range(90, 240); } continue; }
      const t = this.addTree(b.x, b.y, { size: 0.1, kin: b.kin, deg: b.deg, sugar: 0.9, sp: key });
      this.ping(b.x, b.y, 0.1, { deg: b.deg + this.seed.tun.ratios.length * 2 }, this.seed.species[0], 0.35, 10);
      this.flashes.push({ x: b.x, y: b.y, t: 1.5, c: 'seed' });
      const left = this.seedbank.filter(s => !s.done).length;
      this.log(`A ${TREE_SPECIES[t.sp].name.toLowerCase()} seedling breaks the surface (tree ${t.id})${left ? `, ${left} seed${left > 1 ? 's' : ''} still waiting` : ''}. Its roots release exudates that wake fungal spores.`, 'tree');
    }
  }
  // seed rain: wind, jays and nutcrackers keep bringing tree seeds from the valley; they take where light reaches the floor
  seedRain(dt) {
    const r = this.r, n = this.trees.length + this.seedbank.filter(b => !b.done).length;
    if (n >= WILD_TREES || this.t < 900 || !r.chance(dt * 0.0014 * (1 - n / WILD_TREES))) return;
    for (let k = 0; k < 8; k++) {
      const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.range(0, 1)) * (PLOT_R - 2), x = Math.sin(a) * d, y = Math.cos(a) * d;
      if (this.treeAt(x, y, 3) || this.trees.some(t => t.size > 0.8 && Math.hypot(t.x - x, t.y - y) < 4.5)) continue;
      const fits = TREE_KEYS.filter(kk => this.treeFit(kk, x, y) > 0.3), sp = r.chance(0.6) || !fits.length ? this.bestTree(x, y) : r.pick(fits);
      this.seedbank.push({ x, y, t: this.t + r.range(60, 240), kin: r.int(0, 2), deg: r.int(0, this.seed.tun.ratios.length * 2 - 1), sp, done: false });
      return;
    }
  }
  // airborne inoculum: spores drift in from upwind; which species depends on the stage of the forest
  sporeRain(dt) {
    this.sporeRainT -= dt; if (this.sporeRainT > 0) return;
    const ms = this.meanSize(), litter = this.litter.reduce((a, l) => a + l.a, 0);
    const nEarly = [...this.genets.values()].filter(g => g.sp.stage === 'early').length;
    const pool = this.seed.species.filter(sp => (sp.stage === 'early' && nEarly < 5 && ms < 1) || ((sp.stage === 'late' || sp.stage === 'host') && (ms > 0.75 || this.t > 1500 || sp.stage === 'host' && ms > 0.4)) || (sp.stage === 'litter' && litter > 0.8));
    this.sporeRainT = this.r.range(18, 40) * (this.genets.size > 5 ? 2.5 : 1) * (this.genets.size > WILD_FUNGI ? 4 : 1);
    if (!pool.length || !this.trees.length) return;
    // spore rain follows the fruiting calendar: species in season release far more spores
    const wts = pool.map(sp => 0.3 + fruitSeason(sp, this.month) + (sp.months ? 0 : 0.3)); let pick = this.r() * wts.reduce((a, b) => a + b, 0), sp = pool[0];
    for (let i = 0; i < pool.length; i++) { pick -= wts[i]; if (pick <= 0) { sp = pool[i]; break; } }
    const hosts = this.trees.filter(t => this.hostOk(sp, t)); if (sp.guild === 'ecm' && !hosts.length) return;
    const a = this.windDir + Math.PI + this.r.gauss() * 0.5; const d = PLOT_R + 2;
    const tgt = sp.guild === 'sapro' && this.litter.length ? this.r.pick(this.litter) : this.r.pick(hosts.length ? hosts : this.trees);
    const sx = Math.sin(a) * d, sy = Math.cos(a) * d;
    const dirx = (tgt.x - sx), diry = (tgt.y - sy), dl = Math.hypot(dirx, diry) || 1, v = 1.2 + this.windStr * 2;
    const s = { x: sx, y: sy, z: this.r.range(3, 7), vx: dirx / dl * v, vy: diry / dl * v, vz: -0.15, age: 0, life: dl / v + 6, g: 0, sp, voice: null, immigrant: true };
    this.spores.push(s); this.spawnSporeVoice(s);
  }

  growTips(dt) {
    const P = this.p, r = this.r;
    const born = [];
    for (let ti = this.tips.length - 1; ti >= 0; ti--) {
      const tip = this.tips[ti]; const g = this.genets.get(tip.g); if (!g) { this.tips.splice(ti, 1); continue; }
      const sp = g.sp; tip.age += dt;
      const starving = g.energy <= 0.02;
      const lp = this.place(tip.x, tip.y), lfit = this.fungusFit(sp, tip.x, tip.y);
      const v = sp.speed * clamp(0.25 + lp.moist * 1.1, 0.2, 1.4) * this.growthT() * P.growth * (starving ? 0.15 : 1) * (0.45 + 0.55 * lfit);
      let dh = r.gauss() * sp.wander * Math.sqrt(dt);
      const steer = (ax, ay, k) => { const want = Math.atan2(ax, ay); let d = want - tip.h; d = Math.atan2(Math.sin(d), Math.cos(d)); dh += d * k * dt; };
      if (sp.guild === 'ecm') {
        let tgt = null, td = 13;
        for (const t of this.trees) { if ((t.links.get(g.id) || 0) >= 2 || !this.hostOk(sp, t)) continue; const d = Math.hypot(t.x - tip.x, t.y - tip.y); if (d < td && t.node !== tip.from) { td = d; tgt = t; } }
        if (tgt) steer(tgt.x - tip.x, tgt.y - tip.y, sp.trop * (1.4 - td / 13));
        const pt = this.patches.find(p => p.a > 0.05 && Math.hypot(p.x - tip.x, p.y - tip.y) < 4.5);
        if (pt) steer(pt.x - tip.x, pt.y - tip.y, 0.5 * (pt.org ? sp.orgN : 1));
      } else {
        const lt = this.litter.find(l => Math.hypot(l.x - tip.x, l.y - tip.y) < 6); if (lt) steer(lt.x - tip.x, lt.y - tip.y, 0.9);
      }
      const rr = Math.hypot(tip.x, tip.y); if (rr > PLOT_R - 2.5) steer(-tip.x, -tip.y, 1.2);
      tip.h += dh;
      const step = v * dt; tip.x += Math.sin(tip.h) * step; tip.y += Math.cos(tip.h) * step; tip.len += step; tip.sinceB += step;
      g.energy -= step * 0.012 * sp.cost;
      // foraging at the tip
      if (sp.guild === 'ecm') {
        for (const p of this.patches) {
          if (p.a <= 0.02) continue; const d = Math.hypot(p.x - tip.x, p.y - tip.y); if (d > 1.3) continue;
          const take = Math.min(p.a, dt * 0.01 * (p.org ? sp.orgN : 1)); p.a -= take; g.nut += take;
          if (!p.found) { p.found = true; const n = this.nodes.get(tip.from); if (n) { n.refr = 0; this.fire(n, false, 0, 0, g.id); } this.log(`${g.name} found a ${p.org ? 'patch of organic nitrogen' : 'mineral patch'}. Cords toward it will thicken.`, 'bond'); }
        }
      } else {
        for (const l of this.litter) { if (Math.hypot(l.x - tip.x, l.y - tip.y) > 1.4) continue; const take = Math.min(l.a, dt * 0.012); l.a -= take; g.energy += take * 0.8; this.decomp += take; this.addPatch(l.x, l.y, take * 0.6, true); }
      }
      const last = tip.pts[tip.pts.length - 1];
      if (Math.hypot(tip.x - last[0], tip.y - last[1]) >= 0.3) tip.pts.push([tip.x, tip.y]);
      // 1. root contact → mycorrhizal bond (ectomycorrhizal fungi only)
      if (sp.guild === 'ecm') {
        const tree = this.treeAt(tip.x, tip.y, 0.9 + tip.len * 0 + (this.treeAt(tip.x, tip.y, 2) ? this.treeAt(tip.x, tip.y, 2).size * 0.5 : 0));
        if (tree && tree.node !== tip.from && tip.len > 0.8 && (tree.links.get(g.id) || 0) < 2 && this.hostOk(sp, tree)) {
          tip.pts.push([tree.x, tree.y]); this.finish(tip, tree.node); this.tips.splice(ti, 1);
          tree.links.set(g.id, (tree.links.get(g.id) || 0) + 1); this.stats.bonds++;
          this.bondSound(tree, g);
          const n = tree.links.size;
          if (tree.links.get(g.id) === 1) this.log(`${g.name} (${EXPLORATION[sp.expl].label} type) wrapped the root tips of tree ${tree.id} in a mantle. ${n > 1 ? `Tree ${tree.id} now has ${n} fungal partners.` : 'A first partnership: carbon for nutrients.'}`, 'bond');
          continue;
        }
      }
      // 2. contact with another hypha → fuse (same individual) or clash (stranger)
      if (tip.len > 0.8) {
        const hit = this.nearPoint(tip.x, tip.y, 0.42, (e, i) => !(e.a === tip.from && i < 4) && !(e.b === tip.from && i > e.pts.length - 5));
        if (hit) {
          if (hit.e.g === g.id) {
            const n = (hit.i === 0) ? this.nodes.get(hit.e.a) : (hit.i === hit.e.pts.length - 1) ? this.nodes.get(hit.e.b) : this.splitEdge(hit.e, hit.i);
            if (n && n.id !== tip.from) {
              tip.pts.push([n.x, n.y]); this.finish(tip, n.id); this.tips.splice(ti, 1); this.stats.fused++;
              this.ping(n.x, n.y, -0.2, n, sp, 0.5);
              if (this.stats.fused === 1 || this.stats.fused % 25 === 0) this.log(`${g.name} fused with itself (anastomosis). Loops make the network resilient to cuts.`, 'fuse');
              continue;
            }
          } else {
            const end = this.addNode(tip.x, tip.y, 'j', g.id); end.deg = tip.deg;
            this.finish(tip, end.id); this.tips.splice(ti, 1);
            this.fx(K.TICK, { x: tip.x, y: tip.y, z: -0.2, rate: 40, f: sp.tickF * 0.6, q: 4, jit: 0.6, burst: 0.9, gain: 0.25, layer: LAYER.GROWTH, dur: 0.9, rel: 0.3, send: 0.4 });
            this.flashes.push({ x: tip.x, y: tip.y, t: 1.2, c: 'alarm' });
            const other = this.genets.get(hit.e.g);
            if (r.chance(0.2)) this.log(`${g.name} met ${other ? other.name : 'a stranger'} and walled itself off. Genetically different mycelia do not fuse.`, 'clash');
            continue;
          }
        }
        for (const o of this.tips) if (o !== tip && o.g === tip.g && o.len > 0.8 && Math.hypot(o.x - tip.x, o.y - tip.y) < 0.35) {
          const n = this.addNode(tip.x, tip.y, 'j', g.id); n.deg = tip.deg;
          this.finish(tip, n.id); o.pts.push([n.x, n.y]); this.finish(o, n.id);
          this.tips.splice(ti, 1); const oi = this.tips.indexOf(o); if (oi >= 0) { this.tips.splice(oi, 1); if (oi < ti) ti--; }
          this.stats.fused++; this.ping(n.x, n.y, -0.2, n, sp, 0.45); break;
        }
        if (!this.tips.includes(tip)) continue;
      }
      // 3. leaving the plot or dying of age
      if (Math.hypot(tip.x, tip.y) > PLOT_R + 0.5 || tip.age > tip.life) {
        const end = this.addNode(tip.x, tip.y, 'j', g.id); end.deg = tip.deg; this.finish(tip, end.id); this.tips.splice(ti, 1); continue;
      }
      // 4. apical branching
      const pb = sp.branch * step * P.growth * (1 - this.tips.length / 150) * (starving ? 0 : 1) * (this.edges.size > 1500 ? 0 : 1);
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
    if (tip.pts.length < 2 || endNode === tip.from) return;
    if (!this.nodes.has(tip.from) || !this.nodes.has(endNode)) return;
    const e = this.addEdge(tip.from, endNode, tip.pts, tip.g);
    const g = this.genets.get(tip.g); if (g) e.D *= g.sp.cord;
  }
  bondSound(tree, g) {
    this.ping(tree.x, tree.y, 0.4, { deg: tree.deg + this.seed.tun.ratios.length }, g.sp, 0.9, 9);
    const k = 1 + (tree.links.size % 3); tree.amps[k] = Math.min(0.9, tree.amps[k] + 0.12);
    tree.flash = 1;
  }

  // Physarum-style transport (Tero et al. 2010)
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
    const active = this.patches.filter(p => p.found && p.a > 0.05);
    for (const e of edges.values()) {
      const a = nodes.get(e.a), b = nodes.get(e.b); if (!a || !b) continue;
      const g = this.genets.get(e.g); const cond = g ? g.sp.cond : 1;
      e.Q = (e.D / e.len) * (a.p - b.p) * 0.9 * cond;
      const q = Math.abs(e.Q) * 14; let f = Math.pow(q, 1.6) / (1 + Math.pow(q, 1.6));
      // cords connected to a found resource thicken too (Fricker, Bebber, Boddy)
      // hyphae of a fungus that trades with a tree keep carrying nutrients, so they are maintained
      if (g && g.bonded && edges.size < 1600 && ((a.type === 'tree' || a.edges.size >= 3) && (b.type === 'tree' || b.edges.size >= 3))) f = Math.max(f, 0.03);
      if (edges.size > 2000) f *= 0.5;
      if (active.length) { const m = e.pts[(e.pts.length / 2) | 0]; for (const p of active) if (Math.hypot(p.x - m[0], p.y - m[1]) < 3) { f = Math.max(f, 0.35); break; } }
      e.D += (f * 0.12 * (g ? g.sp.cord : 1) - 0.004 * e.D) * dt; e.D = clamp(e.D, 0.01, 3.2); e.age += dt;
      e.act = Math.max(e.act, Math.min(1, Math.abs(e.Q) * 6));
    }
    for (const t of this.trees) {
      const n = nodes.get(t.node); if (!n) continue; let out = 0;
      for (const eid of n.edges) { const e = edges.get(eid); if (!e) continue; out += e.a === n.id ? e.Q : -e.Q; }
      t.sugar -= out * dt * 0.08; t.flow = out;
    }
  }
  // the biological market (Kiers et al. 2011): fungi deliver nutrients to
  // their hosts, trees pay carbon in proportion to what each partner delivers
  trade(dt) {
    for (const t of this.trees) {
      // trees hand a share of their fresh photosynthate below ground (real forests: roughly 10–30 %)
      // nutrient-limited trees send more carbon below ground (functional equilibrium)
      const nutF = t.nut / (t.nut + 0.6);
      const budget = (t.photoAcc || 0) * (0.18 + 0.4 * (1 - nutF)) + Math.max(0, t.sugar - 1.2) * 0.04 * dt; t.photoAcc = 0;
      t.deliv = t.deliv || new Map(); let wsum = 0;
      const parts = [];
      for (const [gid, c] of t.links) {
        const g = this.genets.get(gid); if (!g) continue;
        // in drought, fungi whose cords carry water (long-distance types) keep trading; others falter
        const dryF = clamp((0.42 - this.moist) * 3, 0, 1), wAdv = clamp(1 + dryF * (g.sp.water - 0.5) * 1.4, 0.3, 1.8);
        const give = Math.min(g.nut, 0.006 * c * dt * g.sp.trade * wAdv, Math.max(0, 1.2 - t.nut)) * (1 - g.sp.greed);
        g.nut -= give; t.nut += give; this.stats.trades += give;
        const d = (t.deliv.get(gid) || 0) * Math.exp(-dt / 120) + give; t.deliv.set(gid, d);
        // host age matters: early-stage fungi do best on young trees, late-stage fungi on old ones
        const age = g.sp.stage === 'early' ? clamp(1.5 - t.size, 0.15, 1) : clamp(0.3 + t.size * 0.7, 0.3, 1.3);
        const w = (0.002 * c + d) * age * wAdv * (0.4 + 0.6 * (g.fit === undefined ? 1 : g.fit)); wsum += w; parts.push([g, w, give]);
      }
      if (!parts.length) continue;
      t.sugar -= budget; t.paid = budget;
      // fruit bodies are built from the host's recent photosynthate (girdling stops fruiting: Högberg et al. 2001)
      for (const [g, w, give] of parts) { const pay = budget * w / wsum; g.energy += pay * 0.55; g.fstore = (g.fstore || 0) + pay * 0.45; if (give > 0.0012 && this.r.chance(0.08)) this.tradeSound(t, g, give); }
    }
    // a thin trickle of mineral nutrients reaches every hypha from the soil itself
    for (const g of this.genets.values()) if (g.sp.guild === 'ecm') g.nut += g.len * 0.00002 * dt * clamp(this.moist * 1.5, 0.2, 1.2);
  }
  tradeSound(t, g, amt) {
    if (!this.canSpawn(this.budget.click, 4)) return;
    const id = this.audio.spawn(K.MODAL, { x: t.x, y: t.y, z: -0.3, f: this.freq(t.deg + g.sp.degOff, g.sp.reg + 1), r: [1, 2.01, 3.03, 4.1], d: [0.35, 0.2, 0.12, 0.08], a: [1, 0.3, 0.12, 0.05], hard: 0.15, gain: clamp(0.12 + amt * 25, 0.12, 0.35), layer: LAYER.SIGNALS, send: 0.6, prio: 1 });
    if (id) this.budget.click.add(id);
  }

  treesStep(dt) {
    const r = this.r, s = this.seed;
    for (const t of this.trees) {
      t.age += dt;
      if (!t.life) t.life = (TREE_SPECIES[t.sp].life || 30000) * r.range(0.7, 1.3);
      // old age: vigour fades after about 80% of a lifespan, then death becomes ever more likely
      const old = clamp((t.age / t.life - 0.8) / 0.4, 0, 1);
      if (old > 0 && t.dying <= 0 && r.chance(dt * old * old / 1800)) { this.log(`Tree ${t.id}, an old ${TREE_SPECIES[t.sp].short.toLowerCase()}, has reached the end of its life. It stands on as a snag; light reaches the ground where it stood.`, 'death'); t.dying = 30; if (this.trees.length < MAX_TREES) { const a = r.range(0, Math.PI * 2); this.seedbank.push({ x: t.x + Math.sin(a) * 2.4, y: t.y + Math.cos(a) * 2.4, t: this.t + r.range(200, 500), kin: t.kin, deg: clamp(t.deg + r.pick([-1, 1, 2]), 0, this.seed.tun.ratios.length * 3), done: false }); } }
      const ph = this.phen(t.sp); t.leaf = ph.leaf; t.sen = ph.sen;
      const lp = this.place(t.x, t.y);
      let shade = 0; for (const o of this.trees) if (o !== t) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < 6 && o.size > t.size) shade += (o.size - t.size) * (1 - d / 6); }
      const share = t.size / (t.size + shade * 1.6);
      t.light = this.light * share;
      // water: deep roots reach deeper water; hydraulic redistribution helps at night
      const depth = clamp(t.size / 1.4, 0, 1);
      t.water = clamp(lp.moist * (0.75 + 0.25 * depth) + depth * 0.25 + t.hyd, 0, 1.2);
      t.hyd *= Math.exp(-dt / 600);
      t.drought = clamp((0.5 - t.water) * 2.5 * (0.5 + this.light) * (this.temp > 20 ? 1.3 : 1), 0, 1);
      // sugar: the sky runs in real time; reserves smooth the day/night swing
      const photo = (1 - 0.45 * old) * 0.006 * share * (0.55 * this.dayAvg + 0.45 * this.light) * (1 - 0.7 * t.drought) * Math.min(1.6, t.size * 2 + 0.2) * (0.12 + 0.88 * t.leaf);
      t.sugar += (photo - (this.light > 0.05 ? 1 : 0.5) * (1 - 0.5 * TREE_SPECIES[t.sp].shade * (1 - share)) * 0.0012 * t.size * (0.45 + 0.55 * Math.max(t.leaf, TREE_SPECIES[t.sp] && TREE_SPECIES[t.sp].leaf === 'ever' ? 1 : 0))) * dt; t.photoAcc = (t.photoAcc || 0) + photo * dt;
      if (t.dying > 0) { t.dying -= dt; t.sugar = Math.max(t.sugar, 2.6); if (t.dying <= 0) { this.killTree(t); continue; } }
      // growth needs carbon, nutrients (largely via fungal partners) and water
      const nutF = t.nut / (t.nut + 0.25), myco = clamp(t.links.size / 2, 0, 1);
      const vig = clamp(t.sugar, 0, 2) * (0.25 + 0.75 * nutF) * (0.35 + 0.65 * myco) * (1 - 0.6 * t.drought) * this.growthT() * (0.3 + 0.7 * t.fit);
      if (t.size < 1.6 && t.sugar > 0.2) { const g = 0.0008 * vig * (1 - t.size / 1.7) * this.p.growth; t.size += g * dt; t.sugar -= g * dt * 1.5; t.nut = Math.max(0, t.nut - g * dt * 0.8); }
      t.nut = Math.max(0, t.nut - 0.00025 * t.size * dt); // turnover: leaves and fine roots are shed
      t.sugar = clamp(t.sugar, -0.5, 3);
      if (t.sugar < -0.3) t.hunger += dt * (this.light > 0.05 ? 1 : 0); else t.hunger = Math.max(0, t.hunger - dt * 2);
      if (t.hunger > 900 && t.dying <= 0 && r.chance(dt / 900)) { this.log(`Tree ${t.id} starved: too little light and too few partners. It dies back into the soil.`, 'death'); t.dying = 8; }
      t.stress *= Math.exp(-dt / 12); t.defense *= Math.exp(-dt / 40); t.flash *= Math.exp(-dt * 1.5);
      // xylem clicks: ~1/h unstressed, up to ~35/h under drought (Khait et al. 2023)
      const rate = (1 + 34 * t.drought) / 3600 * clamp(t.size * 1.5, 0.3, 1.5);
      if (r.chance(rate * dt)) this.clickSound(t);
      // a mature, well-fed tree drops a seedling of its own kin nearby
      if (t.size > 1.15 && t.sugar > 1.4 && this.trees.length < WILD_TREES && r.chance(dt * 0.0006)) {
        const a = r.range(0, Math.PI * 2), d = r.range(2.8, 5.5); const x = t.x + Math.sin(a) * d, y = t.y + Math.cos(a) * d;
        if (Math.hypot(x, y) < PLOT_R - 1.5 && !this.treeAt(x, y, 2.2)) {
          const sp2 = r.chance(0.7) && this.treeFit(t.sp, x, y) > 0.2 ? t.sp : this.bestTree(x, y);
          const c = this.addTree(x, y, { size: 0.1, kin: t.kin, deg: clamp(t.deg - TREE_SPECIES[t.sp].regDeg + r.pick([-2, -1, 1, 2, s.tun.ratios.length]), 0, s.tun.ratios.length * 3), sugar: 0.6, sp: sp2 });
          t.sugar -= 0.3; this.log(`Tree ${t.id} dropped a seedling (tree ${c.id}). In the shade it depends on the fungal partners around it.`, 'tree');
        }
      }
      // needle and leaf fall feeds the litter layer, most in autumn
      const fall = TREE_SPECIES[t.sp].leaf === 'ever' ? 0.8 : (t.sen > 0.3 && t.leaf > 0.05 ? 5 : 0.3);
      if (t.size > 0.6 && r.chance(dt * 0.0015 * fall * t.size)) { const a = r.range(0, Math.PI * 2), d = r.range(0.5, 2.5) * t.size; this.addLitter(t.x + Math.sin(a) * d, t.y + Math.cos(a) * d, 0.08 * t.size); }
    }
    let hub = null, hd = 2; for (const t of this.trees) { const n = this.nodes.get(t.node); const d = n ? n.edges.size : 0; if (d > hd && t.size > 0.7) { hd = d; hub = t; } }
    for (const t of this.trees) { const was = t.hub; t.hub = t === hub; if (t.hub && !was) this.log(`Tree ${t.id} is now the hub of the network (${hd} fungal links). Hubs emerge from connectivity, not intent.`, 'tree'); }
  }
  clickSound(t) {
    this.stats.clicks++;
    if (!this.canSpawn(this.budget.click, 4)) return;
    // the real clicks are ultrasonic (20–100 kHz); transposed down by about 10×
    const f = this.r.range(2000, 9000);
    const id = this.audio.spawn(K.MODAL, { x: t.x, y: t.y, z: 1 + t.size * 2 * this.r(), f, r: [1, 1.47, 2.09, 2.94], d: [0.012, 0.008, 0.006, 0.004], a: [1, 0.6, 0.4, 0.2], hard: 1, gain: 0.35 + t.drought * 0.3, layer: LAYER.TREES, send: 0.5, prio: 1 });
    if (id) this.budget.click.add(id);
    if (t.drought > 0.5 && this.r.chance(0.15)) this.log(`Tree ${t.id} is clicking: drought stress, air bubbles in the xylem. Stressed plants click up to about 35 times an hour (Khait 2023).`, 'alarm');
  }
  killTree(t, how) {
    const v = this.v.trees.get(t.id); if (v) { this.audio.set(v, { f: this.freq(t.deg, -1), glide: 5 }); this.audio.rel(v, 6); this.v.trees.delete(t.id); }
    if (how !== 'fall' && t.size > 0.7) { this.snags.push({ x: t.x, y: t.y, size: t.size, t: 0, life: this.r.range(1500, 2700), id: t.id }); this.addLitter(t.x, t.y, 0.4 * t.size); }
    else if (how !== 'fall') this.addLitter(t.x, t.y, 1.5 * Math.max(0.3, t.size));
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
      if (t) { t.flash = Math.min(1.5, t.flash + 0.7); if (alarm && hops > 0) t.defense = Math.min(1.5, t.defense + 0.45); }
    } else this.ping(node.x, node.y, -0.2, node, sp, alarm ? 0.9 : 0.5);
    const maxH = alarm ? 12 : 7; if (hops >= maxH) return;
    for (const eid of node.edges) {
      if (eid === fromEdge) continue; const e = this.edges.get(eid); if (!e) continue;
      const eg = this.genets.get(e.g) || g;
      const pp = alarm ? 0.95 : eg.sp.prop * Math.min(1, 0.35 + e.D);
      if (!this.r.chance(pp) || this.signals.length > 60) continue;
      const n = Math.max(1, Math.round(eg.sp.word * this.r.range(0.6, 1.5) * (alarm ? 1.5 : 1)));
      const sig = { e: e.id, dir: e.a === node.id ? 1 : -1, s: 0, len: e.len, speed: eg.sp.sigSpeed * (alarm ? 1.6 : 1) * Math.pow(2, this.ch('signals', 'pace') * 0.9), n, alarm, g: eg.id, hops: hops + 1, voice: null, x: node.x, y: node.y };
      this.signals.push(sig);
      if (this.canSpawn(this.budget.sig, 7)) {
        const tt = e.len / sig.speed; const isi = clamp(tt / n, 0.04, 0.7);
        const f0 = this.freq(node.deg + eg.sp.degOff + this.dshift('signals'), eg.sp.reg) * (alarm ? 1.5 : 1);
        const id = this.audio.spawn(K.CHIRP, { x: node.x, y: node.y, z: -0.3, f0, f1: f0 * Math.pow(2, eg.sp.glide), mr: eg.sp.mr, mi: eg.sp.mi * (alarm ? 1.4 : 1), n, isi, bd: eg.sp.bd, gain: alarm ? 0.6 : 0.45, layer: LAYER.SIGNALS, send: 0.55, prio: 1 });
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
            if (s.alarm) { t.defense = Math.min(1.5, t.defense + 0.4); if (t.defense > 0.35 && this.r.chance(0.25)) this.log(`Tree ${t.id} received the alarm and is raising its defences.`, 'alarm'); }
            else if (this.r.chance(0.25 * this.p.chatter)) n.u += 0.6;
          }
        }
        if (n.u >= 1) this.fire(n, s.alarm, e.id, s.hops, s.g);
      }
    }
    // spontaneous spiking (Adamatzky); more after rain and in warmth (Fukasawa 2023)
    const warm = clamp(0.5 + this.temp / 25, 0.3, 1.6);
    const rate = 0.03 * this.p.chatter * warm * (1 + 3 * this.afterRain) * Math.pow(2, this.ch('signals', 'pace') * 0.6) * this.quiet() * (this.snow > 0.5 ? 0.6 : 1);
    if (this.edges.size > 3 && this.r.chance(rate * dt * Math.min(12, this.nodes.size / 8))) {
      const arr = [...this.nodes.values()]; const n = arr[Math.floor(this.r() * arr.length)];
      if (n.edges.size) this.fire(n, false, 0, 0);
    }
  }
  stressTree(t, src) {
    if (!t) return;
    t.stress = 1; t.defense = Math.min(1.5, t.defense + 0.6); t.flash = 1.5; this.ev.deer = 20;
    const n = this.nodes.get(t.node); if (n) { n.refr = 0; this.fire(n, true, 0, 0); this.later(2.5, () => { n.refr = 0; this.fire(n, true, 0, 0); }); }
    this.flashes.push({ x: t.x, y: t.y, t: 2, c: 'alarm' });
    this.log(src === 'user' ? `You wounded tree ${t.id}. Damage signals spread through the fungal network.` : `Deer are browsing tree ${t.id}. An alarm runs through the hyphae.`, 'alarm');
  }
  later(t, fn) { (this._timers || (this._timers = [])).push({ t, fn }); }

  // ---------------------------------------------------------- packets: sugar by day, water by night
  movePackets(list, dt, z) {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]; c.s += c.speed * dt;
      if (c.s >= c.len) { list.splice(i, 1); if (c.onArrive) c.onArrive(); continue; }
      let k = c.k; while (k < c.cum.length - 2 && c.cum[k + 1] < c.s) k++; c.k = k;
      const a = c.pts[k], b = c.pts[k + 1]; const t = (c.s - c.cum[k]) / ((c.cum[k + 1] - c.cum[k]) || 1);
      c.x = a[0] + (b[0] - a[0]) * t; c.y = a[1] + (b[1] - a[1]) * t;
      if (c.voice) this.audio.move(c.voice, c.x, c.y, z);
    }
  }
  packet(pts, speed) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum[cum.length - 1], s: 0, k: 0, speed, x: pts[0][0], y: pts[0][1], voice: null }; }
  carbonStep(dt) {
    this.movePackets(this.carbon, dt, 0.2);
    this.carbonT -= dt; if (this.carbonT > 0) return;
    this.carbonT = this.r.range(8, 20);
    let best = null, bq = 0.0008;
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
    if (!cur || cur.type !== 'tree' || cur.id === best.n.id || pts.length < 2) return;
    const dst = this.treeById(cur.tree); if (!dst) return;
    const c = this.packet(pts, 1.6); c.src = best.t.id; c.dst = dst.id; c.onArrive = () => { const t = this.treeById(c.dst); if (t) t.flash = Math.min(1.5, t.flash + 0.6); };
    this.carbon.push(c);
    if (this.canSpawn(this.budget.carbon, 2)) {
      const T = c.len / c.speed;
      const id = this.audio.spawn(K.DRONE, { x: c.x, y: c.y, z: 0.2, f: this.freq(best.t.deg + this.dshift('signals'), 1), r: [1, 2, 3, 5], a: [1, 0.3, 0.12, 0.05], breath: 0.15, bq: 3, bright: 0.45, det: 6, trate: 0.4, tdep: 0.2, glide: T * 0.8, gain: 0.4, att: 0.8, rel: 1.2, dur: T, layer: LAYER.SIGNALS, send: 0.5, prio: 2 });
      if (id) { this.audio.set(id, { f: this.freq(dst.deg + this.dshift('signals'), 1), glide: T * 0.8 }); c.voice = id; this.budget.carbon.add(id); }
    }
    if (this.r.chance(0.3)) this.log(`Carbon moves from tree ${best.t.id} to tree ${dst.id} through ${used.size} cords. In real forests a few percent of root carbon is shared this way (Klein 2016).`, 'carbon');
  }
  // hydraulic redistribution (Querejeta et al. 2003): at night deep-rooted
  // trees lift water and release it to their mycorrhizal partners
  waterStep(dt) {
    this.movePackets(this.water, dt, -0.4);
    this.waterT -= dt; if (this.waterT > 0 || this.light > 0.08) return;
    this.waterT = this.r.range(15, 35);
    const donors = this.trees.filter(t => t.size > 0.9 && t.water > 0.6);
    const needy = this.trees.filter(t => t.size < 0.8 && t.water < 0.75);
    if (!donors.length || !needy.length) return;
    for (let tries = 0; tries < 4; tries++) {
      const a = this.r.pick(donors), b = this.r.pick(needy);
      const pts = this.path(a.node, b.node); if (!pts) continue;
      const c = this.packet(pts, 1.1); c.dst = b.id; c.onArrive = () => { const t = this.treeById(c.dst); if (t) { t.hyd = Math.min(0.4, t.hyd + 0.15); t.flash = Math.min(1.5, t.flash + 0.3); } };
      this.water.push(c);
      if (this.canSpawn(this.budget.carbon, 3)) {
        const T = c.len / c.speed;
        const id = this.audio.spawn(K.NOISE, { x: c.x, y: c.y, z: -0.4, bf: 520, bq: 3, lp: 0.25, srate: 0.3, sdep: 0.3, gust: 0.4, drops: 9, df: 700, gain: 0.22, att: 1.5, rel: 1.5, dur: T, layer: LAYER.SIGNALS, send: 0.6, prio: 2 });
        if (id) { c.voice = id; this.budget.carbon.add(id); }
      }
      if (this.r.chance(0.35)) this.log(`Night: tree ${a.id} lifts water from deep soil and lets it out through its fungal partners toward seedling ${b.id}.`, 'water');
      break;
    }
  }

  // ---------------------------------------------------------- fruiting & spores
  fruitStep(dt) {
    const r = this.r;
    const cool = this.temp < 16 ? 1.3 : 0.8;
    for (const g of this.genets.values()) {
      if (this.fruits.length >= 10) break;
      // each genus fruits in its own months: snowbank Hygrophorus in March, velvet shank in frost, most in late summer and autumn
      const autumn = fruitSeason(g.sp, this.month) * 1.6; if (autumn <= 0) continue;
      if ((g.fstore || 0) < g.sp.fruitCost * 0.9 || this.moist < 0.45 || this.t - g.born < 240) continue;
      if (!r.chance(dt * 0.004 * this.p.bloom * (this.moist - 0.35) * autumn * cool * (1 + 2 * this.afterRain))) continue;
      // fruit bodies appear at the colony margin, which is how fairy rings form
      const own = [...this.nodes.values()].filter(n => n.type === 'j' && n.genet === g.id && n.edges.size >= 1 && !this.treeAt(n.x, n.y, 2) && !this.fruits.some(f => Math.hypot(f.x - n.x, f.y - n.y) < 2.5));
      if (own.length < 3) continue;
      own.sort((a, b) => Math.hypot(b.x - g.ox, b.y - g.oy) - Math.hypot(a.x - g.ox, a.y - g.oy));
      const n = own[Math.floor(r() * Math.max(1, own.length * 0.3))];
      g.fstore -= g.sp.fruitCost * 0.9;
      const f = { id: this.stats.fruits++, node: n.id, x: n.x, y: n.y, g: g.id, phase: 'emerge', t: 0, size: 0, voice: null, spores: 0, maxSpores: r.int(4, 8) };
      this.fruits.push(f);
      if (this.canSpawn(this.budget.fruit, 4)) {
        const sp = g.sp;
        const id = this.audio.spawn(K.GRAIN, { x: n.x, y: n.y, z: 0.15, slot: this.matB && r.chance(0.6) ? 1 : 0, dens: sp.fDens * 0.3 * this.grainD(), size: sp.fSize * this.grainS(), pitch: Math.pow(2, sp.fOct), ps: this.scaleRatios(4, n.deg + sp.degOff + this.dshift('fruit')), pos: r(), pj: 0.08, scan: r.range(-0.03, 0.03), lp: 0.35, rev: sp.fRev, gain: 0.0, att: 6, rel: 6, layer: LAYER.FRUIT, send: 0.6, prio: 2 });
        if (id) { f.voice = id; this.budget.fruit.add(id); }
      }
      this.log(`${g.name} is fruiting at the edge of its colony, ${this.compass(n.x, n.y)}. Fruit bodies form at the advancing margin, which is how fairy rings appear.`, 'fruit');
    }
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i]; f.t += dt; const g = this.genets.get(f.g); const sp = g ? g.sp : this.seed.species[0];
      if (f.phase === 'emerge') {
        f.size = Math.min(1, f.t / 60);
        if (f.voice) this.audio.set(f.voice, { gain: 0.5 * f.size, dens: sp.fDens * (0.3 + f.size * 0.7) * this.grainD(), size: sp.fSize * this.grainS(), lp: 0.3 + f.size * 0.5 });
        if (f.t > 60) { f.phase = 'mature'; f.t = 0; const n = this.nodes.get(f.node) || { deg: 0 }; this.ping(f.x, f.y, 0.5, { deg: n.deg + 2 }, sp, 1.1, 10); const nn = this.nodes.get(f.node); if (nn) { nn.refr = 0; this.fire(nn, false, 0, 0, f.g); } }
      } else if (f.phase === 'mature') { if (f.t > 20) { f.phase = 'spore'; f.t = 0; } }
      else if (f.phase === 'spore') {
        if (f.spores < f.maxSpores && f.t > f.spores * 6) { f.spores++; this.releaseSpore(f, sp); }
        if (f.t > f.maxSpores * 6 + 4) { f.phase = 'decay'; f.t = 0; if (f.voice) this.audio.set(f.voice, { pitch: Math.pow(2, sp.fOct - 1), lp: 0.15, dens: sp.fDens * 0.3 }); }
      } else if (f.phase === 'decay') {
        f.size = Math.max(0, 1 - f.t / 40);
        if (f.voice) this.audio.set(f.voice, { gain: 0.4 * f.size });
        if (f.t > 40) { if (f.voice) this.audio.rel(f.voice, 3); this.addLitter(f.x, f.y, 0.5); this.fruits.splice(i, 1); }
      }
    }
  }
  releaseSpore(f, sp) {
    const r = this.r, a = this.windDir + r.gauss() * 0.8, sp0 = r.range(0.3, 1);
    // evaporation cools the air under the cap; the convection lifts spores even in still air (Dressaire 2016)
    const lift = 0.6 + this.moist * 1.2 + (1 - this.windStr) * 0.6;
    const s = { x: f.x, y: f.y, z: 0.5, vx: Math.sin(a) * sp0, vy: Math.cos(a) * sp0, vz: r.range(0.8, 1.6) * lift, age: 0, life: r.range(10, 26), g: f.g, sp, voice: null };
    this.spores.push(s);
    // ballistospore discharge: Buller's drop flicks each spore off the gill
    this.fx(K.MODAL, { x: f.x, y: f.y, z: 0.45, f: r.range(5000, 9000), r: [1, 1.5, 2.3, 3.1], d: [0.006, 0.004, 0.003, 0.002], a: [1, 0.5, 0.3, 0.2], hard: 1, gain: 0.3, layer: LAYER.FRUIT, send: 0.4, prio: 1 }, 6);
    this.spawnSporeVoice(s);
  }
  grainS() { return Math.pow(2, this.ch('fruit', 'grain') * 1.2); }
  grainD() { return Math.pow(2, -this.ch('fruit', 'grain') * 0.6); }
  spawnSporeVoice(s) {
    if (!this.canSpawn(this.budget.spore, 8)) return;
    const r = this.r, sp = s.sp;
    const id = sp.spore === 'grain'
      ? this.audio.spawn(K.GRAIN, { x: s.x, y: s.y, z: s.z, slot: 0, dens: r.range(10, 26) * this.grainD(), size: r.range(0.015, 0.05) * this.grainS(), pitch: Math.pow(2, r.int(1, 3)), ps: this.scaleRatios(3, sp.degOff + this.dshift('fruit')), pj: 0.3, lp: 0.9, gain: 0.26, att: 0.6, rel: 1.5, layer: LAYER.FRUIT, send: 0.8, prio: 1 })
      : this.audio.spawn(K.TICK, { x: s.x, y: s.y, z: s.z, rate: r.range(3, 9), f: sp.tickF * 1.4, q: sp.tickQ * 1.5, jit: 0.15, burst: 0.1, gain: 0.4, att: 0.4, rel: 1, layer: LAYER.FRUIT, send: 0.8, prio: 1 });
    if (id) { s.voice = id; this.budget.spore.add(id); }
  }
  sporeStep(dt) {
    const r = this.r; const wx = Math.sin(this.windDir) * this.windStr * 3, wy = Math.cos(this.windDir) * this.windStr * 3;
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i]; s.age += dt;
      if (s.immigrant) { s.vz += (-0.12 - s.vz * 0.2) * dt; }
      else { s.vx += ((wx - s.vx) * 0.5 + r.gauss() * 1.0) * dt; s.vy += ((wy - s.vy) * 0.5 + r.gauss() * 1.0) * dt; s.vz += (-0.3 - s.vz * 0.3 + r.gauss() * 0.5) * dt; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.voice) this.audio.move(s.voice, s.x, s.y, s.z);
      const landed = s.z <= 0 || s.age > s.life;
      if (!landed) continue;
      this.spores.splice(i, 1); if (s.voice) this.audio.rel(s.voice, 0.6);
      if (Math.hypot(s.x, s.y) > PLOT_R - 1 || this.genets.size >= (s.sp.guild === 'sapro' ? WILD_FUNGI + 6 : WILD_FUNGI) || this.nearPoint(s.x, s.y, 1.2)) continue;
      // ectomycorrhizal spores germinate near host roots; saprotrophs need litter
      const host = s.sp.guild === 'ecm' ? this.trees.find(t => Math.hypot(t.x - s.x, t.y - s.y) < 4.5 && this.hostOk(s.sp, t)) : this.litter.find(l => Math.hypot(l.x - s.x, l.y - s.y) < 3 && l.a > 0.1);
      if (!host || !r.chance((0.35 + this.place(s.x, s.y).moist * 0.3) * (0.3 + 0.7 * this.fungusFit(s.sp, s.x, s.y)))) continue;
      const parent = this.genets.get(s.g);
      const sp = parent ? mutateSpecies(s.sp, r, this.p.mutation) : s.sp;
      const child = this.addGenet(sp, parent, s.x, s.y);
      child.energy = 0.55;
      const n = this.addNode(s.x, s.y, 'j', child.id); n.deg = sp.degOff + r.int(0, 4);
      const k = r.int(2, 3); for (let j = 0; j < k; j++) this.addTip(child, n.id, s.x, s.y, r.range(0, Math.PI * 2), 0.1);
      this.stats.germ++;
      this.ping(s.x, s.y, 0, n, child.sp, 0.7, 10);
      const ex = EXPLORATION[sp.expl].label;
      if (!parent) this.log(sp.guild === 'ecm' ? `A spore of ${sp.genus} blew in and germinated near the roots of tree ${host.id}: ${child.name}, ${sp.stage === 'early' ? 'an early' : 'a late'}-stage, ${ex} fungus.` : `${sp.genus} spores found the litter: ${child.name}, a decomposer${sp.lum ? ' that glows at night' : ''}.`, 'spore');
      else this.log(`A spore of ${parent.name} germinated: ${child.name}, a new individual with a mutated growth form and voice.`, 'spore');
    }
  }

  // ---------------------------------------------------------- pruning & death
  prune(dt) {
    this._pr = (this._pr || 0) + dt; if (this._pr < 1) return; const pr = this._pr; this._pr = 0;
    for (const e of [...this.edges.values()]) if (e.D < 0.03 && e.age > 120 && !this.fruits.some(f => f.node === e.a || f.node === e.b)) this.removeEdge(e, true);
    for (const g of this.genets.values()) g.len = 0;
    for (const e of this.edges.values()) { const g = this.genets.get(e.g); if (g) g.len += e.len; }
    for (const g of [...this.genets.values()]) {
      g.energy = Math.min(g.energy, 4); g.nut = Math.min(g.nut, 3); g.fstore = Math.min(g.fstore || 0, 2.5);
      // upkeep of the mycelium itself
      g.energy -= g.len * 0.000006 * g.sp.cost * pr;
      const hasTips = this.tips.some(t => t.g === g.id);
      if (!hasTips && g.len < 0.1 && this.t - g.born > 20) { this.genets.delete(g.id); this.log(`${g.name} has died out. Its matter returns to the soil.`, 'death'); continue; }
      if (g.energy < -0.5) { for (const e of [...this.edges.values()]) if (e.g === g.id && this.r.chance(0.3)) e.D *= 0.5; }
      const nt = this.tips.filter(t => t.g === g.id).length;
      if (((g.energy > 0.9 && nt < (g.energy > 2.5 ? 7 : 3)) || (nt === 0 && g.energy > 0.25)) && this.r.chance(0.2 * this.p.growth * pr)) {
        const ns = [...this.nodes.values()].filter(n => n.genet === g.id || (n.type === 'tree' && this.treeById(n.tree) && this.treeById(n.tree).links.has(g.id)));
        if (ns.length) { const n = this.r.pick(ns); this.addTip(g, n.id, n.x, n.y, this.r.range(0, Math.PI * 2), 0.1); g.energy -= 0.04 * g.sp.cost; }
      }
      // circadian bioluminescence (Oliveira 2015): glow peaks in darkness
      g.glow = g.sp.lum ? clamp((0.25 - this.light) * 4, 0, 1) : 0;
    }
    for (const l of this.litter) l.a -= 0.00008 * pr; this.litter = this.litter.filter(l => l.a > 0.02);
    for (const p of this.patches) p.a = Math.min(p.a0 * 1.2, p.a + 0.00015 * pr * this.moist);
    for (const t of this.trees) for (const gid of [...t.links.keys()]) if (!this.genets.has(gid)) t.links.delete(gid);
    for (const g of this.genets.values()) { g.bonded = this.trees.some(t => t.links.has(g.id)); g.fit = this.fungusFit(g.sp, g.ox, g.oy); }
    for (const t of this.trees) t.fit = this.treeFit(t.sp, t.x, t.y);
  }
  events(dt) {
    this.grazeT -= dt;
    if (this.grazeT <= 0) { this.grazeT = this.r.range(500, 1400); const big = this.trees.filter(t => t.size > 0.5); if (big.length) this.stressTree(this.r.pick(big), 'deer'); }
    if (this._timers) { for (let i = this._timers.length - 1; i >= 0; i--) { const tm = this._timers[i]; tm.t -= dt; if (tm.t <= 0) { this._timers.splice(i, 1); tm.fn(); } } }
  }
  stageCheck() {
    const ms = this.meanSize(); let bonds = 0, shared = 0;
    for (const t of this.trees) { bonds += t.links.size; }
    for (const g of this.genets.values()) { let c = 0; for (const t of this.trees) if (t.links.has(g.id)) c++; if (c >= 2) shared++; }
    let s = 0;
    if (this.trees.length) s = 1;
    if (bonds > 0) s = 2;
    if (shared > 0 && bonds >= 3) s = 3;
    if (s >= 3 && ms > 0.5) s = 4;
    if (s >= 4 && ms > 0.85) s = 5;
    if (s >= 5 && ms > 1.2) s = 6;
    if (s > this.stage) { this.stage = s; this.log(`${STAGES[s][0]}. ${STAGES[s][1]}`, 'stage'); }
  }

  // ---------------------------------------------------------- persistent voices
  updateVoices(dt) {
    const A = this.audio; if (!A.ready) return;
    const L = this.listener;
    // only the most audible trees get a voice, so a large forest never floods the mix
    const audible = new Set(this.trees.map(t => [t, Math.pow(clamp(t.size / 1.2, 0, 1.3), 1.5) * (0.5 + 0.5 * t.leaf) / (1 + Math.hypot(t.x - L.x, t.y - L.y) / 7)]).sort((a, b) => b[1] - a[1]).slice(0, 14).map(a => a[0].id));
    for (const [tid, vid] of this.v.trees) if (!audible.has(tid)) { A.rel(vid, 8); this.v.trees.delete(tid); }
    for (const t of this.trees) {
      if (!audible.has(t.id)) continue;
      let id = this.v.trees.get(t.id);
      const day = (0.55 + 0.45 * this.light) * (0.45 + 0.55 * t.leaf);
      const vigor = clamp(0.4 + 0.35 * t.sugar, 0.15, 1.2);
      const grown = Math.pow(clamp(t.size / 1.2, 0, 1.35), 1.5);
      const gain = 1.8 * (0.03 + 0.15 * grown) * day * vigor * (t.hub ? 1.35 : 1) * (t.dying > 0 ? t.dying / 8 : 1);
      // a young tree has only its fundamental; upper partials come with size
      const amps = t.amps.map((a, k) => k === 0 ? a : a * clamp((t.size - 0.15 - k * 0.22) / 0.35, 0, 1) * (0.3 + 0.7 * t.leaf));
      const oct = t.size < 0.4 ? 1 : 0;
      const tDeg = t.deg + this.dshift('trees');
      const tone = this.ch('trees', 'tone') * 0.3 + (this.tide - 0.5) * 0.25;
      const chg = this.p.change === undefined ? 0.5 : this.p.change;
      for (let k = 1; k < 4; k++) t.amps[k] = clamp(t.amps[k] + this.r.gauss() * 0.008 * (0.3 + chg) * Math.sqrt(dt), 0, 0.9);
      if (!id || !A.alive(id)) {
        const f = this.freq(tDeg, oct); t.vf = f;
        id = t.type === 'grain'
          ? A.spawn(K.GRAIN, { x: t.x, y: t.y, z: 1 + t.size * 2, slot: this.matB && this.r.chance(0.5) ? 1 : 0, dens: 4 + t.size * 10, size: 0.2 + this.r() * 0.3, pitch: f / 220, ps: this.scaleRatios(3, t.deg), pos: this.r(), pj: 0.04, scan: 0.006, lp: clamp(0.45 + tone, 0.05, 1), gain, att: 12, rel: 6, layer: LAYER.TREES, send: 0.55, prio: 3 })
          : A.spawn(K.DRONE, { x: t.x, y: t.y, z: 1 + t.size * 2, f, r: t.partials, a: amps, breath: t.breath, bq: 4, det: t.det, bright: clamp(0.3 + tone, 0, 1), trate: 0.07 + this.r() * 0.1, tdep: 0.15, glide: 8, gain, att: 14, rel: 6, layer: LAYER.TREES, send: 0.55, prio: 3 });
        if (id) { this.v.trees.set(t.id, id); t.voct = oct; }
        continue;
      }
      const fT = this.freq(tDeg, oct);
      if (t.type !== 'grain' && (!t.vf || Math.abs(fT / t.vf - 1) > 0.0005)) { A.set(id, { f: fT, glide: t.voct !== oct ? 20 : 6 }); t.vf = fT; t.voct = oct; }
      A.move(id, t.x, t.y, 1 + t.size * 2);
      if (t.type === 'grain') A.set(id, { gain, pj: 0.04 + t.defense * 0.25, lp: clamp(0.3 + this.light * 0.3 + t.defense * 0.3 + t.flash * 0.2 + tone, 0.05, 1), dens: 4 + t.size * 10 + t.flash * 12 + t.stress * 20 });
      else A.set(id, { gain, a: amps, bright: clamp(0.15 + this.light * 0.35 + t.defense * 0.35 + t.size * 0.1 + tone, 0, 1), inh: clamp(t.defense * 0.7, 0, 1), trate: 0.08 + t.stress * 6 + t.drought * 1.5, tdep: 0.12 + t.stress * 0.45 + t.drought * 0.2, flash: t.flash > 0.3 ? t.flash * 0.5 : 0, breath: t.breath + t.stress * 0.25 + (1 - t.leaf) * 0.22 * (0.5 + this.windStr) });
    }
    for (const [tid, id] of this.v.trees) if (!this.treeById(tid)) { A.rel(id, 4); this.v.trees.delete(tid); }
    // growing tips near you tick
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 2;
      const near = this.tips.slice().sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)).slice(0, 4);
      for (let i = 0; i < 4; i++) {
        const tip = near[i]; let tv = this.v.ticks[i];
        if (!tip) { if (tv) { A.rel(tv.id, 1); this.v.ticks[i] = null; } continue; }
        const g = this.genets.get(tip.g); if (!g) continue;
        const rate = (1 + g.sp.speed * this.p.growth * 30 * clamp(this.moist, 0.2, 1.2) * this.growthT()) * Math.pow(2, this.ch('growth', 'density') * 1.2);
        const tf = g.sp.tickF * Math.pow(2, this.ch('growth', 'tone') * 0.8);
        if (!tv || !A.alive(tv.id)) {
          const id = A.spawn(K.TICK, { x: tip.x, y: tip.y, z: -0.25, rate, f: tf, q: g.sp.tickQ, jit: 0.35, burst: g.sp.burst, gain: 0.8, att: 2, rel: 2, layer: LAYER.GROWTH, send: 0.3, prio: 1 });
          this.v.ticks[i] = id ? { id, tip: tip.id } : null;
        } else { tv.tip = tip.id; A.set(tv.id, { rate, f: tf, q: g.sp.tickQ, burst: g.sp.burst }); }
      }
    }
    // weather and soil
    const raining = this.rainT > 0, wtone = this.ch('weather', 'tone');
    if (raining && this.v.rain.length === 0) {
      for (let i = 0; i < 3; i++) { const id = A.spawn(K.NOISE, { x: L.x, y: L.y, z: 5, bf: 3000 + i * 1200, bq: 0.7, lp: 0.75, srate: 0.03, sdep: 0.3, gust: 0.3, drops: 14, df: 2600 + i * 600, gain: 0.0, att: 10, rel: 12, layer: LAYER.WEATHER, send: 0.5, prio: 3 }); if (id) this.v.rain.push({ id, a: i * Math.PI * 2 / 3 }); }
    } else if (!raining && this.v.rain.length) { for (const v of this.v.rain) A.rel(v.id, 14); this.v.rain = []; }
    for (const v of this.v.rain) A.set(v.id, { gain: (this.snowing ? 0.035 : 0.08) * clamp(this.rainT / 8, 0, 1), drops: this.snowing ? 0 : 10 + this.moist * 14, lp: clamp((this.snowing ? 0.3 : 0.75) + wtone * 0.2, 0.05, 1) });
    if (!this.v.wind || !A.alive(this.v.wind)) this.v.wind = A.spawn(K.NOISE, { x: L.x, y: L.y + 12, z: 8, bf: 600, bq: 1.8, lp: 0.5, srate: 0.04, sdep: 0.7, gust: 0.6, gain: 0.05, att: 8, rel: 4, layer: LAYER.WEATHER, send: 0.6, prio: 3 });
    else A.set(this.v.wind, { gain: Math.min(0.22, 0.045 + this.windStr * 0.09 * (1 - 0.4 * clamp(this.meanSize() / 1.4, 0, 1))), bf: (350 + this.windStr * 900) * Math.pow(2, wtone * 0.7), lp: clamp(0.5 + wtone * 0.25, 0.1, 1), gust: clamp(0.3 + this.windStr * 0.6, 0, 1) });
    if (!this.v.soil || !A.alive(this.v.soil)) this.v.soil = A.spawn(K.NOISE, { x: L.x, y: L.y, z: -2, bf: 140, bq: 0.8, lp: 0.12, srate: 0.02, sdep: 0.4, gust: 0.2, crk: 2, gain: 0.05, att: 8, rel: 4, layer: LAYER.WEATHER, send: 0.25, prio: 3 });
    else { this.decomp *= 0.8; A.set(this.v.soil, { crk: (1 + this.tips.length * 0.3 + this.decomp * 300) * (1 - 0.7 * this.snow), gain: (0.045 + this.moist * 0.04) * (1 - 0.4 * this.snow), lp: clamp(0.12 + wtone * 0.08, 0.04, 0.4) }); }
    // foxfire: a faint shimmer over glowing decomposers at night
    let glow = 0, gx = 0, gy = 0; for (const g of this.genets.values()) if (g.glow > 0) { glow += g.glow * Math.min(1, g.len / 10); gx = g.ox; gy = g.oy; }
    if (glow > 0.05) {
      if (!this.v.fox || !A.alive(this.v.fox)) this.v.fox = A.spawn(K.DRONE, { x: gx, y: gy, z: 0, f: this.freq(this.seed.tun.ratios.length * 4, 0), r: [1, 1.5, 2.01, 3], a: [1, 0.5, 0.3, 0.2], breath: 0.3, bq: 12, det: 14, bright: 0.8, trate: 0.15, tdep: 0.5, glide: 6, gain: 0, att: 20, rel: 15, layer: LAYER.FRUIT, send: 0.9, prio: 2 });
      else A.set(this.v.fox, { gain: 0.06 * clamp(glow, 0, 1.5) });
    } else if (this.v.fox) { A.rel(this.v.fox, 15); this.v.fox = null; }
  }
  frameVoices() {
    const A = this.audio, L = this.listener; if (!A.ready) return;
    for (const tv of this.v.ticks) if (tv) { const tip = this.tips.find(t => t.id === tv.tip); if (tip) A.move(tv.id, tip.x, tip.y, -0.25); }
    const wr = Math.pow(2, this.ch('weather', 'width') * 0.9);
    for (const v of this.v.rain) { v.a += 0.002; A.move(v.id, L.x + Math.sin(v.a) * 6 * wr, L.y + Math.cos(v.a) * 6 * wr, 5); }
    if (this.v.wind) { const a = this.windDir + Math.PI + Math.sin(this.t * 0.03) * 0.6; A.move(this.v.wind, L.x + Math.sin(a) * 13 * wr, L.y + Math.cos(a) * 13 * wr, 8); }
    if (this.v.soil) A.move(this.v.soil, L.x, L.y, -2);
  }
  dropVoices() { this.v = { trees: new Map(), ticks: [], rain: [], wind: null, soil: null, fox: null }; for (const k in this.budget) this.budget[k].clear(); for (const s of this.signals) s.voice = null; for (const s of this.spores) s.voice = null; for (const f of this.fruits) f.voice = null; for (const c of this.carbon) c.voice = null; for (const c of this.water) c.voice = null; for (const c of this.critters) c.voice = null; }

  // ---------------------------------------------------------- the slow drift of the sound world
  // Not biology: an aesthetic layer so long listening never settles. The
  // tonal centre leans toward related keys, the timbre tide rises and falls,
  // and each fungus's voice mutates a little every few minutes.
  soundDrift(dt) {
    const r = this.r, ch = this.p.change === undefined ? 0.5 : this.p.change;
    this.keyT -= dt * (0.25 + ch * 1.5);
    if (this.keyT <= 0) {
      this.keyT = r.range(720, 1500);
      if (ch > 0.05) {
        const opts = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 8 / 9, 5 / 6, 4 / 5, 3 / 4, 2 / 3].filter(x => Math.abs(Math.log2(x / this.rootTarget)) > 0.01);
        this.rootTarget = r.pick(opts);
        this.log('The tonal centre of the forest begins to drift. Over the next minutes every voice glides toward a related key.', 'drift');
      }
    }
    this.rootMul *= Math.pow(this.rootTarget / this.rootMul, 1 - Math.exp(-dt / 160));
    this.tide = clamp(this.tide + r.gauss() * 0.03 * Math.sqrt(dt) * (0.3 + ch) + (0.5 - this.tide) * dt * 0.002, 0, 1);
    this.somaT -= dt * (0.2 + ch * 1.6);
    if (this.somaT <= 0) { this.somaT = r.range(240, 480); for (const g of this.genets.values()) g.sp = mutateSpecies(g.sp, r, 0.12 + ch * 0.12); }
  }

  // ---------------------------------------------------------- happenings
  happenings(dt) {
    const r = this.r, s = this.season();
    for (const k in this.ev) if (k !== 'rain' && k !== 'dry' && this.ev[k] > 0) this.ev[k] = Math.max(0, this.ev[k] - dt);
    this.ev.rain = Math.max(0, this.rainT);
    if (this.stormT > 0) {
      this.stormT -= dt; this.ev.storm = Math.max(0, this.stormT);
      const big = this.trees.filter(t => t.size > 0.8);
      if (big.length && r.chance(dt * 0.3)) this.creak(r.pick(big));
      if (big.length && r.chance(dt * 0.07)) {
        const t = r.pick(big), a = r.range(0, 6.28), d = r.range(1, 3);
        this.addLitter(t.x + Math.sin(a) * d, t.y + Math.cos(a) * d, 0.25);
        this.fx(K.MODAL, { x: t.x, y: t.y, z: 3 + t.size * 2, f: r.range(260, 600), r: PING_SETS.wood, d: [0.09, 0.05, 0.03, 0.02], a: [1, 0.6, 0.4, 0.3], hard: 1, gain: 0.35, layer: LAYER.WEATHER, send: 0.6 }, 6);
      }
      for (const f of this.fruits) if (f.phase === 'spore' && r.chance(dt * 0.3)) { const g = this.genets.get(f.g); this.releaseSpore(f, g ? g.sp : this.seed.species[0]); }
      if (this.stormT <= 0) this.windthrow();
    }
    for (let i = this.deposits.length - 1; i >= 0; i--) { const d = this.deposits[i]; d.t -= dt; if (d.t <= 0) { this.deposits.splice(i, 1); this.germinateDeposit(d); } }
    // the forest's own happenings, rarer than rain and deer, shaped by the season
    const busy = ['storm', 'dry', 'cache', 'squirrel'].some(k => this.ev[k] > 0) || this.fgLoad() > FG_MAX * 0.7;
    const rate = { storm: s === 'autumn' || s === 'winter' ? 1.6 : 0.6, dry: s === 'summer' ? 1.8 : s === 'spring' ? 0.5 : 0.25, cache: s === 'autumn' ? 2 : 0.5, squirrel: s === 'autumn' || s === 'summer' ? 1.4 : 0.6 };
    for (const k in this.auto) {
      this.auto[k] -= dt * rate[k];
      if (this.auto[k] > 0 || busy) continue;
      this.auto[k] = r.range(2400, 4800);
      if (k === 'storm') this.windstorm('auto');
      else if (k === 'dry' && this.rainT <= 0 && this.temp > 8) this.drySpell('auto');
      else if (k === 'cache') this.cachers('auto');
      else if (k === 'squirrel') this.squirrels('auto');
      break;
    }
  }
  windstorm(src) {
    if (this.stormT > 0) return false;
    this.stormT = 120; this.ev.storm = 120;
    this.log(`${src === 'user' ? 'You call up a windstorm' : 'A windstorm comes through'}. Trunks creak and branches break; the storm lifts spores high and may throw a weakened tree.`, 'weather');
    return true;
  }
  creak(t) {
    const f = this.r.range(110, 240);
    this.fx(K.CHIRP, { x: t.x, y: t.y, z: 2 + t.size * 2, f0: f, f1: f * this.r.range(0.7, 0.95), mr: 0.5, mi: 2.2, n: this.r.int(5, 12), isi: this.r.range(0.025, 0.05), bd: 0.03, gain: 0.28, layer: LAYER.WEATHER, send: 0.5, prio: 1 }, 6);
  }
  windthrow() {
    const r = this.r;
    const cands = this.trees.filter(t => t.size > 1.1 && t.dying <= 0 && (t.drought > 0.3 || t.sugar < 0.6 || t.hunger > 0 || r.chance(0.35)));
    if (!cands.length || this.trees.length < 5 || !r.chance(0.6)) { this.log('The storm passes. Broken branches lie on the ground for the decomposers.', 'weather'); return; }
    const t = r.pick(cands), a = this.windDir;
    this.fx(K.NOISE, { x: t.x, y: t.y, z: 1, bf: 140, bq: 0.6, lp: 0.2, srate: 0.5, sdep: 0.6, gust: 0.9, crk: 120, gain: 0.5, att: 0.05, rel: 3, dur: 1.6, layer: LAYER.WEATHER, send: 0.8, prio: 2 }, 8);
    this.fx(K.MODAL, { x: t.x, y: t.y, z: 0.5, f: 55, r: [1, 1.7, 2.6, 3.9], d: [1.4, 0.9, 0.5, 0.3], a: [1, 0.6, 0.4, 0.2], hard: 0.3, gain: 0.55, layer: LAYER.WEATHER, send: 0.9, prio: 2 }, 8);
    for (let k = 1; k <= 3; k++) this.addLitter(t.x + Math.sin(a) * k * 1.6 * t.size, t.y + Math.cos(a) * k * 1.6 * t.size, 0.8 * t.size);
    this.addPatch(t.x - Math.sin(a) * 0.8, t.y - Math.cos(a) * 0.8, 1.4, false);
    this.killTree(t, 'fall');
    const gx = t.x + Math.sin(a + 1) * 1.5, gy = t.y + Math.cos(a + 1) * 1.5;
    this.seedbank.push({ x: gx, y: gy, t: this.t + r.range(150, 360), kin: t.kin, deg: clamp(t.deg + r.pick([-1, 1, 2]), 0, this.seed.tun.ratios.length * 3), done: false });
    this.log(`The storm threw tree ${t.id}. Its root plate tore open the mineral soil, and light now reaches the floor: a seedling will come up in the gap.`, 'death');
  }
  drySpell(src) {
    if (this.dryT > 0) return false;
    this.dryT = 600; this.ev.dry = 600; this.rainT = Math.min(this.rainT, 1); this.rainCool = Math.max(this.rainCool, 600);
    this.log(`${src === 'user' ? 'You hold back the rain' : 'A dry spell sets in'}. Thirsty trees start to click (Khait 2023), deep roots pass water through the hyphae at night (Querejeta 2003), and fungi with water-carrying cords gain the upper hand.`, 'weather');
    return true;
  }
  // seed caching: nutcrackers bury stone pine seeds, jays bury acorns; forgotten caches sprout
  cachers(src) {
    const r = this.r; const big = this.trees.filter(t => t.size > 0.7);
    if (!big.length) { this.log('No tree here is old enough to bear seeds yet, so the seed-caching birds stay away.', 'fauna'); return false; }
    if (this.ev.cache > 0) return false;
    this.ev.cache = 90; const tree = r.pick(big); const n = r.int(2, 3);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, 6.28), sx = Math.sin(a) * (PLOT_R + 4), sy = Math.cos(a) * (PLOT_R + 4);
      const perch = [tree.x + r.range(-1, 1), tree.y + r.range(-1, 1), 3 + tree.size * 3];
      const spots = []; for (let k = 0; k < 8 && spots.length < 2; k++) { const b = r.range(0, 6.28), d = r.range(3, 10); const x = tree.x + Math.sin(b) * d, y = tree.y + Math.cos(b) * d; if (Math.hypot(x, y) < PLOT_R - 1.5 && !this.treeAt(x, y, 2.2)) spots.push([x, y, 0.1]); }
      const pts = [[sx, sy, 9], perch]; for (const p of spots) pts.push([p[0], p[1], 1.5], p); pts.push([-sx, -sy, 10]);
      this.later(i * r.range(1.5, 4), () => this.addCritter('bird', pts, 3.2, (c, k) => this.cacheAt(c, k, tree)));
    }
    this.log(this.seed.cacher === 'nutcrackers'
      ? `${src === 'user' ? 'You call nutcrackers' : 'Nutcrackers arrive'}. They harvest tree ${tree.id}'s seeds and bury them in caches. Some caches are forgotten and sprout; the Swiss stone pine depends on this.`
      : `${src === 'user' ? 'You call jays' : 'Jays arrive'}. They harvest tree ${tree.id}'s seeds and bury them one by one. Forgotten caches sprout; jays plant oak woods this way.`, 'fauna');
    return true;
  }
  cacheAt(c, k, tree) {
    const p = c.pts[k]; if (!p || p[2] > 0.5) return;
    this.fx(K.TICK, { x: p[0], y: p[1], z: 0.1, rate: 16, f: 2400, q: 5, jit: 0.3, burst: 0.3, gain: 0.3, dur: 1.2, rel: 0.3, layer: LAYER.FAUNA, send: 0.4 }, 6, this.budget.fauna);
    if (this.r.chance(0.35) && this.trees.length + this.seedbank.filter(b => !b.done).length < 12) {
      this.seedbank.push({ x: p[0], y: p[1], t: this.t + this.r.range(120, 300), kin: tree.kin, deg: clamp(tree.deg + this.r.pick([-1, 1, 2, 0]), 0, this.seed.tun.ratios.length * 3), done: false });
      this.log(`A cache was forgotten ${this.compass(p[0], p[1])}. Its seed will come up in a few minutes.`, 'fauna');
    }
  }
  // mycophagy: squirrels eat mushrooms and dig truffles; the spores pass the gut and are planted elsewhere
  squirrels(src) {
    const r = this.r; if (this.ev.squirrel > 0 || !this.trees.length) return false;
    const ecm = [...this.genets.values()].filter(g => g.sp.guild === 'ecm');
    this.ev.squirrel = 75;
    const a = r.range(0, 6.28); const start = [Math.sin(a) * (PLOT_R + 3), Math.cos(a) * (PLOT_R + 3), 0.1];
    const stops = [];
    const fr = this.fruits.find(f => f.phase !== 'decay'); if (fr) stops.push({ x: fr.x, y: fr.y, fruit: fr.id });
    for (const t of r.shuffle(this.trees.slice()).slice(0, 3)) { const b = r.range(0, 6.28); stops.push({ x: t.x + Math.sin(b) * 1.6, y: t.y + Math.cos(b) * 1.6, dig: true }); }
    const pts = [start]; for (const st of stops) pts.push([st.x, st.y, 0.1]); pts.push([-start[0], -start[1], 0.1]);
    let carried = ecm.length ? (ecm.find(g => g.sp.expl === 'long') || r.pick(ecm)) : null;
    this.addCritter('squirrel', pts, 2.4, (c, k) => { const st = stops[k - 1]; if (st) { const g = this.squirrelStop(st, carried); if (g) carried = g; } });
    this.log(`${src === 'user' ? 'You send a red squirrel' : 'A red squirrel comes foraging'}. Squirrels eat mushrooms and dig up truffles; the spores survive the gut, so they plant fungi wherever they go (mycophagy).`, 'fauna');
    return true;
  }
  squirrelStop(st, g) {
    const r = this.r;
    this.fx(K.TICK, { x: st.x, y: st.y, z: 0.05, rate: 30, f: 1800, q: 3, jit: 0.5, burst: 0.7, gain: 0.3, dur: 1.4, rel: 0.4, layer: LAYER.FAUNA, send: 0.4 }, 6, this.budget.fauna);
    if (st.fruit !== undefined) {
      const f = this.fruits.find(x => x.id === st.fruit);
      if (f) { if (f.voice) this.audio.rel(f.voice, 1); this.fruits.splice(this.fruits.indexOf(f), 1); const fg = this.genets.get(f.g); if (fg) g = fg; this.log('The squirrel eats a mushroom. Its spores travel on inside it.', 'fauna'); }
    }
    if (st.dig) {
      const hit = this.nearPoint(st.x, st.y, 0.8); if (hit && r.chance(0.6)) this.removeEdge(hit.e, true);
      if (g && r.chance(0.7)) this.deposits.push({ x: st.x + r.range(-0.5, 0.5), y: st.y + r.range(-0.5, 0.5), sp: g.sp, parent: g.id, t: r.range(40, 120) });
    }
    return g;
  }
  germinateDeposit(d) {
    if (this.genets.size >= WILD_FUNGI || this.nearPoint(d.x, d.y, 1)) return;
    const host = this.trees.find(t => Math.hypot(t.x - d.x, t.y - d.y) < 4.5 && this.hostOk(d.sp, t)); if (!host) return;
    const parent = this.genets.get(d.parent);
    const child = this.addGenet(mutateSpecies(d.sp, this.r, this.p.mutation * 0.8), parent, d.x, d.y); child.energy = 0.6;
    const n = this.addNode(d.x, d.y, 'j', child.id); n.deg = d.sp.degOff + this.r.int(0, 4);
    for (let j = 0; j < 3; j++) this.addTip(child, n.id, d.x, d.y, this.r.range(0, 6.28), 0.1);
    this.stats.germ++; this.ping(d.x, d.y, 0, n, child.sp, 0.6, 10);
    this.log(`Spores left behind by the squirrel germinated near tree ${host.id}: ${child.name}.`, 'spore');
  }
  addCritter(kind, pts, speed, onPoint) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const c = { kind, pts, cum, len: cum[cum.length - 1], s: 0, k: 0, speed, x: pts[0][0], y: pts[0][1], z: pts[0][2], onPoint, voice: null, callT: 1 };
    if (kind === 'squirrel' && this.canSpawn(this.budget.fauna, 3)) {
      const id = this.audio.spawn(K.TICK, { x: c.x, y: c.y, z: 0.1, rate: 14, f: 2600, q: 2.5, jit: 0.6, burst: 0.6, gain: 0.24, att: 0.3, rel: 0.6, dur: c.len / speed, layer: LAYER.FAUNA, send: 0.35, prio: 1 });
      if (id) { c.voice = id; this.budget.fauna.add(id); }
    }
    this.critters.push(c); return c;
  }
  critterStep(dt) {
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i]; c.s += c.speed * dt;
      while (c.k < c.cum.length - 1 && c.cum[c.k + 1] <= c.s) { c.k++; if (c.onPoint) c.onPoint(c, c.k); }
      if (c.s >= c.len) { this.critters.splice(i, 1); continue; }
      const a = c.pts[c.k], b = c.pts[c.k + 1]; const t = (c.s - c.cum[c.k]) / ((c.cum[c.k + 1] - c.cum[c.k]) || 1);
      c.x = a[0] + (b[0] - a[0]) * t; c.y = a[1] + (b[1] - a[1]) * t; c.z = a[2] + (b[2] - a[2]) * t;
      if (c.voice) this.audio.move(c.voice, c.x, c.y, c.z);
      c.callT -= dt;
      if (c.callT <= 0) { c.callT = this.r.range(2, 5); if (c.kind === 'bird') this.cacherCall(c); else if (this.r.chance(0.4)) this.chatter(c); }
    }
  }
  voiceFauna(kind, p) {
    if (!this.canSpawn(this.budget.fauna, 3)) return null;
    const id = this.audio.spawn(kind, p);
    if (id) { this.budget.fauna.add(id); this.calls.push({ x: p.x, y: p.y, z: p.z, t: 1.6 }); }
    return id;
  }
  cacherCall(c) { const nut = this.seed.cacher === 'nutcrackers'; const f = nut ? this.r.range(1300, 1700) : this.r.range(1700, 2300); this.voiceFauna(K.CHIRP, { x: c.x, y: c.y, z: c.z, f0: f, f1: f * 0.85, mr: 1.5, mi: 2.4, n: this.r.int(2, 4), isi: this.r.range(0.12, 0.18), bd: 0.07, gain: 0.3, layer: LAYER.FAUNA, send: 0.55, prio: 1 }); }
  chatter(c) { this.voiceFauna(K.CHIRP, { x: c.x, y: c.y, z: c.z, f0: 3200, f1: 2600, mr: 2, mi: 1.4, n: this.r.int(6, 12), isi: 0.04, bd: 0.02, gain: 0.18, layer: LAYER.FAUNA, send: 0.4, prio: 1 }); }

  // ---------------------------------------------------------- birds and animals
  fauna(dt) {
    const r = this.r, s = this.season(), sun = this.sun, h = this.clockH;
    const act = Math.pow(2, this.ch('fauna', 'activity') * 1.3);
    const ms = this.meanSize(); const forest = clamp((ms - 0.45) / 0.6, 0, 1) * clamp(this.trees.length / 6, 0, 1);
    const night = this.light < 0.02, q = Math.sqrt(this.quiet());
    const sF = { spring: 1.6, summer: 1, autumn: 0.55, winter: 0.3 }[s];
    const dawn = Math.exp(-Math.pow((h - (sun.rise + 0.5)) / 1.3, 2)), dusk = Math.exp(-Math.pow((h - (sun.set - 0.2)) / 0.7, 2));
    const wet = this.rainT > 0 ? 0.3 : 1, calm = this.stormT > 0 ? 0.15 : 1;
    // songbirds need a forest: a dawn chorus, a smaller dusk chorus, a few songs by day
    if (forest > 0 && !night && r.chance(dt * forest * act * sF * (0.015 + 0.25 * dawn + 0.07 * dusk) * wet * calm * q)) this.singBird();
    if (forest > 0.3 && night && r.chance(dt * forest * act * 0.006 * (s === 'winter' || s === 'autumn' ? 1.5 : 1) * q)) this.owl();
    if (s === 'summer' && night && this.temp > 14 && r.chance(dt * act * 0.035 * q * wet)) this.cricket();
    if (this.snags.length && !night && r.chance(dt * act * 0.006 * this.snags.length * (s === 'spring' || s === 'winter' ? 1.6 : 0.6) * q)) this.drum(r.pick(this.snags));
    if ((this.month === 8 || this.month === 9) && (night || dusk > 0.3) && forest > 0.3 && r.chance(dt * act * 0.0018 * q)) this.roar();
    for (let i = this.snags.length - 1; i >= 0; i--) {
      const g = this.snags[i]; g.t += dt;
      if (r.chance(dt * 0.002)) this.addLitter(g.x + r.range(-1, 1), g.y + r.range(-1, 1), 0.15 * g.size);
      if (g.t > g.life) { this.addLitter(g.x, g.y, 0.8 * g.size); this.snags.splice(i, 1); }
    }
  }
  perch() {
    const L = this.listener; const ts = this.trees.filter(t => t.size > 0.6); if (!ts.length) return null;
    ts.sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y));
    const i = Math.round(clamp((this.ch('fauna', 'dist') + 1) / 2 * (ts.length - 1) + this.r.range(-1.5, 1.5), 0, ts.length - 1));
    const t = ts[i], a = this.r.range(0, 6.28), rr = this.r.range(0, 1.2);
    return { x: t.x + Math.sin(a) * rr, y: t.y + Math.cos(a) * rr, z: 1 + t.size * 3.6 + this.r.range(-0.5, 1) };
  }
  singBird() {
    const p = this.perch(); if (!p) return;
    const b = this.r.pick(this.seed.birds);
    const phrase = () => { const f0 = b.f0 * this.r.range(0.92, 1.08); this.voiceFauna(K.CHIRP, { x: p.x, y: p.y, z: p.z, f0, f1: f0 * b.ratio, mr: b.mr, mi: b.mi, n: this.r.int(b.n[0], b.n[1]), isi: b.isi * this.r.range(0.9, 1.1), bd: b.bd, gain: 0.3, layer: LAYER.FAUNA, send: 0.6, prio: 1 }); };
    phrase(); for (let k = 1; k < b.phrases; k++) this.later(k * this.r.range(1.2, 2.4), phrase);
  }
  owl() { const p = this.perch(); if (!p) return; const o = this.seed.owl; this.voiceFauna(K.CHIRP, { x: p.x, y: p.y, z: p.z, f0: o.f0, f1: o.f0 * 0.93, mr: 1, mi: 0.12, n: o.n, isi: o.isi, bd: 0.28, gain: 0.38, layer: LAYER.FAUNA, send: 0.8, prio: 1 }); if (this.r.chance(0.1)) this.log('A tawny owl calls from the canopy.', 'fauna'); }
  cricket() { const L = this.listener, a = this.r.range(0, 6.28), d = this.r.range(3, 12) * Math.pow(2, this.ch('fauna', 'dist') * 0.6); const f = this.r.range(4200, 5200); this.voiceFauna(K.CHIRP, { x: L.x + Math.sin(a) * d, y: L.y + Math.cos(a) * d, z: 0.05, f0: f, f1: f, mr: 1, mi: 0.25, n: this.r.int(3, 5), isi: 0.055, bd: 0.012, gain: 0.16, layer: LAYER.FAUNA, send: 0.35, prio: 1 }); }
  drum(g) { this.voiceFauna(K.CHIRP, { x: g.x, y: g.y, z: 1.5 + g.size * 2, f0: this.r.range(700, 1100), f1: 650, mr: 2.3, mi: 4, n: this.r.int(12, 22), isi: 0.05, bd: 0.009, gain: 0.22, layer: LAYER.FAUNA, send: 0.6, prio: 1 }); if (this.r.chance(0.2)) this.log('A woodpecker drums on the dead trunk. Standing dead wood feeds beetles, birds and decomposers.', 'fauna'); }
  roar() {
    const L = this.listener, a = this.r.range(0, 6.28), d = this.r.range(28, 38), f = this.r.range(95, 140);
    const id = this.voiceFauna(K.DRONE, { x: L.x + Math.sin(a) * d, y: L.y + Math.cos(a) * d, z: 1.2, f, r: [1, 2, 3, 4], a: [1, 0.7, 0.5, 0.3], breath: 0.8, bq: 1.5, det: 10, bright: 0.35, trate: 7, tdep: 0.3, glide: 1.5, dur: 2.4, att: 0.3, rel: 1.4, gain: 0.3, layer: LAYER.FAUNA, send: 0.8, prio: 1 });
    if (id) this.audio.set(id, { f: f * 0.68, glide: 1.8 });
    if (this.r.chance(0.25)) this.log('A red deer stag roars in the distance. It is the autumn rut.', 'fauna');
  }

  // ---------------------------------------------------------- seasonal sounds
  seasonal(dt) {
    const r = this.r, s = this.season();
    if (this.rainT > 0 && !this.snowing && s === 'summer') {
      this.thunderT -= dt;
      if (this.thunderT <= 0) { this.thunderT = r.range(40, 120); const L = this.listener, a = r.range(0, 6.28), d = r.range(32, 45); this.fx(K.NOISE, { x: L.x + Math.sin(a) * d, y: L.y + Math.cos(a) * d, z: 18, bf: 70, bq: 0.6, lp: 0.08, srate: 0.4, sdep: 0.6, gust: 0.95, crk: 6, gain: 0.4, att: 0.4, rel: 6, dur: 3, layer: LAYER.WEATHER, send: 0.9, prio: 2 }, 8); }
    }
    // frost cracks: in hard frost the outer wood contracts faster than the core and the trunk splits with a bang
    if (this.temp < -4 && this.light < 0.05) for (const t of this.trees) if (t.size > 1 && r.chance(dt / 2400)) {
      this.fx(K.MODAL, { x: t.x, y: t.y, z: 1.5, f: r.range(60, 110), r: PING_SETS.wood, d: [0.6, 0.3, 0.15, 0.08], a: [1, 0.7, 0.4, 0.3], hard: 1, gain: 0.45, layer: LAYER.TREES, send: 0.9, prio: 2 }, 8);
      this.log(`Tree ${t.id} cracked in the frost: the outer wood contracts faster than the core.`, 'weather');
    }
  }

  // ---------------------------------------------------------- saving and continuing
  serialize() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const strip = (o, drop) => { const c = {}; for (const k in o) if (!drop.includes(k)) c[k] = o[k]; return c; };
    return {
      v: 4, seed: this.seed, soil: { wet: Array.from(this.soil.base.wet, v => Math.round(v * 1000) / 1000), rich: Array.from(this.soil.base.rich, v => Math.round(v * 1000) / 1000), acid: Array.from(this.soil.base.acid, v => Math.round(v * 1000) / 1000), stone: Array.from(this.soil.base.stone, v => Math.round(v * 1000) / 1000) }, logs: this.logs, code: this.seed.code, t: this.t, moist: this.moist, snow: this.snow, rootMul: this.rootMul, rootTarget: this.rootTarget, tide: this.tide, keyT: this.keyT, somaT: this.somaT,
      windDir: this.windDir, windStr: this.windStr, rainT: this.rainT, rainCool: this.rainCool, afterRain: this.afterRain, dryT: this.dryT, stormT: this.stormT, stage: this.stage, stats: this.stats,
      ids: [this.nid, this.eid, this.tid, this.gid, this.tipid], timers: { graze: this.grazeT, sporeRain: this.sporeRainT, auto: this.auto },
      nodes: [...this.nodes.values()].map(n => [n.id, r2(n.x), r2(n.y), n.type, n.genet, n.deg, n.tree]),
      edges: [...this.edges.values()].map(e => [e.id, e.a, e.b, e.pts.flatMap(p => [r2(p[0]), r2(p[1])]), Math.round(e.D * 1000) / 1000, e.g, Math.round(e.age), Math.round(e.born)]),
      tips: this.tips.map(t => ({ ...t, pts: t.pts.map(p => [r2(p[0]), r2(p[1])]) })),
      trees: this.trees.map(t => ({ ...strip(t, ['deliv', 'voct', 'vf', 'photoAcc']), links: [...t.links.entries()] })),
      genets: [...this.genets.values()],
      patches: this.patches, litter: this.litter, seedbank: this.seedbank, snags: this.snags, deposits: this.deposits,
      fruits: this.fruits.map(f => ({ ...f, voice: null })),
    };
  }
  loadState(d) {
    for (const k of ['t', 'moist', 'snow', 'rootMul', 'rootTarget', 'tide', 'keyT', 'somaT', 'windDir', 'windStr', 'rainT', 'rainCool', 'afterRain', 'dryT', 'stormT', 'stage', 'stats']) if (d[k] !== undefined) this[k] = d[k];
    [this.nid, this.eid, this.tid, this.gid, this.tipid] = d.ids;
    if (d.timers) { this.grazeT = d.timers.graze; this.sporeRainT = d.timers.sporeRain; if (d.timers.auto) this.auto = d.timers.auto; }
    this.nodes = new Map(); for (const [id, x, y, type, genet, deg, tree] of d.nodes) this.nodes.set(id, { id, x, y, type, genet, deg, tree, edges: new Set(), u: 0, refr: 0, fl: 0 });
    this.edges = new Map();
    for (const [id, a, b, flat, D, g, age, born] of d.edges) {
      if (!this.nodes.has(a) || !this.nodes.has(b)) continue;
      const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
      let len = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(len); }
      this.edges.set(id, { id, a, b, pts, cum, len: Math.max(0.05, len), D, Q: 0, g, age, act: 0, born });
      this.nodes.get(a).edges.add(id); this.nodes.get(b).edges.add(id);
    }
    this.tips = (d.tips || []).filter(t => this.nodes.has(t.from));
    this.trees = d.trees.map(t => ({ ...t, links: new Map(t.links), deliv: new Map() }));
    this.genets = new Map(d.genets.map(g => [g.id, g]));
    this.patches = d.patches; this.litter = d.litter; this.seedbank = d.seedbank; this.snags = d.snags || []; this.deposits = d.deposits || [];
    this.fruits = (d.fruits || []).filter(f => this.nodes.has(f.node));
    this.signals = []; this.carbon = []; this.water = []; this.spores = []; this.critters = []; this.calls = [];
    this.ev = { rain: Math.max(0, this.rainT), deer: 0, storm: Math.max(0, this.stormT), dry: Math.max(0, this.dryT), cache: 0, squirrel: 0 };
    if (d.soil && d.soil.wet && d.soil.wet.length === SOIL_N * SOIL_N) for (const k of ['wet', 'rich', 'acid', 'stone']) { this.soil.base[k] = Float32Array.from(d.soil[k]); this.soil[k] = Float32Array.from(d.soil[k]); }
    this.logs = d.logs || [];
    for (const t of this.trees) { if (!TREE_SPECIES[t.sp]) { t.sp = this.bestTree(t.x, t.y); } if (t.leaf === undefined) { t.leaf = 1; t.sen = 0; } t.fit = this.treeFit(t.sp, t.x, t.y); }
    this.hashDirty = true; this.dropVoices(); this.updateSky(0); this.updateLight(); this.updateCover(0);
  }

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
    if (p.type === 'tree') { const n = this.nodes.get(p.obj.node); if (n && n.edges.size) { n.refr = 0; this.fire(n, false, 0, 0); } p.obj.flash = 1.2; this.log(`You touched tree ${p.obj.id}. ${n && n.edges.size ? 'A signal runs out into its partners.' : 'It has no fungal partners yet.'}`, 'touch'); return true; }
    if (p.type === 'node') { p.obj.refr = 0; this.fire(p.obj, false, 0, 0); return true; }
    if (p.type === 'edge') { const n = this.nodes.get(p.obj.a); if (n) { n.refr = 0; this.fire(n, false, 0, 0); } return true; }
    return false;
  }
  plantAt(x, y, key) {
    if (Math.hypot(x, y) > PLOT_R - 1) return 'edge';
    if (this.treeAt(x, y, 1.8)) return 'crowded';
    if (this.trees.length >= MAX_TREES) return 'full';
    const near = this.treeAt(x, y, 12);
    const sp = TREE_SPECIES[key] ? key : this.bestTree(x, y, TREE_KEYS);
    const t = this.addTree(x, y, { size: 0.1, kin: near ? near.kin : this.r.int(0, 2), deg: near ? clamp(near.deg - (TREE_SPECIES[near.sp] ? TREE_SPECIES[near.sp].regDeg : 0) + this.r.pick([-1, 1, 2]), 0, 20) : this.r.int(0, this.seed.tun.ratios.length * 2), sugar: 0.9, sp });
    const fit = this.treeFit(sp, x, y);
    this.log(`You planted a ${TREE_SPECIES[sp].name.toLowerCase()} (tree ${t.id}). ${fit > 0.6 ? 'This place suits it well.' : fit > 0.3 ? 'It can manage here.' : 'This place does not suit it; it will struggle.'}`, 'tree'); return true;
  }
  inoculate(x, y, genus) {
    if (Math.hypot(x, y) > PLOT_R - 0.5) return 'edge';
    if (this.genets.size >= MAX_FUNGI) return 'full';
    let def = FUNGUS[genus];
    if (!def) {
      // the place decides: the genus that suits this soil, with a host nearby
      const cands = FUNGI.map(f => FUNGUS[f[0]]).filter(f => f.guild === 'sapro' ? this.litter.some(l => Math.hypot(l.x - x, l.y - y) < 4) : this.trees.some(t => Math.hypot(t.x - x, t.y - y) < 8 && this.hostOk(f, t)));
      const pool = cands.length ? cands : FUNGI.map(f => FUNGUS[f[0]]).filter(f => f.guild === 'ecm' && f.hosts === 'any');
      let bw = -1; for (const f of pool) { const w = this.fungusFit(f, x, y) * this.r.range(0.6, 1.4) * (0.6 + fruitSeason(f, this.month) * 0.4); if (w > bw) { bw = w; def = f; } }
    }
    const known = this.seed.species.find(sp => sp.genus === def.genus);
    const base = known || makeSpecies(this.r, this.seed.tun, this.r.range(0, 360), def);
    const sp = mutateSpecies(base, this.r, 0.8 * this.p.mutation + 0.3);
    const g = this.addGenet(sp, null, x, y); g.energy = 0.8; g.fit = this.fungusFit(sp, x, y);
    const n = this.addNode(x, y, 'j', g.id); n.deg = g.sp.degOff + this.r.int(0, 4);
    for (let j = 0; j < 3; j++) this.addTip(g, n.id, x, y, this.r.range(0, Math.PI * 2), 0.1);
    this.ping(x, y, 0, n, g.sp, 0.9, 10);
    const host = sp.hosts && sp.hosts !== 'any' ? ` It partners only ${sp.hosts.map(h => TREE_SPECIES[h].short.toLowerCase()).join(' and ')}.` : '';
    this.log(`You sowed ${sp.genus} (${sp.guild === 'sapro' ? 'a decomposer' : EXPLORATION[sp.expl].label + ' type'}): ${g.name}.${host} ${g.fit > 0.6 ? 'The soil here suits it.' : g.fit < 0.3 ? 'The soil here does not suit it.' : ''}`, 'spore'); return true;
  }
  cut(x1, y1, x2, y2) {
    let n = 0;
    for (const e of [...this.edges.values()]) {
      for (let i = 1; i < e.pts.length; i++) { if (segX(x1, y1, x2, y2, e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1])) { const m = e.pts[i]; this.removeEdge(e, true); n++; this.fx(K.MODAL, { x: m[0], y: m[1], z: -0.2, f: this.freq(this.r.int(4, 10), 2), r: PING_SETS.wood, d: [0.08, 0.05, 0.03, 0.02], a: [1, 0.6, 0.4, 0.3], hard: 1, gain: 0.25, layer: LAYER.GROWTH, send: 0.4 }); break; } }
    }
    for (const tip of [...this.tips]) { const a = tip.pts[tip.pts.length - 2] || tip.pts[0]; if (segX(x1, y1, x2, y2, a[0], a[1], tip.x, tip.y)) { this.tips.splice(this.tips.indexOf(tip), 1); n++; } }
    if (n) this.log(`You cut ${n} hyph${n > 1 ? 'ae' : 'a'}. The network will reroute through its loops.`, 'cut');
    return n;
  }
  fell(t) { if (!t || t.dying > 0) return; t.dying = 12; this.log(`Tree ${t.id} is dying. Its sugar drains into the network toward its neighbours.`, 'death'); }
}
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

if (typeof module !== 'undefined') module.exports = { World, makeSeed, makeMaterial, randomCode, flowerCenters, ratioOf, mutateSpecies, makeRng, hashStr, K, LAYER, PLOT_R, PETAL, FAMILY_NAMES, EXPLORATION, STAGES, MONTHS, CHAR_DEFAULT, SEASON_OF, FG_MAX, TREE_SPECIES, TREE_KEYS, FUNGI, FUNGUS, COVER, SOIL_N, SOIL_CELL, MAX_TREES, MAX_FUNGI, fruitSeason };
