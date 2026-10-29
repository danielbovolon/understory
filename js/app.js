// UNDERSTORY — interface, 3D view, audio bridge, archive
'use strict';
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette
let PAL = {};
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  if (typeof guide !== 'undefined') { guide.entries.clear(); guide.sig = ''; guide.mode = ''; setTimeout(() => renderGuide(true), 0); }
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
    this.out = this.ctx.createGain(); this.node.connect(this.out);
    // on phones, play through a media element: the system then treats the forest like music and keeps it playing with the screen off
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
    if (matchMedia('(pointer: coarse)').matches && this.ctx.createMediaStreamDestination) {
      try {
        this.mdest = this.ctx.createMediaStreamDestination(); this.out.connect(this.mdest);
        this.el = document.createElement('audio'); this.el.setAttribute('playsinline', ''); this.el.srcObject = this.mdest.stream; document.body.appendChild(this.el);
        await this.el.play(); this.viaElement = true;
      } catch (e) { this.viaElement = false; if (this.mdest) { try { this.out.disconnect(this.mdest); } catch (e2) { } } }
    }
    if (!this.viaElement) this.out.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => this.onMsg(e.data);
    this.post({ t: 'seedrng', s: (Math.random() * 2 ** 31) | 0 });
    this.started = true;
  },
  onMsg(m) {
    if (m.freed) for (const id of m.freed) this.live.delete(id);
    if (m.t === 'm') { Object.assign(this.meter, m); if (document.hidden) hiddenTick(); }
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
const P = { time: 1, growth: 1, chatter: 1, bloom: 1, mutation: 1, moisture: 0.5, wind: 0.4, warmth: 0, nitrogen: 0, seeds: 1, spores: 1, grazing: 1, change: 0.5, depth: 1, spin: 0, wet: 0.45, room: 0.5, master: 0.8, layers: [1, 1, 1, 1, 0.8, 0.9], char: CHAR_DEFAULT() };
const P_DEFAULT = JSON.parse(JSON.stringify(P));
const state = { plantItem: 'best', sowItem: 'best', pouchV: -1, plantSp: 'auto', sowGenus: 'auto', shapeKind: 'wet', brush: 2.6, walkMode: null, gait: 'slow', gaitT: 0, walkH: 0, walkV: 0, stepPh: 0, foot: 1, height: 'ground', ride: false, rideObj: null, rideWait: 0, forestId: null, forestName: '', kept: false, season: 'now', running: false, everStarted: false, seed: null, mode: 0, follow: true, drift: false, tool: 'listen', matB: false, matBName: '', pregrow: false, walk: null, driftT: 0, recording: false };
let world = null;
const listener = { x: 0, y: 0, z: 1.6, yaw: 0 };
const HEIGHTS = { ground: 1.6, under: -0.7, canopy: 11 };

function sendGlobals() {
  if (!audio.node || !state.seed) return;
  const rv = state.seed.rev;
  const ab = world ? world.absorb : 0, tide = world ? world.tide : 0.5;
  audio.post({ t: 'g', mode: state.mode, depth: P.depth, wet: P.wet * (0.85 + 0.3 * tide), master: P.master, layers: P.layers, under: state.height === 'under' ? 1 : 0, absorb: ab, carry: world ? world.carry : 0, rev: { size: rv.size * (0.55 + P.room * 0.9), rt: rv.rt * (0.35 + P.room * 1.3) * (1 - 0.45 * ab), damp: Math.min(1, rv.damp + 0.3 * ab), pre: rv.pre } });
}
function sendMaterials() {
  if (!audio.ctx || !audio.node || !state.seed) return;
  const m = makeMaterial(state.seed, audio.ctx.sampleRate);
  audio.post({ t: 'mat', slot: 0, data: m }, [m.buffer]);
  if (!state.matB) { const m2 = makeMaterial({ ...state.seed, matParams: { ...state.seed.matParams, seed: state.seed.matParams.seed ^ 0x5bd1e995, mix: 1 - state.seed.matParams.mix } }, audio.ctx.sampleRate); audio.post({ t: 'mat', slot: 1, data: m2 }, [m2.buffer]); }
}

function headerFor(seed) {
  $('seedCode').textContent = seed.code;
  $('seedName').textContent = state.forestName || seed.name;
  const ecm = seed.species.filter(s => s.guild === 'ecm').map(s => s.genus), sap = seed.species.filter(s => s.guild === 'sapro').map(s => s.genus);
  const snd = soundOf(seed);
  $('seedMeta').textContent = `${WORLDS[snd.worlds[0]].name} with ${WORLDS[snd.worlds[1]].name} · ${seed.tun.name} on ${seed.root.toFixed(1)} Hz · ${FAMILY_NAMES[seed.matParams.fams[0]]} + ${FAMILY_NAMES[seed.matParams.fams[1]]} · spores of ${ecm.join(', ')} and ${sap.join(', ')} in the air · room ${seed.rev.rt.toFixed(1)} s`;
  try { history.replaceState(null, '', '#' + seed.code); } catch (e) { }
}
async function swapOut() { if (audio.node) { audio.post({ t: 'fade', to: 0, time: 0.5 }); await new Promise(r => setTimeout(r, 560)); audio.kill(); } }
function seasonMonth() { return state.season === 'now' ? undefined : SEASON_MONTH[state.season]; }
async function loadSeed(code) {
  await saveForest();
  const seed = makeSeed(code);
  await swapOut();
  state.seed = seed; state.forestId = 'f' + Date.now(); state.forestName = seed.name; state.kept = false;
  // every forest starts as bare soil at the real time of day
  world = new World(seed, audio, { log: logLine, params: P, char: P.char, now: new Date(), month: seasonMonth() });
  world.matB = state.matB;
  listener.x = 0; listener.y = 0; world.listener = listener; state.walk = null; state.rideObj = null;
  $('log').innerHTML = ''; lastLog = {}; guide.sel = null; renderGuide(true);
  headerFor(seed);
  if (audio.node) { sendGlobals(); sendMaterials(); if (state.running) audio.post({ t: 'fade', to: 1, time: 2.5 }); }
  buildToolOpts();
  showHint('Bare soil', 'Nothing has grown here yet. Seeds lie on the flower of life, and spores drift in on the wind, under the real sky of this hour.', 'Grow');
  logLine(`Seed ${code}. Bare soil, ${MONTHS[world.month]}, ${fmtClock(world.clockH)}. ${seed.nTrees} seeds lie on the flower of life. Nothing has grown yet.`, 'stage');
  renderForests();
}
async function continueForest(rec) {
  if (rec.id !== state.forestId) await saveForest();
  const seed = Object.assign(makeSeed(rec.code), (rec.data && rec.data.seed) || {});
  await swapOut();
  state.seed = seed; state.forestId = rec.id; state.forestName = rec.name || seed.name; state.kept = true;
  // the forest's temperament and the listener's nudges come back with it
  if (rec.P) { for (const k in rec.P) if (k !== 'char' && k in P) P[k] = Array.isArray(rec.P[k]) ? rec.P[k].slice() : rec.P[k]; while (P.layers.length < 6) P.layers.push(0.9); }
  if (rec.char) for (const l in P.char) Object.assign(P.char[l], rec.char[l] || {});
  state.season = rec.season || 'now'; $('season').value = state.season;
  world = new World(seed, audio, { log: logLine, params: P, char: P.char, now: new Date(), month: seasonMonth() });
  try { world.loadState(rec.data); } catch (e) { setStatus('This forest could not be restored. A new one begins.'); return loadSeed(randomCode()); }
  world.matB = state.matB;
  Object.assign(listener, rec.listener || { x: 0, y: 0, yaw: 0 }); listener.z = HEIGHTS.ground; state.height = 'ground'; world.listener = listener;
  state.walk = null; state.rideObj = null;
  $('log').innerHTML = ''; lastLog = {};
  headerFor(seed); refreshSliders(); timeNote(); updateOptionButtons(); buildToolOpts();
  if (audio.node) { sendGlobals(); sendMaterials(); if (state.running) audio.post({ t: 'fade', to: 1, time: 2.5 }); }
  // the forest lived on while you were away
  const awayS = rec.visited ? (Date.now() - rec.visited) / 1000 : 0;
  const story = await liveThrough(awayS, true);
  showHint(`Welcome back to ${state.forestName}`, story || `${STAGES[world.stage][0]}, forest age ${fmtAge(world.t)}. ${MONTHS[world.month]}, ${fmtClock(world.clockH)}.`, 'Continue');
  if (story) logLine(story, 'stage'); else logLine(`${state.forestName} continues: ${STAGES[world.stage][0].toLowerCase()}, ${world.trees.length} trees, ${world.genets.size} fungi. ${MONTHS[world.month]}, ${fmtClock(world.clockH)}.`, 'stage');
  renderForests(); renderGuide(true);
  if (story) saveForest(true);
}
// Life while you were away: growth, ageing and death, seed and spore rain, new
// partnerships and the drift of voices carry on at a coarser step. Returns a short story.
let catching = false;
async function liveThrough(awayS, withHint) {
  if (!world || awayS < 45 || catching) return null;
  const span = Math.min(awayS * P.time, CATCHUP_MAX);
  catching = true;
  const pouch0 = world.pouch.reduce((a, p) => a + p.n, 0);
  const trees0 = new Map(world.trees.map(t => [t.id, t.sp])), gen0 = new Map([...world.genets.values()].map(g => [g.id, g.sp.genus])), stage0 = world.stage, arr0 = new Set(Object.keys(world.arrived)), forms0 = world.forms.length;
  const notes = [], realLog = world.log; world.log = (t, c) => { if (/storm threw|beetles killed/i.test(t) && notes.length < 2) notes.push(t.replace(/\. Its root plate.*$/, '.')); };
  if (withHint) showHint('The forest lived on', `You were away ${fmtDur(awayS)}. Catching up…`, '', 0);
  try {
    let t0 = performance.now();
    for (const p of world.catchUp(span)) if (performance.now() - t0 > 35) { if (withHint) setHintProgress(p); await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); }
  } catch (e) { console.error(e); } finally { world.log = realLog; catching = false; }
  const born = {}, gone = {}; let nb = 0, nd = 0;
  for (const t of world.trees) if (!trees0.has(t.id)) { born[t.sp] = (born[t.sp] || 0) + 1; nb++; }
  for (const [id, sp] of trees0) if (!world.trees.some(t => t.id === id)) { gone[sp] = (gone[sp] || 0) + 1; nd++; }
  const newG = {}; let ng = 0, lg = 0; for (const g of world.genets.values()) if (!gen0.has(g.id)) { newG[g.sp.genus] = (newG[g.sp.genus] || 0) + 1; ng++; }
  for (const id of gen0.keys()) if (!world.genets.has(id)) lg++;
  const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${n} ${(TREE_SPECIES[k] ? TREE_SPECIES[k].short : k).toLowerCase()}`).join(', ');
  const parts = [`You were away ${fmtDur(awayS)}${P.time !== 1 ? ` (${fmtDur(span)} of forest life at ${P.time < 1 ? P.time.toFixed(2) : P.time.toFixed(1)}×)` : ''}${awayS * P.time > CATCHUP_MAX ? ', and the forest lived through the last 30 days of it' : ''}.`];
  parts.push(nb || nd ? `${nb ? `${nb} tree${nb > 1 ? 's' : ''} came up (${list(born)})` : 'No new trees came up'}${nd ? `, ${nd} died (${list(gone)})` : ''}.` : 'The trees held.');
  if (ng || lg) parts.push(`${ng ? `${ng} fungal individual${ng > 1 ? 's' : ''} arrived (${Object.keys(newG).slice(0, 4).join(', ')})` : 'No new fungi arrived'}${lg ? `, ${lg} died out` : ''}.`);
  const newArr = Object.keys(world.arrived).filter(k => !arr0.has(k)).map(k => TREE_SPECIES[k] ? TREE_SPECIES[k].name.toLowerCase() : k);
  const few = (arr, n) => arr.length <= n ? arr.join(', ') : `${arr.slice(0, n).join(', ')} and ${arr.length - n} more`;
  if (newArr.length) parts.push(`Never seen here before: ${few(newArr, 5)}.`);
  const newForms = world.forms.slice(forms0).map(f => f.name); if (newForms.length) parts.push(newForms.length === 1 ? `A new local form: ${newForms[0]}.` : `${newForms.length} new local forms and varieties, among them ${few(newForms, 3)}.`);
  for (const n of notes) parts.push(n);
  const pouch1 = world.pouch.reduce((a, p) => a + p.n, 0); if (pouch0 && pouch1 < pouch0) parts.push(pouch1 ? 'Some of what was in your pouch has lost its viability.' : 'The seeds and spores in your pouch have lost their viability; gather fresh ones.');
  if (world.stage !== stage0) parts.push(`It has become: ${STAGES[world.stage][0].toLowerCase()}.`);
  parts.push(`Now ${world.trees.length} trees and ${world.genets.size} fungi, ${MONTHS[world.month]}, ${fmtClock(world.clockH)}.`);
  return parts.join(' ');
}
function fmtDur(s) { const m = s / 60, h = m / 60, d = h / 24; if (m < 90) return `${Math.max(1, Math.round(m))} minute${Math.round(m) === 1 ? '' : 's'}`; if (h < 48) return `${Math.round(h)} hours`; return `${Math.round(d)} days`; }
function showHint(title, text, btn, progress) {
  if (state.running && progress === undefined && btn) { hideHint(); logLine(text, 'stage'); return; }
  $('hintTitle').textContent = title; $('hintText').textContent = text;
  $('hintGrow').textContent = btn || ''; $('hintGrow').hidden = !btn;
  let bar = $('hint').querySelector('.bar'); if (progress !== undefined) { if (!bar) { bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>'; $('hintText').after(bar); } bar.style.setProperty('--p', progress); } else if (bar) bar.remove();
  $('hint').hidden = false; $('feed').classList.add('hinting');
}
function setHintProgress(p) { const bar = $('hint').querySelector('.bar'); if (bar) bar.style.setProperty('--p', p); }
function hideHint() { $('hint').hidden = true; $('feed').classList.remove('hinting'); }

async function setRunning(on) {
  if (on) {
    try { await audio.start(); } catch (e) { setStatus('Audio could not start in this browser: ' + e.message); return; }
    if (!state.everStarted) { sendGlobals(); sendMaterials(); state.everStarted = true; }
    await audio.ensureCtx();
    audio.post({ t: 'fade', to: 1, time: 2.5 });
    if (audio.el && audio.el.paused) { try { await audio.el.play(); } catch (e) { } }
    state.running = true; hideHint();
  } else {
    state.running = false; audio.post({ t: 'fade', to: 0, time: 1.2 });
  }
  updateMediaSession();
  $('grow').setAttribute('aria-pressed', String(state.running));
  $('grow').textContent = state.running ? 'Pause' : 'Grow';
}

// ---------------------------------------------------------------- log + hud
const LOGC = { arrival: 'spore', gather: 'hypha', drift: 'bone', fauna: 'geo', stage: 'bone', water: 'hypha', bond: 'hypha', fuse: 'hypha', touch: 'hypha', carbon: 'spore', fruit: 'spore', spore: 'spore', alarm: 'alarm', clash: 'alarm', cut: 'alarm', weather: 'dim', death: 'dim', tree: 'geo' };
let lastLog = {};
function logLine(text, cat) {
  const now = performance.now();
  const gap = (cat === 'fuse' || cat === 'clash') ? 15000 : 2500;
  if (lastLog[cat] && now - lastLog[cat] < gap && cat !== 'tree' && cat !== 'touch' && cat !== 'stage') return;
  lastLog[cat] = now;
  const box = $('log'); const p = document.createElement('p');
  p.textContent = text; p.style.setProperty('--c', `var(--${LOGC[cat] || 'dim'})`);
  box.appendChild(p);
  if (cat === 'stage') p.className = "logstage";
  while (box.children.length > 5) box.removeChild(box.firstChild);
  [...box.children].forEach((c, i, a) => { c.style.opacity = String(0.35 + 0.65 * (i + 1) / a.length); });
}
function setStatus(t) { $('status').textContent = t || ''; }
function fmtClock(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function fmtAge(t) { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`; }
function skyWord(w) { const h = w.clockH, s = w.sun; if (h < s.rise - 0.6 || h > s.set + 0.6) return 'night'; if (h < s.rise + 0.7) return 'dawn'; if (h > s.set - 0.7) return 'dusk'; return 'day'; }
function updateHud() {
  if (!world) return;
  const w = world;
  const wdeg = ((w.windDir * 180 / Math.PI) % 360 + 360) % 360; const wn = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(wdeg / 45) % 8];
  const st = STAGES[w.stage];
  const hudHtml = `<span class="clock">${fmtClock(w.clockH)}</span>
  <span>${MONTHS[w.month]}, ${w.season()} · ${skyWord(w)} · sun ${fmtClock(w.sun.rise)}–${fmtClock(w.sun.set)}</span>
  <span><b>${w.temp.toFixed(0)} °C</b> · ${w.rainT > 0 ? '<b>raining</b> · ' : ''}soil moisture <b>${Math.round(Math.min(1, w.moist) * 100)}%</b></span>
  <span>wind <b>${(w.windStr * 3).toFixed(1)} m/s</b> from ${wn}${w.stormT > 0 ? ' · <b>storm</b>' : ''}${w.dryT > 0 ? ' · <b>dry spell</b>' : ''}${w.snow > 0.03 ? ` · snow cover <b>${Math.round(w.snow * 100)}%</b>` : ''}</span>
  <span class="hudstage">${st[0]}</span>
  <span>forest age <b>${fmtAge(w.t)}</b></span>
  <span><b>${w.trees.length}</b>/${MAX_TREES} trees · <b>${w.genets.size}</b>/${MAX_FUNGI} fungi · <b>${w.edges.size}</b> hyphae</span>
  <span><b>${w.signals.length}</b> signals · <b>${w.fruits.length}</b> mushrooms · <b>${w.spores.length}</b> spores</span>
  <span>pouch <b>${w.pouch.filter(p => p.kind === 'seed').reduce((a, p) => a + p.n, 0)}</b> seeds · <b>${w.pouch.filter(p => p.kind === 'spores').reduce((a, p) => a + p.n, 0)}</b> spore packets${Object.keys(w.arrived).length ? ` · <b>${Object.keys(w.arrived).length}</b> newcomers` : ''}</span>
  <span>${state.height === 'under' ? 'listening <b>under the soil</b> · ' : state.height === 'canopy' ? 'listening <b>in the canopy</b> · ' : ''}voices <b>${audio.started ? audio.meter.nv : 0}</b>/64${w.carry > 0.05 ? ' · <b>fog</b>' : ''}</span>`;
  if (hudHtml !== updateHud.last) { $('hud').innerHTML = hudHtml; updateHud.last = hudHtml; }
  updateHappenings();
  const here = w.placeInfo(listener.x, listener.y);
  let u = `<b>Underfoot</b>: ${here.text} · ${here.suits}${state.walkMode ? ` · <b>${state.gait === 'run' ? 'running' : state.gait === 'walk' ? 'walking' : 'ambling'}</b>` : ''}`;
  if (scene.hover && (state.tool === 'plant' || state.tool === 'sow' || state.tool === 'shape')) { const hv = w.placeInfo(scene.hover[0], scene.hover[1]); u += `<br><b>Here</b>: ${hv.text} · ${hv.suits}`; }
  if (u !== updateHud.lastU) { $('underfoot').innerHTML = u; updateHud.lastU = u; }
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
function gcol(g, a = 1, boost = 0) { const [h, s, l] = seasonTint(g ? g.sp.hue : 150, 70, PAL.dark ? 64 + boost * 12 : 32 + boost * 6); return hsl(h, Math.min(95, s), Math.min(92, l), a); }
function kinCol(t, a = 1) { const c = treeHSL(t); return PAL.dark ? hsl(c[0], c[1], c[2] + 10, a) : hsl(c[0], Math.min(80, c[1] + 8), Math.max(20, c[2] - 10), a); }
// tree colour from species, season and the state of its leaves
function treeHSL(t) {
  const T = TREE_SPECIES[t.sp] || TREE_SPECIES.birch, c = T.col, mix = (a, b, k) => [a[0] + ((b[0] - a[0] + 540) % 360 - 180) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  if (T.leaf === 'ever') { const se = world.season(); return se === 'winter' ? c[3] : se === 'spring' ? mix(c[0], c[1], 0.4) : se === 'autumn' ? c[2] : c[1]; }
  if (t.leaf < 0.12) return c[3];
  if (t.sen > 0.03) return mix(c[1], c[2], Math.min(1, t.sen * 1.3));
  return mix(c[0], c[1], clamp01((world.doy - 125) / 45));
}
function seasonTint(h, s, l) { const se = world ? world.season() : 'summer'; if (se === 'spring') return [h, s + 6, l + 4]; if (se === 'autumn') return [h + ((35 - h + 540) % 360 - 180) * 0.15, s + 4, l]; if (se === 'winter') return [h - 8, s * 0.55, l + 8]; return [h, s, l]; }

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
  // snow cover
  if (w.snow > 0.02) { groundCircle(g, 0, 0, PLOT_R + 0.6, 0, 96); g.fillStyle = PAL.dark ? `rgba(225,232,240,${w.snow * 0.32})` : `rgba(255,255,255,${w.snow * 0.6})`; g.fill(); }
  // listening from under the soil: the earth closes around you
  const under = clamp01((1.6 - listener.z) / 2.3);
  if (under > 0.02) { g.fillStyle = PAL.dark ? `rgba(48,34,20,${under * 0.45})` : `rgba(120,90,55,${under * 0.25})`; g.fillRect(0, 0, scene.w, scene.h); }
  drawGround(g, w, now);
  // litter
  for (const l of w.litter) { groundCircle(g, l.x, l.y, 0.6 + l.a * 0.7, 0, 24); g.fillStyle = PAL.dark ? `rgba(120,90,50,${0.08 + l.a * 0.06})` : `rgba(110,80,40,${0.08 + l.a * 0.06})`; g.fill(); }
  // nutrient patches in the soil
  for (const p of w.patches) {
    if (p.a < 0.03) continue; const q = cam.proj(p.x, p.y, 0); if (!q) continue;
    const r = Math.max(1, 0.05 * q[2]); g.fillStyle = p.org ? (PAL.dark ? 'rgba(170,130,80,' : 'rgba(120,80,30,') + (0.25 + 0.2 * Math.min(1, p.a)) + ')' : (PAL.dark ? 'rgba(190,195,205,' : 'rgba(90,95,110,') + (0.25 + 0.2 * Math.min(1, p.a)) + ')';
    for (let k = 0; k < 5; k++) { const a = k * 2.4 + p.x, d = 0.25 + (k % 3) * 0.22; const qq = cam.proj(p.x + Math.sin(a) * d, p.y + Math.cos(a) * d, 0); if (qq) { g.beginPath(); g.arc(qq[0], qq[1], r, 0, TAU); g.fill(); } }
    if (p.found) { groundCircle(g, p.x, p.y, 0.9, 0, 20); g.strokeStyle = PAL.hypha; g.globalAlpha = 0.25; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1; }
  }
  // seeds still waiting in the soil
  for (const b of w.seedbank) {
    if (b.done) continue; const q = cam.proj(b.x, b.y, 0); if (!q) continue;
    const near = clamp01(1 - (b.t - w.t) / 40); const pulse = 0.5 + 0.5 * Math.sin(now / 600 + b.x);
    g.fillStyle = PAL.spore; g.globalAlpha = 0.25 + near * 0.5 * pulse; g.beginPath(); g.arc(q[0], q[1], Math.max(1.5, 0.08 * q[2]), 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  // hyphae
  g.globalCompositeOperation = add; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const e of w.edges.values()) {
    const gn = w.genets.get(e.g); const mid = e.pts[(e.pts.length / 2) | 0]; const pm = cam.proj(mid[0], mid[1], -0.05); if (!pm) continue;
    const young = Math.min(1, (w.t - e.born) / 3);
    g.lineWidth = Math.max(0.5, (0.025 + 0.05 * Math.min(3, e.D)) * pm[2]);
    g.strokeStyle = gcol(gn, Math.min(1, (0.22 + 0.25 * Math.min(1, e.D) + 0.5 * e.act) * young * (PAL.dark ? 1 : 1.7)), e.act);
    polyline(g, e.pts, -0.05); g.stroke();
    if (gn && gn.glow > 0.05 && PAL.dark) { g.strokeStyle = `hsla(105,95%,62%,${0.35 * gn.glow})`; g.lineWidth += 3; g.stroke(); }
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
  for (const c of w.water) { const p = cam.proj(c.x, c.y, -0.05); if (!p) continue; glowDot(g, p[0], p[1], Math.max(2, 0.15 * p[2]), PAL.dark ? '#8fc4ff' : '#2a64b8', true); }
  g.globalCompositeOperation = 'source-over';
  drawColonies(g, w, now);
  // flashes
  for (const f of w.flashes) { groundCircle(g, f.x, f.y, 0.5 + (2 - f.t) * 1.5, 0, 32); g.strokeStyle = f.c === 'alarm' ? PAL.alarm : PAL.hypha; g.globalAlpha = Math.min(1, f.t) * 0.7; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1; }
  // sprites sorted by depth
  const spr = [];
  for (const t of w.trees) { const p = cam.proj(t.x, t.y, 0); if (p) spr.push([p[3], 'tree', t]); }
  for (const f of w.fruits) { const p = cam.proj(f.x, f.y, 0); if (p) spr.push([p[3], 'fruit', f]); }
  for (const sn of w.snags) { const p = cam.proj(sn.x, sn.y, 0); if (p) spr.push([p[3], 'snag', sn]); }
  for (const c of w.critters) { const p = cam.proj(c.x, c.y, c.z); if (p) spr.push([p[3], 'critter', c]); }
  for (const s of w.spores) { const p = cam.proj(s.x, s.y, s.z); if (p) spr.push([p[3], 'spore', s]); }
  { const p = cam.proj(listener.x, listener.y, 0); if (p) spr.push([p[3], 'me', listener]); }
  spr.sort((a, b) => b[0] - a[0]);
  g.font = '500 10px "Martian Mono", ui-monospace, monospace'; g.textAlign = 'center';
  for (const [, k, o] of spr) {
    if (k === 'tree') drawTree(g, o, w);
    else if (k === 'fruit') drawFruit(g, o, w);
    else if (k === 'snag') drawSnag(g, o);
    else if (k === 'critter') drawCritter(g, o, now);
    else if (k === 'spore') { const p = cam.proj(o.x, o.y, o.z), q = cam.proj(o.x, o.y, 0); if (!p) continue; if (q) { g.strokeStyle = PAL.spore; g.globalAlpha = 0.18; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); g.globalAlpha = 1; } glowDot(g, p[0], p[1], Math.max(1.3, 0.07 * p[2]), PAL.spore, true); }
    else drawListener(g);
  }
  // where animals call
  for (const c of w.calls) { const p = cam.proj(c.x, c.y, c.z); if (!p) continue; const a = Math.min(1, c.t); const r = Math.max(4, 0.35 * p[2]) * (1.6 - c.t * 0.4); g.strokeStyle = PAL.bone; g.globalAlpha = a * 0.5; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], r, -2.4, -0.7); g.stroke(); g.beginPath(); g.arc(p[0], p[1], r * 1.6, -2.3, -0.8); g.stroke(); g.globalAlpha = 1; }
  drawNatureMotes(g, w, now);
  seasonParticles(g, w, now);
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
  if (w.rainT > 0 && w.snowing) {
    g.fillStyle = PAL.dark ? 'rgba(235,240,250,0.7)' : 'rgba(150,160,180,0.7)';
    for (let i = 0; i < 110; i++) { const x = (i * 97.3 + now * 0.012 * (1 + (i % 5) * 0.2) + Math.sin(now / 900 + i) * 12) % scene.w, y = (i * 53.7 + now * 0.03 * (1 + (i % 3) * 0.3)) % scene.h; g.beginPath(); g.arc(x, y, 1 + (i % 3) * 0.5, 0, TAU); g.fill(); }
  } else if (w.rainT > 0) {
    g.strokeStyle = PAL.dark ? 'rgba(180,200,230,0.18)' : 'rgba(40,60,90,0.18)';
    g.beginPath(); for (let i = 0; i < 90; i++) { const x = Math.random() * scene.w, y = Math.random() * scene.h; g.moveTo(x, y); g.lineTo(x - 2, y + 9); } g.stroke();
  }
  // night
  const night = 1 - w.light; if (night > 0.02) { g.fillStyle = PAL.night; g.globalAlpha = night * (PAL.dark ? 0.32 : 0.14); g.fillRect(0, 0, scene.w, scene.h); g.globalAlpha = 1; }
  // fog: a pale veil that thickens with distance
  const fogA = w.carry; if (fogA > 0.02) { const gr = g.createLinearGradient(0, 0, 0, scene.h); const fc = PAL.dark ? '200,210,215' : '245,247,248'; gr.addColorStop(0, `rgba(${fc},${0.42 * fogA})`); gr.addColorStop(0.55, `rgba(${fc},${0.18 * fogA})`); gr.addColorStop(1, `rgba(${fc},${0.08 * fogA})`); g.fillStyle = gr; g.fillRect(0, 0, scene.w, scene.h); }
  drawGuideMarks(g, w, now);
  // cut line
  if (scene.cutLine) { const [a, b] = scene.cutLine; g.strokeStyle = PAL.alarm; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); }
  // compass
  drawCompass(g);
}
// small things the forest does on its own: drops from the crowns, falling seed and snow, bats, bees, meltwater
function drawNatureMotes(g, w, now) {
  if (w.creekAt && w.v && w.v.creek) {
    const [cx, cy] = w.creekAt, wc = PAL.dark ? '143,196,255' : '42,100,184';
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + now / 1400, d = 0.25 + ((now / 900 + k * 0.37) % 1) * 1.4; const q = cam.proj(cx + Math.sin(a) * d * 1.6, cy + Math.cos(a * 0.7) * d, 0); if (!q) continue; g.strokeStyle = `rgba(${wc},${0.5 * (1 - d / 1.7)})`; g.lineWidth = 1; g.beginPath(); g.ellipse(q[0], q[1], Math.max(2, 0.12 * q[2]), Math.max(1, 0.05 * q[2]), 0, 0, TAU); g.stroke(); }
  }
  for (const o of w.motes || []) {
    const p = cam.proj(o.x, o.y, o.z); if (!p) continue; const life = 1 - o.t / o.life;
    if (o.kind === 'drop') { const q = cam.proj(o.x, o.y, o.z + 0.4); g.strokeStyle = PAL.dark ? `rgba(170,205,240,${0.7 * life})` : `rgba(40,80,140,${0.7 * life})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p[0], p[1]); if (q) g.lineTo(q[0], q[1]); g.stroke(); if (o.z < 0.2) { g.beginPath(); g.arc(p[0], p[1], Math.max(2, 0.1 * p[2]), 0, TAU); g.stroke(); } }
    else if (o.kind === 'seed') { g.save(); g.translate(p[0], p[1]); g.rotate(now / 90); g.fillStyle = PAL.spore; g.globalAlpha = 0.9 * Math.min(1, life * 3); g.beginPath(); g.ellipse(0, 0, Math.max(1.5, 0.08 * p[2]), Math.max(0.8, 0.03 * p[2]), 0, 0, TAU); g.fill(); g.restore(); }
    else if (o.kind === 'snow') { g.fillStyle = PAL.dark ? `rgba(235,240,250,${0.85 * life})` : `rgba(255,255,255,${0.9 * life})`; g.beginPath(); g.arc(p[0], p[1], Math.max(1.5, 0.1 * p[2]), 0, TAU); g.fill(); }
    else if (o.kind === 'bat') { const s = Math.max(3, 0.22 * p[2]), fl = Math.sin(now / 45 + o.x) * 0.5; g.strokeStyle = PAL.bone; g.globalAlpha = 0.75 * Math.min(1, life * 2); g.lineWidth = 1.3; g.beginPath(); g.moveTo(p[0] - s, p[1] - s * fl); g.quadraticCurveTo(p[0] - s * 0.4, p[1] + s * 0.2, p[0], p[1]); g.quadraticCurveTo(p[0] + s * 0.4, p[1] + s * 0.2, p[0] + s, p[1] - s * fl); g.stroke(); g.globalAlpha = 1; }
    else if (o.kind === 'bee') { const j = Math.sin(now / 70 + o.y * 5) * 2, s = Math.max(1.6, 0.07 * p[2]); g.fillStyle = PAL.spore; g.globalAlpha = Math.min(1, life * 3); g.beginPath(); g.arc(p[0] + j, p[1] + Math.cos(now / 55 + o.x) * 2, s, 0, TAU); g.fill(); g.globalAlpha = 1; }
  }
}
function drawTree(g, t, w) {
  const h = 0.3 + t.size * 3.6, rc = 0.2 + t.size * 1.15;
  const sw = Math.sin(performance.now() / (650 + t.id * 37) + t.id) * w.windStr * 0.22 * t.size * (w.stormT > 0 ? 2.2 : 1);
  const tx = t.x + Math.sin(w.windDir) * sw, ty = t.y + Math.cos(w.windDir) * sw;
  const pg = cam.proj(t.x, t.y, 0), pt = cam.proj(tx, ty, h); if (!pg || !pt) return;
  // roots zone and rings
  for (let i = 1; i <= Math.min(3, 1 + Math.floor(t.size * 2.5)); i++) { groundCircle(g, t.x, t.y, Math.max(0.08, t.size * 0.32 * i), 0, 28); g.strokeStyle = kinCol(t, 0.5 - i * 0.1); g.lineWidth = 1; g.stroke(); }
  if (t.hub) { groundCircle(g, t.x, t.y, 1.35, 0, 40); g.strokeStyle = PAL.spore; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
  // trunk
  g.strokeStyle = t.sp === 'birch' ? (PAL.dark ? 'rgba(230,228,220,0.85)' : 'rgba(150,150,145,0.9)') : (PAL.dark ? 'rgba(150,120,95,0.8)' : 'rgba(95,70,50,0.85)'); g.lineWidth = Math.max(1, 0.12 * t.size * pg[2]); g.beginPath(); g.moveTo(pg[0], pg[1]); g.lineTo(pt[0], pt[1]); g.stroke();
  // crown: a cone for conifers, a dome for broadleaves
  const TT = TREE_SPECIES[t.sp] || {};
  if (TT.conifer) {
    const pts = []; const zb = Math.max(0.25, h - rc * 1.1); for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, q = cam.proj(tx + Math.sin(a) * rc * 0.7, ty + Math.cos(a) * rc * 0.7, zb); if (q) pts.push(q); }
    const ap = cam.proj(tx, ty, h + rc * 0.7); if (ap) pts.push(ap);
    const hull = convexHull(pts); g.beginPath(); hull.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath();
  } else groundCircle(g, tx, ty, rc, h, 36);
  const sug = clamp01(t.sugar / 2);
  const bare = (TREE_SPECIES[t.sp] || {}).leaf !== 'ever' && t.leaf < 0.12;
  g.fillStyle = kinCol(t, bare ? ((TREE_SPECIES[t.sp] || {}).leaf === 'marc' ? 0.14 : 0.03) : 0.12 + sug * 0.22 + t.flash * 0.25); g.fill();
  if (bare) g.setLineDash([2, 3]);
  g.strokeStyle = t.defense > 0.2 ? PAL.alarm : kinCol(t, 0.9); g.lineWidth = 1 + t.flash * 1.5 + t.defense; g.stroke(); g.setLineDash([]);
  if (t.stress > 0.1) { groundCircle(g, tx, ty, rc + 0.3 + Math.sin(performance.now() / 90) * 0.1, h, 36); g.strokeStyle = PAL.alarm; g.globalAlpha = t.stress; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1; }
  if (t.flash > 0.1 && PAL.dark) { g.globalCompositeOperation = 'lighter'; glowDot(g, pt[0], pt[1], Math.max(2, 0.2 * pt[2]), kinCol(t, t.flash * 0.6), true); g.globalCompositeOperation = 'source-over'; }
  if (t.drought > 0.4) { groundCircle(g, tx, ty, rc + 0.2, h, 36); g.strokeStyle = PAL.spore; g.setLineDash([2, 4]); g.globalAlpha = t.drought; g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
  if ((t.crop || 0) >= 1 && (state.tool === 'gather' || state.tool === 'listen')) { const n = Math.min(6, Math.floor(t.crop)); g.fillStyle = PAL.spore; for (let k = 0; k < n; k++) { const a = k / n * TAU + t.id, q = cam.proj(tx + Math.sin(a) * rc * 0.55, ty + Math.cos(a) * rc * 0.55, h + 0.1); if (q) { g.beginPath(); g.arc(q[0], q[1], Math.max(1.4, 0.06 * q[2]) * (state.tool === 'gather' ? 1.3 : 0.8), 0, TAU); g.fill(); } } }
  if (TT.berries && inMonths(w.month, TT.berries) && t.size > 0.6) { g.fillStyle = PAL.dark ? '#e0402c' : '#b8261a'; for (let k = 0; k < 7; k++) { const a = k * 2.3 + t.id, q = cam.proj(tx + Math.sin(a) * rc * 0.7, ty + Math.cos(a) * rc * 0.7, h); if (q) { g.beginPath(); g.arc(q[0], q[1], Math.max(1.2, 0.045 * q[2]), 0, TAU); g.fill(); } } }
  if (w.beetle && w.beetle.id === t.id) { g.fillStyle = PAL.dark ? 'rgba(40,25,15,0.9)' : 'rgba(30,20,10,0.9)'; for (let k = 0; k < 7; k++) { const z = 0.3 + k * h / 9, q = cam.proj(t.x + Math.sin(k * 2.1) * 0.08, t.y, z); if (q) { g.beginPath(); g.arc(q[0], q[1], Math.max(1, 0.035 * q[2]), 0, TAU); g.fill(); } } }
  // a name only under the pointer, so nothing covers the forest
  if (!(scene.hover && Math.hypot(t.x - scene.hover[0], t.y - scene.hover[1]) < 1.8)) return;
  const label = `${TREE_SPECIES[t.sp] ? TREE_SPECIES[t.sp].short.toLowerCase() : 'tree'} ${t.id} · ${fmtAge(t.age)}${t.hub ? ' · hub' : ''}${t.dying > 0 ? ' · dying' : ''}`;
  g.font = '500 10px "Martian Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = PAL.bone; g.globalAlpha = 0.95; g.fillText(label, pt[0], pt[1] - Math.max(8, rc * pt[2] * 0.5) - 6); g.globalAlpha = 1;
}
// ---------------------------------------------------------------- mushrooms, drawn after the real genera
function capColor(L, gn, a = 1) {
  let c = L.cap;
  if (L.alt && gn) { const b = Math.floor((((gn.sp.hue || 0) % 360) + 360) % 360 / 120); c = b === 1 ? L.alt : b === 2 && L.alt2 ? L.alt2 : L.cap; }
  return PAL.dark ? hsl(c[0], c[1], Math.min(85, c[2] + 6), a) : hsl(c[0], c[1], Math.max(15, c[2] - 4), a);
}
function stemColor(L, a = 1) { const c = L.stem || [40, 15, 80]; return PAL.dark ? hsl(c[0], c[1], Math.min(92, c[2]), a) : hsl(c[0], c[1], Math.max(28, c[2] - 12), a); }
// one mushroom with its foot at (px, py); u is the width of its cap in pixels
function drawMushroomAt(g, px, py, u, L, gn, glow) {
  const cap = capColor(L, gn), stem = stemColor(L), sh = L.shape;
  if (sh === 'sclerotia') { g.fillStyle = cap; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(px + Math.sin(k * 2.4) * u * 0.9, py + Math.cos(k * 2.4) * u * 0.35, Math.max(0.8, u * 0.12), 0, TAU); g.fill(); } return; }
  if (sh === 'truffle') { g.fillStyle = cap; g.beginPath(); g.ellipse(px, py, u * 0.6, u * 0.42, 0, Math.PI, 0); g.fill(); g.strokeStyle = PAL.dark ? 'rgba(140,105,65,0.8)' : 'rgba(90,65,40,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - u * 0.9, py); g.lineTo(px + u * 0.9, py); g.stroke(); return; }
  if (sh === 'rosette') { g.fillStyle = cap; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.55; g.beginPath(); g.moveTo(px, py); g.arc(px, py, u * (0.75 + (k % 2) * 0.2), a - 0.24, a + 0.24); g.closePath(); g.fill(); } return; }
  if (sh === 'morel') {
    const h = u * 0.6; g.fillStyle = stem; g.fillRect(px - u * 0.18, py - h, u * 0.36, h);
    g.fillStyle = cap; g.beginPath(); g.ellipse(px, py - h - u * 0.45, u * 0.32, u * 0.55, 0, 0, TAU); g.fill();
    g.strokeStyle = PAL.dark ? 'rgba(40,28,18,0.7)' : 'rgba(30,20,12,0.7)'; g.lineWidth = Math.max(0.6, u * 0.04);
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(px + k * u * 0.14, py - h - u * 0.95); g.lineTo(px + k * u * 0.18, py - h - u * 0.02); g.stroke(); }
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.moveTo(px - u * 0.3, py - h - k * u * 0.25); g.lineTo(px + u * 0.3, py - h - k * u * 0.25); g.stroke(); }
    return;
  }
  if (sh === 'hoof') {
    g.strokeStyle = PAL.dark ? 'rgba(150,140,130,0.8)' : 'rgba(95,90,85,0.85)'; g.lineWidth = Math.max(1.5, u * 0.22); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - u * 2); g.stroke();
    for (let k = 0; k < 2; k++) { const y = py - u * (0.7 + k * 0.75), w = u * (0.6 - k * 0.12); g.fillStyle = cap; g.beginPath(); g.moveTo(px, y - w * 0.5); g.quadraticCurveTo(px + w * 1.3, y - w * 0.4, px + w * 0.9, y + w * 0.3); g.lineTo(px, y + w * 0.25); g.closePath(); g.fill(); if (L.belt) { g.strokeStyle = hsl(L.belt[0], L.belt[1], L.belt[2]); g.lineWidth = Math.max(1, u * 0.09); g.beginPath(); g.moveTo(px + w * 0.15, y + w * 0.15); g.lineTo(px + w * 0.95, y + w * 0.12); g.stroke(); } }
    return;
  }
  if (sh === 'shelf') { g.strokeStyle = PAL.dark ? 'rgba(150,120,95,0.8)' : 'rgba(95,70,50,0.85)'; g.lineWidth = Math.max(1.5, u * 0.18); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - u * 1.6); g.stroke(); g.fillStyle = cap; for (let k = 0; k < 3; k++) { const y = py - u * (0.35 + k * 0.45); g.beginPath(); g.ellipse(px + u * 0.28, y, u * (0.55 - k * 0.1), u * 0.2, 0, Math.PI, 0); g.fill(); if (L.bands) { g.strokeStyle = PAL.dark ? 'rgba(235,225,205,0.6)' : 'rgba(250,245,230,0.7)'; g.lineWidth = Math.max(0.6, u * 0.04); g.beginPath(); g.ellipse(px + u * 0.28, y, u * (0.38 - k * 0.08), u * 0.12, 0, Math.PI, 0); g.stroke(); } } if (glow > 0.05 && PAL.dark) { const pc = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; glowDot(g, px + u * 0.3, py - u * 0.8, u * 0.6, `hsla(105,95%,62%,${0.45 * glow})`, true); g.globalCompositeOperation = pc; } return; }
  const h = u * (L.tall ? 1.9 : sh === 'bell' ? 1.6 : sh === 'bun' ? 1.0 : 1.25), sw = u * (L.fat ? 0.42 : L.thin ? 0.08 : 0.2);
  g.fillStyle = stem; g.beginPath(); g.moveTo(px - sw * (L.fat ? 1.2 : 1), py); g.lineTo(px - sw * 0.8, py - h); g.lineTo(px + sw * 0.8, py - h); g.lineTo(px + sw * (L.fat ? 1.2 : 1), py); g.closePath(); g.fill();
  if (L.ring) { g.strokeStyle = stem; g.lineWidth = Math.max(1, u * 0.08); g.beginPath(); g.moveTo(px - sw * 1.8, py - h * 0.72); g.lineTo(px + sw * 1.8, py - h * 0.72); g.stroke(); }
  if (L.scabers) { g.fillStyle = 'rgba(35,28,22,0.75)'; const d = Math.max(1, u * 0.06); for (let k = 0; k < 6; k++) g.fillRect(px - sw * 0.6 + (k % 2) * sw * 0.7, py - h * (0.12 + k * 0.13), d, d); }
  const cy = py - h; g.fillStyle = cap; g.beginPath();
  if (sh === 'convex') g.ellipse(px, cy, u * 0.62, u * 0.42, 0, Math.PI, 0);
  else if (sh === 'bun') g.ellipse(px, cy + u * 0.05, u * 0.7, u * 0.55, 0, Math.PI, 0);
  else if (sh === 'flat') g.ellipse(px, cy, u * 0.68, u * 0.2, 0, Math.PI, 0);
  else if (sh === 'funnel') { g.moveTo(px - u * 0.68, cy - u * 0.28); g.quadraticCurveTo(px, cy - u * 0.04, px + u * 0.68, cy - u * 0.28); g.lineTo(px + sw * 1.2, cy + u * 0.06); g.lineTo(px - sw * 1.2, cy + u * 0.06); }
  else if (sh === 'conic') { g.moveTo(px - u * 0.5, cy); g.quadraticCurveTo(px - u * 0.2, cy - u * 0.25, px, cy - u * 0.6); g.quadraticCurveTo(px + u * 0.2, cy - u * 0.25, px + u * 0.5, cy); }
  else if (sh === 'bell') g.ellipse(px, cy, u * 0.3, u * 0.38, 0, Math.PI, 0);
  g.closePath(); g.fill();
  if (L.wavy) { g.strokeStyle = cap; g.lineWidth = Math.max(0.8, u * 0.06); g.beginPath(); g.moveTo(px - u * 0.62, cy); g.quadraticCurveTo(px - u * 0.3, cy + u * 0.09, px, cy); g.quadraticCurveTo(px + u * 0.3, cy + u * 0.09, px + u * 0.62, cy); g.stroke(); }
  if (L.warts) { g.fillStyle = 'rgba(250,248,240,0.95)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(px + (k - 2.5) * u * 0.18, cy - u * (0.12 + (k % 2) * 0.14), Math.max(0.8, u * 0.055), 0, TAU); g.fill(); } }
  if (L.cobweb) { g.strokeStyle = 'rgba(235,230,220,0.55)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(px - u * 0.5, cy); g.lineTo(px - sw, cy + u * 0.25); g.moveTo(px + u * 0.5, cy); g.lineTo(px + sw, cy + u * 0.25); g.stroke(); }
  if (L.teeth) { g.strokeStyle = cap; g.lineWidth = Math.max(0.6, u * 0.04); g.beginPath(); for (let k = -4; k <= 4; k++) { g.moveTo(px + k * u * 0.13, cy); g.lineTo(px + k * u * 0.13, cy + u * 0.12); } g.stroke(); }
  if (L.glossy) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(px - u * 0.2, cy - u * 0.2, u * 0.14, u * 0.06, -0.3, 0, TAU); g.fill(); }
  if (glow > 0.05 && PAL.dark) { const pc = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; glowDot(g, px, cy - u * 0.1, u * 0.5, `hsla(105,95%,62%,${0.45 * glow})`, true); g.globalCompositeOperation = pc; }
}
function seeded(n) { let a = n | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function drawFruit(g, f, w) {
  const gn = w.genets.get(f.g), genus = f.genus || (gn && gn.sp.genus) || 'Mycena', L = FUNGUS_LOOK[genus] || FUNGUS_LOOK.Mycena;
  const rr = seeded(f.id * 7919 + 13), grow = 0.3 + 0.7 * f.size, items = [];
  for (let k = 0; k < L.n; k++) { const a = rr() * TAU, d = k ? 0.12 + rr() * 0.42 : 0; items.push([f.x + Math.sin(a) * d, f.y + Math.cos(a) * d, k ? 0.55 + rr() * 0.4 : 1]); }
  const proj = items.map(it => [it, cam.proj(it[0], it[1], 0)]).filter(a => a[1]).sort((a, b) => b[1][3] - a[1][3]);
  let top = null;
  for (const [[, , k], p] of proj) { const u = Math.max(4.5 * Math.sqrt(k), 0.85 * p[2] * L.size * k * grow); drawMushroomAt(g, p[0], p[1], u, L, gn, gn ? gn.glow : 0); if (k === 1) top = [p[0], p[1] - u * 1.5, u]; }
  if (top && state.tool === 'gather' && f.phase !== 'emerge' && !f.printed) { g.strokeStyle = PAL.hypha; g.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() / 260); g.lineWidth = 1.5; g.beginPath(); g.arc(top[0], top[1] + top[2] * 0.8, top[2] * 1.6, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  if (top && f.phase === 'spore') { g.strokeStyle = PAL.spore; g.globalAlpha = 0.55; g.lineWidth = 1; g.beginPath(); g.arc(top[0], top[1], top[2] * (1.2 + Math.sin(performance.now() / 200) * 0.2), 0, TAU); g.stroke(); g.globalAlpha = 1; }
}
// colonies: a soft ring where each fungus began, pins before it fruits, Cenococcum's black grains
function drawColonies(g, w) {
  const flat = Math.max(0.3, Math.sin(cam.pitch));
  for (const gn of w.genets.values()) {
    const p = cam.proj(gn.ox, gn.oy, 0); if (!p) continue;
    const r = Math.max(1.5, 0.17 * p[2]);
    g.strokeStyle = gcol(gn, 0.28); g.lineWidth = 1; g.beginPath(); g.ellipse(p[0], p[1], r, r * flat, 0, 0, TAU); g.stroke();
    const L = FUNGUS_LOOK[gn.sp.genus];
    if (L && L.shape === 'sclerotia') drawMushroomAt(g, p[0], p[1], Math.max(2.5, 0.3 * p[2]), L, gn, 0);
    if (gn.pins > 0.15) {
      const k = Math.round(gn.pins * 5), rr = seeded(gn.id * 31); g.fillStyle = PAL.dark ? 'rgba(235,228,210,0.85)' : 'rgba(130,120,100,0.9)';
      for (let i = 0; i < k; i++) { const a = rr() * TAU, d = 0.5 + rr() * 1.2, q = cam.proj(gn.ox + Math.sin(a) * d, gn.oy + Math.cos(a) * d, 0); if (!q) continue; const sz = Math.max(1.2, 0.07 * q[2]); g.beginPath(); g.arc(q[0], q[1] - sz, sz, 0, TAU); g.fill(); }
    }
  }
}
function convexHull(P) {
  const pts = P.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// the field guide's selection, found on the map
function drawGuideMarks(g, w, now) {
  const sel = guide.sel; if (!sel) return; const [grp, key] = sel.split(':'), pts = [];
  if (grp === 'trees') { const [k, v] = key.split('@'); for (const t of w.trees) if (t.sp === k && ((t.dna && t.dna.variety) || '') === (v || '')) pts.push([t.x, t.y, 1.2 + t.size]); }
  else if (grp === 'fungi') { const [k, f0] = key.split('@'); for (const gn of w.genets.values()) if (gn.sp.genus === k && (gn.sp.form || '') === (f0 || '')) pts.push([gn.ox, gn.oy, 0.9]); for (const f of w.fruits) { const gn = w.genets.get(f.g); if (gn && gn.sp.genus === k && (gn.sp.form || '') === (f0 || '')) pts.push([f.x, f.y, 0.7]); } }
  else if (grp === 'ground') { const idx = COVER_KEY[key], S = w.soil; let n = 0; if (idx) for (let k = 0; k < S.cover.length && n < 60; k += 3) if (S.cover[k] === idx && S.coverD[k] > 0.2) { const [x, y] = w.cellXY(k % SOIL_N, Math.floor(k / SOIL_N)); if (Math.hypot(x, y) < PLOT_R) { pts.push([x, y, 0.35]); n++; } } }
  else if (grp === 'fauna') {
    for (const c of w.critters) if ((key === 'boar' && c.kind === 'boar') || (key === 'squirrel' && c.kind === 'squirrel') || ((key === 'nutcrackers' || key === 'jays') && c.kind === 'bird')) pts.push([c.x, c.y, 1.2]);
    if (key === 'beetles' && w.beetle) { const t = w.treeById(w.beetle.id); if (t) pts.push([t.x, t.y, 2]); }
    if (key === 'woodpecker') for (const sn of w.snags) pts.push([sn.x, sn.y, 1]);
    if (key === 'deer') for (const t of w.trees) if (t.stress > 0.2) pts.push([t.x, t.y, 1.4]);
    const MK = { bat: 'bat', bees: 'bee' }; if (MK[key]) for (const o of w.motes || []) if (o.kind === MK[key]) pts.push([o.x, o.y, 0.8]);
    for (const c of w.calls) pts.push([c.x, c.y, 0.8]);
  } else if (grp === 'network') {
    if (key === 'hyphae') for (const t of w.tips) pts.push([t.x, t.y, 0.45]);
    else if (key === 'bond') { for (const t of w.trees) if (t.links.size) pts.push([t.x, t.y, 1 + 0.2 * t.links.size]); }
    else if (key === 'signals' || key === 'alarm') { for (const sg of w.signals) if (key === 'signals' || sg.alarm) pts.push([sg.x, sg.y, 0.5]); }
    else if (key === 'sugar') for (const c of w.carbon) pts.push([c.x, c.y, 0.7]);
    else if (key === 'water') for (const c of w.water) pts.push([c.x, c.y, 0.7]);
    else if (key === 'fruit') for (const f of w.fruits) pts.push([f.x, f.y, 0.9]);
    else if (key === 'spores') for (const sp of w.spores) pts.push([sp.x, sp.y, 0.5]);
    else if (key === 'pins') { for (const gn of w.genets.values()) if (gn.pins > 0.15) pts.push([gn.ox, gn.oy, 1.4]); }
    else if (key === 'glow') { for (const gn of w.genets.values()) if (gn.glow > 0.05) pts.push([gn.ox, gn.oy, 1.4]); }
    else if (key === 'snag') { for (const sn of w.snags) pts.push([sn.x, sn.y, 1]); for (const l of w.logs) pts.push([l.x, l.y, 1.6]); }
    else if (key === 'clicks') for (const t of w.trees) if (t.drought > 0.25) pts.push([t.x, t.y, 1.2]);
    else if (key === 'mast') { for (const t of w.trees) if (w.mastNow && w.mastNow[t.sp] && (t.crop || 0) >= 1) pts.push([t.x, t.y, 1.4]); }
    else if (key === 'gather') { for (const t of w.trees) if ((t.crop || 0) >= 1) pts.push([t.x, t.y, 1.2]); for (const f of w.fruits) if (f.phase !== 'emerge' && !f.printed) pts.push([f.x, f.y, 0.7]); }
    else if (key === 'arrival') { for (const t of w.trees) if (w.arrived[t.sp] !== undefined) pts.push([t.x, t.y, 1.4]); for (const gn of w.genets.values()) if (w.arrived[gn.sp.genus] !== undefined) pts.push([gn.ox, gn.oy, 1]); }
    else if (key === 'form') { for (const gn of w.genets.values()) if (gn.sp.form) pts.push([gn.ox, gn.oy, 1]); }
    else if (key === 'variety') { for (const t of w.trees) if (t.dna && t.dna.variety) pts.push([t.x, t.y, 1.4]); }
  }
  else if (grp === 'weather') {
    if (key === 'melt' && w.creekAt) pts.push([w.creekAt[0], w.creekAt[1], 1.4]);
    else if (key === 'seedfall') { for (const t of w.trees) if ((t.crop || 0) >= 1) pts.push([t.x, t.y, 1.2]); }
    else if (key === 'leaffall') { for (const t of w.trees) if (TREE_SPECIES[t.sp].leaf !== 'ever') pts.push([t.x, t.y, 1.2]); }
    else if (key === 'unload' || key === 'drip') { for (const t of w.trees) if (key === 'drip' || TREE_SPECIES[t.sp].conifer) pts.push([t.x, t.y, 1.2]); }
    for (const o of w.motes || []) if ((key === 'drip' && o.kind === 'drop') || (key === 'seedfall' && o.kind === 'seed') || (key === 'unload' && o.kind === 'snow')) pts.push([o.x, o.y, 0.5]);
  }
  if (!pts.length) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 280);
  g.strokeStyle = PAL.hypha; g.lineWidth = 1.5;
  for (const [x, y, r] of pts.slice(0, 90)) { groundCircle(g, x, y, r * (1 + 0.18 * pulse), 0, 28); g.globalAlpha = 0.4 + 0.45 * pulse; g.stroke(); }
  g.globalAlpha = 1;
}
const COVER_KEY = { grass: 1, moss: 2, fern: 3, heath: 4, sedge: 5, stone: 6, litter: 7 };
function drawListener(g) {
  const L = listener; const pg = cam.proj(L.x, L.y, 0), ph = cam.proj(L.x, L.y, L.z); if (!pg || !ph) return;
  groundCircle(g, L.x, L.y, 3, 0, 48); g.strokeStyle = PAL.bone; g.globalAlpha = 0.18; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = PAL.bone; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(pg[0], pg[1]); g.lineTo(ph[0], ph[1]); g.stroke(); g.globalAlpha = 1;
  const r = Math.max(5, 0.32 * ph[2]);
  const fx = Math.sin(L.yaw), fy = Math.cos(L.yaw);
  const pn = cam.proj(L.x + fx * 0.9, L.y + fy * 0.9, L.z);
  const pl = cam.proj(L.x - fy * 0.34, L.y + fx * 0.34, L.z), pr = cam.proj(L.x + fy * 0.34, L.y - fx * 0.34, L.z);
  g.fillStyle = PAL.soil; g.strokeStyle = PAL.bone; g.lineWidth = 1.6; g.beginPath(); g.arc(ph[0], ph[1], r, 0, TAU); g.fill(); g.stroke();
  if (pn) { g.beginPath(); g.moveTo(ph[0], ph[1]); g.lineTo(pn[0], pn[1]); g.stroke(); }
  g.fillStyle = PAL.hypha; for (const q of [pl, pr]) if (q) { g.beginPath(); g.arc(q[0], q[1], Math.max(2, r * 0.3), 0, TAU); g.fill(); }
  scene.head = [ph[0], ph[1], r];
}
// the ground layer: grass, moss, ferns, heath, sedge and lichen-covered stone, coloured by season
const COVER_COL = {
  1: { spring: [95, 55, 52], summer: [100, 45, 42], autumn: [48, 40, 48], winter: [40, 22, 42] },
  2: { spring: [100, 52, 38], summer: [100, 50, 36], autumn: [95, 45, 36], winter: [110, 32, 34] },
  3: { spring: [110, 55, 45], summer: [115, 48, 38], autumn: [25, 62, 42], winter: [30, 30, 32] },
  4: { spring: [120, 35, 38], summer: [130, 30, 36], autumn: [5, 62, 42], winter: [330, 22, 32] },
  5: { spring: [70, 40, 44], summer: [72, 35, 42], autumn: [50, 35, 42], winter: [45, 25, 40] },
  6: { spring: [90, 10, 58], summer: [90, 8, 58], autumn: [90, 8, 56], winter: [90, 6, 62] },
  7: { spring: [30, 35, 32], summer: [30, 35, 30], autumn: [28, 55, 40], winter: [28, 25, 30] },
};
function drawGround(g, w, now) {
  const S = w.soil, N = SOIL_N, se = w.season(), snow = w.snow;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, [x0, y0] = w.cellXY(i, j); if (Math.hypot(x0, y0) > PLOT_R + 0.3) continue;
    const hsh = Math.sin(k * 12.9898) * 43758.5453, jx = (hsh - Math.floor(hsh) - 0.5) * SOIL_CELL * 0.8, jy = (Math.sin(k * 78.233) * 43758.5453 % 1) * SOIL_CELL * 0.4;
    const x = x0 + jx, y = y0 + jy; const p = cam.proj(x, y, 0); if (!p) continue;
    const r = Math.max(1.2, 0.32 * p[2]);
    // painted soil shows through: wet ground darkens blue, rich ground dark brown, acid ground ochre
    const wv = S.wet[k], rv = S.rich[k], av = S.acid[k];
    if (wv > 0.35) { g.fillStyle = PAL.dark ? `rgba(70,120,170,${(wv - 0.35) * 0.35})` : `rgba(60,110,170,${(wv - 0.35) * 0.3})`; g.beginPath(); g.arc(p[0], p[1], r * 2.4, 0, TAU); g.fill(); }
    else if (wv < -0.45) { g.fillStyle = `rgba(200,170,110,${(-wv - 0.45) * 0.25})`; g.beginPath(); g.arc(p[0], p[1], r * 2.4, 0, TAU); g.fill(); }
    if (rv > 0.62) { g.fillStyle = `rgba(70,45,25,${(rv - 0.62) * 0.6})`; g.beginPath(); g.arc(p[0], p[1], r * 2, 0, TAU); g.fill(); }
    if (av > 0.68) { g.fillStyle = `rgba(190,150,60,${(av - 0.68) * 0.4})`; g.beginPath(); g.arc(p[0], p[1], r * 1.8, 0, TAU); g.fill(); }
    const c = S.cover[k], d = S.coverD[k]; if (!c || d < 0.08) continue;
    const vis = c === 6 ? 1 : Math.max(0, 1 - snow * 1.4); if (vis <= 0.02) continue;
    const col = COVER_COL[c][se]; const a = Math.min(0.75, 0.25 + d * 0.5) * vis;
    const cs = PAL.dark ? hsl(col[0], col[1], col[2], a) : hsl(col[0], Math.min(80, col[1] + 10), Math.max(18, col[2] - 12), a);
    g.strokeStyle = cs; g.fillStyle = cs; g.lineWidth = 1;
    const up = r * (c === 5 ? 1.6 : 1);
    if (c === 1 || c === 5) { g.beginPath(); for (let q = -1; q <= 1; q++) { g.moveTo(p[0] + q * r * 0.5, p[1]); g.lineTo(p[0] + q * r * 0.8 + Math.sin(now / 900 + k) * r * 0.25 * w.windStr, p[1] - up); } g.stroke(); }
    else if (c === 2) { g.beginPath(); g.ellipse(p[0], p[1], r * 1.1, r * 0.5, 0, 0, TAU); g.fill(); }
    else if (c === 3) { g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] - r, p[1] - r, p[0] - r * 1.4, p[1] - r * 0.4); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + r, p[1] - r, p[0] + r * 1.4, p[1] - r * 0.4); g.stroke(); }
    else if (c === 4) { for (let q = 0; q < 3; q++) { g.beginPath(); g.arc(p[0] + (q - 1) * r * 0.6, p[1] - (q % 2) * r * 0.4, r * 0.28, 0, TAU); g.fill(); } }
    else if (c === 6) { g.beginPath(); g.ellipse(p[0], p[1], r * 0.9, r * 0.45, 0.3, 0, TAU); g.fill(); }
    else if (c === 7) { g.beginPath(); g.arc(p[0] - r * 0.3, p[1], r * 0.25, 0, TAU); g.arc(p[0] + r * 0.4, p[1] - r * 0.2, r * 0.2, 0, TAU); g.fill(); }
    // spring flowers on fertile, light ground
    if (se === 'spring' && (c === 1 || c === 3) && rv > 0.42 && (k % 3 === 0)) { g.fillStyle = ['rgba(245,245,235,0.8)', 'rgba(240,210,80,0.8)', 'rgba(170,140,230,0.8)'][k % 3 === 0 ? (k >> 2) % 3 : 0]; g.beginPath(); g.arc(p[0] + r * 0.6, p[1] - up * 0.8, Math.max(1, r * 0.22), 0, TAU); g.fill(); }
  }
  // dead logs
  for (const lg of w.logs) {
    const a = cam.proj(lg.x - Math.sin(lg.a) * lg.len / 2, lg.y - Math.cos(lg.a) * lg.len / 2, 0.15), b = cam.proj(lg.x + Math.sin(lg.a) * lg.len / 2, lg.y + Math.cos(lg.a) * lg.len / 2, 0.15); if (!a || !b) continue;
    const age = clamp01(lg.t / lg.life); g.strokeStyle = PAL.dark ? `rgba(${120 - age * 40},${90 + age * 20},${60},0.85)` : `rgba(${90 - age * 30},${65 + age * 20},40,0.85)`; g.lineCap = 'round'; g.lineWidth = Math.max(2, 0.35 * (a[2] + b[2]) / 2); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // brush preview
  if (scene.brush && state.tool === 'shape') { groundCircle(g, scene.brush.x, scene.brush.y, state.brush, 0, 32); g.strokeStyle = PAL.bone; g.globalAlpha = 0.35; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
  else if (scene.hover && state.tool === 'shape') { groundCircle(g, scene.hover[0], scene.hover[1], state.brush, 0, 32); g.strokeStyle = PAL.bone; g.globalAlpha = 0.2; g.stroke(); g.globalAlpha = 1; }
}
function drawSnag(g, sn) {
  const h = 0.6 + sn.size * 2.6 * Math.max(0.3, 1 - sn.t / sn.life);
  const pg = cam.proj(sn.x, sn.y, 0), pt = cam.proj(sn.x, sn.y, h); if (!pg || !pt) return;
  g.strokeStyle = PAL.dim; g.globalAlpha = 0.85; g.lineWidth = Math.max(1, 0.11 * sn.size * pg[2]); g.beginPath(); g.moveTo(pg[0], pg[1]); g.lineTo(pt[0], pt[1]); g.stroke();
  const pb = cam.proj(sn.x + 0.4, sn.y, h * 0.7); if (pb) { g.lineWidth = 1; g.beginPath(); g.moveTo((pg[0] + pt[0]) / 2 + (pt[0] - pg[0]) * 0.2, (pg[1] + pt[1]) / 2 + (pt[1] - pg[1]) * 0.2); g.lineTo(pb[0], pb[1]); g.stroke(); }
  g.globalAlpha = 1;
}
function drawCritter(g, c, now) {
  const p = cam.proj(c.x, c.y, c.z); if (!p) return; const s = Math.max(3, 0.25 * p[2]);
  if (c.kind === 'bird') {
    const fl = Math.sin(now / 90 + c.s) * 0.5;
    g.strokeStyle = PAL.bone; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p[0] - s, p[1] - s * (0.3 + fl)); g.quadraticCurveTo(p[0] - s * 0.4, p[1] - s * 0.1, p[0], p[1]); g.quadraticCurveTo(p[0] + s * 0.4, p[1] - s * 0.1, p[0] + s, p[1] - s * (0.3 + fl)); g.stroke();
    const q = cam.proj(c.x, c.y, 0); if (q) { g.fillStyle = PAL.dim; g.globalAlpha = 0.25; g.beginPath(); g.ellipse(q[0], q[1], s * 0.6, s * 0.25, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
  } else if (c.kind === 'boar') {
    const b = Math.max(4, 0.42 * p[2]), dir = Math.sign((c.pts[Math.min(c.k + 1, c.pts.length - 1)] || [c.x])[0] - c.x) || 1, bob = Math.sin(now / 160 + c.s) * b * 0.04;
    g.fillStyle = PAL.dark ? '#5a4636' : '#3d2e22'; g.beginPath(); g.ellipse(p[0], p[1] - b * 0.35 + bob, b * 0.7, b * 0.38, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(p[0] + dir * b * 0.72, p[1] - b * 0.28 + bob, b * 0.26, b * 0.2, dir * 0.4, 0, TAU); g.fill();
    g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1.2, b * 0.1); g.beginPath(); for (const lx of [-0.4, -0.15, 0.2, 0.45]) { g.moveTo(p[0] + lx * b, p[1] - b * 0.1); g.lineTo(p[0] + lx * b, p[1] + b * 0.08); } g.stroke();
  } else {
    g.fillStyle = PAL.dark ? '#c4683a' : '#9a4a22'; g.beginPath(); g.ellipse(p[0], p[1], s * 0.55, s * 0.35, 0, 0, TAU); g.fill();
    g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1.5, s * 0.3); g.beginPath(); g.moveTo(p[0] - s * 0.4, p[1]); g.quadraticCurveTo(p[0] - s * 1.1, p[1] - s * 0.9, p[0] - s * 0.5, p[1] - s * 1.2); g.stroke();
  }
}
// seasonal particles: falling leaves in autumn, fireflies on summer nights
function seasonParticles(g, w, now) {
  const s = w.season(), P2 = scene.parts || (scene.parts = []);
  const big = w.trees.filter(t => t.size > 0.6);
  const want = s === 'autumn' && big.length ? 40 : (s === 'summer' && w.light < 0.05 && w.temp > 12 ? 26 : 0);
  if (P2.length && P2[0].kind !== (s === 'autumn' ? 'leaf' : 'fly')) P2.length = 0;
  while (P2.length < want) {
    if (s === 'autumn') { const t = big[Math.floor(Math.random() * big.length)]; const a = Math.random() * TAU, r = Math.random() * (0.3 + t.size); P2.push({ kind: 'leaf', x: t.x + Math.sin(a) * r, y: t.y + Math.cos(a) * r, z: 0.5 + t.size * 3.4, h: (state.seed.kinHue + t.kin * 32 + Math.random() * 25) % 360, ph: Math.random() * TAU }); }
    else { const a = Math.random() * TAU, r = Math.random() * 16; P2.push({ kind: 'fly', x: listener.x + Math.sin(a) * r, y: listener.y + Math.cos(a) * r, z: 0.3 + Math.random() * 1.4, ph: Math.random() * TAU }); }
  }
  if (P2.length > want) P2.length = want;
  const dt = 1 / 60;
  for (let i = P2.length - 1; i >= 0; i--) {
    const q = P2[i];
    if (q.kind === 'leaf') {
      q.z -= dt * 0.35; q.ph += dt * 2; q.x += Math.sin(w.windDir) * w.windStr * dt * 1.2 + Math.sin(q.ph) * dt * 0.4; q.y += Math.cos(w.windDir) * w.windStr * dt * 1.2;
      if (q.z <= 0) { P2.splice(i, 1); continue; }
      const p = cam.proj(q.x, q.y, q.z); if (!p) continue; const r = Math.max(1.5, 0.09 * p[2]);
      g.fillStyle = PAL.dark ? hsl(q.h, 70, 55, 0.85) : hsl(q.h, 70, 42, 0.85); g.beginPath(); g.ellipse(p[0], p[1], r, r * (0.35 + 0.3 * Math.abs(Math.sin(q.ph))), q.ph, 0, TAU); g.fill();
    } else {
      q.ph += dt; q.x += Math.sin(q.ph * 0.7 + i) * dt * 0.3; q.y += Math.cos(q.ph * 0.5 + i) * dt * 0.3;
      const on = Math.max(0, Math.sin(q.ph * 1.7 + i * 1.3)); if (on < 0.6) continue;
      const p = cam.proj(q.x, q.y, q.z); if (!p) continue;
      const prev = g.globalCompositeOperation; if (PAL.dark) g.globalCompositeOperation = 'lighter';
      glowDot(g, p[0], p[1], Math.max(1.2, 0.05 * p[2]), `rgba(200,255,120,${(on - 0.6) * 2.2})`, true); g.globalCompositeOperation = prev;
    }
  }
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
  ['gather', 'Gather', 'Click a tree in seed (gold marks on its crown) to gather its seed, or a ripe mushroom to take a spore print. Everything goes into your pouch.'],
  ['plant', 'Plant', 'Click the floor to plant a seed from your pouch. It lies dormant for a while, then comes up if it is still viable.'],
  ['sow', 'Sow spores', 'Click the floor to sow spores from your pouch. Each packet carries the genotype of the mushroom it came from.'],
  ['cut', 'Cut', 'Drag a line across hyphae to cut them. Click a tree to fell it: it pours its sugar into the network as it dies.'],
  ['shape', 'Shape ground', 'Paint the conditions of a place: wet, dry, rich, acid or stony ground, or lay a dead log. Trees, fungi, moss and grass follow.'],
];
function buildTools() {
  const box = $('tools');
  TOOLS.forEach(([id, label, help], i) => {
    const b = document.createElement('button'); b.className = 'tool'; b.id = 'tool-' + id; b.title = `${help} (key ${i + 1})`; b.setAttribute('aria-pressed', String(id === state.tool));
    b.textContent = label; b.onclick = () => setTool(id); box.appendChild(b);
  });
}
function setTool(id) {
  state.tool = id; $('stage').dataset.tool = id;
  for (const [t] of TOOLS) $('tool-' + t).setAttribute('aria-pressed', String(t === id));
  const t = TOOLS.find(x => x[0] === id); if (t) logHelp(t[2]);
  buildToolOpts();
}
// options for the tools that build: which species to plant, which fungus to sow, what to paint
const SHAPES = [['wet', 'Wet', 'A seep: wetter ground for alder, sedge and moss'], ['dry', 'Dry', 'Drained ground for pine and oak'], ['rich', 'Rich', 'Fertile humus: fir and beech thrive; many mycorrhizal fungi decline'], ['acid', 'Acid', 'Acid soil: spruce, heath and acid-loving fungi'], ['stone', 'Stone', 'Scree: lichen, stone pine and larch'], ['log', 'Dead log', 'Lay a fallen log: decomposers feed on it and the soil grows rich']];
function buildToolOpts() {
  const box = $('toolopts'); box.innerHTML = ''; const tool = state.tool;
  box.hidden = !(tool === 'plant' || tool === 'sow' || tool === 'shape' || tool === 'gather'); if (box.hidden || !world) return;
  state.pouchV = world.pouchV;
  const chip = (label, title, on, fn, sw) => { const b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-pressed', String(on)); b.title = title; b.innerHTML = (sw ? `<i style="background:${sw}"></i>` : '') + label; b.onclick = () => { fn(); buildToolOpts(); }; box.appendChild(b); };
  const label = (it) => it.kind === 'seed' ? (it.form ? it.form : TREE_SPECIES[it.key].short) : (it.form ? `${it.key} ${it.form}` : it.key);
  const sw = (it) => { if (it.kind === 'seed') { const c = TREE_SPECIES[it.key].col[1]; return `hsl(${c[0]},${c[1]}%,${c[2] + 8}%)`; } const L = FUNGUS_LOOK[it.key]; return L ? `hsl(${L.cap[0]},${L.cap[1]}%,${Math.max(30, L.cap[2])}%)` : ''; };
  const items = (kind) => world.pouch.filter(it => it.kind === kind && it.n > 0).sort((a, b) => label(a).localeCompare(label(b)));
  const tip = (it) => `${it.kind === 'seed' ? TREE_SPECIES[it.key].name + ' seed' : it.key + ' spores'}${it.form ? ' · ' + it.form : ''} · ${it.n} in your pouch · ${Math.round(it.viab * 100)}% viable · from ${it.from}`;
  const note = (t) => { const n = document.createElement('span'); n.className = 'count'; n.textContent = t; box.appendChild(n); };
  if (tool === 'plant' || tool === 'sow') {
    const kind = tool === 'plant' ? 'seed' : 'spores', key = tool === 'plant' ? 'plantItem' : 'sowItem', list = items(kind);
    if (state[key] !== 'best' && !list.some(it => it.id === state[key])) state[key] = 'best';
    chip('Best for the spot', `The ${kind === 'seed' ? 'seed' : 'spores'} in your pouch that suit the place you click`, state[key] === 'best', () => state[key] = 'best');
    for (const it of list) chip(`${label(it)} <b>${it.n}</b><small>${Math.round(it.viab * 100)}%</small>`, tip(it), state[key] === it.id, () => state[key] = it.id, sw(it));
    if (!list.length) note(kind === 'seed' ? 'No seed in your pouch. Gather from a tree in seed (the Gather tool).' : 'No spores in your pouch. Take a spore print from a ripe mushroom (the Gather tool).');
    else note(tool === 'plant' ? `${world.trees.length}/${MAX_TREES} trees` : `${world.genets.size}/${MAX_FUNGI} fungi`);
  } else if (tool === 'gather') {
    const ripe = [...new Set(world.trees.filter(t => (t.crop || 0) >= 1).map(t => TREE_SPECIES[t.sp].short.toLowerCase()))];
    const shrooms = world.fruits.filter(f => f.phase !== 'emerge' && !f.printed).length;
    note(`In seed now: ${ripe.length ? ripe.join(', ') : 'nothing'}${Object.keys(world.mastNow || {}).some(k => world.mastNow[k]) ? ' (a mast year!)' : ''} · ripe mushrooms: ${shrooms}`);
    const all = world.pouch.filter(it => it.n > 0);
    if (all.length) { const n = document.createElement('span'); n.className = 'count'; n.textContent = 'Pouch:'; box.appendChild(n); for (const it of all) { const c = document.createElement('span'); c.className = 'chip static'; c.title = tip(it); c.innerHTML = `${sw(it) ? `<i style="background:${sw(it)}"></i>` : ''}${label(it)} <b>${it.n}</b>`; box.appendChild(c); } }
    else note('Your pouch is empty.');
  } else {
    for (const [k, l, t] of SHAPES) chip(l, t, state.shapeKind === k, () => state.shapeKind = k);
    chip(state.brush > 3 ? 'Wide brush' : 'Narrow brush', 'Brush size', false, () => state.brush = state.brush > 3 ? 2.6 : 4.5);
  }
}
let helpTimer = 0;
function logHelp(t) { const st = $('status'); void st; const box = $('log'); const p = document.createElement('p'); p.textContent = t; p.style.setProperty('--c', 'var(--bone)'); box.appendChild(p); while (box.children.length > 5) box.removeChild(box.firstChild); clearTimeout(helpTimer); }

let lastPaint = 0;
function paintAt(p) {
  const now = performance.now(); if (now - lastPaint < 70) return; lastPaint = now;
  const gp = cam.ground(p[0], p[1]); if (!gp || Math.hypot(gp[0], gp[1]) > PLOT_R + 1) return;
  world.paint(gp[0], gp[1], state.shapeKind, state.brush); scene.brush = { x: gp[0], y: gp[1], t: 0.6 };
  if (!state.painted) { state.painted = true; logLine('You are reshaping the ground. Light, moss, grass, trees and fungi will follow its new character.', 'tree'); }
}
function initInput() {
  const cv = scene.cv; let drag = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // two fingers on a phone or tablet: pinch to zoom, twist to turn the view, slide both up or down to tilt
  const touches = new Map(); let pinch = null;
  const pair = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), my: (a[1] + b[1]) / 2 }; };
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) { } const p = pos(e);
    if (e.pointerType !== 'mouse') {
      touches.set(e.pointerId, p);
      if (touches.size >= 2) { drag = null; scene.cutLine = null; const q = pair(); pinch = { ...q, dist0: cam.dist, yaw0: listener.yaw, cyaw0: cam.yaw, pitch0: cam.pitch }; return; }
    }
    const tilt = e.button === 2 || e.shiftKey;
    const onHead = scene.head && Math.hypot(p[0] - scene.head[0], p[1] - scene.head[1]) < scene.head[2] + 12;
    drag = { x0: p[0], y0: p[1], x: p[0], y: p[1], moved: 0, tilt, head: onHead && state.tool === 'listen' && !tilt, yaw0: listener.yaw };
    if (state.tool === 'cut' && !tilt) scene.cutLine = [p, p];
    if (state.tool === 'shape' && !tilt && state.shapeKind !== 'log') paintAt(p);
  });
  cv.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, pos(e));
    if (pinch && touches.size >= 2) {
      e.preventDefault(); const q = pair();
      cam.dist = Math.max(10, Math.min(80, pinch.dist0 * pinch.d / Math.max(20, q.d)));
      const da = q.ang - pinch.ang;
      const tw = Math.abs(da) > 0.06 ? da - Math.sign(da) * 0.06 : 0; if (state.follow) listener.yaw = pinch.yaw0 + tw; else cam.yaw = pinch.cyaw0 - tw;
      cam.pitch = Math.max(0.3, Math.min(1.5, pinch.pitch0 + (q.my - pinch.my) * 0.005));
      return;
    }
    if (!drag) return; const p = pos(e); const dx = p[0] - drag.x, dy = p[1] - drag.y; drag.x = p[0]; drag.y = p[1]; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.tilt) { cam.pitch = Math.max(0.3, Math.min(1.5, cam.pitch + dy * 0.006)); if (!state.follow) cam.yaw += dx * 0.006; return; }
    if (state.tool === 'cut') { scene.cutLine = [[drag.x0, drag.y0], p]; return; }
    if (state.tool === 'shape') { if (state.shapeKind !== 'log') paintAt(p); return; }
    if (state.tool === 'listen') {
      if (drag.head) { const gp = cam.ground(p[0], p[1]); if (gp && Math.hypot(gp[0], gp[1]) < PLOT_R + 3) { listener.x = gp[0]; listener.y = gp[1]; state.walk = null; } }
      else listener.yaw -= dx * 0.007;
    }
  });
  const end = (e) => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) { pinch = null; drag = null; } return; }
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
    else if (state.tool === 'gather') { const r = world.gatherAt(gp[0], gp[1]); logLine(r.msg, r.ok ? 'gather' : 'touch'); if (r.ok) buildToolOpts(); }
    else if (state.tool === 'plant') { const r = world.plantFromPouch(gp[0], gp[1], state.plantItem); if (r !== true) logHelp(r === 'full' ? `The forest holds at most ${MAX_TREES} trees.` : r === 'crowded' ? 'Too close to another trunk or a seed already planted.' : r === 'empty' ? 'Your pouch has no seed for this. Gather seed from a mature tree in its season (the Gather tool).' : 'Plant inside the circle.'); buildToolOpts(); }
    else if (state.tool === 'sow') { const r = world.sowFromPouch(gp[0], gp[1], state.sowItem); if (r !== true) logHelp(r === 'full' ? `The soil holds at most ${MAX_FUNGI} fungal individuals.` : r === 'empty' ? 'Your pouch has no spores for this. Take a spore print from a ripe mushroom (the Gather tool).' : 'Sow inside the circle.'); buildToolOpts(); }
    else if (state.tool === 'shape' && state.shapeKind === 'log') { if (!world.addLog(gp[0], gp[1])) logHelp('A log needs open ground, a little away from other logs (at most 16).'); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; drag = null; scene.cutLine = null; });
  cv.addEventListener('pointermove', (e) => { const p = pos(e); scene.hover = cam.ground(p[0], p[1]); });
  cv.addEventListener('pointerleave', () => { scene.hover = null; });
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
    if (k === 'f') { toggleGuide(); return; }
    if (k === 'escape' && !$('guideSheet').hidden) { toggleGuide(false); return; }
    if (k >= '1' && k <= '8') { setTool(TOOLS[+k - 1][0]); return; }
    if (k === 'g') { setWalk(state.walkMode ? null : 'rhythm'); return; }
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
const UI = { sliders: [] };
function refreshSliders() { for (const s of UI.sliders) { s.inp.value = s.o.get(); s.show(); } }
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
  show(); box.appendChild(row); UI.sliders.push({ inp, show, o });
  return row;
}
const pct = (v) => Math.round(v * 100) + '%';
const mul = (v) => v.toFixed(2) + '×';
const SEASON_MONTH = { spring: 4, summer: 6, autumn: 9, winter: 0 };
function timeNote() { const x = P.time; const day = 24 / x; $('timeNote').textContent = x === 1 ? 'Real time: one forest day lasts a day.' : `One forest day lasts ${day >= 1 ? (day >= 10 ? Math.round(day) : day.toFixed(1)) + ' h' : Math.round(day * 60) + ' min'}.`; }
function setSeason(v) {
  state.season = v; if (!world) return;
  const m = v === 'now' ? new Date().getMonth() : SEASON_MONTH[v]; world.month = m; world.doy = v === 'now' ? Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000) : Math.round(m * 30.4 + 15);
  logLine(`Season set to ${MONTHS[m]}: day length, temperature, leaf fall and fruiting follow.`, 'weather');
}
function buildSliders() {
  const eco = $('ecoS'), sp = $('spaceS'), la = $('layerS');
  const S = (box, id, label, min, max, def, fmt, help, after) => slider(box, { id, label, min, max, def, fmt, help, get: () => P[id], set: (v) => { P[id] = v; if (after) after(v); } });
  slider(eco, { id: 'time', label: 'Time', min: -2, max: Math.log2(24), step: 0.01, def: 0, fmt: (v) => { const x = Math.pow(2, v); return x < 0.99 ? x.toFixed(2) + '×' : x < 9.95 ? x.toFixed(1) + '×' : Math.round(x) + '×'; }, help: 'Speed of the clock. At 1× the sky follows the real clock. Sound always plays in real time.', get: () => Math.log2(P.time), set: (v) => { P.time = Math.pow(2, v); timeNote(); } });
  S(eco, 'growth', 'Growth', 0, 2.5, 1, mul, 'Speed and branching of hyphal tips.');
  S(eco, 'chatter', 'Chatter', 0, 3, 1, mul, 'How often fungi fire spike trains on their own.');
  S(eco, 'bloom', 'Bloom', 0, 3, 1, mul, 'How readily fungi fruit when they are fed and the soil is wet.');
  S(eco, 'mutation', 'Mutation', 0, 3, 1, mul, 'How far a spore\'s offspring drifts from its parent in growth and voice.');
  S(eco, 'moisture', 'Moisture', 0, 1, 0.5, pct, 'Base soil moisture. Wet soil speeds growth and allows fruiting.');
  S(eco, 'wind', 'Wind', 0, 1, 0.4, pct, 'Wind strength: the wind in the crowns, how far spores travel, how often storms break.');
  S(eco, 'warmth', 'Warmth', -6, 6, 0, (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1) + '°', 'Shifts the temperature of this place: growth, spiking, rain or snow, frost, and crickets, which chirp faster when it is warm (Dolbear 1897).');
  S(eco, 'nitrogen', 'Nitrogen', 0, 1, 0, pct, 'Nitrogen falling from polluted air. Trees grow more on their own and need their fungi less; many mycorrhizal fungi, webcaps and knights first, decline (Lilleskov et al. 2002).');
  S(eco, 'seeds', 'Seed rain', 0, 2.5, 1, mul, 'Tree seeds arriving from the valley on the wind and with birds. More seeds, more young trees in every gap.');
  S(eco, 'spores', 'Spore rain', 0, 2.5, 1, mul, 'Fungal spores drifting in from outside. More spores, more new fungal individuals; none, and the forest lives only on the fungi it has.');
  S(eco, 'grazing', 'Grazing', 0, 2.5, 1, mul, 'How many deer. They browse trees (an alarm runs through the network) and bite off seedlings, fir and oak first, spruce last.');
  S(sp, 'depth', 'Distance', 0.3, 2.2, 1, mul, 'Scales every distance you hear: small makes the forest intimate, large makes it vast (more delay, doppler and reverb).', sendGlobals);
  S(sp, 'spin', 'Autopan', -1, 1, 0, (v) => (v === 0 ? 'off' : (v > 0 ? '↻ ' : '↺ ') + Math.abs(v * 14.3).toFixed(1) + '°/s'), 'Turns your head continuously so the whole field revolves around you.');
  S(sp, 'wet', 'Reverb', 0, 1.2, 0.45, pct, 'Level of the forest room.', sendGlobals);
  S(sp, 'room', 'Room', 0, 1, 0.5, pct, 'Size and decay of the room, around the seed\'s own character.', sendGlobals);
  S(sp, 'master', 'Volume', 0, 1.2, 0.8, pct, 'Master level, before the limiter.', sendGlobals);
  S($('changeS'), 'change', 'Change', 0, 1, 0.5, (v) => v < 0.15 ? 'still' : v < 0.4 ? 'slow' : v < 0.7 ? 'drifting' : 'restless', 'How restless the sound world is: how often the tonal centre drifts, how far the timbre tide swings, how quickly each fungus’s voice mutates.');
  buildLayers(la);
}
const LAYER_DEFS = [
  { key: 'trees', name: 'Trees', color: 'spore', nudges: [['reg', 'Register', 'lower', 'higher'], ['tone', 'Tone', 'darker', 'brighter']] },
  { key: 'signals', name: 'Signals & sugar', color: 'hypha', nudges: [['pace', 'Pace', 'slower', 'quicker'], ['reg', 'Register', 'lower', 'higher']] },
  { key: 'growth', name: 'Growth', color: 'geo', nudges: [['density', 'Density', 'sparser', 'busier'], ['tone', 'Tone', 'darker', 'brighter']] },
  { key: 'fruit', name: 'Fruit & spores', color: 'spore', nudges: [['grain', 'Grain', 'finer', 'coarser'], ['reg', 'Register', 'lower', 'higher']] },
  { key: 'weather', name: 'Weather & soil', color: 'dim', nudges: [['tone', 'Tone', 'darker', 'brighter'], ['width', 'Width', 'closer', 'wider']] },
  { key: 'fauna', name: 'Birds & animals', color: 'bone', nudges: [['activity', 'Activity', 'rarer', 'livelier'], ['dist', 'Distance', 'nearer', 'farther']] },
];
function buildLayers(box) {
  LAYER_DEFS.forEach((L, i) => {
    const wrap = document.createElement('div'); wrap.className = 'layer'; box.appendChild(wrap);
    const row = slider(wrap, { id: 'layer' + i, label: L.name, min: 0, max: 1.5, def: i === 4 ? 0.8 : i === 5 ? 0.9 : 1, fmt: pct, help: `Level of ${L.name.toLowerCase()}`, color: `var(--${L.color})`, get: () => P.layers[i], set: (v) => { P.layers[i] = v; sendGlobals(); } });
    const tog = document.createElement('button'); tog.className = 'shape'; tog.textContent = '⋯'; tog.title = `Shape ${L.name.toLowerCase()}`; tog.setAttribute('aria-expanded', 'false'); row.appendChild(tog);
    const nd = document.createElement('div'); nd.className = 'nudges'; nd.hidden = true; wrap.appendChild(nd);
    tog.onclick = () => { nd.hidden = !nd.hidden; tog.setAttribute('aria-expanded', String(!nd.hidden)); };
    for (const [k, label, lo, hi] of L.nudges) {
      const r = document.createElement('div'); r.className = 'nudge'; const id = `nd-${L.key}-${k}`;
      r.innerHTML = `<label for="${id}">${label}</label><span>${lo}</span><input type="range" id="${id}" min="-1" max="1" step="0.01"><span>${hi}</span>`;
      r.title = `A gentle bias. The forest still chooses within it. Double-click to let the forest decide.`;
      const inp = r.querySelector('input');
      const show = () => { inp.style.setProperty('--p', ((+inp.value + 1) / 2 * 100) + '%'); };
      const o = { get: () => P.char[L.key][k], set: (v) => { P.char[L.key][k] = v; } };
      inp.value = o.get(); show();
      inp.addEventListener('input', () => { o.set(+inp.value); show(); });
      inp.addEventListener('dblclick', () => { inp.value = 0; o.set(0); show(); });
      UI.sliders.push({ inp, show, o }); nd.appendChild(r);
    }
  });
}
const HAPPEN = [
  ['rain', () => world && world.temp < 1.5 ? 'Call snow' : 'Call rain', () => world && world.temp < 1.5 ? 'snow hushes the forest' : 'wakes the fungi', 'Rain wets the soil and sets the mycelium talking. Below freezing it falls as snow, and snow absorbs sound.', () => world.startRain(240, 'user')],
  ['deer', () => 'Send deer', () => 'a tree raises the alarm', 'Deer browse a tree; it sends an alarm through the fungal network and its neighbours harden.', () => { const big = world.trees.filter(t => t.size > 0.3); if (!big.length) { logHelp('There is nothing for deer to browse yet.'); return false; } world.stressTree(big[Math.floor(Math.random() * big.length)], 'deer'); return true; }],
  ['storm', () => 'Windstorm', () => 'creaks, breaks, opens gaps', 'Gusts make trunks creak and branches break, lift spores high, and may throw a weakened tree. The gap lets light in for new seedlings.', () => world.windstorm('user')],
  ['dry', () => 'Dry spell', () => 'thirst, clicks, night water', 'Ten minutes without rain. Trees click with drought stress, deep roots share water at night, water-carrying fungi gain the upper hand.', () => world.drySpell('user')],
  ['cache', () => world && world.seed.cacher === 'nutcrackers' ? 'Nutcrackers' : 'Jays', () => 'bury seeds, forget some', 'Seed-caching birds harvest a mature tree and bury its seeds. The caches they forget become new seedlings.', () => world.cachers('user')],
  ['squirrel', () => 'Squirrel', () => 'eats fungi, plants spores', 'A red squirrel eats mushrooms and digs truffles. The spores pass its gut and start new fungi where it goes.', () => world.squirrels('user')],
  ['boar', () => 'Wild boar', () => 'roots and turns the soil', 'A wild boar roots for truffles: it turns litter into the soil, tears hyphae, opens bare ground where seeds take, and spreads truffle spores.', () => world.boar('user')],
  ['beetles', () => 'Bark beetles', () => 'test the weakest conifer', 'Bark beetles bore into the weakest conifer, drought-stressed spruce first. A strong tree drowns them in resin; a weak one dies and stands as a snag.', () => world.beetles('user')],
  ['fog', () => 'Fog', () => 'still air, sound carries', 'Fog settles in: the air goes still, crowns comb water from the cloud, and distant sounds carry further.', () => world.fog('user')],
];
function buildHappenings() {
  const box = $('happen');
  for (const [k, label, sub, help, fn] of HAPPEN) {
    const b = document.createElement('button'); b.className = 'btn hap'; b.id = 'hap-' + k; b.title = help;
    b.innerHTML = `<b></b><small></small><i></i>`;
    b.onclick = async () => { if (!world) return; if (!state.running) await setRunning(true); if (fn() !== false) updateHappenings(); };
    box.appendChild(b);
  }
  updateHappenings();
}
function updateHappenings() {
  if (!world) return;
  for (const [k, label, sub] of HAPPEN) {
    const b = $('hap-' + k); if (!b) continue; const v = world.ev[k] || 0, m = world.evMax[k] || 1;
    b.querySelector('b').textContent = label(); b.querySelector('small').textContent = v > 0 ? 'happening now' : sub();
    b.disabled = v > 0; b.style.setProperty('--p', v > 0 ? clamp01(v / m) : 0);
  }
}

// ---------------------------------------------------------------- field guide
const guide = { tab: 'living', entries: new Map(), sel: null, sig: '', mode: '' };
function initGuide() {
  $('gtabLiving').onclick = () => { guide.tab = 'living'; renderGuide(true); };
  $('gtabLegend').onclick = () => { guide.tab = 'legend'; guide.sel = null; renderGuide(true); };
  $('gtabSound').onclick = () => { guide.tab = 'sound'; guide.sel = null; renderGuide(true); };
  $('guideBtn').onclick = () => toggleGuide();
  $('guideClose').onclick = () => toggleGuide(false);
  // a tap on the blurred forest around the sheet closes it
  $('guideSheet').addEventListener('click', (e) => { if (e.target === $('guideSheet')) toggleGuide(false); });
}
function toggleGuide(open) {
  const sh = $('guideSheet'); if (open === undefined) open = sh.hidden;
  sh.hidden = !open; $('guideBtn').setAttribute('aria-expanded', String(open)); $('guideBtn').setAttribute('aria-pressed', String(open));
  if (open) { guide.lastFocus = document.activeElement; renderGuide(true); $('guideClose').focus(); }
  else if (guide.lastFocus && guide.lastFocus.focus) guide.lastFocus.focus();
}
const GEN_WORD = { drone: 'sustained partials', pluck: 'plucked strands', blow: 'breath through a hollow', grain: 'grains of bark and water' };
const PING_WORD = { modal: 'ring like a struck bar', pluck: 'pluck like a taut thread', blow: 'sound like a small pipe' };
const SPORE_WORD = { grain: 'scatter as grains', tick: 'tick as they drift', blow: 'drift as tiny breaths' };
const EXPL_WORD = {
  contact: 'A contact explorer: dense mats right at the root tips. Its growing tips tick fast and close together, and its signals creep.',
  short: 'A short-distance explorer: fine, dense hyphae near the root. Quick ticks, slow signals.',
  medium: 'A medium-distance explorer: fans of hyphae and modest cords.',
  long: 'A long-distance explorer: thick cords that carry water and signals fast, so its spike trains glide and travel far.',
};
function monthsText(m) { return !m ? 'never: it makes no mushrooms' : m[0] === m[1] ? MONTHS[m[0]] : `${MONTHS[m[0]]} to ${MONTHS[m[1]]}`; }
function fungusSound(sp) {
  const ex = sp.guild === 'sapro' ? 'A decomposer: its colonies feed on litter and dead wood, away from the roots.' : (EXPL_WORD[sp.expl] || '');
  return `${ex} Here its colonies ${PING_WORD[sp.pingGen] || PING_WORD.modal} when a signal reaches them, and speak in spike trains of about ${Math.max(1, Math.round(sp.word))} spikes; its spores ${SPORE_WORD[sp.spore] || SPORE_WORD.grain}. Every individual is a mutated copy of its parent, so no two sound quite alike.${sp.lum ? ' At night it glows, and you hear a faint shimmer above it.' : ''}`;
}
function guideItems(w) {
  const groups = [], seen = w.seen || {};
  // trees
  const trees = new Map();
  for (const t of w.trees) { const vk = t.sp + '@' + ((t.dna && t.dna.variety) || ''); let o = trees.get(vk); if (!o) trees.set(vk, o = { n: 0, maxAge: 0, partners: 0, gens: {}, hub: false, crop: 0 }); o.n++; if ((t.crop || 0) >= 1) o.crop++; o.maxAge = Math.max(o.maxAge, t.age); if (t.links.size) o.partners++; const gk = t.gen || t.type || 'drone'; o.gens[gk] = (o.gens[gk] || 0) + 1; if (t.hub) o.hub = true; }
  groups.push(['trees', 'Trees', [...trees].sort((a, b) => b[1].n - a[1].n).map(([vk, o]) => {
    const [k, variety] = vk.split('@'), T = TREE_SPECIES[k], G = GUIDE.trees[k] || {}, SI = SEED_INFO[k], vf = variety ? w.forms.find(f => f.name === variety) : null;
    const gens = Object.entries(o.gens).sort((a, b) => b[1] - a[1]).map(([gk, n]) => `${o.n > 1 ? n + ' as ' : 'as '}${GEN_WORD[gk] || gk}`).join(', ');
    const seedTxt = `Seed: ${SI.word}, ripe ${MONTHS[SI.months[0]]} to ${MONTHS[SI.months[1]]}${o.crop ? `; ${o.crop} in seed now` : ''}${w.mastNow && w.mastNow[k] ? ', a mast year' : ''}.`;
    const isNew = w.arrived[k] !== undefined;
    return { key: 'trees:' + k + (variety ? '@' + variety : ''), glyph: ['tree', k], name: variety ? variety[0].toUpperCase() + variety.slice(1) : T.name, sub: variety ? `a local variety of ${T.name.toLowerCase()}` : `${G.latin || ''}${isNew ? ' · newcomer' : ''}`, count: o.n,
      here: `${o.n === 1 ? 'One here' : o.n + ' here'}, the oldest ${fmtAge(o.maxAge)}${o.partners ? `; ${o.partners === o.n && o.n > 1 ? 'all' : o.partners} with fungal partners` : '; no fungal partners yet'}${o.hub ? '; one is the hub of the network' : ''}. In this forest ${o.n > 1 ? 'they sound' : 'it sounds'} ${gens}. ${seedTxt}${vf ? ` This variety arose ${fmtAge(w.t - vf.t)} ago from a lineage adapted to its own ground.` : isNew ? ` It arrived ${fmtAge(w.t - w.arrived[k])} ago.` : ''}`,
      nature: G.nature, sound: G.sound };
  })]);
  // fungi
  const fun = new Map();
  const fk = (sp) => sp.genus + '@' + (sp.form || '');
  for (const g of w.genets.values()) { let o = fun.get(fk(g.sp)); if (!o) fun.set(fk(g.sp), o = { n: 0, sp: g.sp, fruit: 0, pins: 0, glow: 0, partners: 0 }); o.n++; if (g.pins > 0.15) o.pins++; if (g.glow > 0.3) o.glow++; }
  for (const t of w.trees) for (const gid of t.links.keys()) { const g = w.genets.get(gid); if (g) { const o = fun.get(fk(g.sp)); if (o) o.partners++; } }
  for (const f of w.fruits) { const g = w.genets.get(f.g); const o = g && fun.get(fk(g.sp)); if (o) o.fruit++; }
  groups.push(['fungi', 'Fungi', [...fun].sort((a, b) => b[1].n - a[1].n).map(([gk, o]) => {
    const [k, form] = gk.split('@'), G = GUIDE.fungi[k] || {}, sp = o.sp, ff = form ? w.forms.find(f => f.name === k + ' ' + form) : null, isNew = w.arrived[k] !== undefined;
    const role = sp.guild === 'sapro' ? 'decomposer' : sp.hosts && sp.hosts !== 'any' ? `partner of ${sp.hosts.map(h => TREE_SPECIES[h].short.toLowerCase()).join(' and ')} only` : 'mycorrhizal partner';
    return { key: 'fungi:' + k + (form ? '@' + form : ''), glyph: ['fungus', k], name: form ? `${k} ${form}` : k, sub: form ? `a local form, found only in this forest · ${role}` : `${G.common || ''} · ${role}${isNew ? ' · newcomer' : ''}`, count: o.n,
      here: `${o.n === 1 ? 'One individual' : o.n + ' individuals'} here${o.partners ? `, ${o.partners} partnership${o.partners > 1 ? 's' : ''} with trees` : ''}${o.fruit ? `, ${o.fruit} fruiting now` : o.pins ? ', pins set, waiting for rain' : ''}. Mushrooms: ${monthsText(sp.months)}.${ff ? ` This form arose ${fmtAge(w.t - ff.t)} ago, when a lineage of ${k} had drifted far from its ancestors.` : isNew ? ` It arrived ${fmtAge(w.t - w.arrived[k])} ago.` : ''}`,
      nature: `${G.nature || ''} ${G.look ? 'It looks like this: ' + G.look + '.' : ''}`, sound: fungusSound(sp) };
  })]);
  // ground
  const S = w.soil, cc = {}; let tot = 0;
  for (let k = 0; k < S.cover.length; k++) { const [x, y] = w.cellXY(k % SOIL_N, Math.floor(k / SOIL_N)); if (Math.hypot(x, y) > PLOT_R) continue; tot++; if (S.coverD[k] > 0.2) cc[S.cover[k]] = (cc[S.cover[k]] || 0) + 1; }
  const ground = [];
  for (const [key, idx] of Object.entries(COVER_KEY)) { const n = cc[idx] || 0; if (n < 5) continue; const G = GUIDE.cover[key]; ground.push({ key: 'ground:' + key, glyph: ['cover', key], name: G.name, sub: '', count: Math.round(n / tot * 100) + '%', here: `Covers about ${Math.round(n / tot * 100)}% of this forest floor.`, nature: G.nature, sound: G.sound, n }); }
  ground.sort((a, b) => b.n - a.n);
  if (w.snow > 0.1) { const G = GUIDE.weather.snow; ground.unshift({ key: 'weather:snow', glyph: ['weather', 'snow'], name: 'Snow cover', sub: '', count: Math.round(w.snow * 100) + '%', here: `Snow lies on ${Math.round(w.snow * 100)}% of the ground.`, nature: G.nature, sound: G.sound }); }
  groups.push(['ground', 'Ground', ground]);
  // animals
  const fauna = [];
  for (const k of ['songbird', 'cuckoo', 'owl', 'bat', 'cricket', 'bees', 'woodpecker', 'deer', 'stag', 'roe', 'fox', 'nutcrackers', 'jays', 'squirrel', 'boar', 'beetles']) {
    const n = k === 'squirrel' ? (seen.squirrel || 0) + (seen.stripping || 0) : seen[k]; if (!n) continue; const G = GUIDE.fauna[k];
    fauna.push({ key: 'fauna:' + k, glyph: ['fauna', k], name: G.name, sub: G.latin || '', count: n, here: `Heard or seen ${n === 1 ? 'once' : n + ' times'} in this forest.`, nature: G.nature, sound: G.sound });
  }
  groups.push(['fauna', 'Animals', fauna]);
  // the network
  const net = [], N = GUIDE.network, has = (k) => !!seen[k];
  const anyFruit = Object.keys(seen).some(k => k.startsWith('fruit:')), pins = [...w.genets.values()].some(g => g.pins > 0.15);
  const conds = [['hyphae', w.edges.size > 0, `${w.edges.size} hyphae and ${w.tips.length} growing tips right now.`], ['bond', w.trees.some(t => t.links.size), `${w.trees.reduce((a, t) => a + t.links.size, 0)} partnerships between trees and fungi.`], ['signals', w.edges.size > 3, `${w.signals.length} spike trains travelling right now.`], ['alarm', has('alarm'), 'Alarms have run through this network.'], ['sugar', has('sugar'), `${w.carbon.length} sugar packets in transit now.`], ['water', has('water'), 'Water has moved through the network at night.'], ['clicks', has('clicks'), `${w.stats.clicks} clicks so far.`], ['fruit', anyFruit, `${w.fruits.length} mushrooms standing now; ${w.stats.fruits} so far.`], ['pins', pins, 'Some colonies have set pins.'], ['spores', has('spores'), `${w.spores.length} spores in the air now.`], ['glow', has('glow'), 'Decomposers here glow at night.'], ['gather', true, `Your pouch holds ${w.pouch.filter(p => p.kind === 'seed').reduce((a, p) => a + p.n, 0)} seeds and ${w.pouch.filter(p => p.kind === 'spores').reduce((a, p) => a + p.n, 0)} spore packets. Trees in seed now: ${w.trees.filter(t => (t.crop || 0) >= 1).length}.`], ['mast', has('mast'), `${w.seen.mast || 0} mast year${(w.seen.mast || 0) === 1 ? '' : 's'} so far${Object.keys(w.mastNow || {}).filter(k => w.mastNow[k]).length ? '; one is happening now (' + Object.keys(w.mastNow).filter(k => w.mastNow[k]).map(k => TREE_SPECIES[k].short.toLowerCase()).join(', ') + ')' : ''}.`], ['arrival', Object.keys(w.arrived).length > 0, `Newcomers so far: ${Object.keys(w.arrived).map(k => TREE_SPECIES[k] ? TREE_SPECIES[k].short.toLowerCase() : k).join(', ')}.`], ['form', w.forms.some(f => f.kind === 'fungus'), `Local forms so far: ${w.forms.filter(f => f.kind === 'fungus').map(f => f.name).join(', ')}.`], ['variety', w.forms.some(f => f.kind === 'tree'), `Local varieties so far: ${w.forms.filter(f => f.kind === 'tree').map(f => f.name).join(', ')}.`], ['snag', w.snags.length > 0 || w.logs.length > 0 || has('snag'), `${w.snags.length} standing dead trees, ${w.logs.length} fallen logs.`]];
  for (const [k, ok, here] of conds) if (ok) net.push({ key: 'network:' + k, glyph: ['net', k], name: N[k].name, sub: '', count: '', here, nature: N[k].nature, sound: N[k].sound });
  groups.push(['network', 'In the network', net]);
  // weather and seasons
  const wx = [];
  for (const k of ['rain', 'drip', 'snow', 'unload', 'melt', 'fog', 'storm', 'windthrow', 'drought', 'thunder', 'frost', 'seedfall', 'leaffall', 'browse']) {
    if (!seen[k] || (k === 'snow' && w.snow > 0.1)) continue; const G = GUIDE.weather[k];
    wx.push({ key: 'weather:' + k, glyph: ['weather', k], name: G.name, sub: '', count: seen[k], here: `${seen[k] === 1 ? 'Once' : seen[k] + ' times'} in this forest so far.`, nature: G.nature, sound: G.sound });
  }
  groups.push(['weather', 'Weather and seasons', wx]);
  return groups;
}
function renderGuide(force) {
  const box = $('guideList'); if (!box || !world) return;
  if ($('guideSheet').hidden) return;
  $('gtabLiving').setAttribute('aria-pressed', String(guide.tab === 'living')); $('gtabLegend').setAttribute('aria-pressed', String(guide.tab === 'legend')); $('gtabSound').setAttribute('aria-pressed', String(guide.tab === 'sound'));
  if (guide.tab === 'sound') {
    if (force || guide.mode !== 'sound') { box.innerHTML = `<div class="concept gwide">${SOUND_CONCEPT}</div>`; guide.mode = 'sound'; guide.sig = ''; }
    return;
  }
  if (guide.tab === 'legend') {
    if (force || guide.mode !== 'legend') {
      box.innerHTML = '';
      for (const [k, name, text] of LEGEND) { const d = document.createElement('div'); d.className = 'glegend'; d.appendChild(glyphCanvas(['legend', k])); const t = document.createElement('div'); const b = document.createElement('b'); b.textContent = name; const sp = document.createElement('span'); sp.textContent = text; t.append(b, sp); d.appendChild(t); box.appendChild(d); }
      guide.mode = 'legend'; guide.sig = '';
    }
    return;
  }
  if (guide.mode !== 'living' || force) { if (guide.mode !== 'living') { box.innerHTML = ''; guide.entries.clear(); guide.sig = ''; } guide.mode = 'living'; }
  const groups = guideItems(world), nodes = [], keys = [];
  for (const [gk, title, items] of groups) {
    if (!items.length) continue;
    let h = guide.entries.get('h:' + gk); if (!h) { h = { el: document.createElement('div') }; h.el.className = 'ggroup'; h.el.textContent = title; guide.entries.set('h:' + gk, h); }
    nodes.push(h.el); keys.push('h:' + gk);
    for (const it of items) { nodes.push(guideEntry(it)); keys.push(it.key); }
  }
  if (!keys.length) { box.innerHTML = '<div class="empty">Nothing has grown yet. Press Grow, and entries appear here as life arrives.</div>'; guide.sig = ''; return; }
  const sig = keys.join('|');
  if (sig !== guide.sig || force) { box.replaceChildren(...nodes); guide.sig = sig; }
  for (const k of [...guide.entries.keys()]) if (!keys.includes(k)) { guide.entries.delete(k); if (guide.sel === k) guide.sel = null; }
}
function guideEntry(it) {
  let e = guide.entries.get(it.key);
  if (!e) {
    const el = document.createElement('div'); el.className = 'gentry'; el.dataset.open = 'false';
    const head = document.createElement('button'); head.className = 'ghead'; head.setAttribute('aria-expanded', 'false');
    const nm = document.createElement('span'); nm.className = 'gname'; const b = document.createElement('b'); const i = document.createElement('i'); nm.append(b, i);
    const cnt = document.createElement('span'); cnt.className = 'gcount';
    head.append(glyphCanvas(it.glyph), nm, cnt);
    const body = document.createElement('div'); body.className = 'gbody'; body.hidden = true;
    const here = document.createElement('p'); here.className = 'ghere';
    const nat = document.createElement('p'); nat.innerHTML = '<b>In nature.</b> <span></span>';
    const snd = document.createElement('p'); snd.innerHTML = '<b>As sound.</b> <span></span>';
    const show = document.createElement('button'); show.className = 'btn small'; show.textContent = 'Show on the map'; show.title = 'Close the guide; the forest marks where this lives';
    show.onclick = () => { guide.sel = it.key; toggleGuide(false); };
    body.append(here, nat, snd, show); el.append(head, body);
    e = { el, b, i, cnt, here, nat: nat.querySelector('span'), snd: snd.querySelector('span'), body, head, last: {} };
    head.onclick = () => {
      const open = el.dataset.open !== 'true'; el.dataset.open = String(open); body.hidden = !open; head.setAttribute('aria-expanded', String(open));
      if (open) { for (const [k, o] of guide.entries) if (k !== it.key && o.el && o.el.dataset && o.el.dataset.open === 'true') { o.el.dataset.open = 'false'; o.body.hidden = true; o.head.setAttribute('aria-expanded', 'false'); } guide.sel = it.key; }
      else if (guide.sel === it.key) guide.sel = null;
    };
    guide.entries.set(it.key, e);
  }
  const set = (node, k, v) => { if (e.last[k] !== v) { node.textContent = v; e.last[k] = v; } };
  set(e.b, 'name', it.name); set(e.i, 'sub', it.sub || ''); set(e.cnt, 'count', String(it.count)); set(e.here, 'here', it.here || ''); set(e.nat, 'nature', it.nature || ''); set(e.snd, 'sound', it.sound || '');
  return e.el;
}
// small drawn icons for the guide, in the same language as the map
function glyphCanvas(gl) {
  const c = document.createElement('canvas'); c.className = 'gglyph'; c.width = 60; c.height = 60; c.setAttribute('aria-hidden', 'true');
  try { drawGlyph(c.getContext('2d'), gl); } catch (e) { }
  return c;
}
function drawGlyph(g, [kind, key]) {
  g.clearRect(0, 0, 60, 60); g.lineCap = 'round'; g.lineJoin = 'round';
  const dark = PAL.dark, dim = PAL.dim, bone = PAL.bone;
  const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
  const dot = (x, y, r, col, glow) => glowDot(g, x, y, r, col, glow);
  if (kind === 'tree') {
    const T = TREE_SPECIES[key], c = T.col[1], col = dark ? hsl(c[0], c[1], c[2] + 14) : hsl(c[0], c[1] + 8, Math.max(20, c[2] - 6));
    line([[30, 56], [30, 30]], key === 'birch' ? (dark ? '#e6e3da' : '#9a9a94') : (dark ? '#9a7a60' : '#5f4632'), key === 'oak' ? 4 : 3);
    g.fillStyle = col; g.beginPath();
    if (T.conifer) { g.moveTo(30, key === 'stonepine' ? 10 : 4); g.lineTo(key === 'stonepine' ? 47 : 44, 44); g.lineTo(key === 'stonepine' ? 13 : 16, 44); } else g.arc(30, 24, key === 'birch' ? 14 : key === 'oak' ? 20 : 17, 0, TAU);
    g.closePath(); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; return;
  }
  if (kind === 'fungus' || (kind === 'net' && key === 'fruit') || (kind === 'legend' && key === 'mushroom')) { const L = FUNGUS_LOOK[kind === 'fungus' ? key : 'Amanita'] || FUNGUS_LOOK.Mycena; const u = L.shape === 'bell' ? 26 : L.shape === 'sclerotia' ? 14 : 30; drawMushroomAt(g, 30, L.shape === 'truffle' || L.shape === 'sclerotia' || L.shape === 'rosette' ? 40 : 54, u * Math.min(1, 0.85 / Math.max(0.6, L.size * 0.75)), L, null, 0); return; }
  if (kind === 'cover') {
    const col = { grass: [100, 45, 42], moss: [100, 50, 36], fern: [115, 48, 38], heath: [130, 30, 36], sedge: [72, 35, 42], stone: [90, 8, 58], litter: [28, 55, 40] }[key];
    const cs = dark ? hsl(col[0], col[1], col[2] + 10) : hsl(col[0], col[1] + 10, Math.max(18, col[2] - 10));
    g.strokeStyle = cs; g.fillStyle = cs; g.lineWidth = 2;
    if (key === 'grass' || key === 'sedge') for (let i = 0; i < 6; i++) line([[12 + i * 7, 50], [14 + i * 7 + (i % 2 ? 3 : -2), key === 'sedge' ? 16 : 26]], cs, 2);
    else if (key === 'moss') { for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(14 + i * 8, 44 - (i % 2) * 4, 9, 5, 0, 0, TAU); g.fill(); } }
    else if (key === 'fern') { line([[30, 54], [30, 14]], cs, 2); for (let i = 0; i < 5; i++) { line([[30, 48 - i * 8], [16 + i * 2, 40 - i * 8]], cs, 2); line([[30, 48 - i * 8], [44 - i * 2, 40 - i * 8]], cs, 2); } }
    else if (key === 'heath') { for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(14 + (i % 4) * 10, 30 + Math.floor(i / 4) * 12, 4, 0, TAU); g.fill(); } g.fillStyle = dark ? '#6a7fd0' : '#3a4fa0'; for (const [x, y] of [[22, 26], [38, 40]]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); } }
    else if (key === 'stone') { g.beginPath(); g.ellipse(30, 40, 22, 12, 0.2, 0, TAU); g.fill(); g.fillStyle = dark ? 'rgba(190,200,120,0.7)' : 'rgba(120,140,60,0.7)'; for (const [x, y] of [[22, 36], [36, 42], [30, 33]]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); } }
    else { for (let i = 0; i < 6; i++) { g.save(); g.translate(14 + (i % 3) * 14, 30 + Math.floor(i / 3) * 14); g.rotate(i * 1.1); g.beginPath(); g.ellipse(0, 0, 7, 3, 0, 0, TAU); g.restore(); g.fill(); } }
    return;
  }
  if (kind === 'fauna') {
    g.strokeStyle = bone; g.fillStyle = bone; g.lineWidth = 2;
    if (key === 'songbird' || key === 'nutcrackers' || key === 'jays') { g.beginPath(); g.moveTo(8, 26); g.quadraticCurveTo(20, 18, 30, 30); g.quadraticCurveTo(40, 18, 52, 26); g.stroke(); if (key !== 'songbird') { g.fillStyle = PAL.spore; g.beginPath(); g.arc(30, 44, 4, 0, TAU); g.fill(); } else for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(30, 30, 10 + i * 7, -2.4, -0.7); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1; } }
    else if (key === 'owl') { g.beginPath(); g.ellipse(30, 32, 14, 18, 0, 0, TAU); g.stroke(); for (const x of [24, 36]) { g.beginPath(); g.arc(x, 28, 4, 0, TAU); g.stroke(); } }
    else if (key === 'cricket') { g.beginPath(); g.ellipse(30, 36, 14, 6, 0, 0, TAU); g.fill(); line([[18, 34], [6, 14]], bone, 1.2); line([[20, 34], [12, 10]], bone, 1.2); line([[36, 40], [48, 52]], bone, 2); }
    else if (key === 'woodpecker') { line([[40, 6], [40, 56]], dim, 5); g.beginPath(); g.ellipse(30, 28, 6, 12, 0.2, 0, TAU); g.fill(); g.fillStyle = PAL.alarm; g.beginPath(); g.arc(30, 17, 3, 0, TAU); g.fill(); }
    else if (key === 'deer' || key === 'stag') { line([[30, 54], [30, 34]], bone, 3); line([[30, 34], [18, 14], [10, 12]], bone, 2); line([[30, 34], [42, 14], [50, 12]], bone, 2); line([[22, 22], [16, 26]], bone, 2); line([[38, 22], [44, 26]], bone, 2); }
    else if (key === 'squirrel') { g.fillStyle = dark ? '#c4683a' : '#9a4a22'; g.beginPath(); g.ellipse(26, 40, 9, 7, 0, 0, TAU); g.fill(); g.strokeStyle = g.fillStyle; g.lineWidth = 6; g.beginPath(); g.moveTo(34, 42); g.quadraticCurveTo(52, 30, 40, 12); g.stroke(); }
    else if (key === 'boar') { g.fillStyle = dark ? '#7a6250' : '#3d2e22'; g.beginPath(); g.ellipse(28, 34, 18, 10, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(48, 36, 7, 5, 0.4, 0, TAU); g.fill(); g.strokeStyle = g.fillStyle; g.lineWidth = 3; for (const x of [18, 24, 34, 40]) line([[x, 40], [x, 50]], g.fillStyle, 3); }
    else if (key === 'bat') { g.beginPath(); g.moveTo(6, 22); g.quadraticCurveTo(14, 34, 22, 28); g.quadraticCurveTo(26, 38, 30, 32); g.quadraticCurveTo(34, 38, 38, 28); g.quadraticCurveTo(46, 34, 54, 22); g.quadraticCurveTo(42, 26, 30, 22); g.quadraticCurveTo(18, 26, 6, 22); g.fill(); g.globalAlpha = 0.5; for (const r of [8, 13]) { g.beginPath(); g.arc(30, 44, r, -2.2, -0.9); g.stroke(); } g.globalAlpha = 1; }
    else if (key === 'bees') { g.fillStyle = PAL.spore; g.beginPath(); g.ellipse(30, 34, 11, 8, 0, 0, TAU); g.fill(); line([[26, 27], [26, 41]], PAL.soil, 2.5); line([[33, 27], [33, 41]], PAL.soil, 2.5); g.globalAlpha = 0.5; g.fillStyle = bone; g.beginPath(); g.ellipse(26, 22, 6, 9, -0.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(35, 22, 6, 9, 0.5, 0, TAU); g.fill(); g.globalAlpha = 1; }
    else if (key === 'cuckoo') { g.beginPath(); g.moveTo(10, 30); g.quadraticCurveTo(24, 22, 34, 28); g.lineTo(54, 36); g.lineTo(34, 34); g.quadraticCurveTo(22, 40, 10, 30); g.fill(); g.font = '600 13px sans-serif'; g.textAlign = 'center'; g.fillText('♪', 16, 16); g.fillText('♪', 28, 20); }
    else if (key === 'fox' || key === 'roe') { const c = key === 'fox' ? (dark ? '#d9763a' : '#a4501e') : (dark ? '#b08a62' : '#6e5232'); g.fillStyle = c; g.strokeStyle = c; g.beginPath(); g.ellipse(28, 34, 15, 8, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(40, 30); g.lineTo(50, 22); g.lineTo(52, 32); g.closePath(); g.fill(); if (key === 'fox') { g.lineWidth = 6; g.beginPath(); g.moveTo(14, 34); g.quadraticCurveTo(4, 40, 8, 50); g.stroke(); } for (const x of [20, 36]) line([[x, 40], [x, 52]], c, 2.5); if (key === 'roe') { line([[49, 22], [47, 12]], c, 1.5); line([[51, 22], [53, 12]], c, 1.5); } }
    else if (key === 'beetles') { g.fillStyle = dark ? '#8a6040' : '#4a3020'; g.beginPath(); g.ellipse(30, 34, 8, 14, 0, 0, TAU); g.fill(); line([[30, 20], [30, 48]], PAL.soil, 1); for (const s of [-1, 1]) for (const y of [26, 34, 42]) line([[30 + s * 7, y], [30 + s * 14, y + 3]], g.fillStyle, 1.5); }
    return;
  }
  if (kind === 'net' || kind === 'legend' || kind === 'weather') {
    const hyc = dark ? hsl(150, 70, 64) : hsl(150, 70, 32);
    switch (key) {
      case 'hyphae': case 'hypha': line([[6, 44], [16, 36], [24, 40], [34, 28], [44, 30], [54, 18]], hyc, 2); line([[24, 40], [30, 52]], hyc, 1.5); if (key === 'hyphae') dot(54, 18, 3, hyc, true); return;
      case 'tip': line([[8, 48], [22, 38], [34, 34]], hyc, 1.5); dot(36, 33, 4, hyc, true); return;
      case 'bond': line([[30, 54], [30, 26]], dark ? '#9a7a60' : '#5f4632', 3); g.strokeStyle = hyc; g.lineWidth = 2; g.beginPath(); g.ellipse(30, 50, 12, 5, 0, 0, TAU); g.stroke(); line([[8, 30], [20, 44], [26, 48]], hyc, 1.5); return;
      case 'signals': case 'signal': line([[6, 40], [54, 24]], hyc, 1.5); dot(22, 35, 3.5, hyc, true); dot(40, 29, 3.5, PAL.alarm, true); return;
      case 'alarm': line([[6, 40], [54, 24]], dim, 1.5); dot(30, 32, 5, PAL.alarm, true); g.strokeStyle = PAL.alarm; g.lineWidth = 1; g.beginPath(); g.arc(30, 32, 12, 0, TAU); g.stroke(); return;
      case 'sugar': line([[6, 44], [54, 20]], dim, 1.5); dot(30, 32, 5, PAL.spore, true); return;
      case 'water': line([[6, 44], [54, 20]], dim, 1.5); dot(30, 32, 5, dark ? '#8fc4ff' : '#2a64b8', true); return;
      case 'clicks': for (let i = 0; i < 4; i++) line([[14 + i * 10, 40 - (i % 2) * 8], [14 + i * 10, 22 - (i % 2) * 8]], PAL.spore, 2); return;
      case 'spores': case 'spore': for (const [x, y] of [[20, 20], [34, 14], [42, 26]]) { line([[x, y], [x, 52]], PAL.spore, 0.8); dot(x, y, 3, PAL.spore, true); } return;
      case 'pins': g.fillStyle = dark ? 'rgba(235,228,210,0.9)' : 'rgba(130,120,100,0.9)'; for (const [x, y] of [[20, 40], [28, 34], [36, 42], [42, 36]]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); } return;
      case 'glow': dot(30, 34, 8, 'hsla(105,95%,62%,0.9)', true); return;
      case 'crop': case 'gather': { const c = TREE_SPECIES.beech.col[1]; g.fillStyle = dark ? hsl(c[0], c[1], c[2] + 10) : hsl(c[0], c[1], c[2]); g.beginPath(); g.arc(30, 28, 18, 0, TAU); g.fill(); g.fillStyle = PAL.spore; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(30 + Math.sin(k * 1.26) * 10, 28 + Math.cos(k * 1.26) * 10, 3, 0, TAU); g.fill(); } if (key === 'crop') { g.fillStyle = dark ? '#e0402c' : '#b8261a'; g.beginPath(); g.arc(44, 44, 3.5, 0, TAU); g.fill(); } return; }
      case 'mast': g.fillStyle = PAL.spore; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(12 + (k * 13) % 38, 14 + Math.floor(k / 3) * 9, 3, 0, TAU); g.fill(); } return;
      case 'arrival': line([[6, 48], [24, 30], [46, 14]], dim, 1.5); g.setLineDash([2, 3]); line([[46, 14], [54, 8]], dim, 1.5); g.setLineDash([]); dot(24, 30, 5, PAL.spore, true); return;
      case 'form': case 'variety': line([[30, 54], [30, 34]], hyc, 2); line([[30, 34], [16, 18]], hyc, 2); line([[30, 34], [44, 18]], hyc, 2); dot(16, 16, 4, hyc, true); dot(44, 16, 5, PAL.spore, true); return;
      case 'snag': line([[30, 56], [30, 10]], dim, 5); line([[30, 26], [42, 18]], dim, 2); return;
      case 'colony': g.strokeStyle = hyc; g.lineWidth = 2; g.beginPath(); g.ellipse(30, 36, 16, 8, 0, 0, TAU); g.stroke(); g.fillStyle = dark ? 'rgba(235,228,210,0.9)' : 'rgba(130,120,100,0.9)'; for (const [x, y] of [[22, 30], [34, 28], [40, 40]]) { g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); } return;
      case 'seed': dot(30, 34, 5, PAL.spore, false); g.globalAlpha = 0.4; dot(30, 34, 9, PAL.spore, false); g.globalAlpha = 1; return;
      case 'patch': g.fillStyle = dark ? 'rgba(170,130,80,0.8)' : 'rgba(120,80,30,0.8)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(22 + (i % 3) * 8, 28 + Math.floor(i / 3) * 9, 3, 0, TAU); g.fill(); } g.strokeStyle = hyc; g.lineWidth = 1.2; g.beginPath(); g.arc(30, 32, 16, 0, TAU); g.stroke(); return;
      case 'call': g.strokeStyle = bone; g.lineWidth = 1.5; for (const r of [10, 17]) { g.beginPath(); g.arc(30, 40, r, -2.4, -0.7); g.stroke(); } return;
      case 'me': g.strokeStyle = bone; g.lineWidth = 2; g.fillStyle = PAL.soil; g.beginPath(); g.arc(30, 32, 11, 0, TAU); g.fill(); g.stroke(); line([[30, 32], [30, 12]], bone, 2); dot(19, 32, 3.5, hyc, false); dot(41, 32, 3.5, hyc, false); return;
      case 'crown': { const c = TREE_SPECIES.spruce.col[1], b = TREE_SPECIES.beech.col[1]; g.fillStyle = dark ? hsl(c[0], c[1], c[2] + 14) : hsl(c[0], c[1], c[2]); g.beginPath(); g.moveTo(18, 8); g.lineTo(30, 44); g.lineTo(6, 44); g.closePath(); g.fill(); g.fillStyle = dark ? hsl(b[0], b[1], b[2] + 10) : hsl(b[0], b[1], b[2]); g.beginPath(); g.arc(42, 30, 13, 0, TAU); g.fill(); return; }
      case 'mushroom': return;
      case 'rain': g.strokeStyle = dark ? 'rgba(180,200,230,0.9)' : 'rgba(40,60,90,0.9)'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) line([[12 + i * 7, 14 + (i % 2) * 8], [9 + i * 7, 26 + (i % 2) * 8]], g.strokeStyle, 1.5); for (let i = 0; i < 5; i++) line([[16 + i * 7, 38 + (i % 2) * 6], [13 + i * 7, 50 + (i % 2) * 6]], g.strokeStyle, 1.5); return;
      case 'snow': g.strokeStyle = bone; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line([[30 - Math.cos(a) * 16, 30 - Math.sin(a) * 16], [30 + Math.cos(a) * 16, 30 + Math.sin(a) * 16]], bone, 1.5); } return;
      case 'fog': for (let i = 0; i < 4; i++) line([[8 + (i % 2) * 6, 18 + i * 9], [52 - (i % 2) * 6, 18 + i * 9]], dark ? 'rgba(210,220,225,0.7)' : 'rgba(120,130,140,0.7)', 3); return;
      case 'drip': g.fillStyle = dark ? 'rgba(170,205,240,0.9)' : 'rgba(40,80,140,0.9)'; for (const [x, y, r] of [[20, 16, 3], [36, 26, 4], [26, 40, 3]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.moveTo(x - r, y); g.lineTo(x, y - r * 2.2); g.lineTo(x + r, y); g.fill(); } g.strokeStyle = g.fillStyle; g.lineWidth = 1; g.beginPath(); g.ellipse(30, 52, 12, 3, 0, 0, TAU); g.stroke(); return;
      case 'unload': { const c = TREE_SPECIES.spruce.col[1]; g.fillStyle = dark ? hsl(c[0], c[1], c[2] + 14) : hsl(c[0], c[1], c[2]); g.beginPath(); g.moveTo(24, 6); g.lineTo(40, 44); g.lineTo(8, 44); g.closePath(); g.fill(); g.fillStyle = bone; for (const [x, y] of [[44, 20], [48, 30], [44, 40], [50, 48], [46, 54]]) { g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); } return; }
      case 'melt': g.strokeStyle = dark ? '#8fc4ff' : '#2a64b8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(8, 14); g.bezierCurveTo(30, 18, 14, 36, 34, 40); g.bezierCurveTo(46, 43, 44, 52, 54, 54); g.stroke(); return;
      case 'seedfall': line([[8, 10], [52, 10]], dim, 2); g.fillStyle = PAL.spore; for (const [x, y] of [[16, 22], [30, 34], [42, 26], [22, 48]]) { g.beginPath(); g.ellipse(x, y, 4, 2.5, x, 0, TAU); g.fill(); } return;
      case 'leaffall': g.fillStyle = dark ? 'rgba(220,150,70,0.9)' : 'rgba(160,90,30,0.9)'; for (const [x, y, a] of [[18, 16, 0.5], [38, 26, -0.6], [24, 40, 1.2], [44, 48, 0.2]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 7, 3.5, 0, 0, TAU); g.fill(); g.restore(); } return;
      case 'storm': g.strokeStyle = bone; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(8, 18 + i * 12); g.bezierCurveTo(24, 10 + i * 12, 34, 26 + i * 12, 52, 16 + i * 12); g.stroke(); } return;
      case 'windthrow': line([[8, 44], [50, 36]], dark ? '#9a7a60' : '#5f4632', 5); g.fillStyle = dark ? 'rgba(140,105,65,0.8)' : 'rgba(90,65,40,0.8)'; g.beginPath(); g.ellipse(10, 38, 6, 12, 0, 0, TAU); g.fill(); return;
      case 'drought': g.strokeStyle = PAL.spore; g.lineWidth = 2; g.beginPath(); g.arc(30, 28, 9, 0, TAU); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line([[30 + Math.cos(a) * 13, 28 + Math.sin(a) * 13], [30 + Math.cos(a) * 18, 28 + Math.sin(a) * 18]], PAL.spore, 2); } return;
      case 'thunder': g.fillStyle = PAL.spore; g.beginPath(); g.moveTo(34, 6); g.lineTo(20, 32); g.lineTo(30, 32); g.lineTo(24, 54); g.lineTo(42, 24); g.lineTo(31, 24); g.closePath(); g.fill(); return;
      case 'frost': line([[30, 56], [30, 6]], dark ? '#9a7a60' : '#5f4632', 7); line([[29, 14], [32, 22], [28, 30], [32, 40]], bone, 1.5); return;
      case 'browse': line([[30, 54], [30, 30]], dark ? '#9a7a60' : '#5f4632', 2); g.fillStyle = dark ? hsl(110, 45, 50) : hsl(110, 45, 35); for (const [x, y] of [[24, 40], [36, 36], [28, 46]]) { g.beginPath(); g.ellipse(x, y, 5, 3, 0.4, 0, TAU); g.fill(); } line([[26, 28], [34, 28]], PAL.alarm, 2); return;
    }
  }
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
  const t = { id: Date.now(), name: `${state.seed.name} ${String(n).padStart(2, '0')}`, created: d.toISOString(), seedCode: state.seed.code, seedName: state.seed.name, tuning: state.seed.tun.name, forestAge: Math.round(world.t), stage: STAGES[world.stage][0], clock: fmtClock(world.clockH), month: MONTHS[world.month], dur: rec.frames / rec.sr, sr: rec.sr, peaks, blob, mode: state.mode ? 'speakers' : 'binaural' };
  rec.chunks = [];
  await db.put(t); takes.unshift(t); renderLib(); selectTake(t.id);
  setStatus(`Saved “${t.name}” (${fmtTime(t.dur)}, ${(blob.size / 1048576).toFixed(1)} MB).`);
}
function fmtTime(s) { const m = Math.floor(s / 60), ss = s - m * 60; return `${String(m).padStart(2, '0')}:${ss.toFixed(1).padStart(4, '0')}`; }

// ---------------------------------------------------------------- archive (IndexedDB, falls back to memory)
const db = {
  h: null, mem: { takes: [], forests: [] }, opened: null,
  open() {
    if (this.opened) return this.opened;
    this.opened = (async () => { try { this.h = await new Promise((res, rej) => { const r = indexedDB.open('understory', 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('takes')) d.createObjectStore('takes', { keyPath: 'id' }); if (!d.objectStoreNames.contains('forests')) d.createObjectStore('forests', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')); }); } catch (e) { this.h = null; } })();
    return this.opened;
  },
  tx(store, mode) { return this.h.transaction(store, mode).objectStore(store); },
  async all(store = 'takes') { if (!this.h) return this.mem[store].slice(); try { return await new Promise((res, rej) => { const r = this.tx(store, 'readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); } catch (e) { return this.mem[store].slice(); } },
  async put(t, store = 'takes') { this.mem[store] = this.mem[store].filter(x => x.id !== t.id); if (!this.h) { this.mem[store].push(t); return; } try { await new Promise((res, rej) => { const r = this.tx(store, 'readwrite').put(t); r.onsuccess = res; r.onerror = () => rej(r.error); }); } catch (e) { this.mem[store].push(t); setStatus(store === 'takes' ? 'This browser would not store the take; it is kept until you close the page. Save it now.' : 'This browser would not store the forest; it lives until you close the page.'); } },
  async del(id, store = 'takes') { this.mem[store] = this.mem[store].filter(x => x.id !== id); if (!this.h) return; try { await new Promise((res) => { const r = this.tx(store, 'readwrite').delete(id); r.onsuccess = res; r.onerror = res; }); } catch (e) { } },
};
// ---------------------------------------------------------------- forests: saved and continued
let forests = [];
let saving = false;
function thumbnail() {
  try { const c = document.createElement('canvas'); c.width = 192; c.height = 120; const g = c.getContext('2d'); const sw = scene.cv.width, sh = scene.cv.height; const ar = 192 / 120; let w = sw, h = sw / ar; if (h > sh) { h = sh; w = sh * ar; } g.drawImage(scene.cv, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, 192, 120); return c.toDataURL('image/jpeg', 0.7); } catch (e) { return ''; }
}
async function saveForest(force) {
  if (!world || !state.forestId || saving) return;
  if (!force && !state.kept && world.t < 120) return;
  saving = true;
  try {
    const prev = forests.find(f => f.id === state.forestId);
    const { char, ...rest } = P;
    const rec = { id: state.forestId, name: state.forestName || (prev && prev.name) || state.seed.name, code: state.seed.code, created: prev ? prev.created : Date.now(), visited: Date.now(), age: world.t, stage: STAGES[world.stage][0], trees: world.trees.length, fungi: world.genets.size, thumb: thumbnail() || (prev && prev.thumb) || '', data: world.serialize(), P: JSON.parse(JSON.stringify(rest)), char: JSON.parse(JSON.stringify(char)), season: state.season, listener: { x: listener.x, y: listener.y, yaw: listener.yaw } };
    state.kept = true;
    await db.put(rec, 'forests');
    forests = [rec, ...forests.filter(f => f.id !== rec.id)].sort((a, b) => (b.visited || 0) - (a.visited || 0));
    renderForests();
  } finally { saving = false; }
}
function ago(ts) { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 36) return `${h} h ago`; return new Date(ts).toLocaleDateString(); }
function renderForests() {
  const box = $('forestList'); if (!box) return; box.innerHTML = '';
  $('keepBtn').hidden = !!forests.find(f => f.id === state.forestId);
  if (!forests.length) { box.innerHTML = '<div class="empty">No forests kept yet. Stay with this one for two minutes, or press Keep this forest.</div>'; return; }
  for (const f of forests) {
    const el = document.createElement('div'); el.className = 'forest'; const cur = f.id === state.forestId; el.setAttribute('aria-current', String(cur));
    el.innerHTML = `${f.thumb ? `<img alt="">` : '<div class="noimg"></div>'}<div><input class="fn" id="fn-${f.id}" aria-label="Forest name"><div class="fm"></div><div class="fa"></div></div>`;
    if (f.thumb) el.querySelector('img').src = f.thumb;
    const nm = el.querySelector('.fn'); nm.value = f.name;
    nm.addEventListener('change', async () => { f.name = nm.value.trim() || f.name; if (cur) { state.forestName = f.name; $('seedName').textContent = f.name; } await db.put(f, 'forests'); });
    el.querySelector('.fm').textContent = `${f.stage} · age ${fmtAge(f.age)} · ${f.trees} trees, ${f.fungi} fungi · seed ${f.code} · ${cur ? 'here now' : ago(f.visited)}`;
    const acts = el.querySelector('.fa');
    const B = (label, title, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.title = title; b.onclick = fn; acts.appendChild(b); return b; };
    if (!cur) B('Continue', 'Return to this forest', () => continueForest(f));
    const del = B('✕', 'Delete this forest', async () => {
      if (!del.dataset.arm) { del.dataset.arm = '1'; del.textContent = 'Delete?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.arm; del.textContent = '✕'; } }, 2500); return; }
      await db.del(f.id, 'forests'); forests = forests.filter(x => x.id !== f.id);
      if (cur) { state.forestId = null; await loadSeed(randomCode()); } else renderForests();
    });
    box.appendChild(el);
  }
}
let takes = [];
const player = { id: null, buf: null, src: null, startAt: 0, offset: 0, playing: false, gain: null };
async function loadArchive() { await db.open(); takes = (await db.all('takes')).sort((a, b) => b.id - a.id); renderLib(); if (takes[0]) selectTake(takes[0].id); }
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
    el.querySelector('.tm').title = `${t.seedName} · ${t.tuning} · ${t.mode}${t.stage ? ` · ${t.stage}, forest age ${fmtAge(t.forestAge)}, ${t.month} ${t.clock}` : ''}`;
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
  const manifest = takes.map(t => ({ file: `understory_${safeName(t.name)}_${t.seedCode}.wav`, name: t.name, created: t.created, seconds: +t.dur.toFixed(2), sampleRate: t.sr, bits: 24, channels: 2, seed: t.seedCode, forest: t.seedName, tuning: t.tuning, spatial: t.mode, stage: t.stage, forestAgeSeconds: t.forestAge, forestClock: t.clock, month: t.month }));
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
  if (world) for (const t of world.trees) if ((t.gen || t.type) === 'grain' && Math.random() < 0.6) audio.set(world.v.trees.get(t.id), { slot: 1 });
  logLine(`“${label}” is now in the soil. New fruit and bark voices grow from it.`, 'fruit');
}
async function sowFile(file) {
  try { const ctx = await audio.ensureCtx(); const buf = await ctx.decodeAudioData(await file.arrayBuffer()); await bufferToSoil(buf, file.name.replace(/\.[^.]+$/, '')); if (!state.running) setRunning(true); }
  catch (e) { setStatus('Could not read that file as audio.'); }
}
async function takeToSoil(t) { try { const buf = await decodeTake(t); await bufferToSoil(buf, t.name); } catch (e) { setStatus('Could not decode this take.'); } }

// ---------------------------------------------------------------- misc controls
function setHeight(h) {
  state.height = state.height === h ? 'ground' : h; updateOptionButtons(); sendGlobals();
  if (state.height === 'under') logLine('You sink into the soil among the hyphae. Signals pass close by; the world above is muffled through the earth.', 'touch');
  else if (state.height === 'canopy') logLine('You climb into the canopy. Birds and wind are close; the soil is far below.', 'touch');
  else logLine('You stand on the forest floor again.', 'touch');
}
function updateOptionButtons() {
  $('underBtn').setAttribute('aria-pressed', String(state.height === 'under')); $('canopyBtn').setAttribute('aria-pressed', String(state.height === 'canopy'));
  $('driftBtn').setAttribute('aria-pressed', String(state.drift)); $('rideBtn').setAttribute('aria-pressed', String(state.ride));
}
function rideStep(dt) {
  const w = world; let o = state.rideObj;
  const alive = o && (w.carbon.includes(o) || w.water.includes(o) || w.signals.includes(o) || w.critters.includes(o) || w.spores.includes(o));
  if (!alive) {
    state.rideObj = null; state.rideWait -= dt; if (state.rideWait > 0) return; state.rideWait = 1.5;
    const pool = [...w.critters.map(c => [c, c.kind === 'squirrel' ? 'the squirrel' : `a ${w.seed.cacher === 'nutcrackers' ? 'nutcracker' : 'jay'}`]), ...w.carbon.map(c => [c, 'sugar on its way between trees']), ...w.water.map(c => [c, 'water lifted from deep roots']), ...w.signals.filter(s => s.voice).map(s => [s, 'a spike train']), ...w.spores.filter(s => s.voice).map(s => [s, 'a drifting spore'])];
    if (!pool.length) return;
    pool.sort((a, b) => Math.hypot(a[0].x - listener.x, a[0].y - listener.y) - Math.hypot(b[0].x - listener.x, b[0].y - listener.y));
    const [obj, desc] = pool[Math.min(pool.length - 1, Math.floor(Math.random() * 2))]; state.rideObj = obj;
    logLine(`Riding along with ${desc}.`, 'touch'); return;
  }
  const dx = o.x - listener.x, dy = o.y - listener.y, d = Math.hypot(dx, dy);
  listener.x += dx * Math.min(1, dt * 2.2); listener.y += dy * Math.min(1, dt * 2.2);
  if (d > 0.05) { let a = Math.atan2(dx, dy) - listener.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); listener.yaw += a * Math.min(1, dt * 1.2); }
}
// walking: slow amble, walk and run, or a rhythm that moves between them
const GAITS = { slow: { v: 0.6, label: 'Amble' }, walk: { v: 1.35, label: 'Walk' }, run: { v: 3.3, label: 'Run' } };
const RHYTHM = [['slow', 25, 45], ['walk', 30, 60], ['run', 6, 14], ['walk', 20, 40]];
function setWalk(mode) {
  state.walkMode = mode; state.rhythmI = 0; state.gait = mode === 'rhythm' ? 'slow' : mode || 'slow'; state.gaitT = mode === 'rhythm' ? 30 : 1e9; state.walkH = listener.yaw;
  if (mode) { state.drift = false; state.ride = false; state.walk = null; }
  for (const b of document.querySelectorAll('#gaits button')) b.setAttribute('aria-pressed', String(b.dataset.g === (mode || 'stop')));
  updateOptionButtons();
  if (mode) logLine(mode === 'rhythm' ? 'You set off walking: ambling, walking, now and then running, then walking again.' : `You ${mode === 'run' ? 'run' : mode === 'walk' ? 'walk' : 'amble'} through the forest.`, 'touch');
}
function walkStep(dt) {
  if (state.walkMode === 'rhythm') { state.gaitT -= dt; if (state.gaitT <= 0) { state.rhythmI = (state.rhythmI + 1) % RHYTHM.length; const [g, a, b] = RHYTHM[state.rhythmI]; state.gait = g; state.gaitT = a + Math.random() * (b - a); } }
  const target = GAITS[state.gait].v; state.walkV += (target - state.walkV) * Math.min(1, dt * 0.7);
  // a meandering path that keeps inside the circle and steps around trunks
  let dh = (Math.random() * 2 - 1) * 0.5 * Math.sqrt(dt);
  const r = Math.hypot(listener.x, listener.y); if (r > PLOT_R - 4) { let a = Math.atan2(-listener.x, -listener.y) - state.walkH; a = Math.atan2(Math.sin(a), Math.cos(a)); dh += a * dt * 0.8; }
  for (const t of world.trees) { const d = Math.hypot(t.x - listener.x, t.y - listener.y); if (d < 1.6) { let a = Math.atan2(listener.x - t.x, listener.y - t.y) - state.walkH; a = Math.atan2(Math.sin(a), Math.cos(a)); dh += a * dt * 1.5 * (1.6 - d); } }
  state.walkH += dh;
  listener.x += Math.sin(state.walkH) * state.walkV * dt; listener.y += Math.cos(state.walkH) * state.walkV * dt;
  let a = state.walkH - listener.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); listener.yaw += a * Math.min(1, dt * 1.4);
}
function toggleMode() { state.mode = state.mode ? 0 : 1; $('modeBtn').textContent = state.mode ? 'Speakers stereo' : 'Headphones 3D'; sendGlobals(); }
function newSeed() { loadSeed(randomCode()); }

// ---------------------------------------------------------------- main loop
let last = 0, hudT = 0, globT = 0, lastAdvance = 0, mediaT = 0, guideT = 0;
// the living part of a frame; it also runs from the audio clock while the screen is off
function advance(dt) {
  lastAdvance = performance.now();
  if (!world) return;
  if (state.running) {
    let sdt = dt * P.time; while (sdt > 0) { const s = Math.min(0.08, sdt); world.step(s); sdt -= s; }
    listener.yaw += P.spin * 0.25 * dt;
    const k = state.keys || new Set(); const fx = Math.sin(listener.yaw), fy = Math.cos(listener.yaw);
    let mx = 0, my = 0; if (k.has('w')) { mx += fx; my += fy; } if (k.has('s')) { mx -= fx; my -= fy; } if (k.has('d')) { mx += fy; my -= fx; } if (k.has('a')) { mx -= fy; my += fx; }
    if (k.has('q')) listener.yaw -= 1.2 * dt; if (k.has('e')) listener.yaw += 1.2 * dt;
    if (mx || my) { listener.x += mx * 3 * dt; listener.y += my * 3 * dt; state.walk = null; }
    if (state.walkMode) walkStep(dt);
    else if (state.drift && !state.ride) driftStep(dt);
    if (state.ride) rideStep(dt);
    if (state.walk) {
      const dx = state.walk.x - listener.x, dy = state.walk.y - listener.y, d = Math.hypot(dx, dy);
      if (d < 0.2) state.walk = null; else { const sp = Math.min(d, (state.drift ? 0.8 : 2.4) * dt); listener.x += dx / d * sp; listener.y += dy / d * sp; if (state.drift) { let a = Math.atan2(dx, dy) - listener.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); listener.yaw += a * 0.25 * dt; } }
    }
    const r = Math.hypot(listener.x, listener.y); if (r > PLOT_R + 3) { listener.x *= (PLOT_R + 3) / r; listener.y *= (PLOT_R + 3) / r; }
  }
  listener.z += (HEIGHTS[state.height] - listener.z) * Math.min(1, dt * 0.9);
  world.frameVoices();
  audio.post({ t: 'lis', x: listener.x, y: listener.y, z: listener.z, yaw: listener.yaw });
  globT += dt; if (globT > 2) { globT = 0; sendGlobals(); }
  mediaT += dt; if (mediaT > 30) { mediaT = 0; updateMediaSession(); }
  audio.flush();
}
function hiddenTick() { const dt = Math.min(1, (performance.now() - lastAdvance) / 1000); if (dt > 0.02) advance(dt); }
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
  if (world) {
    advance(dt);
    cam.tx += (listener.x - cam.tx) * 0.08; cam.ty += (listener.y - cam.ty) * 0.08;
    if (state.follow) { let a = listener.yaw - cam.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); cam.yaw += a * 0.12; }
    if (scene.brush && (scene.brush.t -= dt) <= 0) scene.brush = null;
    draw(ts);
  }
  hudT += dt; if (hudT > 0.25) { hudT = 0; updateHud(); if (world && (state.tool === 'plant' || state.tool === 'sow' || state.tool === 'gather') && (world.pouchV !== state.pouchV || (state.tool === 'gather' && Math.random() < 0.15))) buildToolOpts(); }
  guideT += dt; if (guideT > 1.5) { guideT = 0; renderGuide(); }
  drawMeter();
  if (state.recording) $('rtime').textContent = fmtTime((performance.now() - rec.t0) / 1000);
  if (player.playing || hudT === 0) drawPlayer();
  requestAnimationFrame(frame);
}
// lock-screen controls, like a music player
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !world) return;
  try {
    const art = thumbnail();
    navigator.mediaSession.metadata = new MediaMetadata({ title: state.forestName || 'Understory', artist: 'Understory', album: `${STAGES[world.stage][0]} · ${MONTHS[world.month]}`, artwork: art ? [{ src: art, sizes: '192x120', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.playbackState = state.running ? 'playing' : 'paused';
  } catch (e) { }
}
function initMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) { } };
  set('play', () => setRunning(true)); set('pause', () => setRunning(false)); set('stop', () => setRunning(false));
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
async function boot() {
  readPalette();
  const mq = window.matchMedia('(prefers-color-scheme: light)'); mq.addEventListener && mq.addEventListener('change', readPalette);
  new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  scene.cv = $('scene'); scene.g = scene.cv.getContext('2d'); resize(); new ResizeObserver(resize).observe(scene.cv);
  buildTools(); buildSliders(); initInput();
  $('grow').onclick = () => setRunning(!state.running); $('hintGrow').onclick = () => setRunning(true);
  initGuide();
  $('newSeed').onclick = newSeed; $('rec').onclick = toggleRec; $('modeBtn').onclick = toggleMode;
  $('seedCode').onclick = async () => { const c = state.seed.code; try { await navigator.clipboard.writeText(c); setStatus(`Seed code ${c} copied.`); } catch (e) { setStatus(`Seed code: ${c}`); } };
  buildHappenings();
  $('rideBtn').onclick = () => { state.ride = !state.ride; state.rideObj = null; state.rideWait = 0; if (state.ride) { state.drift = false; state.walk = null; if (state.walkMode) setWalk(null); } updateOptionButtons(); };
  $('underBtn').onclick = () => setHeight('under'); $('canopyBtn').onclick = () => setHeight('canopy');
  const gb = $('gaits'); for (const [g, l, t] of [['stop', 'Stand', 'Stop walking'], ['slow', 'Amble', 'Walk slowly'], ['walk', 'Walk', 'Walk at an easy pace'], ['run', 'Run', 'Run through the forest'], ['rhythm', 'Rhythm', 'Amble, walk, run now and then, walk again']]) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.g = g; b.textContent = l; b.title = t; b.setAttribute('aria-pressed', String(g === 'stop')); b.onclick = async () => { if (!state.running && g !== 'stop') await setRunning(true); setWalk(g === 'stop' ? null : g); }; gb.appendChild(b); }
  $('resetShape').onclick = () => { for (const l in P.char) for (const k in P.char[l]) P.char[l][k] = 0; P.change = 0.5; refreshSliders(); logLine('Every layer is back to the forest’s own character.', 'drift'); };
  $('keepBtn').onclick = async () => { state.kept = true; await saveForest(true); setStatus(`${state.forestName} is kept in Forests.`); };
  $('sowBtn').onclick = () => $('sowFile').click(); $('sowFile').onchange = (e) => { const f = e.target.files[0]; if (f) sowFile(f); e.target.value = ''; };
  $('driftBtn').onclick = () => { state.drift = !state.drift; state.walk = null; state.driftT = 0; if (state.drift) { state.ride = false; if (state.walkMode) setWalk(null); } updateOptionButtons(); };
  $('centreBtn').onclick = () => { state.walk = { x: 0, y: 0 }; state.drift = false; state.ride = false; if (state.height !== 'ground') setHeight(state.height); updateOptionButtons(); };
  $('calmBtn').onclick = () => { audio.post({ t: 'calm' }); logLine('Calm: reverb tails cleared, fading back in.', 'weather'); };
  $('followBtn').onclick = () => { state.follow = !state.follow; $('followBtn').setAttribute('aria-pressed', String(state.follow)); if (!state.follow) cam.yaw = 0; };
  $('zoomIn').onclick = () => { cam.dist = Math.max(10, cam.dist / 1.2); }; $('zoomOut').onclick = () => { cam.dist = Math.min(80, cam.dist * 1.2); };
  $('pPlay').onclick = togglePlay; $('pSave').onclick = () => { const t = takes.find(x => x.id === player.id); if (t) saveTake(t); };
  $('pwave').addEventListener('click', seekPlayer); $('saveAll').onclick = saveAll;
  $('season').onchange = (e) => setSeason(e.target.value); timeNote();
  requestAnimationFrame(frame);
  // forests are kept in this browser; open the one you were in, or a new one
  await db.open();
  forests = (await db.all('forests')).sort((a, b) => (b.visited || 0) - (a.visited || 0));
  const h = (location.hash || '').replace('#', '').toUpperCase();
  const byCode = /^[A-Z0-9]{4,10}$/.test(h) ? forests.find(f => f.code === h) : null;
  if (byCode) await continueForest(byCode);
  else if (/^[A-Z0-9]{4,10}$/.test(h)) await loadSeed(h);
  else if (forests.length) await continueForest(forests[0]);
  else await loadSeed(randomCode());
  loadArchive(); initSaver();
  setInterval(() => { if (state.running) saveForest(); }, 20000);
  initMediaSession();
  setInterval(() => { if (document.hidden) hiddenTick(); }, 1000);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    if (state.running && audio.ctx && audio.ctx.state !== 'running') { try { await audio.ctx.resume(); } catch (e) { } if (audio.el && audio.el.paused) { try { await audio.el.play(); } catch (e) { } } }
    // if the browser froze the page, the forest catches up on the time it missed
    const gap = (performance.now() - lastAdvance) / 1000;
    if (state.running && gap > 60) { const story = await liveThrough(gap, false); lastAdvance = performance.now(); if (story) logLine(story, 'stage'); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveForest(); });
  window.addEventListener('pagehide', () => saveForest());
}
boot();
