// A forest left running for a long time keeps changing: old trees die, gaps open, new generations take over.
import { loadSim } from './load.mjs';
const S = loadSim();
const live = new Set(); let id = 1;
const audio = { ready: true, spawn() { const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } };
const w = new S.World(S.makeSeed(process.argv[2] || 'LONGRUN'), audio, { now: new Date(2026, 4, 20, +(process.argv[4] || 9), 0, 0) });
const born = new Set(), died = new Set(); const mix = () => { const m = {}; for (const t of w.trees) m[t.sp] = (m[t.sp] || 0) + 1; return m; };
const HOURS = +(process.argv[3] || 24), first = []; let worst = 0, prevAlive = null;
for (let h = 1; h <= HOURS; h++) {
  for (let s = 0; s < 3600 * 4; s++) { w.step(0.25); for (const t of w.trees) born.add(t.id); }
  const alive = new Set(w.trees.map(t => t.id)); for (const b of born) if (!alive.has(b)) died.add(b);
  if (h === 3) first.push(...alive);
  if (prevAlive && prevAlive.size >= 6) worst = Math.max(worst, [...prevAlive].filter(i => !alive.has(i)).length / prevAlive.size); prevAlive = alive;
  if (h % 3 === 0) console.log(`hour ${h}: ${w.trees.length} trees ${JSON.stringify(mix())}, ${w.genets.size} fungi, ${w.snags.length} snags, ${died.size} died so far`);
}
const still = first.filter(i => w.trees.some(t => t.id === i)).length;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
ok(died.size > 3, `trees die and are replaced over time (${died.size} died, ${born.size} lived)`);
ok(worst < 0.5, `no sudden collapse (at most ${Math.round(worst * 100)}% of trees lost in one hour)`);
ok(w.trees.length > 4, `the forest persists (${w.trees.length} trees)`);
ok(still < first.length, `the forest of hour 3 has changed (${still} of ${first.length} trees remain)`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
