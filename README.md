# Understory

**A mycorrhizal sound forest that grows around you.** Every forest begins as bare soil under the real sky of the hour you open it: wind, the soil, a few seeds on the flower of life. Over about an hour a forest grows in its own tuning.
- **Seedlings** germinate one by one.
- **Fungal spores** blow in on the wind and wrap the young roots.
- **Trade:** trees and fungi trade carbon for nutrients.
- **Signals and water:** sugar, water and electrical signals move through the hyphae.
- **Fruit:** mushrooms appear after rain, and their spores drift past you and grow into new, mutated individuals.

You hear all of it in 3D. The system runs on its own, and you can walk through it, touch it, wound it, plant in it and cut it.

It uses the Web Audio API and an AudioWorklet engine, with no build step and no dependencies. It runs in any current desktop browser.

![signal flow](docs/signal-flow.svg)

---

## Run it

```bash
git clone https://github.com/<you>/understory.git
cd understory
python3 -m http.server 8080        # or: npm run dev
# open http://localhost:8080
```

Serve the page over `http(s)`, because browsers refuse to load AudioWorklets from `file://`. Use headphones: the default spatial mode is binaural.

### Deploy to GitHub Pages
Push to `main`, and the workflow in `.github/workflows/pages.yml` publishes the repository root. You only need to turn it on once, under **Settings → Pages → Source: GitHub Actions**.

### Single-file build
```bash
npm run build      # → dist/understory.html (self-contained) and dist/artifact.html (for claude.ai artifacts)
```

### Tests
```bash
npm test           # engine stress test: random, dense and extreme voices; checks NaN, ceiling, CPU
npm run test:sim   # succession run headless for an hour per seed, printed every 5 minutes
npm run test:mix   # ecology + engine together offline; loudness per 10 s (add a layer index 0–4 to solo it)
```

---

## Time and succession

- **The sky** follows your real clock and date at 1×, computed for an Alpine valley (46.5° N): sunrise, sunset, temperature, night.
- **Time** runs from 0.25× to 24×; at 24× a forest day lasts an hour. **Season** swaps today's date for May, July, October or January.
- **Growth** is compressed so a forest matures in about an hour at 1×. Sound always plays in real time.

| Stage | Typically at 1× | You hear |
|---|---|---|
| Bare soil | 0 min | wind and the soil |
| Germination | ~0.5 min | thin single tones as seedlings appear, an octave up |
| First partners | ~1–6 min | spores drifting in; the first growing tips ticking; root bonds ringing |
| Network | ~5–15 min | signals travelling, sugar gliding between trees, trades at the roots |
| Young forest | ~25 min | fuller trees with more partials; the first mushrooms after rain |
| Closing canopy | ~40 min | late-stage fungi; decomposers; foxfire shimmer at night |
| Old growth | ~60 min | hub trees, thick cords, the full soundscape |

## How it lives

The biology behind each part, with sources, is in [docs/how-it-lives.md](docs/how-it-lives.md). In short:

| Part | What happens | What you hear |
|---|---|---|
| **Trees** | They germinate from a seed bank, make sugar in daylight, shade each other, and grow with sugar, nutrients and water. They drop seedlings of their own kin. | A drone or bark-grain voice in the seed's tuning that gains partials and loudness as it grows. Thirsty trees click (Khait 2023). |
| **Fungal succession** | Early-stage genera arrive first on the wind, late-stage genera under a canopy, decomposers on litter. Spores germinate only near roots or litter. | New voices enter the mix over the hour. |
| **Exploration types** | Contact, short-, medium- and long-distance body plans (Agerer), from dense mats to thick, fast rhizomorph cords. | From fine high ticks to deep, long chirps. |
| **Market** | Fungi forage nutrient patches and deliver to trees. Trees pay carbon in proportion to delivery, and more when nutrient-starved (Kiers 2011). | Soft tones at the roots when nutrients change hands. |
| **Water** | At night, deep-rooted trees pass water through the hyphae to dry seedlings (Querejeta 2003). | A liquid gurgle travelling through the dark. |
| **Hyphae** | Tips take a random walk, turn toward roots, branch, fuse with their own individual into loops (anastomosis) and bond to roots. Different individuals do not fuse. | The tips nearest you tick as they grow. When two individuals meet and wall off, you hear a crackle. |
| **Sugar** | It flows by pressure, from fed trees to shaded ones. Cords that carry it thicken, and unused cords wither and are recycled. | A warm tone travels along the cords and glides from the source tree's pitch to the receiving tree's pitch. |
| **Signals** | Nodes fire spike trains ("words") that travel along hyphae at walking pace and can make the next node fire. Activity rises after rain and in warmth (Fukasawa 2023). | Chirp trains move through space past you, and nodes ring in the species' resonator voice. |
| **Alarms** | A tree browsed by deer, or wounded by you, sends faster and harsher trains. Trees that receive them raise their defence. | The receiving trees grow rougher, brighter and start to tremble, then calm down over time. |
| **Fruit & spores** | Mushrooms are built from the hosts' recent sugar (Högberg 2001) and form at the colony edge after rain, most in autumn. Spores are flicked off by Buller's drop, lifted by the cap's evaporative updraft (Dressaire 2016) and carried on the wind. They can germinate into new, mutated individuals. | A granular bloom; tiny launch clicks; spores passing around you with doppler. |
| **Decomposers** | They break litter down into nutrient patches. Some glow in darkness under circadian control (Oliveira 2015). | A faint shimmer over the litter at night. |
| **Weather** | The real day and night, temperature, rain showers, drying soil, and wind that turns and gusts. | Rain falls around you, the wind circles, and the soil hums and crackles beneath you. |

### Seeds
Every seed is a different forest, and each one sets all of the following:
- a species pool: two early-stage and two late-stage ectomycorrhizal genera plus one decomposer, each with its own exploration type and genome
- the nutrient patches in the soil
- a tuning: just intonation, harmonic series, an equal temperament from 5 to 22 tones, the Bohlen–Pierce tritave, a golden-ratio spiral, or something like slendro or pelog
- a root note
- two generated nature recordings for the soil (knocked bark, rain on needles, a meltwater creek, wind in reeds, ice and glass, distant voices, stridulation, struck stones, a bowed branch, cave drips)
- the trees' partial sets
- the climate
- the reverb room

The seeds lie on the centres of the **flower of life**, which also lies on the forest floor. The seed code is in the URL hash (`#LARCH9`), so a link reopens the same forest.

### Space
- **Headphones 3D:** each ear reads every voice from its own delay line, at its distance to that ear divided by the speed of sound. Interaural time difference and doppler fall out of the geometry. Head shadow, darkening for sources behind and below, air absorption and a distance-dependent reverb send give direction and depth.
- **Speakers stereo:** equal-power panning, with the same distance and depth cues.
- **Distance** scales every distance you hear. **Autopan** turns your head continuously, so the whole field revolves around you. **Drift** lets the listener wander toward whatever is happening.

### Tools on the forest floor
| Key | Tool | Action |
|---|---|---|
| 1 | Listen | Drag the floor to turn, drag your head to walk, click the floor to walk there |
| 2 | Touch | Click a tree, node or hypha to fire a spike train |
| 3 | Wound | Click a tree to wound it: it sends an alarm |
| 4 | Plant | Click open ground to plant a seedling |
| 5 | Sow spores | Click to start a new, mutated fungal individual |
| 6 | Cut | Drag across hyphae to cut them; click a tree to fell it (it pours its sugar into the network as it dies) |

There are also buttons for **Call rain**, **Send deer** and **Sow a sound**. Sow a sound loads your own recording into the soil, and fruit and bark voices then grow from it. You can also drop an audio file on the forest.

### Archive
- **Record** captures the limiter output as 24-bit stereo WAV into the archive, which lives in this browser's IndexedDB. Each take remembers the seed, the stage, the forest's age and its clock time.
- The player shows the selected take as a waveform: click it to seek.
- **Save** downloads a take as WAV. **Save all as zip** bundles every take with `understory-manifest.json`, which records the seed, tuning and spatial mode of each take.
- **Soil** feeds a take back into the forest as material. **Regrow** plants that take's seed again.

Inside a claude.ai artifact, files go through the platform's save dialog, and WAVs arrive zipped because the dialog doesn't accept `.wav` directly.

---

## Stability by design
- Every filter in the engine is a zero-delay state-variable filter, which stays stable at any frequency and Q.
- 56 voices, with priority-based stealing: trees and weather are never replaced by passing signals.
- Signal cascades die out: there is a firing threshold, a refractory period and a hop limit, and a node passes a signal on with probability below 1.
- The master has a 4 ms look-ahead limiter at −1 dBFS and a hard ceiling at 0.98.
- A NaN or Inf anywhere resets all state and fades back in. **Calm** clears the reverb tails on demand.

`npm test` checks all of this offline.

## Keys
| Key | Action |
|---|---|
| Space | grow / pause |
| N | new seed |
| R | record / stop |
| H | headphones / speakers |
| 1–6 | tools |
| W A S D | walk |
| Q / E | turn |
| Shift-drag or right-drag | tilt the view |
| Wheel | zoom |

## Files
```
index.html                 page markup
css/understory.css         all styles (design tokens at the top, light and dark)
js/engine.js               AudioWorklet: voice pool, generators, 3D spatialiser, FDN reverb, limiter, recorder
js/sim.js                  sky, seeds, tunings, procedural materials, the ecology and its sound mapping
js/app.js                  interface, 3D view, input, recording, archive, file export
tools/build-standalone.mjs single-file build → dist/
tools/stress-test.mjs      offline engine stress test
tools/sim-test.mjs         headless ecology run
tools/mix-test.mjs         ecology + engine offline loudness check
tools/load.mjs             loads the browser sources into Node for the tests
docs/how-it-lives.md       the biology and how it maps onto the system
docs/signal-flow.svg       diagram
```

## Browser support
It runs in current Chrome, Edge, Firefox and Safari; AudioWorklet is required. Desktop is recommended. The interface works on a phone, but the engine is CPU-heavy (about a third of one core with all 56 voices).

## License
MIT © 2026 Daniel Bovolon. See [LICENSE](LICENSE).
