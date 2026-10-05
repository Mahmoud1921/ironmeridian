// Interface: start screen, top bar, dossier panels, army tray, orders and input.
'use strict';
const UI = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let MAP;
  const sel = { prov: -1, armies: [], battle: 0, tab: 'army', fleet: 0, wing: 0, zone: -1, spawnProv: -1, buildProv: -1 };
  let pending = null; // {kind, armies}
  let startPick = 'GER';
  const HPS = [0, 3, 8, 18, 36, 72]; // game hours per real second by speed level
  const DECLARE_COST = 25;

  // ---------- formatting ----------
  function fmtN(n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + 'K';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  const pct = v => Math.round(v * 100) + '%';
  // only touch the DOM when content changed, so buttons stay put under the cursor
  // (and keep the scroll position: replacing the content would otherwise jump a scrolled list back to the top)
  function setHTML(el, html) {
    if (el._html === html) return false;
    const top = el.scrollTop, left = el.scrollLeft;
    el._html = html; el.innerHTML = html;
    if (top) el.scrollTop = top;
    if (left) el.scrollLeft = left;
    return true;
  }
  // your own provinces for a picker: capital first, then cities by size, then the rest by name
  function ownProvs() {
    const G = Sim.G, cap = G.countries[G.player].capital;
    return MAP.provs.filter(p => G.owner[p.id] === G.player)
      .sort((a, b) => (b.id === cap) - (a.id === cap) || (!!b.city - !!a.city) || (a.city && b.city ? b.pop - a.pop : a.name.localeCompare(b.name)));
  }
  function provSelect(id, cur, first) {
    const cap = Sim.G.countries[Sim.G.player].capital;
    return `<select class="field provpick" id="${id}" aria-label="Province">${first ? `<option value="-1"${cur < 0 ? ' selected' : ''}>${esc(first)}</option>` : ''}${ownProvs().map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.name)}${p.id === cap ? ' (capital)' : ''}</option>`).join('')}</select>`;
  }
  // where new troops gather: the province you last chose while you still hold it, else the capital
  function spawnPick() { const G = Sim.G; return sel.spawnProv >= 0 && G.owner[sel.spawnProv] === G.player ? sel.spawnProv : G.countries[G.player].capital; }
  function buildPick() { const G = Sim.G; return sel.buildProv >= 0 && G.owner[sel.buildProv] === G.player ? sel.buildProv : -1; }
  const bicon = (k, n) => `<canvas class="bicon" data-bicon="${k}" width="${n || 76}" height="${n || 76}" aria-hidden="true"></canvas>`;
  let lockUntil = 0;
  let hoverEl = null;
  let hoverBtn = false;
  document.addEventListener('pointerover', e => { hoverEl = e.target.closest ? e.target.closest('#drawer, #leftpanel, #bottombar, #ucard') : null; hoverBtn = !!(hoverEl && e.target.closest('button, .row')); }, true);
  // While a button is held down, nothing on screen is rebuilt: otherwise the periodic refresh swaps the
  // element between press and release, the browser drops the click, and the player has to click twice.
  document.addEventListener('pointerdown', e => { if (e.target.id !== 'map') lockUntil = Infinity; }, true);
  const unlock = () => { if (lockUntil === Infinity) lockUntil = performance.now() + 250; };
  document.addEventListener('pointerup', unlock, true);
  document.addEventListener('pointercancel', unlock, true);
  // a mouse-clicked button must not keep focus, or Space (pause) would press it again
  document.addEventListener('click', e => { if (e.detail > 0) { const b = e.target.closest && e.target.closest('button'); if (b) setTimeout(() => b.blur(), 0); } }, true);

  // ---------- flags (original abstract designs) ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')'; }
  let flagCache = {};
  function flagSVG(tag) {
    if (flagCache[tag]) return flagCache[tag];
    // in a historical era the era's own flag wins; the 1936 flags must not leak onto a tag reused by another era
    const inEra = typeof Eras !== 'undefined' && !Eras.isBase();
    const eraFlag = inEra && Eras.flagFor(tag);
    if (eraFlag) return (flagCache[tag] = eraFlag);
    if (!inEra && typeof FLAGS !== 'undefined' && FLAGS[tag]) return (flagCache[tag] = `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAGS[tag]}</svg>`);
    const c = COUNTRY_BY_TAG[tag].color, h = hash(tag);
    const L = '#ece4cc', D = shade(c, -0.55), A = shade(c, 0.35);
    const pick = h % 8;
    let body = '';
    const starPath = (cx, cy, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
    switch (pick) {
      case 0: body = `<rect width="30" height="20" fill="${c}"/><rect y="6.67" width="30" height="6.67" fill="${L}"/><rect y="13.33" width="30" height="6.67" fill="${D}"/>`; break;
      case 1: body = `<rect width="30" height="20" fill="${L}"/><rect width="10" height="20" fill="${c}"/><rect x="20" width="10" height="20" fill="${D}"/>`; break;
      case 2: body = `<rect width="30" height="20" fill="${c}"/><rect width="13" height="10" fill="${D}"/><path d="${starPath(6.5, 5, 3.4)}" fill="${L}"/>`; break;
      case 3: body = `<rect width="30" height="20" fill="${c}"/><circle cx="15" cy="10" r="6" fill="${L}"/><circle cx="15" cy="10" r="3" fill="${D}"/>`; break;
      case 4: body = `<rect width="30" height="20" fill="${c}"/><rect x="8" width="4" height="20" fill="${L}"/><rect y="8" width="30" height="4" fill="${L}"/><rect x="9" width="2" height="20" fill="${D}"/><rect y="9" width="30" height="2" fill="${D}"/>`; break;
      case 5: body = `<rect width="30" height="20" fill="${c}"/><path d="M0,20 L0,15 L22,0 L30,0 L30,5 L8,20Z" fill="${L}"/><path d="M0,20 L0,17.5 L26,0 L30,0 L4,20Z" fill="${D}"/>`; break;
      case 6: body = `<rect width="30" height="10" fill="${c}"/><rect y="10" width="30" height="10" fill="${A}"/><path d="M0,0 L12,10 L0,20Z" fill="${D}"/><path d="${starPath(4.2, 10, 2.6)}" fill="${L}"/>`; break;
      default: body = `<rect width="30" height="20" fill="${D}"/><rect x="2" y="2" width="26" height="16" fill="${c}"/><path d="M15,4 L20,10 L15,16 L10,10Z" fill="${L}"/>`;
    }
    return (flagCache[tag] = `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`);
  }
  function unitIcon(type, color) {
    const s = UNIT_TYPES[type].symbol;
    const paths = { inf: 'M2,2 L28,18 M28,2 L2,18', arm: '', mec: 'M2,2 L28,18 M28,2 L2,18', mot: 'M2,2 L28,18 M28,2 L2,18 M15,2 L15,18', art: '', rec: 'M2,18 L28,2', mar: 'M2,2 L28,18 M28,2 L2,18 M7,17 Q15,23 23,17', par: 'M2,2 L28,18 M28,2 L2,18 M7,7 Q15,-2 23,7' };
    let extra = '';
    if (s === 'arm' || s === 'mec') extra = '<ellipse cx="15" cy="10" rx="10" ry="5.5" fill="none" stroke="#141414" stroke-width="1.6"/>';
    if (s === 'art') extra = '<circle cx="15" cy="10" r="3" fill="#141414"/>';
    return `<svg viewBox="0 0 30 20" aria-hidden="true"><rect x="1" y="1" width="28" height="18" fill="${color}" stroke="#141414" stroke-width="1.6"/><path d="${paths[s] || ''}" stroke="#141414" stroke-width="1.6" fill="none"/>${extra}</svg>`;
  }

  // ---------- init ----------
  function init(map) {
    MAP = map;
    bindMap();
    bindKeys();
    $('#tb-play').onclick = togglePause;
    $('#tb-slower').onclick = () => setSpeed(Sim.G.speed - 1);
    $('#tb-faster').onclick = () => setSpeed(Sim.G.speed + 1);
    $('#tb-menu').onclick = openMenu;
    $('#tb-goals').onclick = () => openGoals();
    $('#co-next').onclick = () => coachNext();
    $('#co-skip').onclick = () => coachEnd(true);
    $('#tb-nation').onclick = () => { const G = Sim.G; if (!G) return; selectProvince(G.countries[G.player].capital, true); };
    // clicking the open tab folds the panel away; any tab opens it again
    document.querySelectorAll('#rail .tab').forEach(t => t.onclick = () => openTab(t.dataset.tab, true));
    $('#dr-close').onclick = () => { sel.collapsed = true; renderRight(); };
    $('#kh-x').onclick = () => { $('#keyhint').hidden = true; Menu.setPref('hintSeen', true); };
    bindStatTips();
    bindCard();
    $('#mc-pol').onclick = () => setMode('political');
    $('#mc-ter').onclick = () => setMode('terrain');
    $('#mc-trade').onclick = () => setMode(Render.state.mode === 'trade' ? 'political' : 'trade');
    $('#mc-sea').onclick = () => setMode(Render.state.mode === 'sea' ? 'political' : 'sea');
    $('#mc-in').onclick = () => Render.zoomSmooth(Render.size[0] / 2, Render.size[1] / 2, 1.5);
    $('#mc-out').onclick = () => Render.zoomSmooth(Render.size[0] / 2, Render.size[1] / 2, 1 / 1.5);
    $('#mc-world').onclick = () => Render.fitWorld();
    Sim.hooks.notify = (text, prov, kind) => toast(text, prov, kind);
    Sim.hooks.lost = (prov, by) => lostBanner(prov, by);
    netHooks();
    Sim.hooks.pause = () => refreshTop();
    Sim.hooks.gameOver = gameOver;
    Goals.hooks.goal = (kind, goal, p, days) => {
      if (kind === 'side') toast('Goal reached: ' + goal.name + '.', -1, 'win');
      else toast(days >= 365 ? 'One year left to ' + goal.name.toLowerCase() + ': ' + p.now + ' of ' + p.target + '.' : 'Three months left to ' + goal.name.toLowerCase() + ': ' + p.now + ' of ' + p.target + '.', -1, 'loss');
      refreshGoals();
    };
    Goals.hooks.won = () => { refreshGoals(); gameWon(); };
    Goals.hooks.lost = (s, p) => { refreshGoals(); timeUp(p); };
    Events.hooks.show = () => { if ($('#modal').hidden) showEvent(); };
    Peace.hooks.show = () => showPeace();
    const saveOnLeave = () => { if (typeof Save !== 'undefined') Save.autosaveNow(); };
    window.addEventListener('pagehide', saveOnLeave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveOnLeave(); });
    Diplo.hooks.offer = (o, respond) => {
      // an offer is answered later, so check it still makes sense when the player accepts
      const valid = () => {
        const G = Sim.G, war = Sim.atWar(o.from, o.to);
        if (!G.countries[o.from].alive) return false;
        if (o.action === 'peace') return war;
        if (war) return false;
        if (o.action === 'invite') return !Sim.factionOf(G.player) && G.dip.factions.includes(o.terms.fac);
        if (o.action === 'join') return G.dip.factions.includes(o.terms.fac) && !Sim.factionOf(o.from);
        if (o.action === 'trade') return Economy.canDeal(o.from, o.to, o.terms).ok;
        return true;
      };
      // offers from an earlier game are dropped, never answered
      const game = Sim.G;
      for (let i = offers.length - 1; i >= 0; i--) if (offers[i].game !== game) offers.splice(i, 1);
      offers.push({ o, game, respond: yes => Sim.G !== game ? null : yes && !valid() ? (respond(false), { text: 'That offer is no longer valid.' }) : respond(yes) });
      // ignored offers lapse: keep only the three newest
      while (offers.length > 3) offers.splice(1, 1)[0].respond(false);
      showOffer();
    };
  }
  function setMode(m) {
    Render.state.mode = m; Render.state.dirtyOwners = true;
    $('#mc-pol').classList.toggle('active', m === 'political'); $('#mc-ter').classList.toggle('active', m === 'terrain'); $('#mc-trade').classList.toggle('active', m === 'trade'); $('#mc-sea').classList.toggle('active', m === 'sea');
  }

  // ---------- start screen ----------
  const MAJORS_1936 = ['GER', 'FRA', 'ENG', 'SOV', 'ITA', 'USA', 'JAP', 'CHI', 'POL', 'SPA', 'TUR', 'ROM'];
  let MAJORS = MAJORS_1936;
  // the twelve strongest nations of an era, by armies and industry
  const majorsFor = () => typeof Eras === 'undefined' || Eras.isBase() ? MAJORS_1936
    : COUNTRY_DEFS.filter(d => d.divs > 0 && !d.unclaimed).sort((a, b) => (b.divs + b.mil * 2 + b.civ) - (a.divs + a.mil * 2 + a.civ)).slice(0, 12).map(d => d.tag);
  function applyEra(id) {
    Sim.G = null; // eras are picked before a game starts; drop any finished game
    Eras.apply(MAP, id);
    flagCache = {}; MAJORS = majorsFor(); startPick = MAJORS[0];
    if (typeof Figures !== 'undefined' && Figures.reset) Figures.reset();
    Render.refreshAll();
  }
  function pickEra(id) { applyEra(id); showStart(); }
  function countryFacts(tag) {
    const d = COUNTRY_BY_TAG[tag];
    const provs = MAP.provs.filter(p => p.owner === tag);
    const res = {};
    provs.forEach(p => { for (const k in p.res) res[k] = (res[k] || 0) + p.res[k]; });
    return { d, provs: provs.length, res };
  }
  function showStart() {
    $('#start').hidden = false;
    if (typeof Eras !== 'undefined') {
      const cur = Eras.isBase() ? Eras.BASE_ID : Eras.info().id;
      $('#st-eras').innerHTML = Eras.list().map(e => `<button data-era="${e.id}" class="${e.id === cur ? 'sel' : ''}" title="${esc(e.name)}">${esc(e.label)}</button>`).join('');
      document.querySelectorAll('#st-eras button').forEach(b => b.onclick = () => { if (b.dataset.era !== cur) pickEra(b.dataset.era); });
      const e = Eras.list().find(x => x.id === cur);
      $('#st-year').textContent = 'THE WORLD · ' + (e ? e.label : '1936') + (e && e.id !== Eras.BASE_ID ? ' · ' + e.name.toUpperCase() : '');
    }
    const majors = $('#st-majors');
    majors.innerHTML = MAJORS.map(t => `<button class="ncard" data-tag="${t}">${flagSVG(t)}<span><b>${esc(COUNTRY_BY_TAG[t].name)}</b><small>${COUNTRY_BY_TAG[t].gov}</small></span></button>`).join('');
    const renderAll = q => {
      $('#st-all').innerHTML = COUNTRY_DEFS.filter(d => !MAJORS.includes(d.tag) && d.divs > 0 && d.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => `<button class="ncard" data-tag="${d.tag}">${flagSVG(d.tag)}<span><b>${esc(d.name)}</b><small>${d.diff}</small></span></button>`).join('');
      bindCards();
    };
    const bindCards = () => document.querySelectorAll('#start .ncard').forEach(b => b.onclick = () => pickStart(b.dataset.tag));
    $('#st-search').oninput = e => renderAll(e.target.value);
    renderAll('');
    $('#st-play').onclick = () => startGame(startPick);
    pickStart(startPick);
    $('#st-back').onclick = () => { $('#start').hidden = true; Menu.show(); };
  }
  const curEra = () => typeof Eras === 'undefined' || Eras.isBase() ? 'ww2-1936' : Eras.info().id;
  // the nation picker for an era, reached from the main menu's New game
  function chooseNation(eraId) {
    if (eraId && eraId !== curEra()) applyEra(eraId);
    else { Sim.G = null; Render.state.dirtyOwners = true; }
    $('#hud').hidden = true;
    showStart();
  }
  function pickStart(tag) {
    const d = COUNTRY_BY_TAG[tag];
    if (!d.divs) return;
    startPick = tag;
    $('#st-play').textContent = 'Play as ' + d.name;
    document.querySelectorAll('#start .ncard').forEach(b => b.classList.toggle('sel', b.dataset.tag === tag));
    const f = countryFacts(tag);
    const dl = ['Very easy', 'Easy', 'Normal', 'Hard', 'Very hard'].indexOf(d.diff);
    $('#st-flag').outerHTML = flagSVG(tag).replace('class="flag"', 'class="flag" id="st-flag"');
    $('#st-name').textContent = d.name;
    $('#st-gov').textContent = d.gov + (d.overlord ? ' · subject of ' + COUNTRY_BY_TAG[d.overlord].name : '');
    $('#st-diff').innerHTML = '<div class="diff">' + [0, 1, 2, 3, 4].map(i => `<i class="${i <= dl ? 'on' : ''}"></i>`).join('') + '</div><span class="label">' + d.diff + '</span>';
    $('#st-nums').innerHTML = `<div><b>${fmtN(d.pop * 1e6)}</b><span>Population</span></div><div><b>${d.civ + d.mil}</b><span>Factories</span><small>${d.civ} civilian · ${d.mil} military</small></div>
      <div><b>${d.divs}</b><span>Divisions</span></div><div><b>${f.provs}</b><span>Provinces</span></div>`;
    const rn = { steel: 'Steel', oil: 'Oil', coal: 'Coal', aluminium: 'Aluminium', rubber: 'Rubber', rare: 'Rare materials' };
    $('#st-res').innerHTML = Object.keys(rn).map(k => `<span>${rn[k]} ${f.res[k] || 0}</span>`).join('');
    $('#st-sit').textContent = d.sit;
    Render.state.selProv = -1;
    const cap = MAP.provs.find(p => p.capital && p.cityTag === tag);
    if (cap) Render.flyTo(cap.x + (window.innerWidth > 820 ? 4 : 0), cap.y, Math.max(Render.minZoom() * 1.2, tag === 'SOV' || tag === 'CHI' || tag === 'USA' ? 4 : 7));
  }
  function startGame(tag) {
    Sim.newGame(tag);
    enterGame(tag, false);
  }
  // continue a saved game, switching era first when it was saved in another one
  function loadGame(d) {
    const cur = Eras.isBase() ? Eras.BASE_ID : Eras.info().id;
    if (d.era !== cur) applyEra(d.era);
    if (!d.net) { delete d.G.humans; delete d.G.__net; if (d.G.dip) d.G.dip.offers = []; }
    Sim.restore(d.G);
    if (!d.net) Sim.G.paused = true;
    $('#modal').hidden = true;
    enterGame(d.player, true);
  }
  function enterGame(tag, loaded) {
    if (typeof Save !== 'undefined') Save.resetClock();
    $('#leftpanel').hidden = true; $('#battle').hidden = true; sel.battle = 0; pending = null; showHint();
    offers.length = 0; $('#offer').hidden = true; tf.open = null; sel.dip = null; sel.tv = 'goods';
    $('#start').hidden = true; $('#menu').hidden = true; Menu.hide();
    $('#hud').hidden = false;
    const P = Menu.prefs();
    if (!loaded) { const s = Sim.G.settings; s.autosave = P.autosave; s.pauseEvent = P.pauseEvent; s.pauseWar = P.pauseWar; }
    $('#keyhint').hidden = !!P.hintSeen || innerWidth <= 820;
    clearTimeout(enterGame._hint); enterGame._hint = setTimeout(() => { $('#keyhint').hidden = true; }, 25000);
    Render.state.dirtyOwners = true;
    const cap = MAP.provs[Sim.G.countries[tag].capital];
    if (cap) Render.flyTo(cap.x, cap.y, 9);
    sel.armies = []; sel.prov = -1; sel.fleet = 0; sel.wing = 0; sel.zone = -1;
    Render.state.selFleet = 0; Render.state.selWing = 0; Render.state.selZone = -1;
    // paint the player's troops first, then everyone they border; others are painted when they first come into view
    { const G = Sim.G, near = new Set([tag]); MAP.provs.forEach(p => { if (G.owner[p.id] === tag) p.nb.forEach(n => near.add(G.owner[n])); }); Figures.warm([...near].filter(t => G.countries[t] && G.countries[t].alive)); }
    sel.collapsed = true; // the side bar starts closed: the map is clear until a tab is opened
    renderTrays(); renderRight(); refreshTop(); renderLeft();
    if (!Net.isClient()) toast(loaded ? 'Game loaded: ' + Sim.G.countries[tag].name + ', ' + Sim.dateStr(Sim.G.hour) + '. Press Space to continue.' : 'You lead ' + Sim.G.countries[tag].name + '. Press Space or the play button to start the clock.', cap ? cap.id : -1, 'info');
    if (loaded) Goals.restore(); else Goals.begin();
    refreshGoals();
    if (!loaded) coachStart();
    if (Sim.G.peace) showPeace(); else if (Events.open().length) showEvent();
    if (!loaded && Menu.takeHost()) hostGame();
  }

  // ---------- top bar ----------
  function refreshTop() {
    const G = Sim.G; if (!G) return;
    if (G.goals && $('#goalpill')) refreshGoals();
    const c = G.countries[G.player];
    const nb = $('#tb-net');
    if (nb) { const on = Net.active(); nb.classList.toggle('on', on); if (on) { const n = Net.playerList().length; const t = (Net.role === 'host' ? 'Code ' + Net.code : 'Online') + ' · ' + n + ' player' + (n === 1 ? '' : 's'); if (nb.textContent !== t) nb.textContent = t; } }
    setHTML($('#tb-nation'), flagSVG(c.tag) + `<span><div class="nm">${esc(c.name)}</div><div class="gov">${c.gov}</div></span>`);
    const divs = G.armies.filter(a => a.owner === c.tag).reduce((s, a) => s + a.units.length, 0);
    const nArmies = G.armies.filter(a => a.owner === c.tag).length;
    let pop = 0, provs = 0;
    for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === c.tag) { pop += MAP.provs[i].pop || 0; provs++; }
    const e = c.eco, wars = G.wars.filter(w => w.attackers.includes(c.tag) || w.defenders.includes(c.tag));
    const enemies = [...Sim.enemiesOf(c.tag)].map(t => G.countries[t] && G.countries[t].name).filter(Boolean);
    const inc = e && e.income ? e.income : {};
    const incText = [['taxes', inc.tax], ['exports', inc.trade], ['market sales', inc.market], ['upkeep', inc.upkeep], ['imports', inc.imports]].filter(x => x[1] && Math.abs(x[1]) >= 0.5).map(x => x[0] + ' ' + sgn(x[1])).join(', ');
    // [icon, value, extra, class, name, what it means]
    const stats = [
      ['pp', Math.floor(c.pp), '', '', 'Political power', 'Earned every day. Spent on diplomacy, decisions and declaring war (' + DECLARE_COST + ').'],
      ['stab', pct(c.stab), '', c.stab < 0.4 ? 'bad' : c.stab < 0.55 ? 'warn' : '', 'Stability', 'Raises manpower growth and factory output. Below 40% the country struggles.'],
      ['flagp', pct(c.ws), '', c.ws < 0.25 ? 'warn' : '', 'War support', 'How willing your people are to fight. Speeds up organisation recovery.'],
      ['pop', fmtN(pop), '', '', 'Population', 'People across your ' + provs + ' provinces.'],
      ['man', fmtN(c.manpower), '', c.manpower < 20000 ? 'bad' : '', 'Manpower', 'Men ready to train into new divisions. Losses so far: ' + fmtN(c.losses) + '.'],
      ['gold', fmtN(e ? e.gold : 0), e && e.goldDelta ? `<span class="d ${e.goldDelta < 0 ? 'neg' : 'pos'}">${e.goldDelta >= 0 ? '+' : '−'}${fmtN(Math.abs(e.goldDelta))}</span>` : '', e && e.gold < 0 ? 'bad' : '', 'Gold', 'Treasury in ' + Economy.coin() + ' and its change a day' + (incText ? ': ' + incText + '.' : '.')],
      ['crate', fmtN(c.equipment), '', c.equipment < 300 ? 'warn' : '', Economy.goodName('arms'), 'In stock for new and damaged divisions. Made every day from ' + Economy.goodName('metal').toLowerCase() + ' and ' + Economy.goodName('fuel').toLowerCase() + '.'],
      ['div', divs + (c.queue.length ? ' +' + c.queue.length : ''), '', '', 'Divisions', 'In ' + nArmies + ' ' + (nArmies === 1 ? 'army' : 'armies') + (c.queue.length ? ', with ' + c.queue.length + ' in training.' : '.')],
      ['swords', wars.length, '', wars.length ? 'bad' : '', 'Wars', wars.length ? 'At war with ' + enemies.slice(0, 6).join(', ') + (enemies.length > 6 ? ' and ' + (enemies.length - 6) + ' more' : '') + '.' : 'You are at peace.']
    ];
    statTips = stats;
    setHTML($('#tb-stats'), stats.map((s, i) => `<div class="stat ${s[3]}" tabindex="0" data-st="${i}" aria-label="${esc(s[4])} ${esc(String(s[1]))}"><svg class="i"><use href="#i-${s[0]}"/></svg><span class="v">${s[1]}</span>${s[2]}<span class="k">${esc(s[4])}</span></div>`).join(''));
    if (tipAt >= 0) showTip(tipAt);
    const short = Economy.anyShort(c.tag);
    $('#tab-econ-dot').hidden = !short;
    $('#tb-date').textContent = Sim.dateStr(G.hour, true);
    $('#tb-play').classList.toggle('paused', G.paused);
    setHTML($('#tb-play'), `<svg class="i"><use href="#i-${G.paused ? 'play' : 'pause'}"/></svg>`);
    $('#tb-play').setAttribute('aria-label', G.paused ? 'Resume' : 'Pause');
    setHTML($('#tb-speed'), [1, 2, 3, 4, 5].map(i => `<i class="${i <= G.speed ? 'on' : ''}" style="height:${4 + i * 2}px"></i>`).join(''));
  }
  // one floating tooltip for the top bar numbers, so the scrolling stat strip never clips it
  let statTips = [], tipAt = -1;
  function showTip(i) {
    const st = document.querySelector(`#tb-stats .stat[data-st="${i}"]`), s = statTips[i];
    let tip = $('#stat-tip');
    if (!st || !s) { if (tip) tip.hidden = true; tipAt = -1; return; }
    if (!tip) { tip = document.createElement('div'); tip.id = 'stat-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tipAt = i;
    tip.innerHTML = `<b>${esc(s[4])} · ${s[1]}</b>${esc(s[5])}`;
    tip.hidden = false;
    const r = st.getBoundingClientRect(), w = 230;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
  }
  function bindStatTips() {
    const bar = $('#tb-stats');
    const at = e => { const st = e.target.closest && e.target.closest('.stat'); return st ? +st.dataset.st : -1; };
    bar.addEventListener('pointerover', e => { const i = at(e); if (i >= 0) showTip(i); });
    bar.addEventListener('pointerleave', () => showTip(-1));
    bar.addEventListener('focusin', e => { const i = at(e); if (i >= 0) showTip(i); });
    bar.addEventListener('focusout', () => showTip(-1));
    bar.addEventListener('scroll', () => showTip(-1));
    // a tap on a phone toggles the tooltip
    bar.addEventListener('click', e => { const i = at(e); showTip(i === tipAt && e.pointerType !== 'mouse' ? -1 : i); });
  }
  function togglePause() { const G = Sim.G; if (!G || G.over) return; Net.setPaused(!G.paused); refreshTop(); }
  function setSpeed(s) { const G = Sim.G; if (!G) return; Net.setSpeed(s); refreshTop(); }

  // ---------- toasts ----------
  function toast(text, prov, kind) {
    const G = Sim.G;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = `<span class="d">${G ? Sim.dateStr(G.hour) : ''}</span>${esc(text)}`;
    const box = $('#toasts');
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
    if (typeof Sound !== 'undefined' && kind && kind !== 'info') Sound.notice(kind);
    if (sel.tab === 'gov') renderRight();
  }

  // ---------- lost land: a red, pulsing banner (provinces lost close together share one) ----------
  const lost = { provs: [], by: [], t: 0, timer: 0 };
  function lostBanner(prov, by) {
    const G = Sim.G, now = performance.now();
    if (now - lost.t > 8000) { lost.provs = []; lost.by = []; }
    lost.t = now;
    if (!lost.provs.includes(prov)) lost.provs.push(prov);
    if (!lost.by.includes(by)) lost.by.push(by);
    Render.state.flash = (Render.state.flash || []).filter(f => f.prov !== prov).concat([{ prov, t: now }]).slice(-12);
    let el = $('#lossbar');
    if (!el) { el = document.createElement('button'); el.id = 'lossbar'; el.type = 'button'; $('#toasts').before(el); }
    const names = lost.provs.map(id => MAP.provs[id].name), n = names.length;
    const what = n === 1 ? names[0] + ' has fallen' : n + ' provinces lost: ' + names.slice(-3).reverse().join(', ') + (n > 3 ? ' and ' + (n - 3) + ' more' : '');
    const who = lost.by.map(t => G.countries[t] ? G.countries[t].name : t).slice(0, 2).join(' and ') + (lost.by.length > 2 ? ' and others' : '');
    el.innerHTML = `<svg class="i"><use href="#i-swords"/></svg><span><b>${esc(what)}</b><small>Taken by ${esc(who)} · ${esc(Sim.dateStr(G.hour))} · click to look</small></span>`;
    el.hidden = false;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    if (typeof Sound !== 'undefined') Sound.alarm();
    el.onclick = () => { const p = MAP.provs[lost.provs[lost.provs.length - 1]]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, Render.minZoom() * 3)); selectProvince(p.id); el.hidden = true; };
    clearTimeout(lost.timer);
    lost.timer = setTimeout(() => { el.hidden = true; }, 8000);
  }

  // ---------- left panel: province & country ----------
  function relationPill(tag) {
    const G = Sim.G;
    if (!G) return '';
    if (tag === G.player) return '<span class="pill self">Your nation</span>';
    if (Sim.atWar(tag, G.player)) return '<span class="pill war">At war</span>';
    if (Sim.allied(tag, G.player)) return '<span class="pill ally">Ally</span>';
    return '<span class="pill">Neutral</span>';
  }
  function selectProvince(id, fly) {
    sel.prov = id; Render.state.selProv = id;
    if (id >= 0) { sel.zone = -1; Render.state.selZone = -1; }
    if (fly && id >= 0) { const p = MAP.provs[id]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); }
    renderLeft();
  }
  function renderLeft() {
    const el = $('#leftpanel');
    const G = Sim.G;
    if (G && sel.prov < 0 && sel.zone >= 0) { renderZone(el); return; }
    if (sel.prov < 0 || !G) { el.hidden = true; return; }
    el.hidden = false;
    const p = MAP.provs[sel.prov];
    const owner = G.owner[p.id], oc = G.countries[owner];
    const I = (G.ind && G.ind[p.id]) || {};
    const indList = Economy.KIND_KEYS.filter(k => I[k]).map(k => esc(Economy.kindName(k)) + (I[k] > 1 ? ' ×' + I[k] : '')).join(', ') || 'None';
    const deps = Economy.GOODS.filter(k => Economy.dep(p.id, k)).map(k => goodDot(k) + esc(Economy.goodName(k))).join(', ') || 'None';
    const res = `<dt>Industry</dt><dd>${indList}</dd><dt>Slots</dt><dd>${Economy.freeSlots(p.id)} free of ${Economy.slots(p)}${Economy.built(p.id) > Economy.slots(p) ? ' (' + Economy.built(p.id) + ' built)' : ''}</dd><dt>Deposits</dt><dd>${deps}</dd>`;
    const INF = Economy.infraKinds().filter(k => Economy.infra(p.id, k));
    const works = `<dt>Military</dt><dd>${INF.map(k => esc(Economy.kindName(k)) + (Economy.INFRA[k].max > 1 ? ' ' + Economy.infra(p.id, k) : '')).join(', ') || 'None'}</dd>`
      + (Seas.isCoastal(p.id) ? `<dt>Coast</dt><dd>${Seas.zonesOf(p.id).map(z => `<a href="#" class="lnk" data-zone="${z}">${esc(Seas.zone(z).name)}</a>`).join(', ')}</dd>` : '')
      + (Air.bombDamage(p.id) > 0.01 ? `<dt>Bomb damage</dt><dd class="bad">${pct(Air.bombDamage(p.id))} of output lost</dd>` : '');
    const infraBtn = k => { const chk = Economy.canBuild(G.player, k, p.id); const lvl = Economy.infra(p.id, k); return `<button class="btn sm" data-pbuild="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? INFRA_TIP[k] : chk.why)}">${bicon(k)}<span>${esc(Economy.kindName(k))}${lvl && Economy.INFRA[k].max > 1 ? ' ' + (lvl + 1) : ''}</span><small>${Economy.buildCost(k, G.player, p.id).gold} gold</small></button>`; };
    const wingsHere = G.wings.filter(w => w.base === p.id);
    const buildHere = owner === G.player && !G.over ? `<div class="label" style="margin-top:6px">Build here</div><div class="builds">${Economy.KIND_KEYS.map(k => { const chk = Economy.canBuild(G.player, k, p.id); return `<button class="btn sm" data-pbuild="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? 'Makes about ' + f1(Economy.baseOut(k, p) * Economy.provMul(k, p, owner)) + ' ' + Economy.goodName(Economy.KINDS[k].good).toLowerCase() + ' a day' : chk.why)}">${bicon(k)}<span>${esc(Economy.kindName(k))}</span><small>${Economy.buildCost(k, G.player).gold} gold</small></button>`; }).join('')}</div>
      <div class="label" style="margin-top:6px">Military works</div><div class="builds">${Economy.infraKinds().filter(k => Economy.INFRA[k].needs !== 'air' || Air.available()).map(infraBtn).join('')}</div>
      <button class="btn sm${spawnPick() === p.id ? ' on' : ''}" id="lp-spawn" style="width:100%;margin-top:6px" ${spawnPick() === p.id ? 'disabled' : ''}>${spawnPick() === p.id ? 'New troops gather here' : 'Send new troops here'}</button>` : '';
    const armies = G.armies.filter(a => a.prov === p.id && !(a.sea && a.sea.phase !== 'prep'));
    const armyRows = armies.map(a => {
      const comp = compStr(a);
      return `<div class="row click" data-army="${a.id}">${flagSVG(a.owner)}<div class="grow"><div>${esc(G.countries[a.owner].name)} ${esc(a.name)}</div><div class="sub">${comp}</div></div></div>`;
    }).join('') || '<div class="note">No troops present.</div>';
    const isCap = oc && oc.capital === p.id;
    const divs = G.armies.filter(a => a.owner === owner).reduce((s, a) => s + a.units.length, 0);
    const provCount = G.owner.filter(o => o === owner).length;
    const canDeclare = owner !== G.player && !Sim.atWar(owner, G.player) && !Sim.allied(owner, G.player) && !G.over;
    if (!setHTML(el, `<button class="close" aria-label="Close" id="lp-close">×</button>
      <div class="label">${isCap ? 'Capital province' : p.city ? 'City province' : 'Province'}</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 6px">${esc(p.name)}</h2>
      <div class="owner">${flagSVG(owner)}<div><div>${esc(oc.name)}</div>${relationPill(owner)}</div></div>
      ${p.core !== owner && G.countries[p.core] && G.countries[p.core].alive ? `<div class="note">Occupied territory of ${esc(G.countries[p.core].name)}.</div>` : ''}
      <dl class="kv"><dt>Terrain</dt><dd>${TERRAIN[p.terrain].name}</dd><dt>Population</dt><dd>${fmtN(p.pop)}</dd>
      <dt>Infrastructure</dt><dd>Level ${p.infra}</dd>${res}${works}
      <dt>Units</dt><dd>${armies.reduce((s, a) => s + a.units.length, 0)} divisions</dd>${routeRows(p.id)}</dl>${buildHere}
      <div class="list">${armyRows}</div>
      ${wingsHere.length ? '<div class="label" style="margin-top:6px">Air wings based here</div><div class="list">' + wingsHere.map(w => `<div class="row click" data-wing="${w.id}">${flagSVG(w.owner)}<div class="grow"><div>${esc(w.name)}</div><div class="sub">${esc(Air.typeName(w.type))} · ${esc(Air.MISSIONS[w.mission].name)}</div></div></div>`).join('') + '</div>' : ''}
      <hr class="sep">
      <div class="label">Nation</div>
      <dl class="kv"><dt>Government</dt><dd>${oc.gov}</dd><dt>Capital</dt><dd>${oc.capital >= 0 ? esc(MAP.provs[oc.capital].name) : '—'}</dd>
      <dt>Provinces</dt><dd>${provCount}</dd><dt>Divisions</dt><dd>${divs}</dd><dt>Factories</dt><dd>${oc.civ + oc.mil}</dd>
      <dt>Manpower</dt><dd>${fmtN(oc.manpower)}</dd>${oc.overlord ? `<dt>Overlord</dt><dd>${esc(G.countries[oc.overlord].name)}</dd>` : ''}</dl>
      ${owner !== G.player ? `<div style="display:flex;gap:6px"><button class="btn" id="lp-dip" style="flex:1">Diplomacy</button>${canDeclare ? `<button class="btn danger" id="lp-war" style="flex:1" ${G.countries[G.player].pp < warCost(owner) ? 'disabled' : ''}>Declare war${warCost(owner) ? ' · ' + warCost(owner) + ' PP' : ''}</button>` : ''}</div>` : ''}`)) return;
    $('#lp-close').onclick = () => { selectProvince(-1); };
    el.querySelectorAll('[data-army]').forEach(r => r.onclick = () => selectArmies([+r.dataset.army], false));
    el.querySelectorAll('[data-zone]').forEach(r => r.onclick = e => { e.preventDefault(); selectZone(+r.dataset.zone, true); });
    el.querySelectorAll('[data-wing]').forEach(r => r.onclick = () => selectWing(+r.dataset.wing));
    el.querySelectorAll('[data-pbuild]').forEach(b => b.onclick = () => { const r = Economy.build(G.player, b.dataset.pbuild, p.id); toast(r.ok ? r.text : r.why, p.id, 'info'); renderLeft(); renderRight(); refreshTop(); });
    if ($('#lp-spawn')) $('#lp-spawn').onclick = () => { sel.spawnProv = p.id; toast('New troops will gather in ' + p.name + '.', p.id, 'info'); renderLeft(); renderRight(); };
    spinBuildings(performance.now(), true);
    if (canDeclare) $('#lp-war').onclick = () => confirmWar(owner);
    if (owner !== G.player) $('#lp-dip').onclick = () => { sel.dip = owner; sel.tab = 'diplo'; sel.collapsed = false; renderRight(); };
  }
  // the roads and railways that start in a province, and what they give
  function routeRows(pid) {
    if (typeof Routes === 'undefined') return '';
    const G = Sim.G, l = Routes.of(pid);
    if (!l.length) return '';
    const txt = r => {
      const other = r.a === pid ? r.b : r.a, name = MAP.provs[other].name, rail = r.rail;
      const what = (r.trade ? 'Trade ' + (rail ? 'railway' : 'road') : rail ? 'Railway' : 'Road') + ' to ' + name;
      const st = r.idle !== undefined ? 'quiet, no deal' : r.state === 'building' ? 'building, ' + Math.max(1, Math.ceil(r.left)) + ' d left' : Routes.isCut(r) ? 'cut by the enemy' : (rail ? '+20% output, armies ×2' : '+10% output, armies +30%');
      return esc(what) + ' <span class="sub">(' + esc(st) + ')</span>';
    };
    return `<dt>Routes</dt><dd>${l.map(txt).join('<br>')}</dd>`;
  }
  function compStr(a) {
    const cnt = {};
    for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
    return Object.keys(cnt).map(t => cnt[t] + ' ' + UNIT_TYPES[t].name).join(', ');
  }

  const INFRA_TIP = {
    port: 'Ships repair here, troops embark faster, and it feeds armies by sea while your navy keeps the route open.',
    dock: 'Builds warships: each level works on one hull at a time. Also speeds up repairs.',
    air: 'Bases 4 air wings per level.',
    hub: 'A supply source inland: armies nearby are supplied as if at home.',
    fort: 'Defenders here fight 15% better per level.',
    radar: 'Your fighters within 600 km fight 30% better, and your ships spot enemies off this coast more easily.'
  };
  function selectFleet(id) {
    sel.fleet = id; sel.wing = 0; Render.state.selFleet = id; Render.state.selWing = 0;
    if (id) { sel.armies = []; Render.state.selArmies = new Set(); sel.tab = 'navy'; sel.collapsed = false; }
    pending = null; showHint();
    renderRight(); renderTrays();
  }
  function selectWing(id) {
    sel.wing = id; sel.fleet = 0; Render.state.selWing = id; Render.state.selFleet = 0;
    if (id) { sel.armies = []; Render.state.selArmies = new Set(); sel.tab = 'navy'; sel.collapsed = false; }
    pending = null; showHint();
    renderRight(); renderTrays();
  }
  function selectZone(z, fly) {
    sel.zone = z; Render.state.selZone = z;
    if (z >= 0) { sel.prov = -1; Render.state.selProv = -1; if (fly) { const zz = Seas.zone(z); Render.flyTo(zz.x, zz.y, Math.max(Render.cam.z, 5)); } }
    renderLeft();
  }
  function renderZone(el) {
    const G = Sim.G, z = Seas.zone(sel.zone), me = G.player;
    el.hidden = false;
    const ctl = Navy.control(z.id), tot = Object.values(ctl).reduce((s, v) => s + v, 0);
    const ctlRows = Object.entries(ctl).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, v]) => `<div class="row">${flagSVG(t)}<div class="grow"><div>${esc(G.countries[t].name)}</div><div class="bar sup"><i style="width:${Math.round(v / tot * 100)}%"></i></div></div><span class="sub">${pct(v / tot)}</span></div>`).join('');
    const war = Sim.isAtWar(me);
    const fleets = G.fleets.filter(f => f.zone === z.id);
    const straits = Seas.straits.filter(s => s.a === z.id || s.b === z.id);
    const ports = z.coast.filter(pid => Navy.isPort(pid));
    const loss = war ? Navy.lossIn(me, z.id) : 0;
    const invs = G.armies.filter(a => a.sea && a.sea.zone === z.id);
    if (!setHTML(el, `<button class="close" aria-label="Close" id="lp-close">×</button>
      <div class="label">Sea zone</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 6px">${esc(z.name)}</h2>
      <dl class="kv"><dt>Ports</dt><dd>${ports.length} on ${z.coast.length} coastal provinces</dd>
      ${war ? `<dt>Your sea control</dt><dd class="${Navy.superiority(me, z.id) < 0.4 ? 'bad' : ''}">${pct(Navy.superiority(me, z.id))}</dd><dt>Convoy losses</dt><dd class="${loss > 0.05 ? 'bad' : ''}">${loss > 0.005 ? pct(loss) + ' of your shipping sunk here' : 'None'}</dd>` : ''}
      <dt>Borders</dt><dd>${Seas.neighbours(z.id, me).map(([n]) => `<a href="#" class="lnk" data-zone="${n}">${esc(Seas.zone(n).name)}</a>`).join(', ')}</dd></dl>
      ${straits.map(st => `<div class="note">${esc(st.name)}: held by ${esc(G.countries[G.owner[st.prov]]?.name || 'nobody')}${st.year && new Date(Sim.dateTime()).getUTCFullYear() < st.year ? ', not yet built' : Seas.straitOpen(st, me) ? ', open to you' : ', closed to you'}.</div>`).join('')}
      <div class="label" style="margin-top:8px">Naval power here</div><div class="list">${ctlRows || '<div class="note">No warships here.</div>'}</div>
      ${fleets.length ? '<div class="label" style="margin-top:8px">Fleets</div><div class="list">' + fleets.map(f => fleetRow(f)).join('') + '</div>' : ''}
      ${invs.length ? '<div class="label" style="margin-top:8px">Landings</div><div class="list">' + invs.map(a => `<div class="row">${flagSVG(a.owner)}<div class="grow"><div>${esc(a.name)}</div><div class="sub">${esc(Navy.phaseText(a))}</div></div></div>`).join('') + '</div>' : ''}
      ${sel.fleet && Sim.G.fleets.some(f => f.id === sel.fleet && f.owner === me) ? `<button class="btn" id="lp-sail" style="width:100%;margin-top:8px">Send the selected fleet here</button>` : ''}`)) return;
    $('#lp-close').onclick = () => selectZone(-1);
    el.querySelectorAll('[data-zone]').forEach(r => r.onclick = e => { e.preventDefault(); selectZone(+r.dataset.zone, true); });
    el.querySelectorAll('[data-fleet]').forEach(r => r.onclick = () => selectFleet(+r.dataset.fleet));
    const sail = $('#lp-sail'); if (sail) sail.onclick = () => sendFleet(sel.zone);
  }
  function sendFleet(z) {
    const f = Navy.fleet(sel.fleet); if (!f || z < 0) return;
    if (f.battle) { toast('The ' + f.name + ' is in battle and cannot break off.', -1, 'info'); return; }
    if (z === f.zone && !f.path.length) { f.area = z; toast('The ' + f.name + ' is already in the ' + Seas.zone(z).name + '.', -1, 'info'); return; }
    if (Navy.orderMove(f, z)) toast('The ' + f.name + ' sails for the ' + Seas.zone(z).name + (f.mission !== 'hold' ? ' to ' + Navy.MISSIONS[f.mission].name.toLowerCase() : '') + '.', -1, 'info');
    else toast('No sea route to the ' + Seas.zone(z).name + ': a strait may be closed to you.', -1, 'info');
    renderRight(); renderLeft();
  }
  function hullIcon(color, sub) {
    return `<svg viewBox="0 0 34 22" style="width:34px;height:22px;flex:none"><rect x="0.5" y="0.5" width="33" height="21" rx="2" fill="${color}" stroke="rgba(0,0,0,.6)"/>${sub ? '<ellipse cx="17" cy="14" rx="12" ry="3.5" fill="#10161a"/><rect x="15" y="6" width="4" height="6" fill="#10161a"/>' : '<path d="M4 11 H30 L26 17 H8 Z M13 6 H20 V11 H13 Z" fill="#10161a"/>'}</svg>`;
  }
  function planeIcon(color) {
    return `<svg viewBox="0 0 34 22" style="width:34px;height:22px;flex:none"><rect x="0.5" y="0.5" width="33" height="21" rx="2" fill="${color}" stroke="rgba(0,0,0,.6)"/><path d="M17 3 L18.5 9 L28 11 L18.5 12.5 L18 17 L21 19 H13 L16 17 L15.5 12.5 L6 11 L15.5 9 Z" fill="#10161a"/></svg>`;
  }
  function fleetRow(f) {
    const G = Sim.G, st = Navy.fleetStats(f);
    const where = f.battle ? '⚔ In battle' : f.path.length ? 'Sailing to ' + Seas.zone(f.path[f.path.length - 1]).name : Seas.zone(f.zone).name;
    return `<div class="row click ${f.id === sel.fleet ? 'on' : ''}" data-fleet="${f.id}">${hullIcon(COUNTRY_BY_TAG[f.owner].color, f.ships.every(s => s.type === 'submarine'))}<div class="grow"><div>${f.owner !== G.player ? esc(G.countries[f.owner].name) + ' ' : ''}${esc(f.name)}</div>
      <div class="sub">${esc(Navy.comp(f))} · ${esc(where)} · ${esc(Navy.MISSIONS[f.mission].name)}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div><div class="bar org"><i style="width:${st.org * 100}%"></i></div></div></div>`;
  }
  function wingRow(w) {
    return `<div class="row click ${w.id === sel.wing ? 'on' : ''}" data-wing="${w.id}">${planeIcon(COUNTRY_BY_TAG[w.owner].color)}<div class="grow"><div>${esc(w.name)}</div>
      <div class="sub">${esc(Air.typeName(w.type))} · ${esc(MAP.provs[w.base].name)} · ${esc(Air.MISSIONS[w.mission].name)}${w.mission !== 'idle' && w.target >= 0 ? ' over ' + esc(w.sea ? Seas.zone(w.target).name : MAP.provs[w.target].name) : ''}</div><div class="bar str"><i style="width:${w.str * 100}%"></i></div><div class="bar org"><i style="width:${w.org * 100}%"></i></div></div></div>`;
  }
  function fleetCard(f) {
    const G = Sim.G, st = Navy.fleetStats(f), mine = f.owner === G.player;
    let status = f.battle ? 'In battle' : f.path.length ? 'Sailing to ' + Seas.zone(f.path[f.path.length - 1]).name : 'At sea';
    if (f.path.length && !f.battle) { const km = Seas.routeKm(f.zone, f.path) - f.progress; status += ' · ~' + Math.max(1, Math.round(km / Math.max(1, Navy.fleetSpeed(f)) / 24)) + ' days'; }
    const here = G.fleets.filter(x => x !== f && x.owner === G.player && x.zone === f.zone && !x.battle);
    let html = `<div class="owner">${flagSVG(f.owner)}<div><h2 class="display" style="font-size:21px">${esc(f.name)}</h2><div class="sub label">${esc(G.countries[f.owner].name)}</div></div></div>
      <dl class="kv"><dt>Location</dt><dd><a href="#" class="lnk" data-zone="${f.zone}">${esc(Seas.zone(f.zone).name)}</a></dd><dt>Status</dt><dd>${esc(status)}</dd>
      <dt>Mission</dt><dd>${esc(Navy.MISSIONS[f.mission].name)}${f.mission !== 'hold' && f.area >= 0 ? ' in the ' + esc(Seas.zone(f.area).name) : ''}</dd>
      <dt>Speed</dt><dd>${Math.round(Navy.fleetSpeed(f))} km/h</dd><dt>Power</dt><dd>${Math.round(Navy.power(f))}</dd></dl>
      ${meter('Strength', st.str, 'str')}${meter('Organisation', st.org, 'org')}
      <div class="unitgrid" style="margin-top:8px">${Navy.compLong(f).map(x => `<span>${esc(Navy.typeName(x.type))}</span><span>× ${x.n}</span>`).join('')}</div>`;
    if (!mine) return html + '<p class="note">Foreign fleet.</p>';
    html += `<div class="label" style="margin-top:8px">Mission</div><div class="orders">${['patrol', 'hunt', 'escort', 'raid', 'support', 'hold'].map(m => `<button class="btn sm ${f.mission === m ? 'active' : ''}" data-fm="${m}" title="${esc(Navy.MISSIONS[m].desc)}">${esc(Navy.MISSIONS[m].name)}</button>`).join('')}</div>
      <div class="orders" style="margin-top:6px"><button class="btn sm ${pending?.kind === 'fleet' ? 'active' : ''}" data-fo="move" title="Pick a sea zone">Move</button>
      <button class="btn sm" data-fo="repair" title="${esc(Navy.MISSIONS.repair.desc)}">Return to port</button>
      <button class="btn sm" data-fo="split" ${f.ships.length > 1 && !f.battle ? '' : 'disabled'}>Split</button>
      <button class="btn sm" data-fo="merge" ${here.length && !f.battle ? '' : 'disabled'} title="Joins your other fleets in this zone">Merge</button>
      <button class="btn sm" data-fo="back">All fleets</button></div>
      <p class="note">The mission is carried out where the fleet is headed. Right-click a sea zone (or pick one with Move) to send it elsewhere.</p>`;
    return html;
  }
  function wingCard(w) {
    const G = Sim.G, mine = w.owner === G.player;
    let html = `<div class="owner">${flagSVG(w.owner)}<div><h2 class="display" style="font-size:21px">${esc(w.name)}</h2><div class="sub label">${esc(G.countries[w.owner].name)} · ${esc(Air.typeName(w.type))}</div></div></div>
      <dl class="kv"><dt>Base</dt><dd>${esc(MAP.provs[w.base].name)}</dd><dt>Mission</dt><dd>${esc(Air.MISSIONS[w.mission].name)}${w.mission !== 'idle' && w.target >= 0 ? ' over ' + esc(w.sea ? Seas.zone(w.target).name : MAP.provs[w.target].name) : ''}</dd>
      <dt>Range</dt><dd>${Math.round(Air.range(w.type, w.owner))} km</dd>${w.kills ? `<dt>Ships sunk</dt><dd>${w.kills}</dd>` : ''}</dl>
      ${meter('Strength', w.str, 'str')}${meter('Readiness', w.org, 'org')}`;
    if (w.mission !== 'idle' && w.target >= 0) { const pt = Air.point(w); html += `<div class="note">Your side holds ${pct(Air.superiority(w.owner, pt))} of the sky there.</div>`; }
    if (!mine) return html;
    html += `<div class="label" style="margin-top:8px">Mission · pick a target on the map</div><div class="orders">${['superiority', 'cas', 'bomb', 'naval'].map(m => `<button class="btn sm ${pending?.kind === 'wing' && pending.mission === m ? 'active' : w.mission === m ? 'active' : ''}" data-wm="${m}" title="${esc(Air.MISSIONS[m].desc)}">${esc(Air.MISSIONS[m].name)}</button>`).join('')}</div>
      <div class="orders" style="margin-top:6px"><button class="btn sm" data-wo="idle">Stand down</button><button class="btn sm ${pending?.kind === 'rebase' ? 'active' : ''}" data-wo="rebase" title="Pick a friendly airbase">Rebase</button><button class="btn sm" data-wo="back">All wings</button></div>`;
    return html;
  }
  function navyPanel() {
    const G = Sim.G, c = G.countries[G.player], me = G.player;
    const f = sel.fleet ? Navy.fleet(sel.fleet) : null;
    if (sel.fleet && !f) sel.fleet = 0;
    if (f) return fleetCard(f);
    const w = sel.wing ? Air.wing(sel.wing) : null;
    if (sel.wing && !w) sel.wing = 0;
    if (w) return wingCard(w);
    const nv = Navy.nav(c);
    const mine = G.fleets.filter(x => x.owner === me);
    const ships = mine.reduce((s, x) => s + x.ships.length, 0);
    let html = `<div class="label">Fleets · ${ships} ships</div>`;
    html += mine.length ? '<div class="list" style="margin-top:6px">' + mine.map(fleetRow).join('') + '</div>' : '<div class="note">You have no warships.</div>';
    html += `<dl class="kv" style="margin-top:6px"><dt>${esc(Navy.typeName('transport'))}s</dt><dd>${Navy.freeTransports(me)} free of ${nv.transports} · each carries one division</dd>
      <dt>Enemy ships sunk</dt><dd>${nv.sunk}</dd><dt>Ships lost</dt><dd>${nv.lost}</dd>${nv.convoysLost > 0.5 || nv.convoysSunk > 0.5 ? `<dt>Convoys</dt><dd>${f1(nv.convoysLost)} goods lost, ${f1(nv.convoysSunk)} sunk by us</dd>` : ''}</dl>`;
    const docks = Navy.docks(me);
    html += `<hr class="sep"><div class="label">Shipyards · ${docks} dockyard level${docks === 1 ? '' : 's'}</div>`;
    if (nv.queue.length) html += '<div class="list" style="margin:6px 0">' + nv.queue.map((q, i) => `<div class="row"><div class="grow"><div>${esc(Navy.typeName(q.type))}</div><div class="bar prog"><i style="width:${Math.round((1 - q.left / q.total) * 100)}%"></i></div></div><span class="sub">${i < Math.max(1, docks) ? Math.ceil(q.left) + ' d' : 'waiting'}</span><button class="btn sm" data-unship="${i}" aria-label="Cancel ship" title="Cancel (half the ${esc(Economy.goodName('arms').toLowerCase())} back)">×</button></div>`).join('') + '</div>';
    html += `<div class="builds">${Navy.roles().map(r => { const chk = Navy.canBuild(me, r); return `<button class="btn sm" data-ship="${r}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? Navy.stat(r, 'days') + ' days on one dockyard line' : chk.why)}"><span>${esc(Navy.typeName(r))}</span><small>${fmtN(Navy.stat(r, 'eq'))} ${esc(Economy.goodName('arms').toLowerCase())}</small></button>`; }).join('')}</div>`;
    if (!docks) html += `<div class="note">Build a ${esc(Economy.kindName('dock').toLowerCase())} in a coastal province with a ${esc(Economy.kindName('port').toLowerCase())} to lay down ships.</div>`;
    if (Air.available()) {
      const wings = G.wings.filter(x => x.owner === me);
      html += `<hr class="sep"><div class="label">Air wings · ${wings.length}</div>`;
      html += wings.length ? '<div class="list" style="margin-top:6px">' + wings.map(wingRow).join('') + '</div>' : '<div class="note">You have no aircraft.</div>';
      const q = c.airQueue || [];
      if (q.length) html += '<div class="list" style="margin:6px 0">' + q.map((x, i) => `<div class="row"><div class="grow"><div>${esc(Air.typeName(x.type))}</div><div class="bar prog"><i style="width:${Math.round((1 - x.left / x.total) * 100)}%"></i></div></div><span class="sub">${Math.ceil(x.left)} d</span><button class="btn sm" data-unplane="${i}" aria-label="Cancel aircraft">×</button></div>`).join('') + '</div>';
      html += `<div class="builds">${Air.types().map(t => { const chk = Air.canBuild(me, t); return `<button class="btn sm" data-plane="${t}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? Air.MISSIONS[t === 'fighter' ? 'superiority' : t === 'navbomber' ? 'naval' : t === 'bomber' ? 'bomb' : 'cas'].desc : chk.why)}"><span>${esc(Air.typeName(t))}</span><small>${fmtN(Air.TYPES[t].eq)} ${esc(Economy.goodName('arms').toLowerCase())}</small></button>`; }).join('')}</div>`;
    } else html += '<hr class="sep"><div class="note">No aircraft fly in this era.</div>';
    return html;
  }

  function warCost(tag) { return Diplo.warCost(Sim.G.player, tag); }
  function confirmWar(tag) {
    const G = Sim.G;
    const cost = warCost(tag), pact = Sim.hasPact(G.player, tag);
    const joiners = Sim.coalition(tag).filter(t => t !== tag && !Sim.allied(t, G.player));
    Diplo.guaranteedBy(tag).forEach(t => { if (!Sim.allied(t, G.player) && !joiners.includes(t)) joiners.push(t); });
    modal(`<h2 class="display" style="font-size:24px">Declare war on ${esc(G.countries[tag].name)}?</h2>
      <p class="note">${joiners.length ? 'These nations will fight alongside them: ' + esc(joiners.map(t => G.countries[t].name).join(', ')) + '.' : 'Nobody will join them.'}
      ${cost ? 'Costs ' + cost + ' political power.' : 'Your refused demands justify this war, so it costs no political power.'}
      ${pact ? ' You have a non-aggression pact with them: breaking it costs 15% stability.' : ''}${G.countries[G.player].ws < 0.3 ? ' War support is low: stability will drop.' : ''}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">${pact ? 'Break pact and declare war' : 'Declare war'}</button></div>`,
      x => {
        if (x !== 'yes') return;
        const r = Diplo.declare(G.player, tag);
        if (!r.ok) { toast(r.text, -1, 'info'); return; }
        Render.state.dirtyOwners = true;
        renderLeft(); renderRight(); refreshTop();
      });
  }

  // ---------- selection ----------
  function selectArmies(ids, add) {
    const G = Sim.G;
    if (add) { for (const id of ids) { const i = sel.armies.indexOf(id); if (i >= 0) sel.armies.splice(i, 1); else sel.armies.push(id); } }
    else sel.armies = ids.slice();
    // only own armies can be multi-selected
    if (sel.armies.length > 1) sel.armies = sel.armies.filter(id => { const a = Sim.army(id); return a && a.owner === G.player; });
    Render.state.selArmies = new Set(sel.armies);
    if (sel.armies.length) { sel.fleet = 0; sel.wing = 0; Render.state.selFleet = 0; Render.state.selWing = 0; }
    renderRight(); renderTrays();
  }
  function selectedArmies() { return sel.armies.map(Sim.army).filter(Boolean); }
  function myArmiesSel() { const G = Sim.G; return selectedArmies().filter(a => a.owner === G.player); }

  // ---------- side bar and its drawer ----------
  const TABS = [['army', 'Army', 'helmet'], ['recruit', 'Train', 'recruit'], ['navy', 'Navy', 'anchor'], ['diplo', 'Nations', 'globe'], ['econ', 'Economy', 'factory'],
    ['trade', 'Trade', 'trade'], ['tech', 'Tech', 'flask'], ['wars', 'Wars', 'swords'], ['gov', 'Politics', 'gov']];
  // clicking the open tab closes the drawer; any other tab opens it
  function openTab(id, toggle) {
    const same = sel.tab === id;
    sel.collapsed = toggle && same ? !sel.collapsed : false;
    sel.tab = id;
    renderRight();
    if (!same) $('#rp-body').scrollTop = 0;
  }
  function renderRight() {
    const G = Sim.G; if (!G) return;
    const open = !sel.collapsed;
    document.querySelectorAll('#rail .tab').forEach(t => t.classList.toggle('on', open && t.dataset.tab === sel.tab));
    const wars = G.wars.filter(w => w.attackers.includes(G.player) || w.defenders.includes(G.player)).length;
    $('#tab-wars-badge').textContent = wars || ''; $('#tab-wars-badge').hidden = !wars;
    $('#tab-gov-dot').hidden = !Events.open().length;
    const dr = $('#drawer'), body = $('#rp-body'), t = TABS.find(x => x[0] === sel.tab) || TABS[0];
    dr.classList.toggle('open', open); dr.classList.toggle('wide', sel.tab === 'trade');
    $('#hud').classList.toggle('drawer-open', open); $('#hud').classList.toggle('wide', sel.tab === 'trade');
    body.hidden = !open;
    $('#dr-title').textContent = t[1];
    if ($('#dr-icon').dataset.i !== t[2]) { $('#dr-icon').dataset.i = t[2]; $('#dr-icon').innerHTML = `<use href="#i-${t[2]}"/>`; }
    // the periodic refresh leaves the card alone while the pointer rests on one of its buttons
    if (!inFrame || !(hoverEl === $('#ucard') && hoverBtn)) renderCard();
    if (!open) return;
    const html = sel.tab === 'army' ? armyPanel() : sel.tab === 'recruit' ? recruitPanel() : sel.tab === 'navy' ? navyPanel() : sel.tab === 'diplo' ? diploPanel() : sel.tab === 'econ' ? econPanel() : sel.tab === 'trade' ? tradePanel() : sel.tab === 'tech' ? techPanel() : sel.tab === 'wars' ? warsPanel() : politicsPanel();
    if (setHTML(body, html)) bindRight();
  }
  function meter(label, v, cls) { return `<div class="meter"><span>${label}</span><div class="bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></div><span>${pct(v)}</span></div>`; }
  const ORDER_TEXT = { hold: 'Holding position', move: 'Moving', attack: 'Offensive', defend: 'Defending front', retreat: 'Retreating', redeploy: 'Strategic redeployment' };
  function orderText(a) {
    const G = Sim.G;
    if (a.sea) return Navy.phaseText(a);
    if (a.battle) { const b = G.battles.find(x => x.id === a.battle); return (a.landing ? 'Landing at ' : 'Attacking ') + (b ? MAP.provs[b.prov].name : ''); }
    if (a.retreating) return 'Retreating to ' + MAP.provs[a.path[a.path.length - 1]]?.name;
    let t = ORDER_TEXT[a.order] || a.order;
    if (a.order === 'defend') t += a.frontTag ? ' vs ' + G.countries[a.frontTag].name : ' (all enemies)';
    const prey = a.chase && Sim.army(a.chase);
    if (prey) t = 'Hunting ' + prey.name + (prey.prov >= 0 ? ' at ' + MAP.provs[prey.prov].name : '');
    else if ((a.order === 'move' || a.order === 'attack' || a.order === 'redeploy') && a.target >= 0) t += ' → ' + MAP.provs[a.target].name;
    if (a.path.length) { const km = a.path.reduce((s, id, i) => s + Sim.distKm(i ? a.path[i - 1] : a.prov, id), 0) - a.progress; t += ' · ~' + Math.max(1, Math.round(km / Math.max(0.5, Sim.armySpeed(a)) / 24)) + ' days'; }
    return t;
  }
  // the Army tab: every army you field, with the selected ones marked
  function armyPanel() {
    const G = Sim.G, mine = G.armies.filter(a => a.owner === G.player);
    if (!mine.length) return '<p class="note">You have no armies. Train divisions in the Train tab.</p>';
    return `<div class="list">${mine.map(a => { const st = Sim.armyStats(a); return `<div class="row click ${sel.armies.includes(a.id) ? 'on' : ''}" data-selarmy="${a.id}">${flagSVG(a.owner)}<div class="grow"><div>${esc(a.name)} <span class="sub">· ${a.units.length} division${a.units.length === 1 ? '' : 's'}</span></div>
      <div class="sub">${esc(MAP.provs[a.prov].name)} · ${esc(orderText(a))}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div></div></div>`; }).join('')}</div>
      <p class="note">Click an army to select it, shift-click to add more. On the map, drag across your armies to select several at once. Orders are on the army card.</p>`;
  }
  // ---------- compact army card ----------
  const ORDERS = [['move', 'Move', 'move'], ['attack', 'Attack', 'attack', 'atk'], ['front', 'Defend', 'shield'], ['hold', 'Hold', 'hold'], ['retreat', 'Retreat', 'retreat'],
    ['redeploy', 'Redeploy', 'rail'], ['split', 'Split', 'split'], ['merge', 'Merge', 'merge'], ['recruit', 'Recruit', 'plus'], ['invade', 'By sea', 'anchor']];
  const ORDER_TIPS = { move: 'Pick a destination', attack: 'Pick an enemy province, or an enemy army to hunt until it is destroyed', front: 'Pick an enemy province: the army guards that border and shifts to weak spots',
    hold: 'Stop and hold here', retreat: 'Fall back to friendly land', redeploy: 'Fast move through friendly land; organisation drops', split: 'Split the army in two', merge: 'Armies must share a province',
    recruit: 'Train new divisions for this army', invade: 'Ship this army across the sea: pick a coastal province' };
  function renderCard() {
    const el = $('#ucard'), G = Sim.G;
    const list = G ? selectedArmies() : [];
    $('#hud').classList.toggle('carded', list.length > 0);
    if (!list.length) { el.hidden = true; el._html = ''; return; }
    el.hidden = false;
    const mine = list[0].owner === G.player, one = list.length === 1, a = list[0];
    const divs = list.reduce((s, x) => s + x.units.length, 0);
    const avg = f => list.reduce((s, x) => s + f(x) * x.units.length, 0) / Math.max(1, divs);
    const str = avg(x => Sim.armyStats(x).str), org = avg(x => Sim.armyStats(x).org), sup = avg(x => x.supply);
    const x = '<button class="iconbtn" data-desel aria-label="Clear selection"><svg class="i"><use href="#i-x"/></svg></button>';
    let html = one
      ? `<div class="hd">${flagSVG(a.owner)}<b>${esc(a.name)}<small>${esc(MAP.provs[a.prov].name)} · ${esc(orderText(a))} · ${esc(a.commander.name)} ${'★'.repeat(a.commander.skill)}</small></b>${x}</div>`
      : `<div class="hd">${flagSVG(a.owner)}<b>${list.length} armies selected<small>${divs} divisions · orders go to all of them</small></b>${x}</div><div class="multi">${list.map(y => `<span>${esc(y.name)}</span>`).join('')}</div>`;
    const m = (label, v, col) => `<div>${label} <b>${pct(v)}</b><span class="bar"><i style="width:${Math.round(v * 100)}%;background:${col}"></i></span></div>`;
    html += `<div class="meters">${m('Strength', str, 'var(--good)')}${m('Org', org, 'var(--info)')}${m('Supply', sup, 'var(--warn)')}</div>`;
    if (one) {
      const cnt = {}; for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
      html += `<div class="comp">${Object.entries(cnt).map(([t, n]) => `<span>${esc(UNIT_TYPES[t].name)} <b>${n}</b></span>`).join('')}<span>${Sim.armySpeed(a).toFixed(1)} km/h</span>${a.entrench > 0.01 ? `<span>Dug in <b>+${Math.round(a.entrench * 100)}%</b></span>` : ''}</div>`;
    }
    if (!mine) { setHTML(el, html + '<p class="note">Foreign army. You can only give orders to your own troops.</p>'); return; }
    if (one && a.sea) {
      html += `<div class="label">${a.sea.hostile ? 'Naval invasion' : 'Sea transport'}</div><div class="bar prog" style="height:6px;margin:4px 0"><i style="width:${Math.round(Navy.progress(a) * 100)}%"></i></div>
        <p class="note">${esc(Navy.phaseText(a))}. ${a.sea.ships} ${esc(Navy.typeName('transport').toLowerCase())}${a.sea.ships > 1 ? 's' : ''}.${a.sea.hostile ? ' Landing needs 40% sea control (now ' + pct(Navy.superiority(a.owner, a.sea.zone)) + ').' : ''} <a href="#" class="lnk" data-o="cancelsea">${a.sea.phase === 'prep' ? 'Call off' : 'Turn back'}</a></p>`;
    }
    const sameProv = list.every(y => y.prov === list[0].prov);
    const off = { split: !(one && a.units.length > 1), merge: !(list.length > 1 && sameProv), recruit: !one, invade: !(one && !a.sea) };
    const active = k => pending && pending.kind === k;
    html += `<div class="orders">${ORDERS.map(o => `<button class="ord ${o[3] || ''} ${active(o[0]) ? 'active' : ''}" data-o="${o[0]}" ${off[o[0]] ? 'disabled' : ''} title="${esc(o[1] + ': ' + (o[0] === 'invade' && one && Seas.isCoastal(a.prov) ? ORDER_TIPS.invade + '. ' + Navy.freeTransports(G.player) + ' transports free.' : ORDER_TIPS[o[0]]))}"><svg class="i"><use href="#i-${o[2]}"/></svg><span>${o[1]}</span></button>`).join('')}</div>`;
    setHTML(el, html);
  }
  function bindCard() {
    $('#ucard').addEventListener('click', e => {
      const t = e.target.closest('button, a'); if (!t || t.disabled) return;
      if ('desel' in t.dataset) { e.preventDefault(); pending = null; showHint(); selectArmies([], false); return; }
      if (t.dataset.o) { e.preventDefault(); armyOrder(t.dataset.o); }
    });
  }
  function recruitPanel() {
    const G = Sim.G, c = G.countries[G.player];
    const target = myArmiesSel().length === 1 ? myArmiesSel()[0] : null;
    let html = `<dl class="kv"><dt>Manpower</dt><dd>${fmtN(c.manpower)}</dd><dt>${esc(Economy.goodName('arms'))}</dt><dd>${fmtN(c.equipment)} (+${Math.round(c.eco ? c.eco.arms : 0)}/day)</dd></dl>
      <div class="pickrow"><label for="rec-prov">New troops gather in</label>${provSelect('rec-prov', spawnPick())}</div>
      <p class="note">${target ? 'They join <b>' + esc(target.name) + '</b> instead if it is inside your borders when training ends. ' : ''}You can also open one of your provinces on the map and press Send new troops here.</p><div class="list">`;
    // an era may reserve units for some nations (Spartans for Sparta, legionaries for Rome)
    const trainable = (typeof Eras !== 'undefined' && !Eras.isBase() ? Eras.unitsFor(G.player) : LAND_TYPES).filter(t => !UNIT_TYPES[t].locked || Tech.unlocked(G.player, t));
    for (const t of trainable) {
      const u = UNIT_TYPES[t];
      const strat = Economy.stratUnit(t) ? `<div class="sub">Needs ${esc(Economy.goodName('strategic').toLowerCase())}${c.eco && c.eco.sat.strategic < 0.99 ? ': trains at ' + pct(c.eco.sat.strategic) + ' speed' : ''}</div>` : '';
      html += `<div class="row rec-row"><canvas class="spin" data-spin="${t}" width="128" height="128" role="img" aria-label="${esc(u.name)} model"></canvas><div class="grow"><div>${u.name}</div>
        <div class="sub">Atk ${u.atk} · Def ${u.def} · ${u.speed} km/h · Org ${u.org}</div><div class="sub">${fmtN(Sim.mpCost(G.player, t))} men · ${u.eq} ${esc(Economy.goodName('arms').toLowerCase())} · ${u.days} days</div>${strat}</div>
        <button class="btn sm" data-rec="${t}" ${Sim.canRecruit(G.player, t) ? '' : 'disabled'}>Train</button></div>`;
    }
    html += '</div>';
    if (c.queue.length) {
      html += '<hr class="sep"><div class="label">In training</div><div class="list" style="margin-top:6px">' + c.queue.map(q => `<div class="row"><div class="grow"><div>${UNIT_TYPES[q.type].name} <span class="sub">in ${esc(MAP.provs[Sim.spawnProv(c, q)]?.name || '?')}</span></div><div class="bar prog"><i style="width:${Math.round((1 - q.hours / q.total) * 100)}%"></i></div></div><span class="sub">${Math.ceil(q.hours / 24)} d</span></div>`).join('') + '</div>';
    }
    return html;
  }
  let diploQuery = '';
  function relTag(v) { return `<span class="rel ${v >= 30 ? 'good' : v <= -30 ? 'bad' : ''}">${v > 0 ? '+' : ''}${v}</span>`; }
  function dipStatus(tag) {
    const G = Sim.G, out = [];
    const f = Sim.factionOf(tag);
    if (Sim.atWar(tag, G.player)) out.push('<span class="pill war">At war</span>');
    else if (Sim.allied(tag, G.player)) out.push('<span class="pill ally">Ally</span>');
    if (f) out.push(`<span class="pill">${esc(f.name)}</span>`);
    if (Sim.hasPact(tag, G.player)) out.push('<span class="pill">Pact</span>');
    if (Economy.trading(tag, G.player)) out.push('<span class="pill">Trade</span>');
    if (Economy.embargoed(tag, G.player)) out.push('<span class="pill war">Embargo</span>');
    if (G.dip.guar.some(x => x.by === G.player && x.of === tag)) out.push('<span class="pill">Guaranteed</span>');
    if (G.dip.guar.some(x => x.by === tag && x.of === G.player)) out.push('<span class="pill">Guarantees you</span>');
    return out.join(' ');
  }
  function factionCard() {
    const G = Sim.G, f = Sim.factionOf(G.player);
    if (!f) {
      const c = Diplo.can('create', G.player);
      return `<div class="fac"><div class="label">Faction</div><div class="note" style="margin:2px 0 8px">You stand alone. A faction's members fight each other's wars.</div>
        <button class="btn" data-act="create" ${c.ok ? '' : 'disabled'}>Create faction <small>${Diplo.COST.create} PP</small></button>${c.ok ? '' : `<div class="why">${esc(c.why)}</div>`}</div>`;
    }
    return `<div class="fac"><div class="label">Your faction</div><h3 class="display" style="font-size:18px;margin:2px 0 6px">${esc(f.name)}</h3>
      <div class="flags">${f.members.map(t => `<span title="${esc(G.countries[t].name)}${t === f.leader ? ' (leader)' : ''}">${flagSVG(t)}</span>`).join('')}</div>
      <div class="note">${f.members.length} member${f.members.length > 1 ? 's' : ''}, led by ${esc(G.countries[f.leader].name)}.${f.leader === G.player ? ' Open a nation to invite it.' : ''}</div>
      <button class="btn sm" data-act="leave">Leave faction</button></div>`;
  }
  function diploPanel() {
    const G = Sim.G;
    if (sel.dip && G.countries[sel.dip]?.alive && sel.dip !== G.player) return nationPanel(sel.dip);
    const rows = Object.values(G.countries).filter(c => c.alive && c.tag !== G.player && c.name.toLowerCase().includes(diploQuery.toLowerCase()))
      .map(c => ({ c, r: Diplo.rel(G.player, c.tag), w: Sim.atWar(c.tag, G.player) }))
      .sort((a, b) => (b.w - a.w) || (Sim.allied(b.c.tag, G.player) - Sim.allied(a.c.tag, G.player)) || a.c.name.localeCompare(b.c.name));
    return `${factionCard()}
      <input class="search" id="dp-search" placeholder="Search nations" value="${esc(diploQuery)}" aria-label="Search nations">
      <div class="list">${rows.map(({ c, r }) => `<button class="row click dip-row" data-dip="${c.tag}">${flagSVG(c.tag)}<div class="grow"><div>${esc(c.name)}</div>
        <div class="sub">${c.gov} · relations ${relTag(r)} ${dipStatus(c.tag)}</div></div><span class="chev">›</span></button>`).join('')}</div>`;
  }
  function nationPanel(tag) {
    const G = Sim.G, c = G.countries[tag], me = G.player;
    const r = Diplo.rel(me, tag), war = Sim.atWar(me, tag);
    const divs = G.armies.filter(a => a.owner === tag).reduce((s, a) => s + a.units.length, 0);
    const f = Sim.factionOf(tag), myF = Sim.factionOf(me);
    const act = (key, label, opts = {}) => {
      const chk = Diplo.can(opts.as || key, me, tag);
      const cost = opts.cost !== undefined ? opts.cost : Diplo.COST[opts.as || key];
      return `<div class="dact"><button class="btn ${opts.cls || ''}" data-act="${key}" ${chk.ok ? '' : 'disabled'}>${label}${cost ? ` <small>${cost} PP</small>` : ''}</button>
        <div class="why">${chk.ok ? esc(opts.hint || '') : esc(chk.why)}</div></div>`;
    };
    const acts = [];
    if (war) {
      const ws = Diplo.warScore(me, tag);
      acts.push(`<div class="note">War score ${ws > 0 ? '+' : ''}${ws}: ${ws >= 25 ? 'you are winning' : ws <= -25 ? 'you are losing' : 'the war is even'}.</div>`);
      acts.push(act('peace', 'Offer white peace', { hint: 'All occupied land goes back' }));
      acts.push(act('peacekeep', 'Demand they cede occupied land', { as: 'peace', hint: 'You keep what you hold' }));
    } else {
      acts.push(act('improve', 'Improve relations', { hint: '+15 relations' }));
      acts.push(act('aid', 'Send military aid', { hint: Diplo.AID_EQ + ' equipment from your stock' }));
      if (!Sim.allied(me, tag)) acts.push(act('pact', 'Non-aggression pact', { hint: 'No war between you for two years' }));
      acts.push(G.dip.guar.some(x => x.by === me && x.of === tag) ? act('unguarantee', 'Revoke guarantee') : act('guarantee', 'Guarantee independence', { hint: 'You join any war against them' }));
      if (f && !myF) acts.push(act('join', 'Ask to join the ' + esc(f.name), { hint: 'You join their wars too' }));
      else if (myF && !f) acts.push(act('invite', 'Invite to the ' + esc(myF.name), { hint: Sim.isAtWar(tag) ? 'Your faction joins their current wars' : 'They join your wars' }));
      if (!Sim.allied(me, tag)) {
        const provs = Diplo.demandTargets(me, tag).map(id => MAP.provs[id].name);
        acts.push(act('demand', 'Demand territory', { hint: provs.length ? provs.join(', ') : '' }));
        const cost = warCost(tag), canW = !G.over && G.countries[me].pp >= cost;
        acts.push(`<div class="dact"><button class="btn danger" data-war="${tag}" ${canW ? '' : 'disabled'}>${Sim.hasPact(me, tag) ? 'Break pact and declare war' : 'Declare war'}${cost ? ` <small>${cost} PP</small>` : ''}</button>
          <div class="why">${canW ? (cost ? '' : 'Justified by your refused demands') : 'Needs ' + cost + ' political power'}</div></div>`);
      }
    }
    return `<button class="btn sm" data-dipback>‹ All nations</button>
      <div class="owner" style="margin:10px 0 4px">${flagSVG(tag)}<div><h3 class="display" style="font-size:20px;margin:0">${esc(c.name)}</h3><div class="sub note" style="margin:0">${c.gov} · ${divs} divisions</div></div></div>
      <div class="meter"><span>Relations</span><div class="bar ${r >= 0 ? 'str' : 'bad'}"><i style="width:${Math.abs(r)}%"></i></div><span>${r > 0 ? '+' : ''}${r}</span></div>
      <div style="margin:6px 0 10px;display:flex;flex-wrap:wrap;gap:4px">${dipStatus(tag) || '<span class="pill">No treaties</span>'}</div>
      <div class="dacts">${acts.join('')}</div>${war ? '' : nationTrade(tag, act)}`;
  }
  function doDiplo(key, tag) {
    const G = Sim.G;
    const action = key === 'peacekeep' ? 'peace' : key;
    let terms = key === 'peacekeep' ? { keep: true } : {};
    const r = Diplo.act(action, G.player, tag, terms);
    toast(r.text, -1, r.accepted === false ? 'loss' : r.accepted ? 'win' : 'info');
    Render.state.dirtyOwners = true;
    renderRight(); renderLeft(); refreshTop();
  }
  // proposals from AI nations wait their turn, one dialog at a time
  const offers = [];
  // shown as a card above the army tray, not a dialog: it never blocks the map or the panels
  // multiplayer: proposals waiting for this player's answer come from the shared game state
  const shownOffers = new Set();
  function pollOffers() {
    const G = Sim.G; if (!G || !G.humans || !G.dip || !G.dip.offers) return;
    for (const o of G.dip.offers) {
      if (o.decider !== G.player || shownOffers.has(o.id)) continue;
      shownOffers.add(o.id);
      offers.push({ o, game: G, respond: yes => Diplo.answerOffer(o.id, yes) });
      while (offers.length > 3) offers.splice(1, 1);
      showOffer();
    }
  }
  function showOffer() {
    const el = $('#offer');
    if (!offers.length) { el.hidden = true; return; }
    if (!el.hidden) return;
    const G = Sim.G, { o, respond } = offers[0];
    const from = o.from;
    el.innerHTML = `<div class="owner">${flagSVG(from)}<b>${esc(G.countries[from].name)}</b></div><p>${esc(o.text)}</p>
      <div class="acts"><span class="note">Relations ${relTag(Diplo.rel(G.player, from))}</span><button class="btn sm" data-x="no">Decline</button><button class="btn sm primary" data-x="yes">Accept</button></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      offers.shift(); el.hidden = true;
      const yes = b.dataset.x === 'yes';
      const r = respond(yes);
      toast(yes ? (r && r.text) || 'Accepted.' : 'You declined the proposal from ' + G.countries[from].name + '.', -1, 'info');
      Render.state.dirtyOwners = true; renderRight(); renderLeft(); refreshTop();
      setTimeout(showOffer, 250);
    });
  }

  // ---------- economy ----------
  const f1 = n => { n = +n || 0; const a = Math.abs(n); return a >= 100 ? String(Math.round(n)) : a >= 10 ? n.toFixed(0) : n.toFixed(1); };
  const sgn = n => (n >= 0 ? '+' : '−') + f1(Math.abs(n));
  const GOOD_COL = { food: '#9ec46b', metal: '#a9b4bf', fuel: '#8a7a5c', strategic: '#d48a4a', luxuries: '#c790d8', arms: '#c9a55a' };
  const goodDot = k => `<i class="gdot" style="background:${GOOD_COL[k]}"></i>`;
  const shortGood = k => Economy.goodName(k).split(/[ ,]/)[0];
  function econPanel() {
    const G = Sim.G, c = G.countries[G.player], e = c.eco;
    if (!e || !e.need) return '<p class="note">No economy.</p>';
    const inc = e.income || {};
    const parts = [['Taxes', inc.tax], ['Exports', inc.trade], ['Trade bonus', inc.bonus], ['World market sales', inc.market], ['Other', inc.other], ['Military upkeep', inc.upkeep], ['Imports', inc.imports]].filter(x => x[1] && Math.abs(x[1]) >= 0.05);
    let html = `<div class="tsum"><div><b class="${e.gold < 0 ? 'neg' : ''}">${fmtN(e.gold)}</b><span>${esc(Economy.coin())}</span></div><div><b class="${e.goldDelta < 0 ? 'neg' : 'pos'}">${sgn(e.goldDelta || 0)}</b><span>A day</span></div><div><b class="${e.health < 0.8 ? 'neg' : ''}">${pct(e.health)}</b><span>Health</span></div></div>
      <div class="list">${parts.map(x => `<div class="row"><div class="grow">${x[0]}</div><span class="num ${x[1] < 0 ? 'neg' : 'pos'}">${sgn(x[1])}</span></div>`).join('')}</div>
      ${e.gold < 0 ? '<div class="why bad">In debt: you cannot build or buy, and stability falls.</div>' : ''}
      <p class="note">Health is how well you are supplied with ${esc(Economy.goodName('food').toLowerCase())}, ${esc(Economy.goodName('metal').toLowerCase())} and ${esc(Economy.goodName('fuel').toLowerCase())}. It speeds up research and taxes. ${Economy.anyShort(G.player) ? '<a href="#" class="lnk" data-gotrade="goods">Some goods are running short: see Trade.</a>' : 'Goods, partners and deals are in the Trade tab.'}</p>`;
    if (typeof Routes !== 'undefined' && G.routes) {
      const R = Routes.summary(G.player);
      if (R.open + R.building + R.cut + R.idle) html += `<hr class="sep"><div class="label">Roads and railways</div><p class="note" style="margin-top:4px">${R.open} working${R.building ? ', ' + R.building + ' being built' : ''}${R.cut ? ', ' + R.cut + ' cut by the enemy' : ''}${R.idle ? ', ' + R.idle + ' quiet' : ''}. Tolls ${f1(R.tolls)} and upkeep ${f1(R.upkeep)} ${esc(Economy.coin())} a month. They build themselves between your buildings and to land neighbours you trade with, and give more output, faster armies and better supply.</p>`;
    }
    html += `<hr class="sep"><div class="label">Construction · ${f1(e.cp)} points a day</div>`;
    const bp = buildPick();
    if (e.queue.length) html += '<div class="list" style="margin:6px 0">' + e.queue.map((q, i) => `<div class="row">${bicon(q.kind, 60)}<div class="grow"><div>${esc(Economy.kindName(q.kind))} <span class="sub">in ${esc(MAP.provs[q.prov].name)}</span></div><div class="bar prog"><i style="width:${Math.round((1 - q.left / q.total) * 100)}%"></i></div></div><span class="sub">${i < 3 ? Math.max(1, Math.ceil(q.left / Math.max(0.1, e.cp / Math.min(3, e.queue.length)))) + ' d' : 'waiting'}</span><button class="btn sm" data-unbuild="${i}" aria-label="Cancel construction" title="Cancel (half the gold back)">×</button></div>`).join('') + '</div>';
    html += `<div class="pickrow"><label for="build-prov">Build in</label>${provSelect('build-prov', bp, 'Best province for each')}</div>
      <div class="builds">${Economy.KIND_KEYS.map(k => { const chk = Economy.canBuild(G.player, k, bp); return `<button class="btn sm" data-build="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? 'Builds in ' + MAP.provs[chk.prov].name : chk.why)}">${bicon(k)}<span>${esc(Economy.kindName(k))}</span><small>${Economy.buildCost(k, G.player).gold} gold</small></button>`; }).join('')}</div>
      <div class="label" style="margin-top:8px">Military works</div>
      <div class="builds">${Economy.infraKinds().filter(k => Economy.INFRA[k].needs !== 'air' || Air.available()).map(k => { const chk = Economy.canBuild(G.player, k, bp); return `<button class="btn sm" data-build="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? INFRA_TIP[k] + ' Builds in ' + MAP.provs[chk.prov].name + '.' : chk.why)}">${bicon(k)}<span>${esc(Economy.kindName(k))}</span><small>${chk.ok ? chk.cost.gold : Economy.buildCost(k, G.player, bp).gold} gold</small></button>`; }).join('')}</div>
      <div class="note">${bp < 0 ? 'Each building goes to your best province for it. Pick a province above, or click one on the map, to choose the place yourself.' : 'Buildings go up in ' + esc(MAP.provs[bp].name) + ' and appear there on the map.'}</div>`;
    return html;
  }
  function dealRow(d) {
    const G = Sim.G, me = G.player, sell = d.from === me, other = sell ? d.to : d.from;
    const good = Economy.goodName(d.good).toLowerCase();
    const dep = Economy.dependence(d.to, d.good, d.from);
    const txt = sell ? `You sell ${d.amount} ${good} a day to ${G.countries[other].name} for ${d.price} gold` : `${G.countries[other].name} sells you ${d.amount} ${good} a day for ${d.price} gold`;
    const depTxt = sell ? `${G.countries[other].name} gets ${Math.round(dep * 100)}% of its ${good} from you` : `You get ${Math.round(dep * 100)}% of your ${good} from ${G.countries[other].name}`;
    const short = d.delivered !== undefined && d.delivered < d.amount - 0.05 ? ` · only ${f1(d.delivered)} delivered` : '';
    return `<div class="row deal">${flagSVG(other)}<div class="grow"><div>${goodDot(d.good)}${esc(txt)}</div><div class="sub">${esc(depTxt + short)}</div></div><button class="btn sm" data-canceldeal="${d.id}" data-with="${other}">Cancel</button></div>`;
  }
  // trade in the Nations tab is a short summary: offers are made from the Trade tab
  function nationTrade(tag, act) {
    const G = Sim.G, me = G.player, deals = Economy.dealBetween(me, tag);
    const emb = G.dip.embargo.some(x => x.by === me && x.of === tag);
    return `<hr class="sep"><div class="label">Trade</div>
      ${deals.length ? '<div class="list" style="margin:6px 0">' + deals.map(d => dealRow(d)).join('') + '</div>' : ''}
      <div class="dacts"><div class="dact"><button class="btn" data-tradewith="${tag}" ${emb ? 'disabled' : ''}>Trade with ${esc(G.countries[tag].name)} ›</button><div class="why">Opens the Trade tab with an offer to them</div></div>
      ${emb ? act('lift', 'Lift embargo') : act('embargo', 'Embargo', { cls: 'danger', hint: 'Cut every deal with them and refuse new ones' + (Sim.factionOf(me) && Sim.factionOf(me).leader === me ? '. Your faction is asked to join.' : '') })}</div>`;
  }

  // ---------- trade tab: goods, partners, deals ----------
  const AMOUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 60, 80];
  const GOOD_ICON = { food: 'wheat', metal: 'ingot', fuel: 'drop', strategic: 'tyre', luxuries: 'bag', arms: 'hammer' };
  const gIcon = k => `<svg class="i"><use href="#i-${GOOD_ICON[k] || 'bag'}"/></svg>`;
  const tf = { buy: true, good: 'food', open: null, amount: 5, adj: 0 };
  sel.tv = 'goods';
  const tfPrice = () => +(Economy.fairPrice(tf.good, tf.amount) * (1 + tf.adj)).toFixed(1);
  const tfTerms = () => ({ good: tf.good, amount: tf.amount, price: tfPrice(), sell: !tf.buy });
  // nations worth offering to: they have the good to spare (to buy) or lack it (to sell)
  function partners() {
    const G = Sim.G, me = G.player, k = tf.good;
    const list = Object.values(G.countries).filter(c => c.alive && c.tag !== me && c.eco && c.eco.need && !Sim.atWar(c.tag, me) && Economy.routeOK(me, c.tag))
      .map(c => ({ c, b: Economy.balance(c.tag, k) }))
      .filter(x => x.c.tag === tf.open || (tf.buy ? x.b > 0.5 : x.b < -0.5))
      .sort((x, y) => (y.c.tag === tf.open) - (x.c.tag === tf.open) || (tf.buy ? y.b - x.b : x.b - y.b));
    return list.slice(0, 14);
  }
  function openOffer(tag) {
    const me = Sim.G.player, cap = Math.abs(Economy.balance(tag, tf.good)), need = tf.buy ? Math.max(1, -Economy.balance(me, tf.good)) : cap;
    tf.open = tag; tf.adj = 0;
    tf.amount = AMOUNTS.filter(a => a <= Math.max(1, Math.min(cap || need, need))).pop() || 1;
    // start at a price they would take: at least their asking price when buying, at most their limit when selling
    const w = Economy.worldPrice(tf.good), ba = Economy.bidAsk(tag, tf.good, me), step = x => Math.round(x * 20) / 20;
    tf.adj = tf.buy ? Math.max(0, Math.ceil((ba.ask / w - 1) * 20 - 1e-6) / 20) : Math.min(0, Math.floor((ba.bid / w - 1) * 20 + 1e-6) / 20);
    tf.adj = Math.max(-0.4, Math.min(0.8, step(tf.adj)));
  }
  // the world market: every good's price, how it compares with normal, and where it went in the last month
  function worldMarket() {
    const rows = Economy.GOODS.map(k => {
      const p = Economy.worldPrice(k), rel = p / Economy.BASE_PRICE[k], tr = Economy.priceTrend(k);
      const pct = Math.round((rel - 1) * 100), x = Math.max(0, Math.min(100, (Math.log(rel) / Math.log(2) + 1) * 50));
      const arrow = Math.abs(tr) < 0.01 ? '<span class="tr">steady</span>' : `<span class="tr ${tr > 0 ? 'up' : 'down'}">${tr > 0 ? '▲' : '▼'} ${Math.abs(Math.round(tr * 100)) || '<1'}%</span>`;
      return `<div class="wm" data-wm="${k}" title="${esc(Economy.goodName(k))}: ${p.toFixed(2)} gold a unit, ${pct === 0 ? 'the normal price' : Math.abs(pct) + '% ' + (pct > 0 ? 'above' : 'below') + ' normal'}">
        <span class="wn">${gIcon(k)}${esc(shortGood(k))}</span><b class="num">${p.toFixed(2)}</b>
        <span class="wbar"><i style="left:${x}%" class="${pct > 10 ? 'hi' : pct < -10 ? 'lo' : ''}"></i></span>
        <span class="wp ${pct > 10 ? 'neg' : pct < -10 ? 'pos' : ''}">${pct > 0 ? '+' : ''}${pct}%</span>${arrow}</div>`;
    }).join('');
    return `<div class="wmarket"><div class="sectionlabel"><span class="label">World market · gold a unit</span><span class="label">vs normal · month</span></div>${rows}
      <p class="note">Nations pay more than this when they badly need a good, and only buy below it when their stores are full. Prices rise when the world lacks a good.</p></div>`;
  }
  function tradePanel() {
    const G = Sim.G, me = G.player, c = G.countries[me], e = c.eco;
    if (!e || !e.need) return '<p class="note">No economy.</p>';
    const deals = Economy.dealsOf(me), slots = Economy.tradeSlots(me);
    const earned = deals.filter(d => d.from === me).reduce((s, d) => s + d.price, 0), paid = deals.filter(d => d.to === me).reduce((s, d) => s + d.price, 0);
    const shorts = Economy.GOODS.filter(k => Economy.balance(me, k) < -0.05).length;
    let h = `<div class="tsum"><div><b>${deals.length} of ${slots}</b><span>Deal slots</span></div><div><b class="pos">+${f1(earned)}</b><span>Earned a day</span></div><div><b class="${paid ? 'neg' : ''}">−${f1(paid)}</b><span>Paid a day</span></div></div>
      <div class="subtabs" role="tablist">
        <button data-tv="goods" class="${sel.tv === 'goods' ? 'on' : ''}" role="tab" aria-selected="${sel.tv === 'goods'}">Goods<small>${shorts ? shorts + ' running short' : 'All supplied'}</small></button>
        <button data-tv="partners" class="${sel.tv === 'partners' ? 'on' : ''}" role="tab" aria-selected="${sel.tv === 'partners'}">Partners<small>Make an offer</small></button>
        <button data-tv="deals" class="${sel.tv === 'deals' ? 'on' : ''}" role="tab" aria-selected="${sel.tv === 'deals'}">Deals<small>${deals.length} active</small></button>
      </div>`;
    if (sel.tv === 'goods') {
      h += worldMarket();
      h += `<div class="rows">${Economy.GOODS.map(k => {
        const n = Economy.balance(me, k), imp = e.imp[k], exp = e.exp[k], short = n < -0.05, sur = n > Math.max(1, e.need[k] * 0.1);
        const w = Math.min(50, Math.abs(n) / Math.max(4, e.need[k] || 1) * 50), days = Economy.daysLeft(me, k);
        return `<div class="good ${short ? 'short' : sur ? 'surplus' : ''}" data-good="${k}">
          <div class="gi">${gIcon(k)}</div>
          <div class="nm">${esc(Economy.goodName(k))} <span class="net ${short ? 'neg' : sur ? 'pos' : ''}">${sgn(n)} a day</span></div>
          <div class="act">${short ? `<button class="btn sm primary" data-find="buy:${k}">Find sellers</button>` : sur ? `<button class="btn sm" data-find="sell:${k}">Find buyers</button>` : ''}</div>
          <div class="meta">World price <b class="num">${Economy.worldPrice(k).toFixed(2)}</b> · made ${f1(e.prod[k])} · used ${f1(e.need[k])}${imp > 0.05 ? ' · bought ' + f1(imp) : ''}${exp > 0.05 ? ' · sold ' + f1(exp) : ''} · ${short ? (e.stock[k] > 0.5 ? 'stock lasts ' + days + ' days' : '<span class="neg">no stock left</span>') : 'stock ' + fmtN(e.stock[k])}</div>
          <div class="dbar"><i style="${n < 0 ? `right:50%;width:${w}%;background:var(--bad)` : `left:50%;width:${w}%;background:var(--good)`}"></i></div>
        </div>`;
      }).join('')}
        <div class="good"><div class="gi">${gIcon('arms')}</div><div class="nm">${esc(Economy.goodName('arms'))} <span class="net pos">+${f1(e.arms)} a day</span></div><div class="act"></div><div class="meta">Made from ${esc(Economy.goodName('metal').toLowerCase())} and ${esc(Economy.goodName('fuel').toLowerCase())} · stock ${fmtN(c.equipment)} · not traded</div></div></div>
      <p class="note" style="margin-top:10px">Red goods are running short and slow your factories and research. Find sellers lists the nations that have some to spare.</p>`;
    } else if (sel.tv === 'partners') {
      const list = partners(), gname = Economy.goodName(tf.good).toLowerCase();
      h += `<div class="filter">
        <div class="ln"><span>I want to</span><div class="seg"><button class="chip ${tf.buy ? 'on' : ''}" data-tb="1">Buy</button><button class="chip ${!tf.buy ? 'on' : ''}" data-tb="0">Sell</button></div></div>
        <div class="ln"><span>Good</span>${Economy.GOODS.map(k => `<button class="chip ${k === tf.good ? 'on' : ''}" data-tg="${k}" title="${esc(Economy.goodName(k))}">${gIcon(k)}${esc(shortGood(k))}</button>`).join('')}</div>
      </div>
      <div class="sectionlabel"><span class="label">${list.filter(x => tf.buy ? x.b > 0.5 : x.b < -0.5).length} nations ${tf.buy ? 'have spare' : 'need'} ${esc(gname)}</span><span class="label">World price ${Economy.worldPrice(tf.good).toFixed(2)} a unit</span></div>
      <div class="rows">${list.map(({ c: p, b }) => {
        const open = tf.open === p.tag, t = tfTerms();
        const chk = Diplo.can('trade', me, p.tag, t);
        const ans = chk.ok ? Economy.answerDeal(me, p.tag, t) : null;
        const pill = !chk.ok ? '<span class="pill no">Blocked</span>' : ans.yes ? '<span class="pill yes">Likely yes</span>' : '<span class="pill no">Unlikely</span>';
        const r = Diplo.rel(me, p.tag), ba = Economy.bidAsk(p.tag, tf.good, me);
        return `<div class="partner ${open ? 'open' : ''}" data-partner="${p.tag}">
          <div class="top">${flagSVG(p.tag)}<div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub">${b > 0.05 ? 'Spare ' + f1(b) : b < -0.05 ? 'Short by ' + f1(-b) : 'None spare'} ${esc(gname)} a day · ${tf.buy ? 'sells from ' + ba.ask.toFixed(2) : 'pays up to ' + ba.bid.toFixed(2)} a unit${!tf.buy && ba.need >= 0.7 ? ' (badly needs it)' : !tf.buy && ba.need < 0 ? ' (has plenty)' : ''} · relations ${r > 0 ? '+' : ''}${r}${Diplo.borders(me, p.tag) ? '' : ' · by sea'}</div></div>
            ${open ? pill : pill + `<button class="btn sm" data-offer="${p.tag}">Offer</button>`}</div>
          ${open ? `<div class="dealform">
            <div class="stepper"><span>Amount a day</span><button class="iconbtn" data-amt="-1" aria-label="Less"><svg class="i"><use href="#i-minus"/></svg></button><b class="num">${tf.amount}</b><button class="iconbtn" data-amt="1" aria-label="More"><svg class="i"><use href="#i-plus"/></svg></button><small>${Math.abs(b) > 0.05 ? (tf.buy ? 'they spare ' : 'they need ') + f1(Math.abs(b)) : ''}</small></div>
            <div class="stepper"><span>Gold a day</span><button class="iconbtn" data-adj="-0.05" aria-label="Lower price"><svg class="i"><use href="#i-minus"/></svg></button><b class="num">${t.price}</b><button class="iconbtn" data-adj="0.05" aria-label="Higher price"><svg class="i"><use href="#i-plus"/></svg></button><small>${tf.adj === 0 ? 'world price' : (tf.adj > 0 ? '+' : '') + Math.round(tf.adj * 100) + '% vs world'}</small></div>
            <div class="summary">${esc(tf.buy ? `You buy ${tf.amount} ${gname} a day from ${p.name} for ${t.price} gold a day.` : `You sell ${tf.amount} ${gname} a day to ${p.name} for ${t.price} gold a day.`)}<small>${esc(!chk.ok ? chk.why + '.' : 'Uses 1 deal slot and ' + Diplo.COST.trade + ' political power. ' + (ans.yes ? 'They would agree.' : 'They would refuse: ' + ans.why.toLowerCase() + '.'))}</small></div>
            <div style="display:flex;gap:6px;justify-content:space-between"><button class="btn sm danger" data-emb="${p.tag}" ${Diplo.can('embargo', me, p.tag).ok ? '' : 'disabled'}>Embargo</button><span style="display:flex;gap:6px"><button class="btn sm ghost" data-tcancel="1">Cancel</button><button class="btn sm primary" data-send="${p.tag}" ${chk.ok && c.pp >= Diplo.COST.trade ? '' : 'disabled'}>Send offer</button></span></div>
          </div>` : ''}
        </div>`;
      }).join('') || `<p class="note">Nobody ${tf.buy ? 'has ' + esc(gname) + ' to spare' : 'is short of ' + esc(gname)} right now.</p>`}</div>`;
    } else {
      const grp = (title, arr) => `<div class="sectionlabel"><span class="label">${title}</span></div>` + (arr.length ? `<div class="list">${arr.map(dealRow).join('')}</div>` : '<p class="note">None.</p>');
      h += grp('Buying', deals.filter(d => d.to === me)) + grp('Selling', deals.filter(d => d.from === me));
      const emb = G.dip.embargo.filter(x => x.by === me || x.of === me);
      h += '<div class="sectionlabel"><span class="label">Embargoes</span></div>' + (emb.length ? '<div class="list">' + emb.map(x => `<div class="row">${flagSVG(x.by === me ? x.of : x.by)}<div class="grow">${x.by === me ? 'Your embargo on ' + esc(G.countries[x.of].name) : esc(G.countries[x.by].name) + ' embargoes you'}</div>${x.by === me ? `<button class="btn sm" data-lift="${x.of}">Lift</button>` : ''}</div>`).join('') + '</div>' : '<p class="note">None. Embargo a nation from its row under Partners.</p>');
      h += '<p class="note" style="margin-top:10px">World prices are under <a href="#" data-gotrade="goods">Goods</a>.</p>';
    }
    return h;
  }
  function bindTrade(body) {
    const G = Sim.G, me = G.player;
    const redo = () => renderRight();
    body.querySelectorAll('[data-tv]').forEach(b => b.onclick = () => { sel.tv = b.dataset.tv; redo(); body.scrollTop = 0; });
    body.querySelectorAll('[data-find]').forEach(b => b.onclick = () => { const [m, k] = b.dataset.find.split(':'); tf.buy = m === 'buy'; tf.good = k; tf.open = null; sel.tv = 'partners'; redo(); body.scrollTop = 0; });
    body.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => { tf.buy = b.dataset.tb === '1'; tf.open = null; redo(); });
    body.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { tf.good = b.dataset.tg; if (tf.open) openOffer(tf.open); redo(); });
    body.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => { openOffer(b.dataset.offer); redo(); });
    body.querySelectorAll('[data-amt]').forEach(b => b.onclick = () => { const i = AMOUNTS.indexOf(tf.amount); tf.amount = AMOUNTS[Math.max(0, Math.min(AMOUNTS.length - 1, (i < 0 ? 4 : i) + +b.dataset.amt))]; redo(); });
    body.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => { tf.adj = Math.max(-0.4, Math.min(0.8, Math.round((tf.adj + +b.dataset.adj) * 100) / 100)); redo(); });
    body.querySelectorAll('[data-tcancel]').forEach(b => b.onclick = () => { tf.open = null; redo(); });
    body.querySelectorAll('[data-send]').forEach(b => b.onclick = () => {
      const r = Diplo.act('trade', me, b.dataset.send, tfTerms());
      toast(r.text, -1, r.accepted === false ? 'loss' : r.accepted ? 'win' : 'info');
      if (r.accepted) tf.open = null;
      redo(); refreshTop();
    });
    body.querySelectorAll('[data-emb]').forEach(b => b.onclick = () => { const r = Diplo.act('embargo', me, b.dataset.emb); toast(r.text, -1, 'info'); tf.open = null; redo(); refreshTop(); });
    body.querySelectorAll('[data-tradewith]').forEach(b => b.onclick = () => {
      const tag = b.dataset.tradewith, bal = k => Economy.balance(tag, k), mine = k => Economy.balance(me, k);
      // start from what fits best: something they spare and we lack, else something we spare and they lack
      let best = null, bv = 0;
      for (const k of Economy.GOODS) { const buy = Math.min(-mine(k), bal(k)), sell = Math.min(mine(k), -bal(k)); if (buy > bv) { bv = buy; best = [true, k]; } if (sell > bv) { bv = sell; best = [false, k]; } }
      if (!best) best = [true, Economy.GOODS.reduce((a, k) => bal(k) > bal(a) ? k : a, Economy.GOODS[0])];
      tf.buy = best[0]; tf.good = best[1]; openOffer(tag); sel.tv = 'partners'; openTab('trade');
    });
    body.querySelectorAll('[data-gotrade]').forEach(b => b.onclick = e => { e.preventDefault(); sel.tv = b.dataset.gotrade; openTab('trade'); });
  }

  // ---------- research ----------
  let treeOpen = false;
  function techCard(tag, t) {
    const st = Tech.state(tag, t.id), x = Tech.info(t.id), c = Sim.G.countries[tag];
    const slot = c.rs.slots.find(s => s && s.id === t.id);
    const pts = slot ? slot.pts : (c.rs.saved[t.id] || 0);
    const rate = Math.max(0.01, c.rs.rate || Tech.rate(tag));
    const days = Math.ceil((x.cost - pts) / rate);
    const gate = t.from && !Tech.dateReady(x) ? `<em>Available from ${esc(Tech.fromLabel(x))}</em>` : '';
    const foot = st === 'done' ? 'Researched' : st === 'closed' ? 'Other path chosen' : st === 'locked' ? 'Needs the tier before' : st === 'active' ? Math.round(pts / x.cost * 100) + '% · ' + days + ' d' : x.cost + ' points · about ' + days + ' days';
    return `<button class="tcard ${st}" data-tech="${t.id}" ${st === 'open' ? '' : 'aria-disabled="true"'}><b>${esc(t.name)}</b><span>${esc(t.desc || '')}</span>${gate}<small>${foot}</small>${st === 'active' ? `<i class="tp" style="width:${Math.round(pts / x.cost * 100)}%"></i>` : ''}</button>`;
  }
  function pickTech(id) {
    const G = Sim.G, st = Tech.state(G.player, id);
    if (st !== 'open') return;
    const r = Tech.start(G.player, id);
    if (!r.ok) toast(r.why + (r.why.includes('busy') ? ': stop one in the Research tab first.' : '.'), -1, 'info');
    renderRight(); renderTree();
  }
  function techPanel() {
    const G = Sim.G, c = G.countries[G.player];
    if (!c.rs || !Tech.branchesFor(G.player).length) return '<p class="note">No technologies for this era.</p>';
    let html = `<dl class="kv"><dt>Research</dt><dd>${f1(Tech.rate(G.player))} points a day</dd><dt>Researched</dt><dd>${c.techs.length}</dd></dl><div class="label">Research slots</div><div class="list" style="margin:6px 0">`;
    c.rs.slots.forEach((s, i) => {
      if (!s) { html += `<div class="row"><div class="grow note">Empty slot: pick a technology below.</div></div>`; return; }
      const x = Tech.info(s.id);
      const days = Math.ceil((x.cost - s.pts) / Math.max(0.01, c.rs.rate || Tech.rate(G.player)));
      const gate = x.t.from && !Tech.dateReady(x) ? ' · waits for ' + Tech.fromLabel(x) : '';
      html += `<div class="row"><div class="grow"><div>${esc(x.t.name)}</div><div class="bar prog"><i style="width:${Math.round(s.pts / x.cost * 100)}%"></i></div><div class="sub">${s.pts >= x.cost ? 'Ready' : days + ' days'}${esc(gate)}</div></div><button class="btn sm" data-stopr="${i}">Stop</button></div>`;
    });
    html += `</div><button class="btn" data-opentree style="width:100%">Open the tech tree</button><div class="label" style="margin-top:10px">Available now</div><div class="tlist">`;
    for (const b of Tech.branchesFor(G.player)) for (const tier of b.tiers) for (const t of (Array.isArray(tier) ? tier : [tier]))
      if (Tech.state(G.player, t.id) === 'open') html += techCard(G.player, t).replace('<b>', `<u>${esc(b.name)}</u><b>`);
    return html + '</div>';
  }
  function renderTree() {
    const el = $('#techtree'), G = Sim.G;
    if (!treeOpen || !G) { el.hidden = true; return; }
    el.hidden = false;
    const me = G.player, c = G.countries[me];
    const cols = Tech.branchesFor(me).map(b => `<div class="tcol ${b.id.includes(':') ? 'own' : ''}"><div class="label">${esc(b.name)}${b.id.startsWith('nat:') ? ' · national' : b.id.startsWith('cul:') ? ' · culture' : ''}</div>${b.tiers.map((tier, i) =>
      Array.isArray(tier) ? `<div class="tchoice"><div class="tier">Tier ${i + 1} · choose one</div>${tier.map(t => techCard(me, t)).join('<div class="or">or</div>')}</div>` : `<div class="tier">Tier ${i + 1}</div>` + techCard(me, tier)).join('')}</div>`).join('');
    const slots = c.rs.slots.map(s => s ? esc(Tech.info(s.id).t.name) : 'empty').join(' · ');
    if (!setHTML(el, `<div class="tt-head"><div><div class="label">Technology · ${esc(typeof Eras !== 'undefined' ? (Eras.list().find(e => e.id === (Eras.isBase() ? Eras.BASE_ID : Eras.info().id)) || {}).name || '' : '')}</div>
      <div class="note" style="margin:0">Researching: ${slots}. ${f1(Tech.rate(me))} points a day. Tier 3 is a choice: taking one path closes the other for good.</div></div><button class="close" aria-label="Close" id="tt-close">×</button></div>
      <div class="tcols">${cols}</div>`)) return;
    $('#tt-close').onclick = () => { treeOpen = false; renderTree(); };
    el.querySelectorAll('[data-tech]').forEach(b => b.onclick = () => pickTech(b.dataset.tech));
  }

  function warsPanel() {
    const G = Sim.G;
    if (!G.wars.length) return '<p class="note">The world is at peace.</p>';
    return G.wars.map(w => {
      const side = list => { const f = list.map(t => Sim.factionOf(t)).find(Boolean); return (f ? `<div class="label">${esc(f.name)}</div>` : '') + list.map(t => `<div class="owner" style="margin:3px 0">${flagSVG(t)}<span>${esc(G.countries[t].name)}</span></div>`).join(''); };
      const occ = (list, enemies) => MAP.provs.filter(p => list.includes(p.core) && enemies.includes(G.owner[p.id])).length;
      const casA = w.attackers.reduce((s, t) => s + G.countries[t].losses, 0), casD = w.defenders.reduce((s, t) => s + G.countries[t].losses, 0);
      return `<div class="panel" style="padding:10px;margin-bottom:10px;box-shadow:none">
        <div class="label">${w.name === 'World War' ? 'Global conflict' : 'War'} · since ${Sim.dateStr(w.start)}</div>
        <h3 class="display" style="font-size:19px;margin:2px 0 4px">${esc(w.name)}</h3><div class="note">War goal: ${esc(w.goal)}</div>
        <div class="vs"><div class="side">${side(w.attackers)}<div class="sub note">Occupying ${occ(w.defenders, w.attackers)} provinces · losses ${fmtN(casA)}</div></div><div class="mid">vs</div>
        <div class="side">${side(w.defenders)}<div class="sub note">Occupying ${occ(w.attackers, w.defenders)} provinces · losses ${fmtN(casD)}</div></div></div></div>`;
    }).join('');
  }
  function logPanel() {
    const G = Sim.G;
    if (!G.log.length) return '<p class="note">Nothing has happened yet.</p>';
    return '<div class="list">' + G.log.slice(0, 60).map(l => `<div class="row ${l.prov >= 0 ? 'click' : ''}" data-prov="${l.prov}"><div class="grow"><div class="sub">${Sim.dateStr(l.hour)}</div><div>${esc(l.text)}</div></div></div>`).join('') + '</div>';
  }
  function bindRight() {
    const G = Sim.G, body = $('#rp-body');
    body.querySelectorAll('[data-selarmy]').forEach(b => b.onclick = e => { const id = +b.dataset.selarmy; selectArmies([id], e.shiftKey || e.ctrlKey || e.metaKey); if (!e.shiftKey) { const a = Sim.army(id); if (a) { const p = MAP.provs[a.prov]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 6)); } } });
    bindTrade(body);
    body.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
      const t = myArmiesSel().length === 1 ? myArmiesSel()[0].id : 0;
      if (Sim.recruit(G.player, b.dataset.rec, t, spawnPick())) { renderRight(); refreshTop(); }
    });
    const pick = (id, fn) => { const s = body.querySelector('#' + id); if (s) s.onchange = () => { fn(+s.value); s.blur(); renderRight(); }; };
    pick('rec-prov', v => { sel.spawnProv = v; });
    pick('build-prov', v => { sel.buildProv = v; if (v >= 0) { const p = MAP.provs[v]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 6)); } });
    spinBuildings(performance.now(), true);
    body.querySelectorAll('[data-war]').forEach(b => b.onclick = () => confirmWar(b.dataset.war));
    body.querySelectorAll('[data-dip]').forEach(b => b.onclick = () => { sel.dip = b.dataset.dip; renderRight(); body.scrollTop = 0; });
    body.querySelectorAll('[data-dipback]').forEach(b => b.onclick = () => { sel.dip = null; renderRight(); body.scrollTop = 0; });
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => doDiplo(b.dataset.act, sel.dip));
    body.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => selectProvince(+b.dataset.cap, true));
    body.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { if (+b.dataset.prov >= 0) selectProvince(+b.dataset.prov, true); });
    body.querySelectorAll('[data-canceldeal]').forEach(b => b.onclick = () => { const r = Diplo.act('canceltrade', G.player, b.dataset.with, { id: +b.dataset.canceldeal }); toast(r.text, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-lift]').forEach(b => b.onclick = () => { const r = Diplo.act('lift', G.player, b.dataset.lift); toast(r.text, -1, 'info'); renderRight(); });
    body.querySelectorAll('[data-build]').forEach(b => b.onclick = () => { const r = Economy.build(G.player, b.dataset.build, buildPick()); toast(r.ok ? r.text : r.why, r.ok ? r.prov : -1, 'info'); renderRight(); refreshTop(); renderLeft(); });
    body.querySelectorAll('[data-unbuild]').forEach(b => b.onclick = () => { Economy.cancelBuild(G.player, +b.dataset.unbuild); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const r = Politics.take(G.player, b.dataset.dec); toast(r.ok ? r.text : r.why, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-evopen]').forEach(b => b.onclick = () => showEvent());
    body.querySelectorAll('[data-tech]').forEach(b => b.onclick = () => pickTech(b.dataset.tech));
    body.querySelectorAll('[data-fleet]').forEach(b => b.onclick = () => { selectFleet(+b.dataset.fleet); const f = Navy.fleet(+b.dataset.fleet); if (f) { const [x, y] = Render.fleetPos(f); Render.flyTo(x, y, Math.max(Render.cam.z, 5)); } });
    body.querySelectorAll('[data-wing]').forEach(b => b.onclick = () => { selectWing(+b.dataset.wing); const w = Air.wing(+b.dataset.wing); if (w) { const p = MAP.provs[w.base]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 6)); } });
    body.querySelectorAll('[data-zone]').forEach(b => b.onclick = e => { e.preventDefault(); selectZone(+b.dataset.zone, true); });
    body.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => { const f = Navy.fleet(sel.fleet); if (!f) return; if (!Navy.setMission(f, b.dataset.fm)) toast('The fleet cannot take that mission from here.', -1, 'info'); renderRight(); });
    body.querySelectorAll('[data-fo]').forEach(b => b.onclick = () => {
      const f = Navy.fleet(sel.fleet), k = b.dataset.fo;
      if (k === 'back') { selectFleet(0); return; }
      if (!f) return;
      if (k === 'move') { pending = pending && pending.kind === 'fleet' ? null : { kind: 'fleet' }; showHint(); }
      if (k === 'repair') { if (!Navy.setMission(f, 'repair')) toast('No friendly port within reach.', -1, 'info'); }
      if (k === 'split') { const n = Navy.splitFleet(f); if (n) toast('Split off the ' + n.name + '.', -1, 'info'); }
      if (k === 'merge') { const m = Navy.mergeFleets([f, ...G.fleets.filter(x => x !== f && x.owner === G.player && x.zone === f.zone && !x.battle)]); if (m) toast('Fleets merged into the ' + m.name + '.', -1, 'info'); }
      renderRight();
    });
    body.querySelectorAll('[data-wm]').forEach(b => b.onclick = () => { pending = pending && pending.kind === 'wing' && pending.mission === b.dataset.wm ? null : { kind: 'wing', mission: b.dataset.wm }; showHint(); renderRight(); });
    body.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => {
      const w = Air.wing(sel.wing), k = b.dataset.wo;
      if (k === 'back') { selectWing(0); return; }
      if (!w) return;
      if (k === 'idle') { Air.setMission(w, 'idle'); pending = null; showHint(); }
      if (k === 'rebase') { pending = pending && pending.kind === 'rebase' ? null : { kind: 'rebase' }; showHint(); }
      renderRight();
    });
    body.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { const r = Navy.build(G.player, b.dataset.ship); toast(r.ok ? r.text : r.why, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-unship]').forEach(b => b.onclick = () => { Navy.cancelBuild(G.player, +b.dataset.unship); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-plane]').forEach(b => b.onclick = () => { const r = Air.build(G.player, b.dataset.plane); toast(r.ok ? r.text : r.why, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-unplane]').forEach(b => b.onclick = () => { Air.cancelBuild(G.player, +b.dataset.unplane); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-stopr]').forEach(b => b.onclick = () => { Tech.stop(G.player, +b.dataset.stopr); renderRight(); renderTree(); });
    body.querySelectorAll('[data-opentree]').forEach(b => b.onclick = () => { treeOpen = true; renderTree(); });
    const s = $('#dp-search');
    if (s) s.oninput = e => { diploQuery = e.target.value; renderRight(); const n = $('#dp-search'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }

  function armyOrder(kind) {
    const list = myArmiesSel();
    if (!list.length) return;
    if (kind === 'cancelsea') { list.forEach(a => Navy.cancelInvasion(a)); renderRight(); return; }
    if (kind === 'move' || kind === 'attack' || kind === 'redeploy' || kind === 'front' || kind === 'invade') {
      pending = pending && pending.kind === kind ? null : { kind };
      showHint(); renderRight(); return;
    }
    pending = null; showHint();
    if (kind === 'hold') list.forEach(Sim.orderHold);
    if (kind === 'retreat') list.forEach(a => Sim.orderRetreat(a));
    if (kind === 'split') { const b = Sim.splitArmy(list[0]); if (b) selectArmies([list[0].id, b.id], false); }
    if (kind === 'merge') { const m = Sim.mergeArmies(list); if (m) selectArmies([m.id], false); }
    if (kind === 'recruit') { sel.tab = 'recruit'; sel.collapsed = false; }
    renderRight(); renderTrays();
  }
  function showHint() {
    const h = $('#hint');
    const txt = { move: 'Choose a destination province', attack: 'Choose an enemy province, or an enemy army to hunt down', redeploy: 'Choose a friendly province to redeploy to', front: 'Choose an enemy province to set the front against',
      invade: 'Choose a coastal province to land in', fleet: 'Choose a sea zone to sail to', rebase: 'Choose a province with a friendly airbase',
      wing: pending && pending.mission === 'naval' ? 'Choose a sea zone to strike' : pending && pending.mission === 'bomb' ? 'Choose an enemy province to bomb' : 'Choose where the wing should fly' };
    if (!pending) { h.hidden = true; $('#map').classList.remove('targeting'); return; }
    h.hidden = false; h.textContent = txt[pending.kind] + ' · Esc to cancel';
    $('#map').classList.add('targeting');
  }
  function resolvePending(prov, zone) {
    const G = Sim.G, list = myArmiesSel();
    const kind = pending.kind, mission = pending.mission; pending = null; showHint();
    if (kind === 'fleet') { sendFleet(zone >= 0 ? zone : prov >= 0 && Seas.isCoastal(prov) ? Seas.zonesOf(prov)[0] : -1); renderRight(); return; }
    if (kind === 'wing' || kind === 'rebase') {
      const w = Air.wing(sel.wing); if (!w) return;
      let r;
      if (kind === 'rebase') r = prov >= 0 ? Air.rebase(w, prov) : { ok: false, why: 'Pick a province with an airbase.' };
      else if (mission === 'naval' || (mission === 'superiority' && prov < 0)) r = zone >= 0 ? Air.setMission(w, mission, zone, true) : prov >= 0 && mission === 'naval' && Seas.isCoastal(prov) ? Air.setMission(w, mission, Seas.zonesOf(prov)[0], true) : mission === 'superiority' && prov >= 0 ? Air.setMission(w, mission, prov) : { ok: false, why: 'Pick a sea zone.' };
      else r = prov >= 0 ? Air.setMission(w, mission, prov) : { ok: false, why: 'Pick a land province.' };
      toast(r.ok ? (kind === 'rebase' ? w.name + ' moved to ' + MAP.provs[w.base].name + '.' : w.name + ': ' + Air.MISSIONS[w.mission].name.toLowerCase() + '.') : r.why, -1, 'info');
      renderRight(); return;
    }
    if (kind === 'invade') {
      if (prov < 0 || list.length !== 1) { toast('Pick a coastal province on land.', -1, 'info'); return; }
      const r = Navy.invade(list[0], prov);
      toast(r.ok ? r.text : r.why, prov, 'info'); renderRight(); renderTrays(); return;
    }
    if (prov < 0 || !list.length) return;
    if (kind === 'front') {
      const tag = G.owner[prov];
      if (!Sim.atWar(tag, G.player)) { toast('Pick a province of a country you are at war with.', -1, 'info'); return; }
      list.forEach(a => Sim.orderDefend(a, tag));
      toast(list.length + ' ' + (list.length > 1 ? 'armies' : 'army') + ' now defending the front against ' + G.countries[tag].name + '.', -1, 'info');
    } else issueMove(list, prov, kind);
    renderRight();
  }
  function chase(list, foe) {
    if (!list.length) return;
    const ok = list.filter(a => Sim.orderChase(a, foe)).length;
    toast(ok ? (ok > 1 ? ok + ' armies are' : list[0].name + ' is') + ' hunting ' + Sim.G.countries[foe.owner].name + ' ' + foe.name + ' until it is destroyed.' : 'No land route to ' + foe.name + '.', foe.prov, 'info');
    renderRight();
  }
  function issueMove(list, prov, kind) {
    const G = Sim.G;
    let failed = 0;
    for (const a of list) {
      const hostile = Sim.atWar(G.player, G.owner[prov]);
      const k = kind === 'auto' ? (hostile ? 'attack' : 'move') : kind;
      if (!Sim.orderMove(a, prov, k === 'attack' ? 'move' : k)) { failed++; continue; }
      if (k === 'attack') a.order = 'attack';
    }
    if (failed) {
      const o = G.owner[prov];
      const why = o !== G.player && !Sim.allied(o, G.player) && !Sim.atWar(o, G.player) ? 'You need to be at war with ' + G.countries[o].name + ' or allied to enter.' : kind === 'redeploy' ? 'Redeployment only uses friendly land.' : 'No land route: use Invade by sea to cross water.';
      toast('No route to ' + MAP.provs[prov].name + '. ' + why, prov, 'info');
    }
    renderRight();
  }

  // ---------- trays ----------
  function renderTrays() {
    const G = Sim.G; if (!G) return;
    const mine = G.armies.filter(a => a.owner === G.player);
    const status = a => a.sea ? (a.sea.phase === 'prep' ? 'Embarking' : 'At sea') : a.battle ? '⚔ In battle' : a.retreating ? 'Retreating' : a.path.length ? (a.order === 'attack' ? 'Advancing' : 'Moving') : a.order === 'defend' ? 'Defending front' : 'Holding';
    const trayHTML = mine.map(a => {
      const st = Sim.armyStats(a);
      return `<button class="acard ${sel.armies.includes(a.id) ? 'sel' : ''}" data-a="${a.id}"><div class="t"><span>${esc(a.name)}</span><span class="num">${a.units.length}</span></div>
        <div class="s">${esc(MAP.provs[a.prov].name)} · ${status(a)}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div><div class="bar org"><i style="width:${st.org * 100}%"></i></div></button>`;
    }).join('');
    const tray = $('#armytray');
    // a long army list scrolls sideways with the ordinary mouse wheel
    if (!tray._wheel) { tray._wheel = true; tray.addEventListener('wheel', e => { if (tray.scrollWidth > tray.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tray.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
    if (setHTML(tray, trayHTML)) document.querySelectorAll('#armytray .acard').forEach(b => {
      b.onclick = e => selectArmies([+b.dataset.a], e.shiftKey || e.ctrlKey || e.metaKey);
      b.ondblclick = () => { const a = Sim.army(+b.dataset.a); if (a) { const p = MAP.provs[a.prov]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); } };
    });
    if (!inFrame || !(hoverEl === $("#ucard") && hoverBtn)) renderCard();
  }

  // ---------- battle popup ----------
  function openBattle(b) { sel.battle = b.id; renderBattle(); }
  function renderBattle() {
    const el = $('#battle');
    const G = Sim.G;
    const b = G && G.battles.find(x => x.id === sel.battle);
    if (!b) { el.hidden = true; sel.battle = 0; return; }
    el.hidden = false;
    const atts = b.attackers.map(Sim.army).filter(Boolean);
    const defs = Sim.hostilesAt(b.atkTag, b.prov);
    const side = (list, org, str, cas, tag) => `<div class="side"><h3>${tag === b.atkTag ? 'Attacker' : 'Defender'}</h3><div class="owner">${flagSVG(tag)}<b>${esc(G.countries[tag].name)}</b></div>
      <div class="note">${list.reduce((s, a) => s + a.units.length, 0)} divisions in ${list.length} ${list.length === 1 ? 'army' : 'armies'}</div>
      ${meter('Strength', str || 0, 'str')}${meter('Organisation', org || 0, 'org')}<div class="note">Casualties: <b class="num">${fmtN(cas)}</b></div></div>`;
    const days = Math.floor((G.hour - b.start) / 24), hrs = (G.hour - b.start) % 24;
    const est = b.rateD > b.rateA * 1.15 ? 'Attacker is gaining ground' : b.rateA > b.rateD * 1.15 ? 'Defender is holding firm' : 'Evenly matched';
    if (!setHTML(el, `<button class="close" aria-label="Close" id="bt-close">×</button><div class="label">Battle · ${days} d ${hrs} h</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 10px">Battle of ${esc(MAP.provs[b.prov].name)}</h2>
      <div class="vs">${side(atts, b.aOrg, b.aStr, b.casA, b.atkTag)}<div class="mid">vs</div>${side(defs, b.dOrg, b.dStr, b.casD, b.defTag)}</div>
      <div class="tug" style="background:linear-gradient(90deg, ${COUNTRY_BY_TAG[b.atkTag].color}, ${COUNTRY_BY_TAG[b.defTag].color})"><i style="left:calc(${Math.round(b.progress * 100)}% - 1px)"></i></div>
      <div style="display:flex;justify-content:space-between" class="label"><span>Attacker</span><span>Estimated progress</span><span>Defender</span></div>
      <div class="note" style="text-align:center">${est}</div><hr class="sep"><div class="label" style="margin-bottom:4px">Modifiers (attacker's view)</div>
      <div class="mods">${b.mods.filter(m => Math.abs(m[1]) > 0.005).map(m => `<span>${esc(m[0])}</span><span class="${m[1] > 0 ? 'pos' : 'neg'} num">${m[1] > 0 ? '+' : ''}${Math.round(m[1] * 100)}%</span>`).join('') || '<span>None</span><span></span>'}</div>`)) return;
    $('#bt-close').onclick = () => { sel.battle = 0; el.hidden = true; };
  }

  // ---------- modal / menu ----------
  function modal(html, cb) {
    const m = $('#modal');
    m.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { m.hidden = true; cb && cb(b.dataset.x); });
  }
  function openMenu() {
    const G = Sim.G; if (!G) return;
    const s = G.settings;
    const chk = (k, t) => `<label class="check"><input type="checkbox" id="set-${k}" ${s[k] ? 'checked' : ''}> ${t}</label>`;
    modal(`<h2 class="display" style="font-size:24px">Command menu</h2>
      <div class="label">Time</div>${chk('autoPause', 'Pause automatically on important events')}
      <div style="padding-left:24px;display:flex;flex-direction:column;gap:4px">${chk('pauseWar', 'War declared on me')}${chk('pauseLoss', 'My capital falls')}${chk('pauseCities', 'Any of my cities falls (once a day at most)')}${chk('pauseBattle', 'Battles involving my armies')}${chk('pauseMinor', 'Everyday events (big historical events always pause)')}</div>
      ${chk('autosave', 'Autosave every month')}${chk('pauseEvent', 'Pause when an event needs my answer')}
      <hr class="sep"><div class="label">Sound</div><div class="opts" id="menu-sound">${Menu.soundPane()}</div>
      ${netSection()}
      <hr class="sep"><div class="label">Saved games</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-x="saves">Save or load</button></div>
      <hr class="sep"><div class="label">Controls</div>
      <p class="note">WASD, the arrow keys or a right-drag move the map; scroll or pinch to zoom. Click a counter to select an army, shift-click to add, or drag across several. Right-click to move or attack. Keys 1 to 9 open the side bar tabs, Space pauses, + and − change speed, Esc closes panels.</p>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><span style="display:flex;gap:8px"><button class="btn danger" data-x="new">New game</button><button class="btn" data-x="quit">Save and quit to menu</button></span><button class="btn primary" data-x="ok">Close</button></div>`,
      x => {
        if (x === 'host') hostGame();
        else if (x === 'leave') { Net.stop(); backToStart(); }
        else if (x === 'new') newGamePrompt();
        else if (x === 'saves') openSaves(true);
        else if (x === 'quit') { const r = Save.write(Save.AUTO, 'Autosave'); if (!r.ok) toast(r.why, -1, 'info'); backToStart(); }
      });
    if (s.autosave === undefined) s.autosave = true;
    if (s.pauseEvent === undefined) s.pauseEvent = true;
    $('#set-autosave').checked = s.autosave; $('#set-pauseEvent').checked = s.pauseEvent;
    ['autoPause', 'pauseWar', 'pauseLoss', 'pauseCities', 'pauseBattle', 'pauseMinor', 'autosave', 'pauseEvent'].forEach(k => { $('#set-' + k).onchange = e => { s[k] = e.target.checked; }; });
    Net.setPaused(true); refreshTop();
    const cp = $('#modal [data-copy]'); if (cp) cp.onclick = () => copyInvite();
    const snd = () => { const box = $('#menu-sound'); if (!box) return; box.innerHTML = Menu.soundPane(); Menu.soundHooks(box, snd); };
    snd();
  }
  // ---------- multiplayer ----------
  const PAGES_URL = 'https://mahmoud1921.github.io/ironmeridian/';
  const inArtifact = () => !!window.IM_ARTIFACT;
  const inviteLink = () => (location.protocol.startsWith('http') && !inArtifact() ? location.origin + location.pathname : PAGES_URL) + '#join=' + Net.code;
  function copyInvite() {
    const t = inviteLink();
    const done = () => toast('Invite link copied: ' + t, -1, 'info');
    try { navigator.clipboard.writeText(t).then(done, () => toast('Share this link: ' + t, -1, 'info')); } catch (e) { toast('Share this link: ' + t, -1, 'info'); }
  }
  function netSection() {
    const list = Net.playerList();
    const who = list.map(p => `<div class="row">${flagSVG(p.tag)}<div class="grow">${esc(p.name)}${p.me ? ' (you)' : ''}<div class="sub">${esc(Sim.G.countries[p.tag] ? Sim.G.countries[p.tag].name : p.tag)}${p.host ? ' · host' : ''}</div></div></div>`).join('');
    if (Net.role === 'host') return `<hr class="sep"><div class="label">Playing with others</div>
      <p class="note">Your join code is <b class="netcode">${esc(Net.code)}</b>. Friends open the game, choose Join game and type it, or open the invite link. They pick any nation nobody leads. If you close this page, the game ends for everyone.</p>
      <div class="list">${who}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn" data-copy="1">Copy invite link</button></div>`;
    if (Net.role === 'client') return `<hr class="sep"><div class="label">Playing with others</div>
      <p class="note">You are in a game hosted by someone else (code ${esc(Net.code)}). Saving keeps a copy of the game in this browser.</p><div class="list">${who}</div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="btn danger" data-x="leave">Leave the game</button></div>`;
    if (inArtifact()) return `<hr class="sep"><div class="label">Playing with others</div><p class="note">Online play works in the web version: <a class="lnk" href="${PAGES_URL}" target="_blank" rel="noopener">${PAGES_URL}</a>. Save here, export the save, and import it there to host this game.</p>`;
    return `<hr class="sep"><div class="label">Playing with others</div><p class="note">Let friends join this game from their own browsers. You get a code to share; nations nobody picks stay with the computer.</p>
      <div style="display:flex;gap:8px"><button class="btn primary" data-x="host">Invite players</button></div>`;
  }
  async function hostGame() {
    toast('Opening the game to other players…', -1, 'info');
    const r = await Net.host(Menu.prefs().name || 'Host');
    if (!r.ok) { modal(`<h2 class="display" style="font-size:24px">Could not open the game</h2><p class="note">${esc(r.why)}</p><div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="ok">Close</button></div>`); return; }
    openMenu();
    refreshTop();
  }
  function netHooks() {
    $('#tb-net').onclick = () => openMenu();
    Net.hooks.joined = p => { toast(p.name + ' joined and leads ' + Sim.G.countries[p.tag].name + '.', Sim.G.countries[p.tag].capital, 'info'); refreshTop(); };
    Net.hooks.left = p => { toast(p.name + ' left. The computer leads ' + (Sim.G.countries[p.tag] ? Sim.G.countries[p.tag].name : p.tag) + ' again.', -1, 'info'); refreshTop(); };
    Net.hooks.players = () => { refreshTop(); const m = $('#modal'); if (!m.hidden && m.querySelector('.netcode, [data-x="host"]')) openMenu(); };
    Net.hooks.synced = ev => {
      if (ev.first) {
        loadGame({ era: ev.era, player: ev.tag, G: ev.G, net: true });
        const L = Sim.G.log || [];
        netSeen = { hour: L.length ? L[0].hour : -1, texts: new Set(L.filter(l => l.hour === (L.length ? L[0].hour : -1)).map(l => l.text)) };
        toast('You joined ' + (ev.hostName || 'the host') + '\'s game and lead ' + Sim.G.countries[ev.tag].name + '.', -1, 'info');
        Menu.hide();
        return;
      }
      const G = Sim.G; if (!G) return;
      if (G.ownVer !== Render.state.ownVer) { Render.state.ownVer = G.ownVer; Render.state.dirtyOwners = true; }
      if (!netLost && (!G.countries[G.player] || !G.countries[G.player].alive)) { netLost = true; gameOver(false); }
      if (G.log && G.log.length) {
        const seen = netSeen;
        for (let i = G.log.length - 1; i >= 0; i--) { const l = G.log[i]; if (l.hour > seen.hour || (l.hour === seen.hour && !seen.texts.has(l.text))) { if (!l.to || l.to === G.player) toast(l.text, l.prov, l.kind); } }
        netSeen = { hour: G.log[0].hour, texts: new Set(G.log.filter(l => l.hour === G.log[0].hour).map(l => l.text)) };
      }
    };
    Net.hooks.ended = (text, inGame) => {
      if (inGame && Sim.G) { const r = Save.write(Save.AUTO, 'Autosave'); if (!r.ok) console.warn(r.why); }
      backToStart();
      Menu.open('join');
      Menu.flash(text + (inGame ? ' A copy was saved as the autosave.' : ''));
    };
  }
  let netSeen = { hour: -1, texts: new Set() }, netLost = false;
  // ---------- saved games ----------
  function openSaves(inGame) {
    const G = Sim.G;
    const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    const eraLabel = id => { const e = Eras.list().find(x => x.id === id); return e ? e.label : id; };
    const row = s => {
      const name = s.slot === Save.AUTO ? 'Autosave' : 'Slot ' + s.slot;
      const what = s.empty ? '<span class="sub">Empty</span>' : s.bad ? '<span class="sub">' + esc(s.bad) + '</span>'
        : `${flagSVG(s.player)}<span><b>${esc(s.nation)}</b> · ${esc(s.date)}<div class="sub">${esc(eraLabel(s.era))} · saved ${ago(s.savedAt)}${s.temp ? ' · kept only until you close the page' : ''}</div></span>`;
      const btns = (inGame && G && !G.over && s.slot !== Save.AUTO ? `<button class="btn sm" data-sv="${s.slot}">Save</button>` : '')
        + (!s.empty && !s.bad ? `<button class="btn sm" data-ld="${s.slot}">Load</button>` : '')
        + (!s.empty && s.slot !== Save.AUTO ? `<button class="btn sm ghost" data-rm="${s.slot}" aria-label="Delete ${name}">✕</button>` : '');
      return `<div class="row saverow"><div class="label" style="width:64px">${name}</div><div class="grow sv-what">${what}</div><div class="sv-btns">${btns}</div></div>`;
    };
    modal(`<h2 class="display" style="font-size:24px">Saved games</h2>
      ${Save.available() ? '' : '<p class="note">This browser does not allow saving here, so saves last only until the page closes. Use Export to keep a copy.</p>'}
      <div class="list">${Save.list().map(row).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${inGame && G ? '<button class="btn" data-io="export">Export to file</button>' : ''}<button class="btn" data-io="import">Import from file</button><input type="file" id="sv-file" accept=".json,application/json" hidden></div>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="ok">Close</button></div>`);
    const m = $('#modal');
    m.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { const r = Save.write(b.dataset.sv); toast(r.ok ? 'Saved to slot ' + b.dataset.sv + '.' : r.why, -1, 'info'); openSaves(inGame); });
    m.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { const r = Save.read(b.dataset.ld); if (r.ok) loadGame(r.data); else toast(r.why, -1, 'info'); });
    m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { Save.remove(b.dataset.rm); openSaves(inGame); });
    const exp = m.querySelector('[data-io="export"]');
    if (exp) exp.onclick = async () => {
      // inside the Claude viewer a file is offered through its downloads capability; elsewhere through a normal download
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
      if (dl) {
        const name = Save.fileName();
        try { await dl.save({ filename: name, data: Save.serialise('Export') }); toast('Saved game exported as ' + name + '.', -1, 'info'); }
        catch (e) { if (e && e.code !== 'declined') toast('The export could not be saved here.', -1, 'info'); }
        return;
      }
      try {
        const blob = new Blob([Save.serialise('Export')], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = Save.fileName();
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('Saved game exported as ' + a.download + '.', -1, 'info');
      } catch (e) { toast('This browser blocked the download.', -1, 'info'); }
    };
    m.querySelector('[data-io="import"]').onclick = () => $('#sv-file').click();
    $('#sv-file').onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const r = Save.parse(String(rd.result)); if (r.ok) loadGame(r.data); else toast(r.why, -1, 'info'); };
      rd.readAsText(f);
    };
  }

  // ---------- events ----------
  // everyday events: a card beside the army tray, answered whenever the player likes while time runs on
  let sideShown = 0;
  function showSideEvent() {
    const G = Sim.G, box = $('#evside'); if (!G || !box) return;
    const e = Events.open().find(x => !Events.isMajor(x));
    if (!e) { if (!box.hidden) { box.hidden = true; box.innerHTML = ''; } sideShown = 0; return; }
    const left = Math.max(1, Events.DECIDE_DAYS - Math.floor((G.hour - e.hour) / 24));
    const more = Events.open().filter(x => !Events.isMajor(x)).length - 1;
    const foot = `Time keeps running. Your ministers decide in ${left} day${left > 1 ? 's' : ''} if you don't.${more > 0 ? ' ' + more + ' more waiting.' : ''}`;
    if (sideShown === e.n) { const f = box.querySelector('.ev-foot'); if (f && f.textContent !== foot) f.textContent = foot; return; }
    const v = Events.view(e);
    if (!v) { Events.choose(e.n, 0); return; }
    sideShown = e.n;
    box.innerHTML = `<div class="ev-top" data-evs="${e.n}">${flagSVG(e.tag)}<span class="label">${esc(v.date)}</span></div>
      <h3 class="display">${esc(v.title)}</h3><p class="ev-text">${esc(v.text)}</p>
      <div class="ev-opts">${v.options.map(o => `<button class="btn ev-opt" data-x="${o.i}"><b>${esc(o.text)}</b><small>${o.fx.map(esc).join(' · ')}</small></button>`).join('')}</div>
      <div class="ev-foot">${esc(foot)}</div>`;
    box.hidden = false;
    box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { Events.choose(e.n, +b.dataset.x); sideShown = 0; refreshTop(); renderRight(); renderLeft(); showSideEvent(); });
  }
  function showEvent() {
    const G = Sim.G; if (!G) return;
    showSideEvent();
    const e = Events.open().find(x => Events.isMajor(x) || G.settings.pauseMinor); if (!e) return;
    const v = Events.view(e);
    if (!v) { Events.choose(e.n, 0); return; }
    const c = G.countries[e.tag];
    modal(`<div class="ev-top" data-evn="${e.n}">${flagSVG(e.tag)}<span class="label">${esc(c.name)} · ${esc(v.date)}</span></div>
      <h2 class="display" style="font-size:24px;margin:0">${esc(v.title)}</h2>
      <p class="ev-text">${esc(v.text)}</p>
      <div class="ev-opts">${v.options.map(o => `<button class="btn ev-opt" data-x="${o.i}"><b>${esc(o.text)}</b><small>${o.fx.map(esc).join(' · ')}</small></button>`).join('')}</div>`,
      x => { Events.choose(e.n, +x); refreshTop(); renderRight(); renderLeft(); showEvent(); });
  }

  // ---------- peace conference ----------
  function showPeace() {
    const G = Sim.G, conf = G && G.peace; if (!conf) return;
    const v = Peace.view(conf), me = G.player;
    const who = t => t && t[0] === '@' ? 'restored ' + esc(G.countries[t.slice(1)].name) : t === me ? 'you' : esc(G.countries[t].name);
    const provRow = p => `<div class="row pz-row ${p.taken === me ? 'on' : ''}"><div class="grow"><a class="lnk" data-pzgo="${p.id}">${esc(p.name)}</a>${p.capital ? ' <span class="pill">Capital</span>' : p.city ? ' <span class="pill">City</span>' : ''}
        <div class="sub">${p.held === me ? 'You hold it' : 'Held by ' + esc(G.countries[p.held].name)}${p.taken && p.taken !== me ? ' · taken by ' + who(p.taken) : ''}${!p.taken && !p.ok ? ' · ' + esc(p.why) : ''}</div></div>
        ${p.taken === me ? `<button class="btn sm" data-pzu="${p.id}">Give back</button>` : !p.taken ? `<button class="btn sm ${p.ok ? '' : 'dis'}" data-pz="${p.id}" ${p.ok ? '' : 'disabled'}>Take · ${p.cost}</button>` : ''}</div>`;
    const lc = G.countries[v.loser];
    const others = v.winners.filter(w => w.tag !== me).map(w => `${esc(G.countries[w.tag].name)} ${w.done ? 'spent ' + w.spent : 'waits'} of ${w.pts}`).join(' · ');
    const m = $('#modal');
    m.innerHTML = `<div class="panel pz" role="dialog" aria-modal="true">
      <div class="ev-top">${flagSVG(v.loser)}<span class="label">Peace conference · ${esc(v.war)}</span></div>
      <h2 class="display" style="font-size:24px;margin:0">${esc(lc.name)} has capitulated</h2>
      <p class="note">You have <b>${v.left}</b> of ${v.pts} points to spend. Land nobody takes goes back to ${esc(lc.name)}. ${others ? 'Other victors: ' + others + '.' : ''}</p>
      <div class="pz-body">
        <div class="label">Terms</div>
        <div class="list">
          <div class="row"><div class="grow"><b>Make ${esc(lc.name)} your subject</b><div class="sub">${v.puppet.by ? 'Subject of ' + who(v.puppet.by) : 'It keeps the land nobody takes and follows you in war.'}</div></div>${v.puppet.by === me ? '<button class="btn sm" data-pzx="puppet">Withdraw</button>' : !v.puppet.by ? `<button class="btn sm" data-pzd="puppet" ${v.puppet.ok ? '' : 'disabled'} title="${esc(v.puppet.why)}">Demand · ${v.puppet.cost}</button>` : ''}</div>
          <div class="row"><div class="grow"><b>Reparations</b><div class="sub">They pay you ${esc(Economy.coin())} every day for two years${v.repar.mine ? ' · demanded ' + v.repar.mine + '×' : ''}.</div></div>${v.repar.mine ? '<button class="btn sm" data-pzx="repar">Withdraw</button>' : ''}<button class="btn sm" data-pzd="repar" ${v.repar.ok ? '' : 'disabled'} title="${esc(v.repar.why)}">Demand · ${v.repar.cost}</button></div>
          ${v.restore.map(r => `<div class="row"><div class="grow"><b>Restore ${esc(G.countries[r.tag].name)}</b><div class="sub">${r.by ? 'Restored by ' + who(r.by) : 'Brings back a nation that was conquered, friendly to you.'}</div></div>${r.by === me ? `<button class="btn sm" data-pzxr="${r.tag}">Withdraw</button>` : !r.by ? `<button class="btn sm" data-pzr="${r.tag}" ${r.ok ? '' : 'disabled'}>Restore · ${r.cost}</button>` : ''}</div>`).join('')}
        </div>
        <div class="label">Provinces</div>
        <div class="list">${v.provs.map(provRow).join('')}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn" data-pzauto="1">Pick for me</button><button class="btn primary" data-pzdone="1">Sign the treaty</button></div></div>`;
    m.hidden = false;
    const again = () => { const st = m.querySelector('.pz-body').scrollTop; showPeace(); const b = m.querySelector('.pz-body'); if (b) b.scrollTop = st; };
    m.querySelectorAll('[data-pz]').forEach(b => b.onclick = () => { Peace.demand(conf, me, { kind: 'prov', id: +b.dataset.pz }); again(); });
    m.querySelectorAll('[data-pzu]').forEach(b => b.onclick = () => { Peace.undo(conf, me, { kind: 'prov', id: +b.dataset.pzu }); again(); });
    m.querySelectorAll('[data-pzd]').forEach(b => b.onclick = () => { Peace.demand(conf, me, { kind: b.dataset.pzd }); again(); });
    m.querySelectorAll('[data-pzx]').forEach(b => b.onclick = () => { Peace.undo(conf, me, { kind: b.dataset.pzx }); again(); });
    m.querySelectorAll('[data-pzr]').forEach(b => b.onclick = () => { Peace.demand(conf, me, { kind: 'restore', tag: b.dataset.pzr }); again(); });
    m.querySelectorAll('[data-pzxr]').forEach(b => b.onclick = () => { Peace.undo(conf, me, { kind: 'restore', tag: b.dataset.pzxr }); again(); });
    m.querySelectorAll('[data-pzgo]').forEach(b => b.onclick = () => { const p = MAP.provs[+b.dataset.pzgo]; Render.state.selProv = p.id; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 6)); });
    m.querySelector('[data-pzauto]').onclick = () => { Peace.aiPick(conf, me); again(); };
    m.querySelector('[data-pzdone]').onclick = () => {
      const text = Peace.done(conf);
      m.hidden = true;
      Render.state.dirtyOwners = true;
      refreshTop(); renderRight(); renderLeft(); renderTrays();
      modal(`<h2 class="display" style="font-size:24px">Peace signed</h2><p class="note">${esc(text)}</p><div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="ok">Continue</button></div>`);
    };
  }

  // ---------- politics tab ----------
  function politicsPanel() {
    const G = Sim.G, me = G.player, c = G.countries[me];
    let html = '';
    const open = Events.open();
    if (open.length) html += `<button class="btn primary" data-evopen="1" style="width:100%">Answer: ${esc(Events.view(open[0])?.title || 'event')}</button>`;
    html += `<div class="label">Decisions <span class="sub">· ${Math.floor(c.pp)} political power</span></div>`;
    const list = Politics.list(me);
    for (const cat of ['Economy', 'Military', 'Home front']) {
      html += `<div class="sub" style="margin:6px 0 2px">${cat}</div><div class="list">` + list.filter(d => d.cat === cat).map(d =>
        `<div class="row dec"><div class="grow"><b>${esc(d.name)}</b><div class="sub">${esc(d.desc)} ${esc(d.fx)}${d.ok ? '' : ' · <i>' + esc(d.why) + '</i>'}</div></div><button class="btn sm" data-dec="${d.id}" ${d.ok ? '' : 'disabled'} title="${esc(d.ok ? '' : d.why)}">${d.cost} PP${d.gold ? ' + ' + d.gold : ''}</button></div>`).join('') + '</div>';
    }
    const mods = Politics.mods(me);
    html += '<div class="label">In effect</div>' + (mods.length ? '<div class="list">' + mods.map(m => `<div class="row"><div class="grow"><b>${esc(m.name)}</b><div class="sub">${esc(Politics.fxText(m.fx))}</div></div><span class="sub">${Math.ceil((m.until - G.hour) / 24)} days</span></div>`).join('') + '</div>' : '<p class="note">No decisions or events in effect.</p>');
    const rec = Events.recent(40).filter(r => r.tag === me || r.news).slice(0, 10);
    const tre = (G.treaties || []).slice(0, 5);
    if (tre.length) html += '<div class="label">Treaties</div><div class="list">' + tre.map(t => `<div class="row"><div class="grow"><div class="sub">${Sim.dateStr(t.hour)}</div><div>${esc(t.text)}</div></div></div>`).join('') + '</div>';
    if (rec.length) html += '<div class="label">Recent events</div><div class="list">' + rec.map(r => `<div class="row"><div class="grow"><div class="sub">${Sim.dateStr(r.hour)} · ${esc(G.countries[r.tag].name)}</div><div><b>${esc(r.title)}</b>${r.choice ? ': ' + esc(r.choice) : ''}</div></div></div>`).join('') + '</div>';
    html += '<div class="label">Log</div>' + logPanel();
    return html;
  }

  function newGamePrompt() {
    modal(`<h2 class="display" style="font-size:24px">Start a new game?</h2><p class="note">The current campaign will be lost.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">New game</button></div>`,
      x => { if (x === 'yes') { backToStart(); Menu.open('new'); } });
  }
  function backToStart() {
    if (Net.active()) Net.stop();
    netSeen = { hour: -1, texts: new Set() }; netLost = false; shownOffers.clear();
    Sim.G = null; $('#modal').hidden = true; $('#evside').hidden = true; if ($('#lossbar')) $('#lossbar').hidden = true; $('#keyhint').hidden = true; sel.armies = []; sel.prov = -1; sel.battle = 0; sel.fleet = 0; sel.wing = 0; sel.zone = -1; pending = null; showHint();
    Render.state.selFleet = 0; Render.state.selWing = 0; Render.state.selZone = -1;
    Render.state.selArmies = new Set(); Render.state.selProv = -1; Render.state.dirtyOwners = true; Render.setFrontEdges(null);
    $('#hud').hidden = true; $('#battle').hidden = true; $('#leftpanel').hidden = true; treeOpen = false; $('#techtree').hidden = true; showTip(-1);
    coachEnd(false); if ($('#goalpill')) $('#goalpill').hidden = true;
    Menu.show();
  }
  function gameOver(won) {
    const G = Sim.G;
    const days = Math.floor(G.hour / 24);
    modal(`<h2 class="display" style="font-size:28px">${won ? 'Victory' : esc(G.countries[G.player].name) + ' has fallen'}</h2>
      <p class="note">Your government capitulated on ${Sim.dateStr(G.hour)} after ${days} days. Battles won: ${G.stats.battlesWon}, lost: ${G.stats.battlesLost}. Provinces captured: ${G.stats.captured}.</p>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="new">Choose a new nation</button></div>`, () => backToStart());
  }

  // ---------- goals: what this era asks of the player ----------
  function goalRow(g) {
    const p = Goals.progress(g);
    return `<div class="goal ${p.done ? 'on' : ''}">
      <span class="mark">${p.done ? '<svg class="i"><use href="#i-check"/></svg>' : ''}</span>
      <b>${esc(g.name)}</b><span class="num">${g.kind === 'gold' ? Math.min(p.now, p.target).toLocaleString() : p.now} / ${g.kind === 'gold' ? p.target.toLocaleString() : p.target}</span>
      <span class="sub">${esc(g.main || !g.note ? p.text : g.note)}</span>
      <span class="bar"><i style="width:${Math.round(p.share * 100)}%"></i></span></div>`;
  }
  function goalsHTML() {
    const G = Sim.G, s = Goals.info();
    if (!s) return '';
    const m = Goals.progress(s.main), days = Goals.daysLeft();
    return `<h2 class="display" style="font-size:24px">Your goals</h2>
      <p class="note">${esc(G.countries[G.player].name)} · ${esc(s.note)}</p>
      <div class="label">Main goal${s.won ? ' · reached' : ''}</div>${goalRow(s.main)}
      <div class="label">Side goals</div>${s.sides.map(goalRow).join('')}
      <p class="note">${s.won ? 'You have already won this era. Play on as long as you like.'
        : s.lost ? 'The date has passed. You can play on freely.'
        : 'By ' + esc(Goals.deadlineText()) + ' · ' + (days > 730 ? Math.round(days / 365) + ' years left' : days > 60 ? Math.round(days / 30) + ' months left' : days + ' days left') + '. Losing your last province, or your capital falling with no land left, ends the game.'}</p>`;
  }
  function openGoals() {
    if (!Sim.G || !Goals.info()) return;
    modal(goalsHTML() + '<div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="ok">Close</button></div>');
  }
  function refreshGoals() {
    const s = Sim.G && Goals.info();
    let el = $('#goalpill');
    if (!s) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('button'); el.id = 'goalpill'; el.type = 'button'; el.onclick = () => openGoals(); $('#keyhint').before(el); }
    const p = Goals.progress(s.main), days = Goals.daysLeft();
    el.hidden = false;
    el.classList.toggle('done', p.done);
    const html = `<b>${esc(s.main.name)}</b><span class="bar"><i style="width:${Math.round(p.share * 100)}%"></i></span>` +
      `<span class="sub">${p.now} / ${p.target}${s.won ? ' · won' : s.lost ? '' : ' · by ' + esc(String(s.until <= 0 ? (1 - s.until) + ' BC' : s.until))}</span>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    if (!$('#modal').hidden && $('#modal .panel') && /Your goals/.test($('#modal').textContent)) openGoals();
  }
  function gameWon() {
    const G = Sim.G, s = Goals.info();
    if (typeof Sound !== 'undefined') Sound.notice('win');
    G.paused = true; refreshTop();
    modal(`<h2 class="display" style="font-size:28px">${esc(s.main.name)}</h2>
      <p class="note">${esc(G.countries[G.player].name)} reached its goal on ${Sim.dateStr(G.hour)}. Battles won: ${G.stats.battlesWon}. Provinces captured: ${G.stats.captured}.</p>
      ${goalsHTML().replace(/^<h2[\s\S]*?<\/p>/, '')}
      <div style="display:flex;justify-content:space-between;gap:8px"><button class="btn" data-x="new">Choose a new nation</button><button class="btn primary" data-x="ok">Keep playing</button></div>`,
      x => { if (x === 'new') backToStart(); });
  }
  function timeUp(p) {
    const G = Sim.G;
    if (typeof Sound !== 'undefined') Sound.notice('loss');
    G.paused = true; refreshTop();
    modal(`<h2 class="display" style="font-size:26px">The years ran out</h2>
      <p class="note">${esc(Goals.info().main.name)} was not reached by ${esc(Goals.deadlineText())}: ${p.now} of ${p.target}. Your nation stands, and you may play on for as long as you like.</p>
      <div style="display:flex;justify-content:space-between;gap:8px"><button class="btn" data-x="new">Choose a new nation</button><button class="btn primary" data-x="ok">Play on</button></div>`,
      x => { if (x === 'new') backToStart(); });
  }

  // ---------- the first game: a short tutorial that follows what the player does ----------
  const STEPS = [
    { t: 'Welcome to <b>Iron Meridian</b>. You lead a nation through its era, province by province. Press <b>Space</b> or the play button to start the clock, and again to pause.', lit: '#tb-play', on: () => !Sim.G.paused },
    { t: 'This is your goal for the era. Click it at any time to see the side goals and the date you have to reach them by.', lit: '#goalpill' },
    { t: 'Click one of your armies on the map to select it. Drag across several to take them all.', lit: null, on: () => sel.armies.length > 0 },
    { t: 'Now <b>right-click</b> a neighbouring province to march there. Right-click an enemy to attack instead.', lit: null, on: () => Sim.G.armies.some(a => a.owner === Sim.G.player && a.path && a.path.length) },
    { t: 'The side bar holds everything else. <b>Train</b> raises new divisions; keys <b>1</b> to <b>9</b> open the tabs.', lit: '[data-tab="recruit"]', on: () => sel.tab === 'recruit' && !sel.collapsed },
    { t: '<b>Economy</b> builds farms, mines and factories in your provinces, which pay for the army.', lit: '[data-tab="econ"]', on: () => sel.tab === 'econ' && !sel.collapsed },
    { t: '<b>Nations</b> is where you make friends, guarantee neighbours and declare war.', lit: '[data-tab="diplo"]', on: () => sel.tab === 'diplo' && !sel.collapsed },
    { t: 'That is everything you need. <b>Esc</b> opens the menu, where you can save, change the sound, or turn these hints off. Good luck.', lit: null }
  ];
  let coach = -1, coachTimer = 0;
  function coachShow() {
    const st = STEPS[coach], el = $('#coach');
    document.querySelectorAll('.coachlit').forEach(e => e.classList.remove('coachlit'));
    if (!st) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector('.ct').innerHTML = st.t;
    $('#co-next').textContent = coach === STEPS.length - 1 ? 'Finish' : 'Next';
    if (st.lit) { const t = document.querySelector(st.lit); if (t) t.classList.add('coachlit'); }
  }
  function coachNext() { coach++; if (coach >= STEPS.length) coachEnd(true); else coachShow(); }
  function coachEnd(done) {
    coach = -1; clearInterval(coachTimer); coachTimer = 0;
    document.querySelectorAll('.coachlit').forEach(e => e.classList.remove('coachlit'));
    $('#coach').hidden = true;
    if (done) Menu.setPref('taught', true);
  }
  function coachStart() {
    if (Menu.prefs().taught || innerWidth <= 820 || Net.isClient()) return;
    coach = 0; coachShow();
    coachTimer = setInterval(() => {
      if (!Sim.G) return coachEnd(false);
      const st = STEPS[coach];
      const busy = !$('#modal').hidden || !$('#evside').hidden || !$('#offer').hidden;
      $('#coach').hidden = busy || coach < 0;   // step aside while a card or the menu is open
      if (!busy && st && st.on && st.on()) coachNext();
    }, 600);
  }

  // ---------- map input ----------
  function bindMap() {
    const cv = $('#map');
    const ptrs = new Map();
    let down = null, dragged = false, pinch = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; dragged = true; }
      else {
        down = { x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, button: e.button }; dragged = false;
        // with a mouse, the left button drags a selection box (right or middle button, or WASD, moves the map);
        // on a touch screen a drag moves the map
        const G = Sim.G;
        if (G && e.button === 0 && e.pointerType === 'mouse' && !pending) down.box = true;
      }
    });
    cv.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        Render.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; return;
      }
      if (down) {
        if (!dragged && Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 5) { dragged = true; cv.classList.add('dragging'); }
        if (dragged && down.box) { drawBox(down.x, down.y, e.offsetX, e.offsetY); return; }
        if (dragged) { Render.pan(e.offsetX - down.lx, e.offsetY - down.ly); down.lx = e.offsetX; down.ly = e.offsetY; }
        return;
      }
      if (e.pointerType === 'mouse') {
        const [wx, wy] = Render.screenToWorld(e.offsetX, e.offsetY);
        Render.state.hover = Render.provinceAt(wx, wy);
      }
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      cv.classList.remove('dragging');
      if (down && !dragged) click(e.offsetX, e.offsetY, down.button, e.shiftKey || e.ctrlKey || e.metaKey);
      else if (down && down.box) {
        drawBox();
        const G = Sim.G, ids = G ? Render.armiesInRect(down.x, down.y, e.offsetX, e.offsetY).filter(a => a.owner === G.player).map(a => a.id) : [];
        if (ids.length) { if (e.shiftKey) selectArmies(ids.filter(id => !sel.armies.includes(id)), true); else selectArmies(ids, false); }
      }
      if (!ptrs.size) down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; pinch = null; drawBox(); });
    cv.addEventListener('pointerleave', () => { Render.state.hover = -1; });
    cv.addEventListener('wheel', e => { e.preventDefault(); Render.zoomSmooth(e.offsetX, e.offsetY, Math.exp(-Math.max(-300, Math.min(300, e.deltaMode ? e.deltaY * 40 : e.deltaY)) * 0.0022)); }, { passive: false });
  }
  function drawBox(x0, y0, x1, y1) {
    let b = $('#selbox');
    if (x0 === undefined) { if (b) b.hidden = true; return; }
    if (!b) { b = document.createElement('div'); b.id = 'selbox'; $('#map').parentElement.appendChild(b); }
    const r = $('#map').getBoundingClientRect();
    Object.assign(b.style, { left: r.left + Math.min(x0, x1) + 'px', top: r.top + Math.min(y0, y1) + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
    b.hidden = false;
  }
  function click(sx, sy, button, add) {
    const G = Sim.G;
    const [wx, wy] = Render.screenToWorld(sx, sy);
    const prov = Render.provinceAt(wx, wy);
    const zone = prov < 0 && G && typeof Seas !== 'undefined' ? Seas.zoneAt(wx, wy) : -1;
    if (!G) { if (prov >= 0) pickStart(MAP.provs[prov].owner); return; }
    // an enemy army clicked while ordering an attack (or right-clicked) is hunted down wherever it goes
    // a marching army is a moving target: a click close to its troops counts as a click on it
    const foeAt = () => {
      const g = Render.stackAt(sx, sy), hit = g && g.find(a => Sim.atWar(a.owner, G.player));
      if (hit) return hit;
      let best = null, bd = 28;
      for (const h of Render._hits()) {
        const d = Math.hypot(sx - (h.x + h.w / 2), sy - (h.y + h.h / 2));
        const foe = d < bd && h.group.find(a => Sim.atWar(a.owner, G.player));
        if (foe) { best = foe; bd = d; }
      }
      return best;
    };
    if (pending && button === 0) { const foe = pending.kind === 'attack' || pending.kind === 'move' ? foeAt() : null; if (foe) { pending = null; showHint(); chase(myArmiesSel(), foe); return; } resolvePending(prov, zone); return; }
    if (button === 2) {
      pending = null; showHint();
      const f = sel.fleet ? Navy.fleet(sel.fleet) : null;
      if (f && f.owner === G.player) { const z = zone >= 0 ? zone : prov >= 0 && Seas.isCoastal(prov) ? Seas.zonesOf(prov)[0] : -1; if (z >= 0) sendFleet(z); return; }
      const foe = foeAt();
      if (foe && myArmiesSel().length) { chase(myArmiesSel(), foe); return; }
      const list = myArmiesSel();
      if (list.length && prov >= 0) issueMove(list, prov, 'auto');
      return;
    }
    const fl = Render.fleetAt(sx, sy);
    if (fl) {
      // clicking the same counter again steps through the fleets in it
      const ids = fl.map(x => x.id), k = ids.indexOf(sel.fleet);
      selectFleet(ids[(k + 1) % ids.length]);
      selectZone(fl[0].path.length ? -1 : fl[0].zone);
      return;
    }
    const wl = Render.wingAt(sx, sy);
    if (wl) { const ids = wl.map(x => x.id), k = ids.indexOf(sel.wing); selectWing(ids[(k + 1) % ids.length]); selectProvince(wl[0].base); return; }
    const b = Render.battleAtScreen(sx, sy);
    if (b) { openBattle(b); return; }
    const stack = Render.stackAt(sx, sy);
    if (stack) {
      const a = stack[0];
      if (a.owner === G.player && !add) {
        // first click takes the whole stack; clicking it again steps through its armies one by one
        const ids = stack.map(x => x.id);
        const cur = sel.armies;
        let pick = ids;
        if (ids.length > 1) {
          if (cur.length === ids.length && ids.every(id => cur.includes(id))) pick = [ids[0]];
          else if (cur.length === 1 && ids.includes(cur[0])) { const k = ids.indexOf(cur[0]) + 1; pick = k < ids.length ? [ids[k]] : ids; }
        }
        selectArmies(pick, false);
      } else selectArmies([a.id], add && a.owner === G.player);
      return;
    }
    if (!add) selectArmies([], false);
    if (prov < 0 && zone >= 0) { selectProvince(-1); selectZone(zone); return; }
    selectProvince(prov);
  }
  const panKeys = new Set();
  let panStep = () => {}, lastPan = 0;
  function bindKeys() {
    // WASD and the arrow keys pan the map
    const PAN = { w: [0, 1], a: [1, 0], s: [0, -1], d: [-1, 0], arrowup: [0, 1], arrowleft: [1, 0], arrowdown: [0, -1], arrowright: [-1, 0] };
    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (PAN[k] && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) { panKeys.add(k); if (k.startsWith('arrow')) e.preventDefault(); } });
    window.addEventListener('keyup', e => panKeys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => panKeys.clear());
    panStep = dt => {
      if (!panKeys.size || !$('#modal').hidden) return;
      let dx = 0, dy = 0;
      for (const k of panKeys) { dx += PAN[k][0]; dy += PAN[k][1]; }
      const v = 700 * (Menu.prefs().panSpeed || 6) / 6 * dt;   // screen pixels a second
      if (dx || dy) Render.pan(dx * v, dy * v);
    };
    window.addEventListener('keydown', e => {
      if (typing(e)) return;
      const G = Sim.G; if (!G) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === '+' || e.key === '=') setSpeed(G.speed + 1);
      else if (e.key === '-' || e.key === '_') setSpeed(G.speed - 1);
      else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) { Menu.setPref('soundOn', Menu.prefs().soundOn === false); toast(Menu.prefs().soundOn ? 'Sound on.' : 'Sound off.', -1, 'info'); }
      else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && $('#modal').hidden) openTab(TABS[+e.key - 1][0], true);
      else if (e.key === 'Escape') {
        if (pending) { pending = null; showHint(); renderRight(); }
        else if (!$('#modal').hidden) { if (!$('#modal [data-evn]') && !$('#modal .pz')) $('#modal').hidden = true; }
        else if (sel.battle) { sel.battle = 0; $('#battle').hidden = true; }
        else if (treeOpen) { treeOpen = false; renderTree(); }
        else if (!sel.collapsed) { sel.collapsed = true; renderRight(); }
        else { selectArmies([], false); selectProvince(-1); selectZone(-1); if (sel.fleet) selectFleet(0); if (sel.wing) selectWing(0); }
      }
    });
  }

  // ---------- periodic refresh ----------
  let lastRefresh = 0, lastFront = 0, inFrame = false;
  // the unit models in the Train list turn slowly: one full turn every ten seconds
  const SPIN_MS = 10000;
  // the build lists turn their building models slowly, like the units in Train (a turn every 10 s)
  let bspinAt = 0;
  function spinBuildings(now, force) {
    if (!force && now - bspinAt < 50) return;
    bspinAt = now;
    const G = Sim.G; if (!G) return;
    const yaw = -0.55 + (now % 10000) / 10000 * Math.PI * 2, era = Economy.eraId(), col = COUNTRY_BY_TAG[G.player].color;
    if (!sel.collapsed && sel.tab === 'econ') try { Buildings.spin($('#rp-body'), era, col, yaw); } catch (e) { }
    if (!$('#leftpanel').hidden) try { Buildings.spin($('#leftpanel'), era, col, yaw); } catch (e) { }
  }
  // the turning models in the Train list: about 25 turns of the wheel a second is smooth enough, and only the
  // cards scrolled into view are drawn
  let spinAt = 0;
  function spinModels(now) {
    if (sel.tab !== 'recruit' || !$('#drawer').classList.contains('open')) return;
    if (now - spinAt < 40) return;
    spinAt = now;
    const yaw = (now % SPIN_MS) / SPIN_MS * Math.PI * 2;
    const tag = Sim.G.player, body = $('#rp-body'), box = body.getBoundingClientRect();
    body.querySelectorAll('canvas[data-spin]').forEach(cv => {
      const r = cv.getBoundingClientRect();
      if (r.bottom < box.top || r.top > box.bottom) return;
      try { Figures.preview(cv, tag, cv.dataset.spin, yaw); } catch (e) { }
    });
  }
  function frame(now) {
    const dtPan = lastPan ? Math.min(0.1, (now - lastPan) / 1000) : 0; lastPan = now;
    panStep(dtPan);
    const G = Sim.G; if (!G) return;
    spinModels(now);
    spinBuildings(now);
    // an event card answered elsewhere (or a finished conference) closes; one still waiting comes back
    const evCard = $('#modal').hidden ? null : $('#modal [data-evn]');
    if (evCard && !(G.ev && G.ev.open.some(e => e.n === +evCard.dataset.evn))) $('#modal').hidden = true;
    if (!$('#modal').hidden && $('#modal .pz') && !G.peace) $('#modal').hidden = true;
    if ($('#modal').hidden && !G.over) { if (G.peace) showPeace(); else if (G.ev && G.ev.open.length) showEvent(); }
    if (now - (frame.side || 0) > 500) { frame.side = now; showSideEvent(); }
    if (now - lastRefresh > 300) {
      lastRefresh = now;
      if (G.humans) pollOffers();
      sel.armies = sel.armies.filter(id => Sim.army(id));
      Render.state.selArmies = new Set(sel.armies);
      if (sel.fleet && !Navy.fleet(sel.fleet)) { sel.fleet = 0; Render.state.selFleet = 0; }
      if (sel.wing && !Air.wing(sel.wing)) { sel.wing = 0; Render.state.selWing = 0; }
      if (now > lockUntil) {
        // a panel under the mouse refreshes slowly, so its buttons don't shift while you aim at them
        // (and not at all while the pointer rests on one of its buttons)
        const calm = el => hoverEl === el && (hoverBtn || now - (el._lastRefresh || 0) < 1500);
        const run = (el, fn) => { if (!calm(el)) { el._lastRefresh = now; fn(); } };
        inFrame = true;
        refreshTop();
        run($('#bottombar'), renderTrays);
        const ae = document.activeElement;
        if (ae?.id !== 'dp-search' && !(ae?.tagName === 'SELECT' && ae.closest('#drawer'))) run($('#drawer'), renderRight);
        else run($('#ucard'), renderCard);
        if (!$('#leftpanel').hidden) run($('#leftpanel'), renderLeft);
        if (treeOpen) run($('#techtree'), renderTree);
        if (sel.battle) renderBattle();
        inFrame = false;
      }
    }
    if (now - lastFront > 1000) {
      lastFront = now;
      const pairs = new Set();
      const en = Sim.enemiesOf(G.player);
      for (const a of G.armies) {
        if (a.owner !== G.player || a.order !== 'defend') continue;
        for (const p of MAP.provs) {
          if (G.owner[p.id] !== G.player) continue;
          for (const n of p.nb) { const o = G.owner[n]; if (a.frontTag ? (o === a.frontTag || (en.has(o) && Sim.root(o) === Sim.root(a.frontTag))) : en.has(o)) pairs.add(p.id + ':' + n); }
        }
      }
      Render.setFrontEdges(pairs);
    }
  }

  return { init, showStart, chooseNation, loadGame, openSaves, curEra, frame, openTab, HPS, toast, flagSVG, refreshTop, _select: ids => selectArmies(ids, false), _showEvent: () => showEvent(), _showPeace: () => showPeace(), _openSaves: g => openSaves(g), _loadGame: d => loadGame(d), _selected: () => sel.armies.slice(),
    _selectFleet: id => selectFleet(id), _selectWing: id => selectWing(id), _sel: () => ({ fleet: sel.fleet, wing: sel.wing, zone: sel.zone, tab: sel.tab }), _goals: () => openGoals(), _coach: () => coach };
})();
