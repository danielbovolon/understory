# How it lives

Understory is built from what is known about fungal networks and forests. Where the science is disputed, the system leaves the behaviour to emerge instead of hard-coding it.

## Hyphal growth
Mycelium grows at its tips. A tip moves forward, wanders a little, turns toward chemical cues such as root exudates, and branches behind its apex.
- **In the system:** every tip takes a persistent random walk. It is steered toward root zones its individual has not reached yet, toward decaying litter, and away from the plot edge. It branches with a species-specific rate and angle.
- **Death:** tips die of age or when they leave the plot. A starving individual slows down and stops branching.

## Anastomosis and incompatibility
Hyphae of the same individual fuse when they meet. That closes loops and makes the network resilient. Hyphae of genetically different individuals reject each other and form barrier zones.
- **Fusion:** a tip that touches its own network splits the hypha it hits at that point and joins it. The node rings softly.
- **Rejection:** a tip that touches a stranger stops, with a short crackle.

## Mycorrhizal bonds
Fungi colonise roots and trade nutrients for the tree's sugar.
- A tip that reaches a root zone bonds the fungus to that tree.
- The tree's drone takes on a partial from the bond, so the tree slowly changes its timbre as it gains partners.

## Transport and adaptation
Studies of cord-forming fungi (Bebber, Fricker, Boddy and others) show that networks reinforce the links that carry resources and let the others regress. The result is a balance between efficient transport and resilient loops. The Physarum transport model (Tero et al.) captures the same idea in equations.
- **Flow:** tree sugar sets the pressure at tree nodes, and junction pressures relax to the conductance-weighted mean of their neighbours. Flow on each hypha is its conductance divided by its length, times the pressure difference.
- **Adaptation:** conductance grows with flow (a saturating function) and decays without it. Hyphae that thin out below a threshold are pruned, and their matter returns to the soil as litter.
- **Tax:** the fungus keeps a share of whatever moves through it, which feeds its growth and fruiting.

## Carbon between trees
Simard's 1997 field experiment found carbon moving between birch and Douglas fir through shared fungal connections.
- Later claims are disputed. A 2023 review (Karst, Jones and Hoeksema) found little peer-reviewed evidence that mature "mother trees" preferentially feed their offspring, and only thin evidence that networks are widespread or that transfer measurably helps seedlings.
- **So in Understory:** sugar moves only because pressure differs. Shaded seedlings are sinks and sunlit trees are sources, so seedlings can be fed without any intention built in.
- The **hub** tree is simply the large tree with the most links at the moment, and the hub can change.
- A dying tree raises its pressure and empties its sugar into the network for its neighbours.

## Electrical spiking
Adamatzky recorded trains of electrical spikes in the mycelium of several fungal species. He grouped them into "words" and estimated a vocabulary of up to about 50 words, with most species using around 15–20. Whether this is a language is open: the spikes may also serve growth or signalling of presence.
- **In the system:** each node integrates its input and fires a spike train when it crosses a threshold, then rests for a refractory period.
- Each species has its own average word length, timbre (FM ratio and index, glide, blip length), resonator voice and travel speed.
- Signals move along the actual path of each hypha. They are slowed down to walking pace so you hear them travel.
- Spontaneous activity is higher at dawn and dusk.

## Alarms and defence
Damaged plants are reported to signal stress through shared fungal networks, and neighbours prepare their defences.
- A browsed or wounded tree sends faster and longer trains that travel further.
- Trees that receive them raise their defence: their partials stretch away from harmonic, they get brighter, and they tremble. They relax over about half a minute.
- Deer arrive on their own every few minutes.

## Fruiting, spores, mutation
Fungi fruit when they have stored enough and the conditions are wet. Their spores travel on the wind and found new individuals.
- **Fruiting:** an individual that has stored enough energy, in soil that is wet enough, fruits at one of its junctions away from tree trunks.
- **The mushroom's life:** it grows for about 12 s, matures, releases 3–7 spores, then decays into litter.
- **Spores** follow the wind with turbulence and settle slowly.
- **Germination:** a spore that lands on open, wet ground can germinate into a new individual. Its genome is mutated, with the amount set by the **Mutation** control: growth, branching, signal timbre, register, resonator, fruit voice and colour.
- **Selection:** over time, the lineages that feed well spread and those that starve die out.

## Trees
- Trees photosynthesise along the day cycle and shade the smaller trees nearby. They respire, grow when well fed, and drop seedlings of the same kin, a nearby note in the scale.
- Trees that stay starved for too long die back into litter.

## Sources
- A. Adamatzky (2022), *Language of fungi derived from their electrical spiking activity*, Royal Society Open Science.
- J. Karst, M. D. Jones, J. D. Hoeksema (2023), *Positive citation bias and overinterpreted results lead to misinformation on common mycorrhizal networks in forests*, Nature Ecology & Evolution.
- S. W. Simard et al. (1997), *Net transfer of carbon between ectomycorrhizal tree species in the field*, Nature.
- D. P. Bebber, J. Hynes, P. R. Darrah, L. Boddy, M. D. Fricker (2007), *Biological solutions to transport network design*, Proc. R. Soc. B.
- A. Tero et al. (2010), *Rules for biologically inspired adaptive network design*, Science.
