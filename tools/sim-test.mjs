// Runs the ecology headless for 15 simulated minutes and prints its state.
import { loadSim } from './load.mjs';
const S = loadSim();
const codes = process.argv.slice(2).length ? process.argv.slice(2) : ['ABC234','MOSS77','LARCH9'];
for (const code of codes) {
  const seed = S.makeSeed(code);
  let spawned = {}, live = new Set(), id = 1;
  const audio = { ready: true, spawn(k,p){ spawned[k]=(spawned[k]||0)+1; const i=id++; live.add(i); if(p.dur) setTimeout(()=>{},0); return i; }, set(){}, rel(i){ live.delete(i); }, alive(i){ return live.has(i); }, move(){} };
  const logs = [];
  const w = new S.World(seed, audio, { log: (t,c)=>logs.push(c) });
  let t0 = Date.now(); const mt = Date.now(); S.makeMaterial(seed, 48000); const matMs = Date.now()-mt;
  console.log(`\n${code}: ${seed.name} ${seed.mood} | ${seed.tun.name} | root ${seed.root.toFixed(1)} | ${seed.matParams.fams} | trees ${seed.nTrees} species ${seed.species.length} | mat ${matMs}ms`);
  let maxStep = 0;
  for (let s = 0; s <= 900*20; s++) {
    // emulate voice expiry
    if (s % 40 === 0) for (const i of [...live]) if (Math.random() < 0.15) live.delete(i);
    const a = Date.now(); w.step(0.05); w.frameVoices(); maxStep = Math.max(maxStep, Date.now()-a);
    if (s % (120*20) === 0) {
      const sug = w.trees.map(t=>t.sugar.toFixed(1)).join(' ');
      const Dmax = Math.max(0,...[...w.edges.values()].map(e=>e.D));
      console.log(`t=${(s*0.05).toFixed(0).padStart(4)} trees ${w.trees.length} [${sug}] genets ${w.genets.size} edges ${w.edges.size} nodes ${w.nodes.size} tips ${w.tips.length} sig ${w.signals.length} fruit ${w.fruits.length} spores ${w.spores.length} litter ${w.litter.length} Dmax ${Dmax.toFixed(2)} moist ${w.moist.toFixed(2)} light ${w.light.toFixed(2)} gE [${[...w.genets.values()].map(g=>g.energy.toFixed(1)).join(' ')}]`);
    }
  }
  const cnt = {}; for (const l of logs) cnt[l]=(cnt[l]||0)+1;
  console.log('events', JSON.stringify(cnt), 'stats', JSON.stringify(w.stats), 'spawns', JSON.stringify(spawned), 'maxStep', maxStep+'ms', 'total', (Date.now()-t0)+'ms');
}
