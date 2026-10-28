// Runs the ecology headless and prints the succession, minute by minute.
// usage: node tools/sim-test.mjs [CODE ...] [--minutes 60] [--month 9] [--hour 14]
import { loadSim } from './load.mjs';
const S = loadSim();
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const codes = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const minutes = opt('minutes', 60), month = opt('month', 9), hour = opt('hour', 14);
for (const code of (codes.length ? codes : ['ABC234', 'MOSS77'])) {
  const seed = S.makeSeed(code);
  const live = new Set(); let id = 1; const spawned = {};
  const audio = { ready: true, spawn(k) { spawned[k] = (spawned[k] || 0) + 1; const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } };
  const logs = []; const now = new Date(2026, month, 15, hour, 0, 0);
  const w = new S.World(seed, audio, { log: (t, c) => logs.push([w ? w.t : 0, c, t]), now });
  console.log(`\n${code}: ${seed.name} | ${seed.tun.name} | pool: ${seed.species.map(s => `${s.genus}(${s.stage},${s.expl}${s.lum ? ',glows' : ''})`).join(' ')}`);
  let maxStep = 0, sigs = 0; const t0 = Date.now();
  for (let s = 1; s <= minutes * 60 * 20; s++) {
    if (s % 40 === 0) for (const i of [...live]) if (Math.random() < 0.15) live.delete(i);
    const a = Date.now(); w.step(0.05); maxStep = Math.max(maxStep, Date.now() - a); sigs += 0;
    if (s % (5 * 60 * 20) === 0) {
      const g = [...w.genets.values()].map(g => `${g.sp.genus[0]}${g.sp.genus[1]}:e${g.energy.toFixed(1)}n${g.nut.toFixed(2)}`).join(' ');
      console.log(`${String(s / 1200).padStart(3)}min ${String(Math.floor(w.clockH)).padStart(2)}:${String(Math.floor(w.clockH % 1 * 60)).padStart(2, '0')} T${w.temp.toFixed(0)}° L${w.light.toFixed(2)} M${w.moist.toFixed(2)}${w.rainT > 0 ? ' RAIN' : ''} | ${S.STAGES[w.stage][0].padEnd(14)} trees ${w.trees.length} size ${w.meanSize().toFixed(2)} bonds ${w.trees.reduce((a, t) => a + t.links.size, 0)} sug ${(w.trees.reduce((a,t)=>a+t.sugar,0)/Math.max(1,w.trees.length)).toFixed(2)} nut ${(w.trees.reduce((a,t)=>a+t.nut,0)/Math.max(1,w.trees.length)).toFixed(2)} | fungi ${w.genets.size} [${g}] | hyphae ${w.edges.size} tips ${w.tips.length} fruit ${w.fruits.length} litter ${w.litter.length}`);
    }
  }
  const cnt = {}; for (const l of logs) cnt[l[1]] = (cnt[l[1]] || 0) + 1;
  console.log('first events:'); for (const l of logs.slice(0, 14)) console.log(`  ${(l[0] / 60).toFixed(1).padStart(5)}min  ${l[2]}`);
  console.log('counts', JSON.stringify(cnt), 'stats', JSON.stringify(w.stats), 'spawns', JSON.stringify(spawned), 'maxStep', maxStep + 'ms', 'total', (Date.now() - t0) + 'ms');
}
