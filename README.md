# Iron Meridian

A browser grand-strategy game set in 1936. Plain HTML, CSS and JavaScript, no backend.

## Run it
- Open `dist/iron-meridian.html` in a browser (single file, works offline apart from the web fonts), or
- serve this folder (`npx serve .`) and open `index.html` to run from the modular sources.

After editing anything in `js/` or `css/`, run `python3 build.py` to regenerate both files in `dist/`
(`dist/artifact.html` is the page published as the playable Artifact).

## Source layout
| File | What it holds |
| --- | --- |
| `js/geo.js` | Hand-drawn coastlines, inland seas, strait crossings, Miller projection |
| `js/countries.js` | 67 nations of 1936 with cities (territory anchors), resources, commander name pools |
| `js/mapgen.js` | Deterministic province generation (Voronoi per landmass), terrain, ownership, population, factories |
| `js/units.js` | Unit catalogue and government baselines |
| `js/sim.js` | Game state, clock, movement, combat, supply, recruitment, wars, capitulation, AI |
| `js/diplo.js` | Relations, factions, pacts, guarantees, trade deals, embargoes, aid, demands, peace, AI diplomacy |
| `js/economy.js` | Goods, industries, stockpiles, gold, construction, trade deals, dependence, supply shocks, AI trade and building |
| `js/tech.js` | Research slots, tree states, tier-3 choices, date gates, `Tech.mod()` modifiers, AI research |
| `js/tech-data.js` | Tech trees for all six eras, national and culture branches, historical deposits per era |
| `js/seas.js` | 62 sea zones, straits and canals (closed to enemies of the owner), sea routes |
| `js/navy.js` | Ship roles per era, fleets, missions, naval battles, sea control, convoys, naval invasions, naval AI |
| `js/air.js` | Air wings, airbases, missions, air superiority, close air support, bombing, naval strikes |
| `js/render.js` | Canvas renderer with cached layers, camera, picking |
| `js/ui.js` | Start screen, top bar, panels, army tray, orders, input |
| `js/main.js` | Boot and game loop |

## Phases
1. Map, countries, provinces, zoom/pan, country selection, clock — done
2. Armies, counters, movement, combat, conquest — done (plus frontline/offensive orders, supply, recruitment, basic war AI)
3. Economy: goods, industries, construction, trade deals, embargoes — done
4. Research and diplomacy, factions, fuller AI — done (tech trees for every era, full diplomacy)
5. Navy, air force, supply network, naval invasions — done
6. Events, peace conferences, save/load, polish

## Playtest loop

`python3 build.py && node tests/playtest.js` plays the built game in headless Chromium:
- It picks a nation and runs the clock.
- It clicks army cards, tabs, order buttons, provinces and counters, and counts every click that needed a second try.
- It declares a war and orders an attack.
- It runs 20 seconds at top speed while panning and zooming, and measures frame times.
- It follows one marching army frame by frame: it must move every frame with no jumps, stutters or backward steps.
- It checks that 3D troop figures show, glide while moving, get painted in the background, and draw fast on a crowded map.
- It checks state invariants and script errors.
- It works through every diplomacy action in the Nations tab:
  - relations, aid and trade
  - creating a faction and inviting a nation
  - guarantees, peace, pacts and demands
  - answering an AI proposal
- It then lets the AI run its own diplomacy for months, and checks that the treaty rules still hold.
- It works the economy through the new tabs: builds from the Economy tab and from a province, signs, uses and cancels a deal through the trade form, embargoes a nation, cuts a deal to check the buyer's stockpile drains, researches a tech, opens the tree and checks the tier-3 choice closes the other path, and switches to the trade map.
- It lets the AI trade, build and research on its own for a year, and checks the economy rules (no negative stocks, no deals at war or under embargo, never both tier-3 paths).
- It picks each historical era on the start screen, plays it at top speed, and checks that it runs with period units only, has an economy and a tech tree, and that a date-gated tech (Landships, 1914) waits for its date.
- It repeats the key taps on a phone-sized screen.

Options: `--quick`, `--seed N`, `--browser firefox` (where Firefox is installed). It exits non-zero on any failure, writes `tests/last-report.json`, and saves screenshots to `tests/shots/`.

Run it after every change and every phase. Fix what fails, then run it again until it is clean. Try a few seeds (`--seed 3`, `--seed 11`) before calling it done.

## Troop figures

`js/figures.js` defines small low-poly 3D models: a squad of soldiers, a truck, a halftrack, a tank, a towed gun, an armoured car, and a transport plane for airborne troops on the move. A tiny flat-shaded rasterizer renders them once per nation into a sprite atlas, with 8 headings and 4 animation frames, in the nation's colours. The map only blits sprites. The atlases are painted a row at a time in the background, and at most 28 are kept.

## Diplomacy

`js/diplo.js` handles relations between nations, which run from -100 to 100. Governments start friendly or hostile to each other, and actions move relations up or down over time.

Every action goes through `Diplo.act(action, from, to)`, so the player and the AI use the same rules. When one side makes a proposal, the other side answers through `Diplo.answer`. A proposal made to the player opens a dialog.

The actions are:
- improve relations
- send military aid
- trade (+10% equipment for both sides; Phase 3 will turn this into a resource trade)
- non-aggression pact
- guarantee independence
- create, join, invite to and leave a faction
- demand territory (a refusal lets you declare war for free)
- declare war (faction members and guarantors join in)
- offer white peace, or peace where you keep the land you occupy

## Flags

`js/flags.js` draws each nation's real 1936 flag as a small SVG. Flags that carried extremist symbols in 1936 use a non-extremist historical variant; for Germany that is the black, white and red tricolour.

## Historical eras

The start screen offers six start dates: 431 BC, 117 AD, 1200, 1805, 1914 and 1936. Each era reuses the same map with its own nations, cities, flags, units and troop models.

- **Loader:** `js/eras.js`.
- **Data:** one `js/era-*.js` file per era.
- **Flags:** `js/eras-flags.js` draws each era's flags.
- **Background:** research notes and sources are in `../rts-game-eras/`.

To add an era, add a data file and a `<script>` line; no other code changes are needed.

## Economy and trade
Designed in `rts-game-design/ECONOMY-AND-TRADE.md`. Six goods with era names (Food, Metal, Fuel, one strategic good, Luxuries and Arms): the strategic good is Tin in 431 BC, Horses in 117 and 1200, Saltpetre in 1805, Nitrates in 1914 and Rubber in 1936.
- Provinces hold industries (farm, mine, fuel works, strategic works, workshop, arsenal) up to their slots. The old civilian and military factories become workshops and arsenals; farms, mines and works are placed by land and deposits at the start.
- Each day nations produce, consume, fill or drain a 90-day stockpile, and sell what nobody buys on a world market that only takes so much. Shortages scale smoothly: no food cuts manpower and stability, no metal or fuel slows arsenals and construction, no strategic good slows and wears down the units that need it. Economic health multiplies research and taxes.
- Gold comes from taxes, exports, the trade bonus and world market sales, and goes to army upkeep, imports and construction. In debt you cannot build or buy.
- Trade deals ("Netherlands sells 8 oil a day to Germany for 16 gold") need a shared border or coasts on both sides and a free trade slot. Nations start with opening deals. Cutting a deal gives the buyer a 60-day supply shock and costs the seller relations and trust. An embargo cuts every deal and can give a strangled victim a reason for war.
- The AI buys what it lacks, sells what it has spare, cancels deals a month before it attacks, and builds what it is short of.
- Screens: the Economy tab, the province panel's Build buttons, the trade form on each nation page, and the Trade map mode.

## Research
Designed in `rts-game-design/TECH-TREES.md`. Every era has four branches (Military, Industry, Trade, Statecraft) with a locked choice at tier 3, plus a national branch for the major nations and a culture branch for everyone else. Two research slots; progress on a stopped tech is kept. Some techs wait for their real date (Landships from September 1916, which also unlocks a tank unit in 1914). Every effect is a modifier from `Tech.mod()` that combat, movement, supply, production, trade and stability read.

## Navy, air force and supply
- **Seas:** the oceans are split into 62 sea zones. Straits and canals (Bosporus, Danish Straits, Gibraltar, Suez from 1869, Panama from 1914, Bab-el-Mandeb, Hormuz, Malacca) are held by a province and closed to anyone at war with its owner. The Seas map mode shows who controls each zone.
- **Ships:** battleships, carriers, cruisers, destroyers and submarines, with period names in every era (triremes in 431 BC, ships of the line in 1805). Transports are a pool. Ships are laid down at dockyards.
- **Missions:** hold, patrol, search and destroy, convoy escort, convoy raiding, invasion support and repair. Fleets spot each other by search power and fight in salvos, and a battered fleet runs for port.
- **Convoys:** trade deals that cross the sea lose part of each delivery to raiders in the zones they pass. Submarines are the best raiders and escorts cut the losses.
- **Invasions:** select an army, press Invade by sea, then click a coastal province. The army needs free transports and a sea route. It prepares (faster from a port), sails, and waits offshore for 40% naval superiority. It then lands with an attack penalty. A progress pill on the map and a bar in the army panel track it.
- **Air:** fighters, close air support, bombers and naval bombers (1936; 1914 has early fighters and bombers). Wings fly air superiority, CAS, bombing and naval strike within range of their airbase. Air superiority boosts battles and cuts enemy supply. Bombing lowers a province's output. Radar strengthens fighters.
- **Military works:** ports, dockyards, airbases, supply hubs, forts and radar, built from the province panel on the same construction queue as industry. The Maginot Line starts fortified.
- **Supply:** supply flows from the capital, core cities, supply hubs and ports (ports only while the sea lanes are held). It fades with distance. Poor supply lowers attack, defence and organisation, slows movement and causes attrition.
