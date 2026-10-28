// Runs the ecology and the engine together offline and reports loudness.
import { loadEngine, loadSim } from './load.mjs';
const S = loadSim();
const SR = 48000; const { Proc, messages: msgs } = loadEngine(SR);
const code = process.argv[2] || 'MOSS77'; const secs = +(process.argv[3] || 120); const layerSolo = process.argv[4];
const p = new Proc(); const send = (m) => p.port.onmessage({ data: m });
const seed = S.makeSeed(code);
const live = new Set(); let nid = 1; const moves = [];
const audio = { ready: true, spawn(k, q) { const id = nid++; live.add(id); send({ t: 'spawn', id, k, p: q }); return id; }, set(id, q) { if (live.has(id)) send({ t: 'set', id, p: q }); }, rel(id, r) { if (live.has(id)) send({ t: 'rel', id, r }); }, alive(id) { return live.has(id); }, move(id, x, y, z) { moves.push(id, x, y, z); } };
const lay = [1, 1, 1, 1, 0.8, 0.9]; if (layerSolo !== undefined && layerSolo !== '-') for (let i = 0; i < 6; i++) lay[i] = i == layerSolo ? 1 : 0;
send({ t: 'mat', slot: 0, data: S.makeMaterial(seed, SR) }); send({ t: 'mat', slot: 1, data: S.makeMaterial(seed, SR) });
const rv = seed.rev; send({ t: 'g', mode: 0, depth: 1, wet: 0.45, master: 0.8, layers: lay, rev: { size: rv.size, rt: rv.rt, damp: rv.damp, pre: rv.pre } }); send({ t: 'fade', to: 1, time: 0.5 });
const pre = +(process.argv[5] || 0);
const w = new S.World(seed, audio, { log: () => { }, now: new Date(2026, 4, 15, 6, 30, 0) });
if (pre) { audio.ready = false; for (let i = 0; i < pre * 60 * 20; i++) w.step(0.05); audio.ready = true; console.log(`(grown silently for ${pre} min: ${w.trees.length} trees, mean size ${w.meanSize().toFixed(2)}, ${w.genets.size} fungi, ${w.edges.size} hyphae)`); }
const out = [new Float32Array(128), new Float32Array(128)];
let pk = 0, sq = 0, n = 0, gr = 1, maxv = 0; const rows = [];
const blocks = secs * SR / 128;
for (let b = 0; b < blocks; b++) {
  if (b % 6 === 0) { w.step(6 * 128 / SR); w.updateVoices && 0; w.frameVoices(); send({ t: 'lis', x: 0, y: 0, z: 1.6, yaw: 0 }); if (moves.length) { send({ t: 'pos', a: new Float32Array(moves) }); moves.length = 0; } }
  p.process([], [out]);
  for (let c = 0; c < 2; c++) for (let i = 0; i < 128; i++) { const v = out[c][i]; pk = Math.max(pk, Math.abs(v)); sq += v * v; n++; }
  for (const m of msgs) { if (m.freed) for (const f of m.freed) live.delete(f); if (m.t === 'm') { gr = Math.min(gr, m.gr); maxv = Math.max(maxv, m.nv); } } msgs.length = 0;
  if ((b + 1) % (SR * 30 / 128) === 0) { rows.push(`t=${((b + 1) * 128 / SR).toFixed(0).padStart(4)}s rms ${(20 * Math.log10(Math.sqrt(sq / n) + 1e-9)).toFixed(1)} dB peak ${(20 * Math.log10(pk + 1e-9)).toFixed(1)} dB  minGR ${(20 * Math.log10(gr)).toFixed(1)} dB voices ${maxv} light ${w.light.toFixed(2)} trees ${w.trees.length} size ${w.meanSize().toFixed(2)} fungi ${w.genets.size}`); pk = 0; sq = 0; n = 0; gr = 1; maxv = 0; }
}
console.log(code, seed.name, layerSolo !== undefined ? 'solo layer ' + layerSolo : ''); console.log(rows.join('\n'));
