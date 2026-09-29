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
| `js/render.js` | Canvas renderer with cached layers, camera, picking |
| `js/ui.js` | Start screen, top bar, panels, army tray, orders, input |
| `js/main.js` | Boot and game loop |

## Phases
1. Map, countries, provinces, zoom/pan, country selection, clock — done
2. Armies, counters, movement, combat, conquest — done (plus frontline/offensive orders, supply, recruitment, basic war AI)
3. Economy, factories, production lines, resources, construction — next
4. Research, diplomacy, factions, fuller AI
5. Navy, air force, supply network, naval invasions
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
