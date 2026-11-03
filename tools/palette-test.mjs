// Prints the ensemble, rhythm and tuning of a set of seeds and checks every voice the forest asks for is sound.
// usage: node tools/palette-test.mjs [N]
import { loadSim } from './load.mjs';
const S = loadSim(); const N = +(process.argv[2] || 300);
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let rs = 7; const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const code = () => Array.from({ length: 6 }, () => letters[(rnd() * letters.length) | 0]).join('');
const counts = {}, metres = {}, tunings = {};
for (let i = 0; i < N; i++) {
  const sd = S.makeSeed(code()), p = S.paletteOf(sd), vb = S.makeVoicebook(sd);
  counts[p.key] = (counts[p.key] || 0) + 1; metres[vb.score.meter + '/' + vb.score.sub] = (metres[vb.score.meter + '/' + vb.score.sub] || 0) + 1; tunings[sd.tun.name.split(',')[0]] = 1;
  if (i < 14) console.log(sd.code, sd.site.key.padEnd(10), (p.name + ' + ' + p.name2).padEnd(42), String(Math.round(vb.score.bpm)).padStart(3), 'bpm', (vb.score.meter + '/' + vb.score.sub).padEnd(4), vb.score.pattern.join(''), '|', sd.tun.name);
}
console.log('ensembles', counts); console.log('metres', metres); console.log('tunings', Object.keys(tunings).length);
const kinds = {}; let bad = 0;
for (const c of ['MOSS77', 'BSCVSY', 'ABC234', 'QW3RTY']) {
  const seed = S.makeSeed(c); const live = new Set(); let id = 1;
  const audio = { ready: true, spawn(k, p) { kinds[k] = (kinds[k] || 0) + 1; for (const [kk, v] of Object.entries(p)) if ((typeof v === 'number' && !isFinite(v)) || (Array.isArray(v) && v.some(x => !isFinite(x)))) { bad++; if (bad < 5) console.log('bad', k, kk, v); } const i = id++; live.add(i); return i; }, set() { }, rel(i) { live.delete(i); }, alive(i) { return live.has(i); }, move() { } };
  const w = new S.World(seed, audio, { log() { }, now: new Date(2026, 8, 15, 14) });
  for (let s = 1; s <= 20 * 60 * 15; s++) { if (s % 40 === 0) for (const i of [...live]) if (Math.random() < 0.15) live.delete(i); w.step(0.05); }
}
const names = Object.fromEntries(Object.entries(S.K).map(([a, b]) => [b, a]));
console.log('voices', Object.fromEntries(Object.entries(kinds).map(([k, v]) => [names[k], v])));
console.log(bad ? `FAIL ${bad} bad parameters` : 'PASS');
