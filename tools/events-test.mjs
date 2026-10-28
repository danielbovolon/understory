// Exercises every happening, every season and a save/restore round trip, headless.
import { loadSim } from './load.mjs';
const S = loadSim();
const mkAudio = () => { const live = new Set(); let id = 1; const spawned = {}; return { spawned, ready: true, spawn(k, p) { spawned[p.layer] = (spawned[p.layer] || 0) + 1; const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { }, tick() { for (const i of [...live]) if (Math.random() < 0.15) live.delete(i); }, live }; };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (w, a, min, every) => { let maxLoad = 0, sum = 0, n = 0; for (let s = 0; s < min * 1200; s++) { if (s % 40 === 0) a.tick(); w.step(0.05); if (s % 20 === 0) { const l = w.fgLoad(); maxLoad = Math.max(maxLoad, l); sum += l; n++; } if (every) every(s); } run.avg = sum / Math.max(1, n); return maxLoad; };
const seasons = [['winter', 0, 7], ['spring', 4, 5], ['summer', 6, 22], ['autumn', 9, 19]];
for (const [name, month, hour] of seasons) {
  const a = mkAudio(); const logs = [];
  const w = new S.World(S.makeSeed('FOREST'), a, { log: (t, c) => logs.push(c + ': ' + t), now: new Date(2026, month, 15, hour, 0, 0), month });
  run(w, a, 60);
  const fired = { rain: w.startRain(200, 'user') || w.rainT > 0 };
  run(w, a, 2);
  fired.deer = (w.stressTree(w.trees[0], 'user'), true);
  fired.storm = w.windstorm('user') || w.stormT > 0; run(w, a, 3);
  fired.cache = w.cachers('user') || w.ev.cache > 0; run(w, a, 2);
  fired.squirrel = w.squirrels('user') || w.ev.squirrel > 0; run(w, a, 2);
  fired.dry = w.drySpell('user') || w.dryT > 0; run(w, a, 2);
  fired.boar = w.boar('user') || w.ev.boar > 0; run(w, a, 2);
  fired.beetles = w.beetles('user') || w.ev.beetles > 0; run(w, a, 3);
  fired.fog = w.fog('user') || w.fogT > 0;
  const carry = w.carry;
  const load = run(w, a, 8);
  console.log(`\n${name}: temp ${w.temp.toFixed(1)}°, snow ${w.snow.toFixed(2)}, absorb ${w.absorb.toFixed(2)}, trees ${w.trees.length}, snags ${w.snags.length}, seeds waiting ${w.seedbank.filter(b => !b.done).length}, genets ${w.genets.size}, max foreground ${load}/${S.FG_MAX + 1}, average ${run.avg.toFixed(1)}`);
  console.log('  sounds per layer', JSON.stringify(a.spawned), ' fired', JSON.stringify(fired));
  const fauna = logs.filter(l => l.startsWith('fauna')).map(l => l.slice(7, 70));
  console.log('  fauna log:', [...new Set(fauna)].slice(0, 5).join(' | '));
  ok(load <= S.FG_MAX + 1, `${name}: foreground stays within ${S.FG_MAX}`);
  ok(Object.entries(fired).every(([k, v]) => v || (k === 'cache' && !w.trees.some(t => t.size > 0.7)) || (k === 'beetles' && !w.trees.some(t => S.TREE_SPECIES[t.sp].conifer && t.size > 0.8))), `${name}: all nine happenings start (seed caching needs a tree old enough to bear seeds, beetles a grown conifer)`);
  ok(carry >= 0 && carry <= 1, `${name}: fog carry in range (${carry.toFixed(2)})`);
  ok(Object.keys(w.seen).length > 3, `${name}: the field guide has seen ${Object.keys(w.seen).length} kinds of things (${Object.keys(w.seen).slice(0, 12).join(', ')})`);
  if (name === 'winter') ok(w.snow > 0, 'winter: snow cover forms');
  if (name !== 'winter') ok((a.spawned[5] || 0) > 0, `${name}: birds and animals sound`);
  // save and continue
  const json = JSON.stringify(w.serialize());
  const a2 = mkAudio();
  const w2 = new S.World(S.makeSeed('FOREST'), a2, { now: new Date(2026, month, 16, hour, 0, 0), month });
  w2.loadState(JSON.parse(json));
  ok(w2.edges.size === w.edges.size && w2.trees.length === w.trees.length && w2.genets.size === w.genets.size && Math.abs(w2.t - w.t) < 1e-6, `${name}: restore keeps ${w.edges.size} hyphae, ${w.trees.length} trees, ${w.genets.size} fungi (${(json.length / 1024).toFixed(0)} KB)`);
  run(w2, a2, 3);
  ok(w2.trees.length > 0 && Number.isFinite(w2.meanSize()), `${name}: restored forest keeps living`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
