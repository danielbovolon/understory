// Offline stress test for js/engine.js: runs the worklet in Node with
// random, extreme and moving voices and checks for NaN, clipping and CPU.
import { loadEngine } from './load.mjs';
const SR = 48000;
const { Proc, messages } = loadEngine(SR);
const sandbox = { _msgs: messages };
const seconds = Number(process.argv[2] || 20);
let rng = 12345; const R = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

function run(label, cfg) {
  const p = new Proc();
  const send = (m) => p.port.onmessage({ data: m });
  const mat = new Float32Array(SR * 4); for (let i = 0; i < mat.length; i++) mat[i] = Math.sin(i * 0.03) * 0.5 + (R() - 0.5) * 0.4;
  send({ t: 'mat', slot: 0, data: mat }); send({ t: 'mat', slot: 1, data: mat });
  send({ t: 'g', mode: cfg.mode, depth: cfg.depth, wet: cfg.wet, master: cfg.master, layers: [cfg.lay, cfg.lay, cfg.lay, cfg.lay, cfg.lay], rev: { size: cfg.size, rt: cfg.rt, damp: 0.5, pre: 0.04 } });
  send({ t: 'fade', to: 1, time: 0.01 });
  let id = 1; const live = new Set();
  const out = [new Float32Array(128), new Float32Array(128)];
  let resets = 0, nvs = 0; let peak = 0, nan = 0, sumsq = 0, cnt = 0, clipped = 0;
  const blocks = Math.round(seconds * SR / 128);
  const t0 = performance.now();
  for (let b = 0; b < blocks; b++) {
    if (b % 20 === 0) {
      const spawns = cfg.dense ? 6 : 2;
      for (let s = 0; s < spawns; s++) {
        const k = (R() * 6) | 0; const ex = cfg.extreme;
        const P = {
          gain: ex ? 2 : 0.2 + R() * 0.4, layer: (R() * 5) | 0, att: ex ? 0.001 : 0.01 + R(), rel: ex ? 0.005 : 0.1 + R() * 2,
          dur: k === 1 || k === 5 ? (R() < 0.5 ? 0 : 1 + R() * 4) : 0, send: ex ? 2 : R(), x: (R() - 0.5) * 60, y: (R() - 0.5) * 60, z: (R() - 0.5) * 8,
          f: ex ? (R() < 0.5 ? 5 : 30000) : 40 + R() * 2000, r: [1, 2.1 + R(), 3.7, 6.1], d: ex ? [20, 20, 20, 20] : [0.5, 0.3, 0.2, 0.1], a: [1, 0.6, 0.4, 0.2],
          hard: R(), breath: ex ? 1 : R() * 0.3, bq: ex ? 100 : 2 + R() * 10, bright: ex ? 1 : R(), inh: ex ? 1 : R() * 0.5, det: 8,
          dens: ex ? 400 : 5 + R() * 40, size: ex ? 0.002 : 0.03 + R() * 0.3, pitch: ex ? 8 : 0.5 + R(), ps: [1, 1.5, 2], pj: 0.2, scan: 0.05, lp: R(),
          rate: ex ? 500 : 2 + R() * 20, q: ex ? 40 : 3 + R() * 10, jit: 0.3, f0: 200 + R() * 3000, f1: 200 + R() * 3000, mr: 1 + R() * 3, mi: ex ? 20 : R() * 3, n: 1 + (R() * 8) | 0, isi: 0.05 + R() * 0.2, bd: 0.02 + R() * 0.05,
          bf: 100 + R() * 4000, drops: ex ? 200 : R() * 20, df: 2000, crk: ex ? 300 : R() * 10, gust: R(), prio: 1 + (R() * 3) | 0,
        };
        const i = id++; send({ t: 'spawn', id: i, k, p: P }); live.add(i);
      }
      // move everything
      const a = []; for (const i of live) a.push(i, (R() - 0.5) * 50, (R() - 0.5) * 50, (R() - 0.5) * 5);
      send({ t: 'pos', a: new Float32Array(a) });
      send({ t: 'lis', x: Math.sin(b / 300) * 10, y: Math.cos(b / 300) * 10, z: 1.6, yaw: b / 100 });
      // release some sustained voices
      for (const i of live) if (R() < 0.08) send({ t: 'rel', id: i, r: 0.3 });
      for (const i of live) if (R() < 0.05) send({ t: 'set', id: i, p: { strike: 1, hard: R(), flash: 1, f: 50 + R() * 500, inh: R() } });
    }
    out[0].fill(0); out[1].fill(0);
    p.process([], [out]);
    for (let c = 0; c < 2; c++) for (let i = 0; i < 128; i++) {
      const v = out[c][i]; if (!Number.isFinite(v)) nan++; const a = Math.abs(v); if (a > peak) peak = a; if (a > 0.985) clipped++; sumsq += v * v; cnt++;
    }
    for (const m of sandbox._msgs) { if (m.t === "reset") resets++; if (m.t === "m") nvs = Math.max(nvs, m.nv); } for (const m of sandbox._msgs) if (m.freed) for (const f of m.freed) live.delete(f);
    sandbox._msgs.length = 0;
  }
  const ms = performance.now() - t0;
  const rt = (ms / 1000) / seconds;
  const ok = nan === 0 && peak <= 0.981 && clipped === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} peak ${peak.toFixed(3)}  rms ${(Math.sqrt(sumsq / cnt)).toFixed(3)}  nan ${nan}  cpu ${(rt * 100).toFixed(1)}% of realtime  resets ${resets} maxvoices ${nvs}`);
  return ok;
}

let all = true;
all &= run('binaural, moderate', { mode: 0, depth: 1, wet: 0.35, master: 0.8, lay: 1, size: 1, rt: 3, dense: false, extreme: false });
all &= run('speakers, dense', { mode: 1, depth: 0.5, wet: 0.6, master: 1, lay: 1.5, size: 2, rt: 8, dense: true, extreme: false });
all &= run('extreme params, dense', { mode: 0, depth: 2.5, wet: 1.5, master: 1.5, lay: 2, size: 2.6, rt: 14, dense: true, extreme: true });
all &= run('all zero', { mode: 0, depth: 0.2, wet: 0, master: 0, lay: 0, size: 0.3, rt: 0.3, dense: false, extreme: false });
console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
