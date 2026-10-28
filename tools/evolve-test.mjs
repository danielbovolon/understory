// The long life of a forest: gathering and planting from the pouch, mast years,
// newcomers that arrive when their niche opens, and new local forms over time.
import { loadSim } from './load.mjs';
const S = loadSim();
const mk = () => { const live = new Set(); let id = 1; return { ready: true, spawn() { const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } }; };
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const code = process.argv[2] || 'EVOLVE', logs = [];
const w = new S.World(S.makeSeed(code), mk(), { now: new Date(2026, 8, 25, 10, 0, 0), month: 8, log: (m, c) => logs.push([c, m]) });
ok(w.pouch.length >= 3, `starter pouch: ${w.pouch.map(p => `${p.n} ${p.kind} ${p.key}`).join(', ')}`);
for (let i = 0; i < 70 * 60 * 4; i++) w.step(0.25);
const mature = w.trees.filter(t => t.size >= S.SEED_INFO[t.sp].mature);
console.log(`after 70 min: ${w.trees.length} trees, ${mature.length} mature (${mature.map(t => t.sp + ' crop ' + (t.crop || 0).toFixed(1)).join(', ')}), ${w.genets.size} fungi, ${w.fruits.length} mushrooms`);
const inSeed = mature.find(t => (t.crop || 0) >= 1);
if (inSeed) { const r = w.gatherAt(inSeed.x, inSeed.y); ok(r.ok, 'gather seed: ' + r.msg); } else console.log('no tree in seed yet (fine in some seeds)');
w.startRain(300, 'user'); for (let i = 0; i < 20 * 60 * 4 && !w.fruits.some(f => f.phase !== 'emerge'); i++) w.step(0.25);
const ripe = w.fruits.find(f => f.phase !== 'emerge');
if (ripe) { const r = w.gatherAt(ripe.x, ripe.y); ok(r.ok, 'spore print: ' + r.msg); const r2 = w.gatherAt(ripe.x, ripe.y); ok(!r2.ok, 'only one print per mushroom: ' + r2.msg); } else console.log('no ripe mushroom found');
// plant from the pouch on open ground
let planted = 0, tries = 0; const n0 = w.trees.length;
while (planted < 3 && tries++ < 200) { const a = Math.random() * 6.28, d = 4 + Math.random() * 14; const r = w.plantFromPouch(Math.sin(a) * d, Math.cos(a) * d, 'best'); if (r === true) planted++; else if (r === 'empty') break; }
ok(planted > 0, `planted ${planted} seeds from the pouch`);
const g0 = w.genets.size; let sown = 0; for (let k = 0; k < 40 && sown < 2; k++) { const t = w.trees[k % w.trees.length]; if (w.sowFromPouch(t.x + 1.5, t.y + 0.5, 'best') === true) sown++; }
ok(sown > 0, `sowed ${sown} spore packets (${g0} → ${w.genets.size} fungi)`);
for (let i = 0; i < 25 * 60 * 4; i++) w.step(0.25);
ok(w.trees.length > n0 || logs.some(l => /did not come up/.test(l[1])), `planted seeds came up or failed honestly (${n0} → ${w.trees.length} trees)`);
// many days later
const t0 = performance.now(); for (const _ of w.catchUp(30 * 86400)); const ms = performance.now() - t0;
const arrived = Object.keys(w.arrived), forms = w.forms;
console.log(`30 days later (${(ms / 1000).toFixed(1)} s): ${w.trees.length} trees of ${new Set(w.trees.map(t => t.sp)).size} species, ${w.genets.size} fungi of ${new Set([...w.genets.values()].map(g => g.sp.genus + (g.sp.form || ''))).size} kinds`);
console.log('  newcomers:', arrived.join(', ') || 'none'); console.log('  new forms and varieties:', forms.map(f => f.name).join(', ') || 'none');
console.log('  seen:', Object.keys(w.seen).filter(k => /mast|arrival|form|variety/.test(k)).map(k => k + ' ' + w.seen[k]).join(', '));
ok(arrived.length >= 3, `species never seen arrived (${arrived.length})`);
ok(forms.length >= 1, `new local forms or varieties appeared (${forms.length})`);
ok(w.trees.length <= S.MAX_TREES && w.genets.size <= S.MAX_FUNGI, 'the caps hold');
ok(w.pouch.every(p => p.viab <= 1 && p.viab > 0), 'pouch viability stays sane');
const json = JSON.stringify(w.serialize()); const w2 = new S.World(S.makeSeed(code), mk(), {}); w2.loadState(JSON.parse(json));
ok(Object.keys(w2.arrived).length === arrived.length && w2.forms.length === forms.length && w2.pouch.length === w.pouch.length, `save keeps newcomers, forms and the pouch (${(json.length / 1024).toFixed(0)} KB)`);
for (let i = 0; i < 2 * 60 * 4; i++) w2.step(0.25); ok(w2.trees.length > 0, 'restored forest lives on');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
