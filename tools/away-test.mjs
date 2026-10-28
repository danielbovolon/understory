// The forest keeps living while you are away: grows a forest, saves it, then
// lets 8 hours, 3 days and 30 days pass and checks speed, change and health.
import { loadSim } from './load.mjs';
const S = loadSim();
const mk = () => { const live = new Set(); let id = 1; return { ready: true, spawn() { const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } }; };
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const code = process.argv[2] || 'AWAY01';
const w = new S.World(S.makeSeed(code), mk(), { now: new Date(2026, 9, 20, 10, 0, 0) });
for (let i = 0; i < 40 * 60 * 20; i++) w.step(0.05);
const saved = JSON.stringify(w.serialize());
const mix = (x) => { const m = {}; for (const t of x.trees) m[t.sp] = (m[t.sp] || 0) + 1; return JSON.stringify(m); };
console.log(`before: ${w.trees.length} trees ${mix(w)}, ${w.genets.size} fungi, ${w.edges.size} hyphae, stage ${S.STAGES[w.stage][0]}, age ${(w.t / 3600).toFixed(2)} h`);
for (const [label, secs] of [['8 hours', 8 * 3600], ['3 days', 3 * 86400], ['30 days', 30 * 86400]]) {
  const w2 = new S.World(S.makeSeed(code), mk(), { now: new Date(2026, 9, 21, 7, 30, 0) });
  w2.loadState(JSON.parse(saved));
  const ids0 = new Set(w2.trees.map(t => t.id)), g0 = new Set(w2.genets.keys()), logs = [];
  w2.log = (m, c) => logs.push(c);
  const t0 = performance.now(); let steps = 0;
  for (const p of w2.catchUp(secs)) steps++;
  const ms = performance.now() - t0;
  const born = w2.trees.filter(t => !ids0.has(t.id)).length, died = [...ids0].filter(id => !w2.trees.some(t => t.id === id)).length;
  const gNew = [...w2.genets.keys()].filter(id => !g0.has(id)).length, gLost = [...g0].filter(id => !w2.genets.has(id)).length;
  const bonded = w2.trees.filter(t => t.links.size).length;
  console.log(`${label}: ${ms.toFixed(0)} ms · ${w2.trees.length} trees ${mix(w2)} (+${born} / −${died}) · ${w2.genets.size} fungi (+${gNew} / −${gLost}) · ${w2.edges.size} hyphae · ${bonded} trees with partners · stage ${S.STAGES[w2.stage][0]} · clock ${w2.clockH.toFixed(2)} h, ${S.MONTHS[w2.month]}`);
  ok(ms < 8000, `${label}: catch-up in ${(ms / 1000).toFixed(1)} s`);
  ok(Math.abs(w2.clockH - 7.5) < 0.3, `${label}: the sky ends at the real hour (${w2.clockH.toFixed(2)})`);
  ok(w2.trees.length >= 3, `${label}: the forest is alive (${w2.trees.length} trees)`);
  if (secs >= 86400) ok(born + died > 2, `${label}: the forest has changed (${born} born, ${died} died)`);
  ok(bonded >= Math.min(3, w2.trees.length) * 0.5, `${label}: trees keep fungal partners (${bonded})`);
  // and it keeps living in real time afterwards
  const a = mk(); w2.audio = a; for (let i = 0; i < 3 * 60 * 20; i++) w2.step(0.05);
  ok(Number.isFinite(w2.meanSize()) && w2.trees.length > 0, `${label}: lives on afterwards (${w2.tips.length} tips growing)`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
