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
