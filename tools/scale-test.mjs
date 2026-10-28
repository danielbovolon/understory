// A large, shaped forest: 64 trees and 128 fungi on painted ground. Checks speed, crowding and place-dependence.
import { loadSim } from './load.mjs';
const S = loadSim();
const live = new Set(); let id = 1;
const audio = { ready: true, spawn() { const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } };
const w = new S.World(S.makeSeed('BIGONE'), audio, { now: new Date(2026, 8, 20, 11, 0, 0) });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
// shape the ground: a bog in the west, a stony ridge in the east, rich soil in the south
for (let k = 0; k < 25; k++) { w.paint(-12, 0, 'wet'); w.paint(12, 4, 'stone'); w.paint(12, 4, 'dry'); w.paint(0, -12, 'rich'); }
for (let k = 0; k < 4; k++) w.addLog(-3 + k * 3, 8);
w.updateCover(0);
const westBest = w.bestTree(-12, 0, S.TREE_KEYS), eastBest = w.bestTree(12, 4, S.TREE_KEYS);
console.log('best for the bog:', westBest, '· best for the ridge:', eastBest, '·', w.placeInfo(-12, 0).text, '|', w.placeInfo(12, 4).text);
ok(['alder'].includes(westBest) || S.TREE_SPECIES[westBest].wet > 0.6, 'wet ground favours wet-loving trees');
ok(S.TREE_SPECIES[eastBest].stone >= 0.6, 'stony ridge favours stone-tolerant trees');
// plant 32 trees in rings, letting the place decide the species
let planted = 0; for (let ring = 1; ring <= 6 && planted < 80; ring++) for (let k = 0; k < ring * 8; k++) { const a = k / (ring * 8) * Math.PI * 2 + ring * 0.3, r = ring * 3.1; if (w.plantAt(Math.sin(a) * r, Math.cos(a) * r) === true) planted++; }
ok(w.trees.length === S.MAX_TREES, `trees reach the cap of ${S.MAX_TREES} (${w.trees.length})`);
const sp = {}; for (const t of w.trees) sp[t.sp] = (sp[t.sp] || 0) + 1; console.log('species:', JSON.stringify(sp));
ok(Object.keys(sp).length >= 3, 'different places grow different species');
for (let i = 0; i < 200; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 19; w.inoculate(Math.sin(a) * r, Math.cos(a) * r, i % 3 === 0 ? S.FUNGI[i % S.FUNGI.length][0] : undefined); }
ok(w.genets.size === S.MAX_FUNGI, `fungi reach the cap of ${S.MAX_FUNGI} (${w.genets.size})`);
const gen = {}; for (const g of w.genets.values()) gen[g.sp.genus] = (gen[g.sp.genus] || 0) + 1; console.log('genera:', Object.keys(gen).length, JSON.stringify(gen).slice(0, 300));
let maxStep = 0, total = 0, n = 0, maxLoad = 0;
for (let s = 0; s < 30 * 60 * 20; s++) {
  if (s % 40 === 0) for (const i of [...live]) if (Math.random() < 0.15) live.delete(i);
  const t0 = performance.now(); w.step(0.05); w.frameVoices(); const d = performance.now() - t0; maxStep = Math.max(maxStep, d); total += d; n++;
  if (s % 20 === 0) maxLoad = Math.max(maxLoad, w.fgLoad());
}
console.log(`after 30 min: ${w.trees.length} trees (mean size ${w.meanSize().toFixed(2)}), ${w.genets.size} fungi, ${w.edges.size} hyphae, ${w.nodes.size} nodes, ${w.tips.length} tips, ${w.fruits.length} fruit; step avg ${(total / n).toFixed(2)} ms, max ${maxStep.toFixed(1)} ms; voices live ${live.size}`);
ok(total / n < 4, 'average step under 4 ms (24× runs 5 steps per frame)');
ok(maxLoad <= S.FG_MAX + 1, `foreground cap holds (${maxLoad})`);
const bonds = w.trees.reduce((a, t) => a + t.links.size, 0); ok(bonds > 20, `the large network is connected (${bonds} bonds)`);
const wrong = w.trees.some(t => [...t.links.keys()].some(gid => { const g = w.genets.get(gid); return g && !w.hostOk(g.sp, t); })); ok(!wrong, 'host specialists only partner their hosts');
const json = JSON.stringify(w.serialize()); ok(json.length < 2e6, `save size ${(json.length / 1024).toFixed(0)} KB`);
process.exit(fails ? 1 : 0);
