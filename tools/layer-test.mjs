// Grows one forest, then renders each layer alone and the full mix: level, peaks and limiting per layer.
import { loadEngine, loadSim } from './load.mjs';
const S = loadSim(); const SR = 48000;
const code = process.argv[2] || 'RIVER4', grow = +(process.argv[3] || 180), secs = +(process.argv[4] || 40), hour = +(process.argv[5] || 9);
const seed = S.makeSeed(code);
const w = new S.World(seed, { ready: false, spawn() { return null; }, set() { }, rel() { }, alive() { return false; }, move() { } }, { log: () => { }, now: new Date(2026, 4, 15, hour, 30, 0) });
for (let i = 0; i < grow * 60 * 20; i++) w.step(0.05);
const state = JSON.stringify(w.serialize());
console.log(`${code} ${seed.name} · ${seed.sound.worlds.join(' + ')} · ${w.trees.length} trees (${[...new Set(w.trees.map(t => t.gen))].join('/')}), ${w.genets.size} fungi, size ${w.meanSize().toFixed(2)}`);
const NAMES = ['trees', 'signals', 'growth', 'fruit', 'weather', 'fauna', 'ALL'];
for (let L = 0; L < 7; L++) {
  const { Proc, messages: msgs } = loadEngine(SR); const p = new Proc(); const send = (m) => p.port.onmessage({ data: m });
  const live = new Set(); let nid = 1; const moves = [];
  const audio = { ready: true, spawn(k, q) { const id = nid++; live.add(id); send({ t: 'spawn', id, k, p: q }); return id; }, set(id, q) { if (live.has(id)) send({ t: 'set', id, p: q }); }, rel(id, r) { if (live.has(id)) send({ t: 'rel', id, r }); }, alive(id) { return live.has(id); }, move(id, x, y, z) { moves.push(id, x, y, z); } };
  const lay = [1, 1, 1, 1, 0.8, 0.9]; if (L < 6) for (let i = 0; i < 6; i++) lay[i] = i === L ? lay[i] : 0;
  send({ t: 'mat', slot: 0, data: S.makeMaterial(seed, SR) }); send({ t: 'mat', slot: 1, data: S.makeMaterial(seed, SR) });
  const rv = seed.rev; send({ t: 'g', mode: 0, depth: 1, wet: 0.45, master: 0.8, layers: lay, rev: { size: rv.size, rt: rv.rt, damp: rv.damp, pre: rv.pre } }); send({ t: 'fade', to: 1, time: 0.5 });
  const w2 = new S.World(seed, audio, { log: () => { }, now: new Date(2026, 4, 15, hour + Math.floor(grow / 60), 30, 0) }); w2.loadState(JSON.parse(state));
  const out = [new Float32Array(128), new Float32Array(128)]; let pk = 0, sq = 0, n = 0, gr = 1, nv = 0;
  for (let b = 0; b < secs * SR / 128; b++) {
    if (b % 6 === 0) { w2.step(6 * 128 / SR); w2.frameVoices(); send({ t: 'lis', x: 0, y: 0, z: 1.6, yaw: 0 }); if (moves.length) { send({ t: 'pos', a: new Float32Array(moves) }); moves.length = 0; } }
    p.process([], [out]);
    if (b > SR * 3 / 128) for (let c = 0; c < 2; c++) for (let i = 0; i < 128; i++) { const v = out[c][i]; pk = Math.max(pk, Math.abs(v)); sq += v * v; n++; }
    for (const m of msgs) { if (m.freed) for (const f of m.freed) live.delete(f); if (m.t === 'm') { gr = Math.min(gr, m.gr); nv = Math.max(nv, m.nv); } } msgs.length = 0;
  }
  console.log(`${NAMES[L].padEnd(8)} rms ${(20 * Math.log10(Math.sqrt(sq / n) + 1e-9)).toFixed(1).padStart(6)} dB  peak ${(20 * Math.log10(pk + 1e-9)).toFixed(1).padStart(6)} dB  limiter ${(20 * Math.log10(gr)).toFixed(1)} dB  voices ${nv}`);
}
