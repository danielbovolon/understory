// Loads the browser sources into Node for the offline tests.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

export function loadEngine(sampleRate = 48000) {
  let Proc = null; const messages = [];
  const Base = class { constructor() { this.port = { onmessage: null, postMessage: (m) => messages.push(m) }; } };
  new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', read('js/engine.js'))(sampleRate, Base, (n, c) => { Proc = c; });
  return { Proc, messages };
}
export function loadSim() {
  const module = { exports: {} };
  new Function('module', read('js/sim.js'))(module);
  return module.exports;
}
