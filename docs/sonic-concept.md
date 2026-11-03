# The sonic concept of Understory

## Premise

Understory is a piece of **model-based sonification**: a generative composition whose score is a running ecological simulation. Nothing is sequenced or looped, and no sample library is used. Every sound has a cause in the model: a hypha that grows, a tree that trades sugar, a mushroom that drops its spores, a bat that hunts. The listener does not hear a soundtrack laid over a picture. The picture and the sound come from the same process.

The piece is organised the way soundscape ecology describes a real habitat. Bernie Krause divides a soundscape into **geophony** (wind, rain, water, snow), **biophony** (the voices of living things) and **anthropophony** (human noise, absent here except for the listener's own actions). Within the biophony, his **acoustic niche hypothesis** says that species in a mature habitat share the spectrum and the timeline so their signals don't mask each other. R. Murray Schafer's terms describe the hierarchy: **keynote** sounds (the steady ground of a place: crown wind, rain, the drone of the trees), **signals** (foreground events that ask for attention: an alarm, a cuckoo, a crack of frost) and **soundmarks** (the voices that make this forest different from any other).

Understory adds a layer no microphone can reach: the **mycorrhizal network** under the soil, the "wood-wide web". Its processes (electrical spike trains in hyphae, carbon flow between trees, the growth of hyphal tips) have no natural acoustic output that a person can hear. These are **translated**: their timing, quantity and topology are kept, and their outcome is given a sound by a rule that is stated openly.

## Layers

The mix is stratified into six layers. Each one has its own spectral region, typical event density and reverberation send, so that they interlock without masking each other: an acoustic niche structure built in deliberately.

- **Trees** — The keynote. Sustained, slowly evolving tones (additive drones, plucked strings, blown pipes) for each tree, plus crown wind. Mostly the low and low-mid register, with a high reverb send that places them in the room.
- **Signals** — Electrical activity in the mycelium. Short modal impulses (struck bars, plucked threads, small pipes) where a spike train reaches a node, phrased in short trains of a few spikes. The mid and upper-mid register, dry and precise.
- **Growth** — Hyphal tips extending. Sparse, very short ticks and grains at the growing edge, close to the ground. A texture, not a melody.
- **Fruit** — Mushrooms and spores. Granular clouds while a mushroom emerges; spore discharge as tiny ballistic clicks; a faint shimmer above bioluminescent fungi at night.
- **Weather** — The geophony: wind, rain on needles or on leaves, canopy drip, snow unloading, meltwater, thunder, frost cracks. A broadband layer that also changes how every other layer is heard.
- **Fauna** — The biophony above ground: songbirds, owl, cuckoo, woodpecker, bats, bumblebees, crickets, deer, fox, boar, squirrels. Each is restricted to its real season, time of day and habitat.

Each layer has a level fader in the app and responds to the "lean" controls. The forest keeps mutating around those settings.

## Pitch and tuning

Every forest seed draws its own **tuning system**. It can be just intonation (5–7 pure ratios), a segment of the harmonic series (harmonics 8–15, 10–19, 12–23 or 16–31), an equal division of the octave other than 12 (5, 7, 9, 10, 11, 13, 15, 17, 19 or 22 steps), the **Bohlen–Pierce** scale (13 steps of the tritave 3:1, no octave), a golden-ratio spiral, slendro- and pelog-like Javanese gamelan tunings with natural deviation, and, for about a third of forests, one of seven further systems: a maqam-like scale with neutral thirds, just pentatonic modes, an otonal (harmonics 8–14) or utonal (undertone) row, quarter-comma meantone, a septimal Wilson-style scale, or Wendy Carlos's alpha steps of 78 cents, which repeat at the fifth rather than the octave.

Every pitched voice is placed on a degree of that tuning above a root of 38–96 Hz. Species and fungal genera take fixed degree offsets and registers, so each has a recognisable intervallic identity inside the shared scale. Over long listening the **tonal centre drifts** to closely related keys (by 9:8, 6:5, 5:4, 4:3 or 3:2), and every voice glides there over minutes. This is a compositional layer, not biology, and it is the main reason the forest never settles into a loop.

## Synthesis

All sound is synthesised in real time in an **AudioWorklet** (64 voices; 24 on phones). Nine generator types are chosen for physical plausibility, not decoration:

- **Modal synthesis** — Banks of damped resonators tuned to the inharmonic mode ratios of struck wood, metal, glass or stone. Used for signals, cones and nuts landing, frost cracks and canopy drops. Damping and mode spread follow the material.
- **Additive drones** — Partials with slow detuning, tremolo and breath noise. The sustained voice of most trees, and also the wingbeat hum of bumblebees.
- **Granular synthesis** — Grains drawn from procedurally generated "field recordings" of bark, water and soil. Bark-voiced trees and emerging mushrooms; a sound you sow yourself feeds the grain source.
- **Karplus–Strong plucked strings** — A delay line with a filtered feedback loop. Damping, brightness and pick position come from the tree's genotype. Trees that sound like taut threads.
- **Blown resonance** — Noise and tone exciting two resonant filters. Hollow, flute-like trees; the cuckoo; the fox's bark and the vixen's scream.
- **Ticks** — Peak-normalised filtered impulse trains with jitter and bursts. Hyphal tips, spore discharge, leaf fall, a squirrel stripping a cone.
- **FM chirps** — Fast frequency sweeps. Birdsong, owl calls and bat echolocation (see below).
- **Shaped noise** — Band-passed noise with gusts and crackle. Wind, rain, thunder, snow sliding off a branch, the roe deer's bark.
- **Formant voice** — Two band-limited (polyBLEP) saw waves through a pair of vowel formants that drift slowly from one vowel to another. Reed-organ and choir forests, and the buzzing of wings when the formants are high and a fast tremolo beats them.

**Physical-to-timbral mapping.** A tree's voice is not fixed. Its partial spread, brightness, vibrato and damping change with **age** (young trees are brighter and higher, old trees darker and slower), **wetness** (wetter ground damps high partials), **stone** (stony ground gives harder attacks), **nutrients**, **drought stress** (a stressed tree loses partials and becomes rough), and **mycorrhizal partners** (a connected tree gains beating partials, "voices joined"). A drought-stressed tree's xylem clicks are real: cavitation emits ultrasonic acoustic emissions, here transposed into the audible range.

## Individuality and heredity

Sound identity has four nested levels:

1. **The seed** — Every forest is played by its own **ensemble** (see below) and blends two of six **sound worlds** (wood, glass, string, breath, metal, earth), which set material, mode ratios and generator preference.
2. **The species** — Every tree species is voiced after its wood and crown: dense beech and oak ring low and long, light birch and aspen bright and short, conifers through needles, so higher and more airy.
3. **The individual** — Every tree carries a **genotype** (inharmonicity, brightness, detuning, vibrato, tremolo rate, partial jitter, filter Q, pick position, formant), and every fungal colony is a mutated copy of its parent.
4. **The lineage** — Seed inherits its parent's genotype with mutation. A lineage that drifts far enough and adapts to its ground becomes a named **local variety** or **local form**, with a voice that exists only in that forest.

So no two trees sound alike, offspring sound related to their parents, and an old forest has a sonic ancestry you can follow by ear.

## Time

There are **two clocks**. The **sky clock** runs on real local time and date: sunrise and sunset, day length, temperature and season are those of today. The dawn chorus happens at your dawn, bats hunt at your dusk, and frost cracks come on your coldest nights. The **biological clock** is compressed: growth, succession and fruiting that take decades in a real forest are scaled to hours and days, because otherwise nothing would visibly happen in a human lifetime. The Time control speeds or slows the sky, from a quarter of real speed up to 24× (one forest day per hour); at 1× it follows your real clock.

Event rates within a moment are kept close to nature. Cuckoo calls are paced at about one per second, a bat's search calls at about 10 per second accelerating into a feeding buzz, cricket chirp rate follows **Dolbear's law** (temperature), and the fox calls in its real breeding season. When you are away, the forest catches up on the elapsed time in coarse steps and tells you what changed.

**Frequency division for inaudible signals.** Bats echolocate at 20–110 kHz, and drought-stressed xylem emits clicks at 100–1000 kHz. As a bat detector does, Understory divides these frequencies by about ten to bring them into hearing while keeping their rhythm and sweep shape.

## Space

The listener stands in the forest. **Binaural rendering** (headphones) is built from geometry, not from a generic HRTF:

- **Interaural time difference** — Each ear reads the voice from its own delay line at distance ÷ speed of sound, with the ears 17.5 cm apart. ITD and **Doppler shift** follow from movement automatically.
- **Interaural level difference and head shadow** — The far ear is attenuated and low-pass filtered, more steeply at high frequencies.
- **Front/back and elevation cues** — Spectral darkening behind and below the head.
- **Distance** — Roughly inverse-distance level loss, plus **air absorption** modelled as a distance-dependent low-pass filter.
- **Direct-to-reverberant ratio** — The reverb send rises with distance, so far sounds are more diffuse: the most important natural cue for depth.
- **Room** — An 8-line **feedback delay network** reverb whose size, RT60, damping and pre-delay are drawn per forest: a dense young spruce stand is short and bright, an old beech hall long and dark.

The environment changes the acoustics as it does in nature. **Snow cover** absorbs highs and shortens reverberation. **Fog** with its temperature inversion bends sound back to the ground, so distant sources carry further and brighter. **Under the soil** everything above ground is heavily low-passed and the hyphal layer comes close. **In the canopy** birds and wind are near and the ground recedes. On speakers, the same model renders as constant-power stereo panning.

## Composition

Underneath the events runs a score, so the forest unfolds as a piece rather than a scatter of sounds.

- **Pulse and metre** — Every place has a slow pulse: around 44 beats a minute at the treeline, 50 in spruce, 56–60 in beech and fir, up to 66 in warm oak and riverside forests. The metre is three, four or five. Spike trains, pings, the meeting of roots and fungi, trades and grafts fall on the eighth notes of that pulse; growing tips pulse at multiples of it.
- **Harmony** — A chord progression is built from the forest's own tuning by stacking every other degree, whatever the tuning: just intonation, a harmonic series, an unusual equal temperament, Bohlen–Pierce or a gamelan scale. Each chord lasts two or four bars. Every pitched voice gravitates to the nearest tone of the current chord, so the trees' drones glide when the harmony moves and the network answers in the same chord.
- **Form** — Passages of 8, 12 or 16 bars follow an arc: build, peak, release, rest. The passage sets how often the network speaks and how present it is, so there are full stretches and quiet ones, and the forest breathes on a scale of minutes. Over hours, the slow drift of the tonal centre carries the whole piece into related keys.

## Every forest its own voicebook

Beyond its tuning and sound worlds, every forest draws a **voicebook**: for each kind of event it decides which gesture sounds, in which material and register. The gestures are:

- **Knock** — Two short struck resonances, the second answering the first.
- **Plucked pair** — Two plucked strands a tuning interval apart.
- **Swell** — A breathy tone rising and handing over to a second.
- **Glissando** — A rapid frequency-modulated slide from one pitch to the other.
- **Bell** — One long modal tail, with a faint pre-strike.
- **Whistle** — A narrow band of noise, like air through a knot hole.
- **Rattle** — A dense burst of resonant ticks.
- **Dyad** — Two sustained partials sounding together and fading.
- **Grains** — A short cloud of grains from the forest's own field recording.
- **Pulse** — A triple strike, the last on the second pitch.

The events that use them:

- **Roots meeting a fungus** — The fungus's pitch and the tree's pitch, joined by the forest's bond gesture. Each fungal genus meets roots in one of three ways, so a Russula sounds its bonds differently from a Suillus in the same forest.
- **Fusion and clash** — A hypha fusing with its own individual sounds a consonant interval; two strangers meeting and walling off sound a dissonant one (a semitone, tritone or major seventh).
- **Trade, root grafts, sugar and water** — Each has its own gesture or carrier: sugar may travel as a breathy tone, a sustained partial, a tremolo string, a chirp train or a bell; water at night as drops, a gurgle, ticks or glassy drops.
- **Drought clicks, signals, spores and fruit** — Clicks take the forest's resonator family and range; spike trains its frequency-modulation colour and glide; spores and fruiting grains its own register and density.
- **Arrivals** — When a spike train reaches a tree's root tips, the fungus's pitch is handed to the tree's in the forest's arrival gesture; a damage signal arrives in a dissonant interval. Sugar and water delivered to a tree end in a soft gesture of their own, low for sugar, higher and wetter for water.
- **A spore touching down** — A tiny, high tap in the forest's own resonator. A real spore weighs picograms and lands without a sound, so this is a translation, and only about one landing in five sounds, so a spore cloud settles like fine rain.
- **A mushroom collapsing** — A soft, damp settling as a rotting fruit body falls in.
- **A snag falling** — A real, audible event: wood fibres creak and crack in a quickening run, and two seconds later the trunk hits the ground with a deep thud and a burst of broken twigs, beside where it stood.

The place colours the draw. Cold, high and rocky places lean to glass, ice and stone, with brighter, longer tails. Wet, low places lean to membrane, bark and breath, with damped tails, because water and wet wood absorb high frequencies. Limestone rings harder than peat. Fifteen resonator families are available (wood, marimba, glass, bell, string, membrane, stone, bamboo, bark, hollow, plate, shell, ice and their blends), so two forests rarely share a palette.

## Every forest its own ensemble

On top of its voicebook, every seed is played by one of sixteen **ensembles**, with a little of a second one leaking in. The ensemble decides which instruments the network's events become, and so how the whole forest sounds:

- **Thumb-piano grove** — Strikes become short plucked tongues with kalimba and vibraphone overtones; quick, in sixes, with echoing figures.
- **Reed organ** — Tree drones become reeds through slow vowels; strikes partly become blown pipes; slow and in four.
- **Gamelan clearing** — Stretched, gong-like overtones, long tails, a strong sympathetic body, sixteenth-note patterns that interlock with their echoes.
- **Woodblock clockwork** — Claves and seed pods, short and hard, fast in four with tight patterns.
- **Choir of hollows** — Drones become voices on u, o and a; strikes become breath; very slow, wet and wide.
- **Buzzing wings** — High vowels beaten by a fast tremolo; leaf and wire resonators; in threes and sixes.
- **Glass harmonica** — Strikes become rubbed glass; very long and soft attacks, an octave up.
- **Log drums** — Drum and membrane modes an octave down, swung patterns in four, six or seven.
- **Harp of roots** — Nearly everything plucked, with arpeggiated echoes that walk up the scale.
- **Dust and tape** — Dense small grains, some reversed, dark and loose in time.
- **Stone xylophone** — Compressed (sub-harmonic) slab modes, hard, in five or seven.
- **Bowed metal** — Strongly stretched plate and gong modes, very resonant formants, a ringing body.
- **Water organ** — Pipes and blown tones on u and o, slightly swung.
- **Pizzicato frost** — Short, very bright plucks and ice, an octave up and fast.
- **Deep drone** — Everything an octave down, very slow, one beat at a time.
- **Music box** — High chimes and tines with long echo figures.

What an ensemble sets:

- **Timbre** — Whether a strike stays a struck resonator or becomes a plucked string or a blown pipe; whether a tree drone becomes a formant voice; the inharmonicity of every resonator (its overtones are stretched or compressed by an exponent); the ring time, hardness and brightness; the FM ratios of spike trains; grain size, density and reversal; the Q and register of ticks.
- **Register** — Network voices may sit an octave above or below the trees.
- **Resonance** — A **sympathetic body**: four tuned comb resonators on the reverb send, tuned to the forest's own scale and damped by snow, ringing along with everything that passes, like the open strings of a viola d'amore or the hollow of a log. Some ensembles have almost none, gamelan and bowed metal a lot.
- **Rhythm** — Tempo (from about 25 to 130 beats a minute, scaled from the place's pulse), metre (two to eight), subdivision (whole beats, halves, threes or fours), swing, a **euclidean accent pattern** (three in eight, five in eight, seven in sixteen and so on) on which most events wait, and **echo figures**: a ping may repeat on the pulse, stepping up or down the scale and dying away.
- **Harmony** — The chord shape stacked on the progression: triads, sevenths, open fifths, fourths or clusters.

The place biases which ensemble grows there: cold places lean to glass, frost and music box; wet ones to choir, water organ and log drums; limestone to stone xylophone and gamelan; warm, dry ones to buzzing wings, kalimba and clockwork. The description under the forest's name says which ensemble plays it, its tempo and metre.

## Clean sound on every device

Fast grains are read from band-limited copies of the forest's field recording (one per octave of playback speed), so spores and high fruit never fold their highs back down as aliasing. Spike-train FM keeps every sideband below Nyquist. On phones the voice pool is smaller (24), the picture is drawn at half rate and lower resolution so the audio thread never starves, and after a call, an alarm or a change of headphones the sound engine restarts itself once, at the phone's current sample rate.

## Soft by default, crisp in moments

The mycelium and the mushrooms are the most constant voices in the forest, so most of the time they speak softly. Growing tips sound as sparse, tonal droplets instead of fast clicks. Spike trains use a gentler frequency modulation and longer bursts. Struck sounds are softer and lower; spores drift as quiet breaths; the soil's crackle and the mushrooms' grain clouds are low-passed and thinned. Rattles, grain clouds and whistles give way to pulses, dyads and swells.

The crisp, detailed textures return in **moments**: when rain arrives, after a storm, when a flush of mushrooms comes up, when you touch the network, and now and then on their own for a minute or so. They fade in and out over several seconds, so the forest breathes between calm and close attention, as a real one does after rain.

## Settings from the place

With every new seed, every setting of the sound engine starts from the conditions of its place. Only the master volume and the choice of headphones or speakers stay as you set them.

- **Distance** — From the openness of the stand. Wide-spaced treeline, dry-pine and bog stands let sound travel; dense spruce and alder close it in.
- **Reverb level and room** — From the forest's measured structure: the long tail of a tall beech hall, the short, damped decay of dense conifers.
- **Change** — From continentality: dry, high, inner-alpine places swing more than wet lowland ones.
- **Layer levels** — Signals from soil moisture; growth from the length of the growing season; fruit from moisture and rain; weather from wind exposure and rain; fauna from the biodiversity of the community (riparian and warm broadleaf forests richest, the treeline poorest).
- **Layer character** — Productive stands grow tall and sound lower and darker; cold air is brighter; spike trains run faster in warmth; open stands place animals farther away and widen the weather.

"Back to this place", "Let the forest decide" and a double-click on any control return to these values. A forest you return to keeps the settings you left it with.

## Density and level

A forest with 64 trees and 128 fungal colonies could produce thousands of events a minute. A **foreground budget** of about 14 simultaneous signal-type sounds, plus per-category quotas and a priority scheme, keeps the texture readable: rare and meaningful events (alarms, animal calls, frost) win over routine ones (ticks, drips). Distant, low-priority events are dropped before near ones. This is a direct implementation of the acoustic niche idea: masking is avoided by scheduling, not by turning everything down.

The master is mixed for listening, not loudness. A mature forest sits around **−23 dBFS RMS** with peaks near −8 dBFS. The look-ahead limiter is a safety device that should almost never act, so transients and dynamics stay intact.

## What is literal and what is translated

- **Literal sound sources** (synthesised, not recorded) — Wind, rain, canopy drip, snow, thunder, frost cracks, seed and leaf fall, meltwater, all animals. Their timing, season, time of day and habitat follow field biology.
- **Real but inaudible, made audible** — Bat echolocation and xylem cavitation, both frequency-divided.
- **Real processes, sonified by rule** — Electrical spike trains in hyphae, carbon and water flow through the network, hyphal growth, mycorrhizal partnerships, alarm signalling after wounding. The timing and topology are modelled from published research; the sound is a mapping.
- **Compositional** — The tuning systems, the tonal drift and the choice of sound worlds. They give each forest an identity and keep long listening open.

## Could it be like seeing a real forest?

In part, and that is the aim of the event layer. Everything above ground that a real forest does audibly can be translated almost literally, as long as its causes are modelled: rain makes the canopy drip afterwards; ripe seed falls in its season; snow loads branches until they unload; bats come out only on warm, dry summer nights; bumblebees work willow catkins in March and rowan in June. The more causes the model holds, the more the forest **behaves** rather than **plays**. Understory now holds most of the common audible processes of a temperate mountain forest.

What can't be literal is the time scale of growth (compressed, as in time-lapse), and the underground network, which has no natural sound. It stays a translation, but one where every sound you hear corresponds to something that actually happened in the model at that moment, in that place.
