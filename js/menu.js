// Main menu: Continue, New game (era, then nation), Load game, Join game (online play), Options and Credits.
// Also keeps the player's preferences, which outlive any one game.
'use strict';
const Menu = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const X = '<button class="iconbtn x" data-close aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button>';

  // ---------- preferences ----------
  const PREFS_KEY = 'ironmeridian.prefs', BG_KEY = 'ironmeridian.bg';
  const DEFAULTS = { panSpeed: 6, uiSize: 100, figures: true, autosave: true, pauseEvent: true, pauseWar: true, hintSeen: false, taught: false, effects: true, soundOn: true, volMaster: 70, volMusic: 45, volSfx: 70 };
  let prefs = null, bgMemory = null;
  function load() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { p = {}; }
    prefs = Object.assign({}, DEFAULTS, p);
  }
  function save() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { } }
  function getPrefs() { if (!prefs) load(); return prefs; }
  function setPref(k, v) { getPrefs()[k] = v; save(); apply(); }
  function apply() {
    const p = getPrefs();
    const hud = $('#hud');
    if (hud) hud.style.zoom = p.uiSize === 100 ? '' : String(p.uiSize / 100);
    if (typeof Render !== 'undefined' && Render.state) { Render.state.figures = p.figures; Render.state.effects = p.effects !== false; }
    const G = typeof Sim !== 'undefined' && Sim.G;
    if (G) { G.settings.autosave = p.autosave; G.settings.pauseEvent = p.pauseEvent; G.settings.pauseWar = p.pauseWar; }
    if (typeof Sound !== 'undefined') Sound.apply();
  }

  // ---------- background: the painting, or the player's own picture ----------
  let painted = false, embersOn = false;
  function background() {
    if (!painted) { painted = true; try { MenuArt.paint($('#bg-paint')); } catch (e) { console.error(e); } }
    if (!embersOn) { embersOn = true; MenuArt.embers($('#embers'), () => !$('#menu').hidden); }
    let img = bgMemory;
    if (!img) try { img = localStorage.getItem(BG_KEY); } catch (e) { img = null; }
    $('#bg-img').hidden = !img; $('#bg-paint').hidden = !!img;
    if (img && $('#bg-img').src !== img) $('#bg-img').src = img;
    film(!img);
  }
  // the battle film made in Blender: the painting shows until it plays, and stays if it cannot
  const FILM = ['media/menu-battle.webm', 'media/menu-battle.mp4', '../media/menu-battle.webm', '../media/menu-battle.mp4'];
  let filmSet = false;
  function film(want) {
    const v = $('#bg-video'); if (!v) return;
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!want || still || $('#menu').hidden) { v.hidden = !want || still; if (!v.paused) v.pause(); return; }
    v.hidden = false;
    if (!filmSet) {
      filmSet = true;
      v.innerHTML = FILM.map(src => `<source src="${src}" type="video/${src.endsWith('.mp4') ? 'mp4' : 'webm'}">`).join('');
      v.addEventListener('playing', () => v.classList.add('on'));
      v.load();
      // stop playing once the menu is gone, so the game gets the computer to itself
      setInterval(() => { if ($('#menu').hidden && !v.paused) v.pause(); }, 1000);
    }
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }
  function useImage(file) {
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      bgMemory = url;
      let big = false;
      try { localStorage.setItem(BG_KEY, url); bgMemory = null; } catch (e) { big = true; }
      background(); renderOptions();
      if (big) flash('That picture is too big to remember after you close the page, so it shows until then.');
    };
    r.readAsDataURL(file);
  }
  function usePainting() { bgMemory = null; try { localStorage.removeItem(BG_KEY); } catch (e) { } background(); renderOptions(); }
  const hasImage = () => { if (bgMemory) return true; try { return !!localStorage.getItem(BG_KEY); } catch (e) { return false; } };

  // ---------- the menu itself ----------
  const eras = () => Eras.list().slice().sort((a, b) => a.year - b.year);
  const yearLabel = e => e.year < 0 ? -e.year + ' BC' : e.year < 1000 ? e.year + ' AD' : String(e.year);
  function show(sheet) {
    $('#hud').hidden = true; $('#start').hidden = true;
    $('#menu').hidden = false;
    background();
    const last = typeof Save !== 'undefined' ? Save.latest() : null;
    $('#mm-continue').hidden = !last;
    if (last) $('#mm-cont-sub').textContent = last.nation + ' · ' + last.date;
    const list = eras(), n = list.length - 1;
    $('#mm-eras').innerHTML = list.map((e, i) => `<div style="left:${n ? i / n * 100 : 0}%"><b>${esc(e.label || yearLabel(e))}</b><span>${esc(e.name)}</span></div>`).join('');
    open(sheet || null);
  }
  function hide() { $('#menu').hidden = true; open(null); film(false); }
  let current = null, pickedEra = null, optTab = 'controls';
  function open(id) {
    current = id;
    document.querySelectorAll('.menu-list button').forEach(b => b.classList.toggle('on', b.id === 'mm-' + id));
    const sh = $('#sheet');
    if (!id) { sh.hidden = true; sh.innerHTML = ''; return; }
    sh.hidden = false;
    if (id === 'new') renderNew();
    else if (id === 'load') renderLoad();
    else if (id === 'options') renderOptions();
    else if (id === 'credits') renderCredits();
    else if (id === 'join') renderJoin();
    sh.scrollTop = 0;
    const f = sh.querySelector('.era.on, [data-ld], [data-otab].on'); if (f) f.focus({ preventScroll: true });
  }
  function renderNew() {
    const list = eras();
    if (!pickedEra || !list.some(e => e.id === pickedEra)) pickedEra = UI.curEra();
    $('#sheet').innerHTML = `${X}<h2>New game</h2><p>Pick an era, then the nation you will lead.</p>
      <div class="era-cards" role="listbox" aria-label="Eras">${list.map(e => `<button class="era ${e.id === pickedEra ? 'on' : ''}" data-era="${e.id}" role="option" aria-selected="${e.id === pickedEra}"><b>${esc(e.label || yearLabel(e))}</b><span>${esc(e.name)}</span><small>${esc(e.blurb || '')}</small></button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-close>Back</button><button class="btn primary" id="mm-choose">Choose nation</button></div>`;
    $('#sheet').querySelectorAll('.era').forEach(b => {
      b.onclick = () => { pickedEra = b.dataset.era; $('#sheet').querySelectorAll('.era').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); };
      b.ondblclick = () => go();
    });
    const go = () => { hide(); UI.chooseNation(pickedEra); };
    $('#mm-choose').onclick = go;
  }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  function flagOf(tag, era) {
    // a save from another era may name a nation this era doesn't have
    try { if (era === UI.curEra() && COUNTRY_BY_TAG[tag]) return UI.flagSVG(tag); } catch (e) { }
    return '<span class="noflag"><svg class="i"><use href="#i-save"/></svg></span>';
  }
  function renderLoad() {
    const slots = Save.list().filter(s => !s.empty);
    const eraName = id => { const e = Eras.list().find(x => x.id === id); return e ? e.name : id; };
    $('#sheet').innerHTML = `${X}<h2>Load game</h2>
      <p>${Save.available() ? 'Saves are kept in this browser. The autosave runs every game month.' : 'This browser does not allow saving here, so saves last only until the page closes. Import a file you exported instead.'}</p>
      <div class="slots">${slots.length ? slots.map(s => `<div class="slot">${s.bad ? '<span class="noflag">!</span>' : flagOf(s.player, s.era)}
        <div><h3>${s.slot === Save.AUTO ? 'Autosave' : 'Slot ' + esc(s.slot)}${s.bad ? '' : ' · ' + esc(s.nation)}</h3><div class="sub">${s.bad ? esc(s.bad) : esc(eraName(s.era)) + ' · ' + esc(s.date) + ' · saved ' + ago(s.savedAt)}</div></div>
        <div class="acts">${s.bad ? '' : `<button class="btn sm ${s === slots[0] ? 'primary' : ''}" data-ld="${esc(s.slot)}">Load</button>`}<button class="btn sm ghost" data-rm="${esc(s.slot)}" aria-label="Delete ${s.slot === Save.AUTO ? 'the autosave' : 'slot ' + esc(s.slot)}">Delete</button></div></div>`).join('')
        : '<p class="note">No saved games yet. Save from the menu during a game, or wait for the monthly autosave.</p>'}</div>
      <div class="foot"><label class="btn upload">Import from file<input type="file" id="mm-file" accept=".json,application/json"></label></div>`;
    const sh = $('#sheet');
    sh.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { const r = Save.read(b.dataset.ld); if (r.ok) { hide(); UI.loadGame(r.data); } else flash(r.why); });
    sh.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { Save.remove(b.dataset.rm); renderLoad(); refreshContinue(); });
    $('#mm-file').onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const r = Save.parse(String(rd.result)); if (r.ok) { hide(); UI.loadGame(r.data); } else { renderLoad(); flash(r.why); } };
      rd.readAsText(f);
    };
  }
  // a short message at the top of the open sheet
  function flash(msg) { const sh = $('#sheet'); if (sh.hidden) return; let n = sh.querySelector('.flash'); if (!n) { n = document.createElement('p'); n.className = 'flash why bad'; n.setAttribute('role', 'alert'); sh.querySelector('h2').after(n); } n.textContent = msg; }
  function refreshContinue() { const last = Save.latest(); $('#mm-continue').hidden = !last; if (last) $('#mm-cont-sub').textContent = last.nation + ' · ' + last.date; }
  function renderOptions() {
    if (current !== 'options') return;
    const p = getPrefs();
    const seg = (k, a, b) => `<div class="seg"><button class="chip ${p[k] ? 'on' : ''}" data-pref="${k}" data-v="1">${a}</button><button class="chip ${!p[k] ? 'on' : ''}" data-pref="${k}" data-v="0">${b}</button></div>`;
    const panes = {
      controls: `<div class="k">Move the map</div><div class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows, or drag with the right button</div>
        <div class="k">Map speed<small>How fast the keys move the map</small></div><input type="range" id="opt-pan" min="1" max="10" value="${p.panSpeed}" aria-label="Map speed">
        <div class="k">Select several armies<small>Hold the left button on the map and drag across them</small></div><div class="keys">Drag</div>
        <div class="k">Add or remove one army</div><div class="keys"><kbd>Shift</kbd> + click</div>
        <div class="k">Move or attack</div><div class="keys">Right-click</div>
        <div class="k">Open a side bar tab</div><div class="keys"><kbd>1</kbd> to <kbd>9</kbd></div>
        <div class="k">Close panels</div><div class="keys"><kbd>Esc</kbd></div>
        <div class="k">Pause, and game speed</div><div class="keys"><kbd>Space</kbd><kbd>+</kbd><kbd>−</kbd></div>`,
      graphics: `<div class="k">Menu background<small>The battle film of all six eras (the painting shows while it loads), or a picture of your own</small></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ${hasImage() ? '' : 'primary'}" id="opt-paint">Battle film</button><label class="btn sm upload ${hasImage() ? 'primary' : ''}">Use my image<input type="file" id="opt-bg" accept="image/*"></label></div>
        <div class="k">Interface size<small>${p.uiSize}%</small></div><input type="range" id="opt-ui" min="85" max="125" step="5" value="${p.uiSize}" aria-label="Interface size">
        <div class="k">3D troop figures<small>Off shows plain counters, which is faster on old computers</small></div>${seg('figures', 'On', 'Off')}
        <div class="k">Battle and map effects<small>Shells in flight, blasts, falling soldiers, and the busy map. Light keeps only the gunfire, for slower computers</small></div>${seg('effects', 'Full', 'Light')}`,
      sound: soundPane(p),
      game: `<div class="k">Autosave<small>Once a game month, and when you leave the page</small></div>${seg('autosave', 'On', 'Off')}
        <div class="k">Pause when an event needs an answer</div>${seg('pauseEvent', 'Yes', 'No')}
        <div class="k">Pause when a war starts</div>${seg('pauseWar', 'Yes', 'No')}`
    };
    $('#sheet').innerHTML = `${X}<h2>Options</h2>
      <div class="tabs" role="tablist">${[['controls', 'Controls'], ['graphics', 'Graphics'], ['sound', 'Sound'], ['game', 'Game']].map(([k, n]) => `<button data-otab="${k}" class="${optTab === k ? 'on' : ''}" role="tab" aria-selected="${optTab === k}">${n}</button>`).join('')}</div>
      <div class="opts">${panes[optTab]}</div>`;
    const sh = $('#sheet');
    sh.querySelectorAll('[data-otab]').forEach(b => b.onclick = () => { optTab = b.dataset.otab; renderOptions(); });
    sh.querySelectorAll('[data-pref]').forEach(b => b.onclick = () => { setPref(b.dataset.pref, b.dataset.v === '1'); renderOptions(); });
    const pan = $('#opt-pan'); if (pan) pan.oninput = e => setPref('panSpeed', +e.target.value);
    const ui = $('#opt-ui'); if (ui) { ui.oninput = e => { prefs.uiSize = +e.target.value; ui.previousElementSibling.querySelector('small').textContent = prefs.uiSize + '%'; }; ui.onchange = e => setPref('uiSize', +e.target.value); }
    const bg = $('#opt-bg'); if (bg) bg.onchange = e => { const f = e.target.files && e.target.files[0]; if (f) useImage(f); };
    const pt = $('#opt-paint'); if (pt) pt.onclick = usePainting;
    soundHooks(sh);
  }
  // ---------- sound: shared by Options and the in-game menu ----------
  function soundPane(p) {
    p = p || getPrefs();
    const seg = (k, a, b) => `<div class="seg"><button class="chip ${p[k] ? 'on' : ''}" data-pref="${k}" data-v="1">${a}</button><button class="chip ${!p[k] ? 'on' : ''}" data-pref="${k}" data-v="0">${b}</button></div>`;
    const sl = (k, n, sub) => `<div class="k">${n}<small>${sub}</small></div><input type="range" data-vol="${k}" min="0" max="100" step="5" value="${p[k]}" aria-label="${n}">`;
    return `<div class="k">Sound<small>Music and effects are made by the game itself. M turns sound on or off.</small></div>${seg('soundOn', 'On', 'Off')}
        ${sl('volMaster', 'Overall volume', 'Everything together')}${sl('volMusic', 'Music', 'A tune for each era')}${sl('volSfx', 'Effects', 'Battle, alerts and clicks')}`;
  }
  function soundHooks(root, rerender) {
    if (rerender) root.querySelectorAll('[data-pref="soundOn"]').forEach(b => b.onclick = () => { setPref('soundOn', b.dataset.v === '1'); rerender(); });
    root.querySelectorAll('[data-vol]').forEach(r => { r.oninput = e => { prefs[r.dataset.vol] = +e.target.value; apply(); }; r.onchange = e => setPref(r.dataset.vol, +e.target.value); });
  }
  // ---------- online play: join a friend's game with a code, or host one ----------
  const PAGES_URL = 'https://mahmoud1921.github.io/ironmeridian/';
  let joinCode = '', hostNext = false, joining = false;
  function renderJoin() {
    const p = getPrefs();
    if (window.IM_ARTIFACT) {
      $('#sheet').innerHTML = `${X}<h2>Play with others</h2><p>Online play runs in the web version of the game, which anyone can open without an account:</p>
        <p><a class="lnk" href="${PAGES_URL}" target="_blank" rel="noopener">${PAGES_URL}</a></p>
        <p class="note">To host a game you started here, save it, export the save from Load game, and import it there.</p>`;
      return;
    }
    const lob = Net.role === 'client' && Net.lobby;
    if (lob) { renderLobby(lob); return; }
    $('#sheet').innerHTML = `${X}<h2>Play with others</h2>
      <p>Join a friend's game with the code they give you, or host your own. Nations nobody picks stay with the computer.</p>
      <div class="opts">
        <div class="k">Your name<small>Shown to the other players</small></div><input class="field" id="mp-name" maxlength="24" value="${esc(p.name || '')}" placeholder="Player" autocomplete="nickname">
        <div class="k">Join code</div><input class="field code" id="mp-code" maxlength="12" value="${esc(joinCode)}" placeholder="ABCDE" autocomplete="off" autocapitalize="characters" spellcheck="false">
      </div>
      <p class="note" id="mp-status">${esc(Net.status || '')}</p>
      <div class="foot"><button class="btn ghost" id="mp-host">Host a new game</button><button class="btn primary" id="mp-join" ${joining ? 'disabled' : ''}>Join game</button></div>
      <p class="note">To host a saved game, load it, then open the menu with Esc and choose Invite players.</p>`;
    const name = $('#mp-name'), code = $('#mp-code');
    name.onchange = () => setPref('name', name.value.trim().slice(0, 24));
    code.oninput = () => { joinCode = Net.clean(code.value); };
    code.onkeydown = e => { if (e.key === 'Enter') go(); };
    const go = async () => {
      if (joining) return;
      setPref('name', name.value.trim().slice(0, 24));
      joinCode = Net.clean(code.value);
      joining = true; $('#mp-join').disabled = true;
      const r = await Net.join(joinCode, getPrefs().name || 'Player');
      joining = false;
      if (current !== 'join') return;
      if (!r.ok) { renderJoin(); flash(r.why); }
    };
    $('#mp-join').onclick = go;
    $('#mp-host').onclick = () => { setPref('name', name.value.trim().slice(0, 24)); hostNext = true; open('new'); };
    if (!code.value) code.focus({ preventScroll: true });
  }
  function renderLobby(m) {
    if (current !== 'join') open('join');
    const eraName = (Eras.list().find(e => e.id === m.era) || {}).name || m.era;
    $('#sheet').innerHTML = `${X}<h2>Pick your nation</h2>
      <p>${esc(m.host || 'The host')}'s game · ${esc(eraName)} · ${esc(m.date || '')}. Pick any nation nobody leads yet.</p>
      <div class="list mp-nations">${m.nations.map(n => {
        const by = m.taken[n.tag];
        return `<button class="row mp-nation" data-mpick="${esc(n.tag)}" ${by ? 'disabled' : ''}><span class="swatch" style="background:${esc(n.color)}"></span><span class="grow"><b>${esc(n.name)}</b><span class="sub">${n.prov} province${n.prov === 1 ? '' : 's'}${by ? ' · led by ' + esc(by) : ''}</span></span></button>`;
      }).join('')}</div>
      <div class="foot"><button class="btn ghost" id="mp-leave">Leave</button></div>`;
    if (m.deny) flash(m.deny);
    $('#sheet').querySelectorAll('[data-mpick]').forEach(b => b.onclick = () => { $('#sheet').querySelectorAll('[data-mpick]').forEach(x => x.disabled = true); b.querySelector('.sub').textContent = 'Joining…'; Net.pick(b.dataset.mpick); });
    $('#mp-leave').onclick = () => { Net.stop(); renderJoin(); };
  }
  function takeHost() { const h = hostNext; hostNext = false; return h; }
  function renderCredits() {
    $('#sheet').innerHTML = `${X}<h2>Credits</h2>
      <p>Designed by mahmoud. Built with Claude.</p>
      <p>Every map, flag, painting and troop figure is original and drawn in code. Seven eras, from the Peloponnesian War in 431 BC to the drone wars of 2026. Every sound and tune is made by the game itself.</p>`;
  }

  function init() {
    load();
    $('#mm-continue').onclick = () => { const last = Save.latest(); if (!last) return; const r = Save.read(last.slot); if (r.ok) { hide(); UI.loadGame(r.data); } else { open('load'); flash(r.why); } };
    $('#mm-new').onclick = () => open(current === 'new' ? null : 'new');
    $('#mm-load').onclick = () => open(current === 'load' ? null : 'load');
    $('#mm-options').onclick = () => open(current === 'options' ? null : 'options');
    $('#mm-credits').onclick = () => open(current === 'credits' ? null : 'credits');
    $('#mm-join').onclick = () => open(current === 'join' ? null : 'join');
    Net.hooks.lobby = m => { if (!$('#menu').hidden) renderLobby(m); };
    Net.hooks.status = t => { const n = $('#mp-status'); if (n) n.textContent = t; };
    // an invite link opens straight onto the join sheet with the code filled in
    const h = /[#&]join=([A-Za-z0-9-]+)/.exec(location.hash || '');
    if (h) { joinCode = Net.clean(h[1]); setTimeout(() => { if (!$('#menu').hidden) open('join'); }, 0); }
    $('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) open(null); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#menu').hidden && current) { e.preventDefault(); open(null); } });
    apply();
  }
  return { init, show, hide, open, flash, takeHost, prefs: getPrefs, setPref, apply, soundPane, soundHooks, isOpen: () => !$('#menu').hidden };
})();
