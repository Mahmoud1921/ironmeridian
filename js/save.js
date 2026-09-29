// Save and load: three slots and an autosave in the browser's storage, plus export to and import from a file.
'use strict';
const Save = (function () {
  const VERSION = 1, PREFIX = 'ironmeridian.save.';
  const SLOTS = ['1', '2', '3'];
  const AUTO = 'auto';
  let memory = {};   // used when the browser refuses storage (private windows, blocked site data)
  function store() { try { const s = window.localStorage; const k = PREFIX + 'probe'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; } }
  const eraId = () => typeof Eras === 'undefined' || Eras.isBase() ? 'ww2-1936' : Eras.info().id;
  // numbers are kept to 5 decimals: a third smaller and nothing the game can notice
  const round = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v;
  function snapshot(label) {
    const G = Sim.G;
    if (!G) return null;
    const c = G.countries[G.player];
    return { game: 'iron-meridian', v: VERSION, era: eraId(), player: G.player, nation: c.name, date: Sim.dateStr(G.hour), hour: G.hour, savedAt: Date.now(), label: label || '', G };
  }
  function serialise(label) { const s = snapshot(label); return s ? JSON.stringify(s, round) : null; }
  function write(slot, label) {
    const text = serialise(label);
    if (!text) return { ok: false, why: 'No game to save' };
    const s = store();
    if (!s) { memory[slot] = text; return { ok: true, temp: true, size: text.length }; }
    try { s.setItem(PREFIX + slot, text); return { ok: true, size: text.length }; }
    catch (e) {
      // storage full: drop the autosave to make room for a manual save
      if (slot !== AUTO) { try { s.removeItem(PREFIX + AUTO); s.setItem(PREFIX + slot, text); return { ok: true, size: text.length }; } catch (e2) { } }
      memory[slot] = text;
      return { ok: true, temp: true, size: text.length };
    }
  }
  function readText(slot) {
    if (memory[slot]) return memory[slot];
    const s = store();
    try { return s ? s.getItem(PREFIX + slot) : null; } catch (e) { return null; }
  }
  function parse(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, why: 'This is not a saved game' }; }
    if (!d || d.game !== 'iron-meridian' || !d.G || !d.G.countries) return { ok: false, why: 'This is not an Iron Meridian save' };
    if (d.v > VERSION) return { ok: false, why: 'This save comes from a newer version of the game' };
    if (typeof Eras !== 'undefined' && d.era !== 'ww2-1936' && !Eras.get(d.era)) return { ok: false, why: 'Unknown era in this save' };
    if (!d.G.countries[d.player]) return { ok: false, why: 'The save is damaged' };
    return { ok: true, data: d };
  }
  function info(slot) {
    const t = readText(slot);
    if (!t) return null;
    // the header sits before the big state object, so it can be read without parsing everything
    const r = parse(t);
    if (!r.ok) return { slot, bad: r.why };
    const d = r.data;
    return { slot, era: d.era, player: d.player, nation: d.nation, date: d.date, savedAt: d.savedAt, size: t.length, temp: !!memory[slot] };
  }
  function list() { return SLOTS.concat([AUTO]).map(s => info(s) || { slot: s, empty: true }); }
  function latest() { return list().filter(x => !x.empty && !x.bad).sort((a, b) => b.savedAt - a.savedAt)[0] || null; }
  function read(slot) { const t = readText(slot); return t ? parse(t) : { ok: false, why: 'This slot is empty' }; }
  function remove(slot) { delete memory[slot]; const s = store(); try { if (s) s.removeItem(PREFIX + slot); } catch (e) { } }
  // autosave once a month of game time, and when the page is hidden
  let lastAuto = -1;
  function tick() {
    const G = Sim.G;
    if (!G || G.over || G.settings.autosave === false) return;
    const month = Math.floor(G.hour / (24 * 30));
    if (lastAuto < 0) { lastAuto = month; return; }
    if (month !== lastAuto) { lastAuto = month; write(AUTO, 'Autosave'); }
  }
  function autosaveNow() { const G = Sim.G; if (G && !G.over && G.settings.autosave !== false) write(AUTO, 'Autosave'); }
  function resetClock() { lastAuto = -1; }
  function fileName() { const G = Sim.G; return 'iron-meridian-' + (G ? G.player.toLowerCase() + '-' + Sim.dateStr(G.hour).replace(/\s+/g, '-') : 'save') + '.json'; }
  return { VERSION, SLOTS, AUTO, serialise, write, read, parse, info, list, latest, remove, tick, autosaveNow, resetClock, fileName, available: () => !!store() };
})();
