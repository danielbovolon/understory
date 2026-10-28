# Changelog

## 5.0.0
- Every seed, species and individual has its own sound. Seeds blend two of six sound worlds; species are voiced after real wood and crown acoustics; every tree carries a genotype its seedlings inherit; voices follow age, ground, nutrients, partners and stress.
- Two new generators in the engine: a plucked strand (Karplus–Strong) and a blown resonator. Wind sounds in the nearest crowns: needles whistle (Aeolian tone), leaves flutter, dry winter leaves rattle.
- The forest lives on while you are away: up to 30 days of forest life are caught up in seconds when you return, with a short account of what changed.
- Mushrooms are drawn after their real genera (caps, rosettes, shelves, truffles, sclerotia), with colony rings and pins before fruiting; conifers are drawn as cones.
- Field guide: everything living in the forest, with what it does in nature and what it sounds like, and a map legend. Open an entry to find it on the map.
- Nothing covers the map: tools sit above it; clock, events and ground below it; tree names appear only under the pointer.
- Up to 64 trees and 128 fungal individuals. Decomposers and mycorrhizal fungi have separate room in the wild.
- Ecosystem: Warmth, Nitrogen, Seed rain, Spore rain and Grazing. Happenings: wild boar, bark beetles and fog, nine in all.
- Deer browse seedlings, fir and oak first. Crickets chirp at a rate set by the temperature (Dolbear's law).
- Lower levels: master gain down about 5 dB and resonant clicks normalised; the limiter no longer works on a mature forest.
- Footsteps removed.
- Large forests step about twice as fast (sugar flow, shading and stage checks).

## 4.1.0
- On phones, the clock, the happenings log and the underfoot description sit below the map instead of covering it.
- Background playback on phones: sound runs through a media element with a playback audio session, so it keeps going with the screen off. Play and pause on the lock screen (Media Session), showing the forest's name, stage and month.
- The forest keeps living while the screen is dark, driven by the audio clock.
- Tree lifespans by species: old trees lose vigour and die as snags, gaps open, and forests keep shifting over long runs.
- Continuous seed rain from the valley into open, lit ground; seedlings come up in the gaps old trees leave.
- Trees carry reserves through the night, and shade-tolerant species respire less under a canopy, so a crowded forest thins gradually instead of collapsing overnight.
- New `npm run test:longrun`: a forest run for many hours keeps turning over without collapsing.
- The opening text no longer predicts how the forest will grow.

## 4.0.0
- Up to 32 trees and 64 fungal individuals; hyphae, tips, signals, fruit, litter and nutrient patches scaled up; only the 14 most audible trees get a voice at once.
- A soil map for every place: wetness, fertility, acidity and stone, generated per seed (seep, ridge, patches) and paintable with the new Shape ground tool (Wet, Dry, Rich, Acid, Stone, Dead log).
- Eight tree species with niches, timbres and seasonal colours; deciduous phenology (budburst, autumn colour, bare winter), marcescent beech and oak; trees change the soil (needles acidify, alder enriches).
- 22 fungal genera with soil preferences, nitrogen sensitivity, host specificity and fruiting calendars; spore rain follows the calendar; plant and sow by species or let the place decide.
- Ground cover from light and soil: grass, moss, ferns, blueberry heath, sedge, lichen on stone, spring flowers; it smothers or shelters seedlings and softens sound.
- Colours of trees, fungi and ground shift with the season.
- Walk: Amble, Walk, Run, Rhythm, with footsteps that follow the surface.
- Underfoot description of the place you stand on and the place under the pointer.

## 3.0.0
- Six happenings, each brought by the forest in its season or called by you: rain/snow, deer, windstorm (creaking, broken branches, windthrow and gap regeneration), dry spell (drought clicks, night water, water-carrying fungi favoured), nutcrackers/jays (seed caching; forgotten caches sprout), squirrel (mycophagy: eats fungi, plants spores).
- Six ways to listen: Drift, Ride along (travel with sugar, water, signals, spores or animals), Under the soil (muffled world above), Into the canopy, Back to centre, Calm.
- Six layers with levels and two nudges each, including a new Birds & animals layer; nudges bias the forest without fixing it. Change control for the slow drift of the sound world (tonal centre glides to related keys, timbre tide, somatic drift of fungal voices).
- Birds and animals: dawn and dusk chorus that needs a canopy, owls, crickets, woodpeckers on standing dead wood, red deer rut; dead trees now stand as snags before they fall into litter.
- Seasons: snow cover that absorbs highs and reverb, frost cracks, spring growth flush, summer thunder, crickets and fireflies, autumn leaf fall.
- Forests are saved in the browser (autosave every 20 s and on leaving) and listed with thumbnails; continue any forest later; the page reopens the last one.
- Crowding cap on foreground sounds; gentler alarms; fewer simultaneous pings and signals.
- Larger slider and button touch targets on phones.

## 2.0.0
- Two clocks: the sky follows the real local clock and date (sun for 46.5° N, day length, temperature, season); Time runs 0.25×–24×; Season control.
- Every forest starts as bare soil and grows through seven stages over about an hour at 1×: seed bank germination on the flower of life, spore rain from upwind, early-stage then late-stage fungi, then decomposers.
- Exploration types (contact, short-, medium-, long-distance) shape growth, cords, signal speed, nutrient access and voice.
- Biological market: nutrient patches in the soil, delivery to trees, carbon paid in proportion to delivery, more below-ground carbon when trees are nutrient-starved, host-age preference, greedy genomes.
- Fruiting funded by the hosts' recent sugar; triggered by moisture, rain, cooling and season; at the colony margin (fairy rings); ballistospore clicks; evaporative updraft.
- Hydraulic redistribution at night: water packets from deep-rooted trees to seedlings through the hyphae.
- Drought and xylem clicks at measured rates (1/h to 35/h), transposed into hearing range.
- Electrical activity rises after rain and with temperature; nodes fire on nutrient discovery and fruit maturation.
- Decomposers turn litter into nutrient patches; luminous species glow at night and add a foxfire shimmer.
- Trees gain loudness and partials as they grow; seedlings start an octave up with a single partial.
- View: seeds, nutrient patches, water, glow and drought rings. HUD: clock, sun, temperature, stage, forest age. Takes record stage and age.

## 1.0.0
- New system, built from mycelium and forest biology: hyphal tip growth, branching, anastomosis, vegetative incompatibility, mycorrhizal bonds.
- Physarum-style transport: sugar flows by pressure, cords that carry it thicken, unused ones are pruned and recycled into litter.
- Electrical spike trains that travel along hyphae and make nodes fire; alarms from wounded or browsed trees raise defence in the trees that hear them.
- Fruiting after rain, spores on the wind in 3D, germination into new individuals with mutated genomes.
- Trees with a day/night sugar budget, shading, kin seedlings, hub trees, starvation, and a carbon release when they die.
- AudioWorklet engine: 56 voices (modal, drone, grain, tick, chirp, noise), per-voice 3D spatialiser with per-ear delay (ITD and doppler), head shadow, rear/below darkening, air absorption; speaker mode; 8-line FDN reverb; look-ahead limiter.
- Autopan, Drift, walking and turning; the view follows the head.
- Seeds: tuning system, root, two procedural soil materials, 1–3 fungal species, tree partials, climate and room; trees planted on the flower of life.
- Recording to 24-bit stereo WAV, in-browser archive with player, Save, Save all as zip with manifest, Soil (feed a take back in), Regrow.
- Offline tests: engine stress test, headless ecology run, ecology + engine loudness check.
