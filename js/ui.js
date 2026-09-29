// Interface: start screen, top bar, dossier panels, army tray, orders and input.
'use strict';
const UI = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let MAP;
  const sel = { prov: -1, armies: [], battle: 0, tab: 'army' };
  let pending = null; // {kind, armies}
  let startPick = 'GER';
  const HPS = [0, 2, 6, 12, 24, 60]; // game hours per real second by speed level
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
  function setHTML(el, html) { if (el._html === html) return false; el._html = html; el.innerHTML = html; return true; }
  let lockUntil = 0;
  document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.panel, #hud header')) lockUntil = performance.now() + 700; }, true);

  // ---------- flags (original abstract designs) ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')'; }
  const flagCache = {};
  function flagSVG(tag) {
    if (flagCache[tag]) return flagCache[tag];
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
    $('#tb-nation').onclick = () => { const G = Sim.G; if (!G) return; selectProvince(G.countries[G.player].capital, true); };
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => { sel.tab = t.dataset.tab; renderRight(); });
    $('#mc-pol').onclick = () => setMode('political');
    $('#mc-ter').onclick = () => setMode('terrain');
    $('#mc-in').onclick = () => Render.zoomAt(Render.size[0] / 2, Render.size[1] / 2, 1.5);
    $('#mc-out').onclick = () => Render.zoomAt(Render.size[0] / 2, Render.size[1] / 2, 1 / 1.5);
    $('#mc-world').onclick = () => Render.fitWorld();
    Sim.hooks.notify = toast;
    Sim.hooks.pause = () => refreshTop();
    Sim.hooks.gameOver = gameOver;
  }
  function setMode(m) {
    Render.state.mode = m; Render.state.dirtyOwners = true;
    $('#mc-pol').classList.toggle('active', m === 'political'); $('#mc-ter').classList.toggle('active', m === 'terrain');
  }

  // ---------- start screen ----------
  const MAJORS = ['GER', 'FRA', 'ENG', 'SOV', 'ITA', 'USA', 'JAP', 'CHI', 'POL', 'SPA', 'TUR', 'ROM'];
  function countryFacts(tag) {
    const d = COUNTRY_BY_TAG[tag];
    const provs = MAP.provs.filter(p => p.owner === tag);
    const res = {};
    provs.forEach(p => { for (const k in p.res) res[k] = (res[k] || 0) + p.res[k]; });
    return { d, provs: provs.length, res };
  }
  function showStart() {
    $('#start').hidden = false;
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
  }
  function pickStart(tag) {
    const d = COUNTRY_BY_TAG[tag];
    if (!d.divs) return;
    startPick = tag;
    document.querySelectorAll('#start .ncard').forEach(b => b.classList.toggle('sel', b.dataset.tag === tag));
    const f = countryFacts(tag);
    const dl = ['Very easy', 'Easy', 'Normal', 'Hard', 'Very hard'].indexOf(d.diff);
    $('#st-flag').outerHTML = flagSVG(tag).replace('class="flag"', 'class="flag" id="st-flag"');
    $('#st-name').textContent = d.name;
    $('#st-gov').textContent = d.gov + (d.overlord ? ' · subject of ' + COUNTRY_BY_TAG[d.overlord].name : '');
    $('#st-diff').innerHTML = '<div class="diff">' + [0, 1, 2, 3, 4].map(i => `<i class="${i <= dl ? 'on' : ''}"></i>`).join('') + '</div><span class="label">' + d.diff + '</span>';
    $('#st-nums').innerHTML = `<div><b>${fmtN(d.pop * 1e6)}</b><span>Population</span></div><div><b>${d.civ + d.mil}</b><span>Factories (${d.civ} civ · ${d.mil} mil)</span></div>
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
    $('#start').hidden = true;
    $('#hud').hidden = false;
    Render.state.dirtyOwners = true;
    const cap = MAP.provs[Sim.G.countries[tag].capital];
    Render.flyTo(cap.x, cap.y, 9);
    sel.armies = []; sel.prov = -1;
    renderTrays(); renderRight(); refreshTop(); renderLeft();
    toast('You lead ' + Sim.G.countries[tag].name + '. Press Space or the play button to start the clock.', cap.id, 'info');
  }

  // ---------- top bar ----------
  function refreshTop() {
    const G = Sim.G; if (!G) return;
    const c = G.countries[G.player];
    setHTML($('#tb-nation'), flagSVG(c.tag) + `<span><div class="nm">${esc(c.name)}</div><div class="gov">${c.gov}</div></span>`);
    const divs = G.armies.filter(a => a.owner === c.tag).reduce((s, a) => s + a.units.length, 0);
    const stats = [
      ['Political power', Math.floor(c.pp), '', 'Earned daily. Declaring war costs ' + DECLARE_COST + '.'],
      ['Stability', pct(c.stab), c.stab < 0.4 ? 'bad' : c.stab < 0.55 ? 'warn' : '', 'Raises manpower growth and factory output.'],
      ['War support', pct(c.ws), c.ws < 0.25 ? 'warn' : '', 'Speeds up organisation recovery.'],
      ['Manpower', fmtN(c.manpower), c.manpower < 20000 ? 'bad' : '', 'Available recruits. Losses so far: ' + fmtN(c.losses)],
      ['Equipment', fmtN(c.equipment), c.equipment < 300 ? 'warn' : '', 'Produced by military factories each day.'],
      ['Factories', c.civ + ' / ' + c.mil, '', 'Civilian / military factories.'],
      ['Divisions', divs + (c.queue.length ? ' +' + c.queue.length : ''), '', 'Fielded divisions (+ in training).'],
      ['Wars', G.wars.filter(w => w.attackers.includes(c.tag) || w.defenders.includes(c.tag)).length, Sim.isAtWar(c.tag) ? 'bad' : '', 'Wars you are fighting.']
    ];
    setHTML($('#tb-stats'), stats.map(s => `<div class="stat ${s[2]}" title="${esc(s[3])}"><span class="v">${s[1]}</span><span class="k">${s[0]}</span></div>`).join(''));
    $('#tb-date').textContent = Sim.dateStr(G.hour, true);
    $('#tb-play').classList.toggle('paused', G.paused);
    setHTML($('#tb-play'), G.paused ? '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor"/></svg>');
    $('#tb-play').setAttribute('aria-label', G.paused ? 'Resume' : 'Pause');
    setHTML($('#tb-speed'), [1, 2, 3, 4, 5].map(i => `<i class="${i <= G.speed ? 'on' : ''}" style="height:${4 + i * 2}px"></i>`).join(''));
  }
  function togglePause() { const G = Sim.G; if (!G || G.over) return; G.paused = !G.paused; refreshTop(); }
  function setSpeed(s) { const G = Sim.G; if (!G) return; G.speed = Math.max(1, Math.min(5, s)); refreshTop(); }

  // ---------- toasts ----------
  function toast(text, prov, kind) {
    const G = Sim.G;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = `<span class="d">${G ? Sim.dateStr(G.hour) : ''}</span>${esc(text)}`;
    el.onclick = () => { if (prov >= 0) selectProvince(prov, true); el.remove(); };
    const box = $('#toasts');
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
    if (sel.tab === 'log') renderRight();
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
    if (fly && id >= 0) { const p = MAP.provs[id]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); }
    renderLeft();
  }
  function renderLeft() {
    const el = $('#leftpanel');
    const G = Sim.G;
    if (sel.prov < 0 || !G) { el.hidden = true; return; }
    el.hidden = false;
    const p = MAP.provs[sel.prov];
    const owner = G.owner[p.id], oc = G.countries[owner];
    const resNames = { steel: 'Steel', oil: 'Oil', coal: 'Coal', aluminium: 'Aluminium', rubber: 'Rubber', rare: 'Rare materials' };
    const res = Object.keys(p.res).map(k => `<dt>${resNames[k]}</dt><dd>${p.res[k]}</dd>`).join('') || '<dt>Resources</dt><dd>None</dd>';
    const armies = G.armies.filter(a => a.prov === p.id);
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
      ${p.core !== owner ? `<div class="note">Occupied territory of ${esc(G.countries[p.core].name)}.</div>` : ''}
      <dl class="kv"><dt>Terrain</dt><dd>${TERRAIN[p.terrain].name}</dd><dt>Population</dt><dd>${fmtN(p.pop)}</dd>
      <dt>Infrastructure</dt><dd>Level ${p.infra}</dd><dt>Factories</dt><dd>${p.civ} civ · ${p.mil} mil</dd>${res}
      <dt>Units</dt><dd>${armies.reduce((s, a) => s + a.units.length, 0)} divisions</dd></dl>
      <div class="list">${armyRows}</div>
      <hr class="sep">
      <div class="label">Nation</div>
      <dl class="kv"><dt>Government</dt><dd>${oc.gov}</dd><dt>Capital</dt><dd>${oc.capital >= 0 ? esc(MAP.provs[oc.capital].name) : '—'}</dd>
      <dt>Provinces</dt><dd>${provCount}</dd><dt>Divisions</dt><dd>${divs}</dd><dt>Factories</dt><dd>${oc.civ + oc.mil}</dd>
      <dt>Manpower</dt><dd>${fmtN(oc.manpower)}</dd>${oc.overlord ? `<dt>Overlord</dt><dd>${esc(G.countries[oc.overlord].name)}</dd>` : ''}</dl>
      ${canDeclare ? `<button class="btn danger" id="lp-war" style="width:100%" ${G.countries[G.player].pp < DECLARE_COST ? 'disabled' : ''}>Declare war · ${DECLARE_COST} PP</button>` : ''}`)) return;
    $('#lp-close').onclick = () => { selectProvince(-1); };
    el.querySelectorAll('[data-army]').forEach(r => r.onclick = () => selectArmies([+r.dataset.army], false));
    if (canDeclare) $('#lp-war').onclick = () => confirmWar(owner);
  }
  function compStr(a) {
    const cnt = {};
    for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
    return Object.keys(cnt).map(t => cnt[t] + ' ' + UNIT_TYPES[t].name).join(', ');
  }

  function confirmWar(tag) {
    const G = Sim.G;
    const allies = Sim.family(tag).filter(t => t !== tag).map(t => G.countries[t].name);
    modal(`<h2 class="display" style="font-size:24px">Declare war on ${esc(G.countries[tag].name)}?</h2>
      <p class="note">${allies.length ? 'These nations will join them: ' + esc(allies.join(', ')) + '.' : 'They have no allies who will join.'}
      Costs ${DECLARE_COST} political power.${G.countries[G.player].ws < 0.3 ? ' War support is low: stability will drop.' : ''}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">Declare war</button></div>`,
      x => {
        if (x !== 'yes') return;
        const c = G.countries[G.player];
        if (c.pp < DECLARE_COST) return;
        c.pp -= DECLARE_COST;
        if (c.ws < 0.3) c.stab = Math.max(0, c.stab - 0.08);
        Sim.declareWar(G.player, tag);
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
    if (sel.armies.length) sel.tab = 'army';
    renderRight(); renderTrays();
  }
  function selectedArmies() { return sel.armies.map(Sim.army).filter(Boolean); }
  function myArmiesSel() { const G = Sim.G; return selectedArmies().filter(a => a.owner === G.player); }

  // ---------- right panel ----------
  function renderRight() {
    const G = Sim.G; if (!G) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === sel.tab));
    const wars = G.wars.filter(w => w.attackers.includes(G.player) || w.defenders.includes(G.player)).length;
    $('#tab-wars-badge').textContent = wars || ''; $('#tab-wars-badge').hidden = !wars;
    const body = $('#rp-body');
    const html = sel.tab === 'army' ? armyPanel() : sel.tab === 'recruit' ? recruitPanel() : sel.tab === 'diplo' ? diploPanel() : sel.tab === 'wars' ? warsPanel() : logPanel();
    if (setHTML(body, html)) bindRight();
  }
  function meter(label, v, cls) { return `<div class="meter"><span>${label}</span><div class="bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></div><span>${pct(v)}</span></div>`; }
  const ORDER_TEXT = { hold: 'Holding position', move: 'Moving', attack: 'Offensive', defend: 'Defending front', retreat: 'Retreating', redeploy: 'Strategic redeployment' };
  function orderText(a) {
    const G = Sim.G;
    if (a.battle) { const b = G.battles.find(x => x.id === a.battle); return 'Attacking ' + (b ? MAP.provs[b.prov].name : ''); }
    if (a.retreating) return 'Retreating to ' + MAP.provs[a.path[a.path.length - 1]]?.name;
    let t = ORDER_TEXT[a.order] || a.order;
    if (a.order === 'defend') t += a.frontTag ? ' vs ' + G.countries[a.frontTag].name : ' (all enemies)';
    if ((a.order === 'move' || a.order === 'attack' || a.order === 'redeploy') && a.target >= 0) t += ' → ' + MAP.provs[a.target].name;
    if (a.path.length) { const km = a.path.reduce((s, id, i) => s + Sim.distKm(i ? a.path[i - 1] : a.prov, id), 0) - a.progress; t += ' · ~' + Math.max(1, Math.round(km / Math.max(0.5, Sim.armySpeed(a)) / 24)) + ' days'; }
    return t;
  }
  function armyPanel() {
    const G = Sim.G;
    const list = selectedArmies();
    if (!list.length) return `<p class="note">Select an army by clicking its counter on the map or a card in the tray below. Shift-click adds more armies to the selection.</p>
      <p class="note">Right-click a province to move there. Right-click enemy territory to launch an offensive that keeps pushing toward that point.</p>`;
    const mine = list[0].owner === G.player;
    let html = '';
    if (list.length === 1) {
      const a = list[0], st = Sim.armyStats(a), c = G.countries[a.owner];
      html += `<div class="owner">${flagSVG(a.owner)}<div><h2 class="display" style="font-size:21px">${esc(a.name)}</h2><div class="sub label">${esc(c.name)}</div></div></div>
        <dl class="kv"><dt>Commander</dt><dd>${esc(a.commander.name)} ${'★'.repeat(a.commander.skill)}</dd>
        <dt>Location</dt><dd>${esc(MAP.provs[a.prov].name)}</dd><dt>Orders</dt><dd>${esc(orderText(a))}</dd>
        <dt>Divisions</dt><dd>${a.units.length} · ${fmtN(Sim.manpowerOf(a))} men</dd><dt>Speed</dt><dd>${Sim.armySpeed(a).toFixed(1)} km/h</dd>
        <dt>Entrenchment</dt><dd>+${Math.round(a.entrench * 100)}%</dd></dl>
        ${meter('Strength', st.str, 'str')}${meter('Organisation', st.org, 'org')}${meter('Supply', a.supply, 'sup')}
        <div class="unitgrid" style="margin-top:8px">${Object.entries(a.units.reduce((m, u) => (m[u.type] = (m[u.type] || 0) + 1, m), {})).map(([t, n]) => `<span>${UNIT_TYPES[t].name}</span><span>× ${n}</span>`).join('')}</div>`;
    } else {
      const divs = list.reduce((s, a) => s + a.units.length, 0);
      const str = list.reduce((s, a) => s + Sim.armyStats(a).str * a.units.length, 0) / divs;
      const org = list.reduce((s, a) => s + Sim.armyStats(a).org * a.units.length, 0) / divs;
      html += `<h2 class="display" style="font-size:21px">${list.length} armies selected</h2><dl class="kv"><dt>Divisions</dt><dd>${divs}</dd></dl>${meter('Strength', str, 'str')}${meter('Organisation', org, 'org')}`;
    }
    if (!mine) return html + '<p class="note">Foreign army. You can only give orders to your own troops.</p>';
    const one = list.length === 1;
    const sameProv = list.every(a => a.prov === list[0].prov);
    html += `<div class="orders">
      <button class="btn sm ${pending?.kind === 'move' ? 'active' : ''}" data-o="move" title="Pick a destination">Move</button>
      <button class="btn sm ${pending?.kind === 'attack' ? 'active' : ''}" data-o="attack" title="Pick an enemy objective; the army keeps attacking toward it">Attack</button>
      <button class="btn sm ${pending?.kind === 'front' ? 'active' : ''}" data-o="front" title="Pick an enemy province: the army guards that border and shifts to weak spots">Defend front</button>
      <button class="btn sm" data-o="hold">Hold</button>
      <button class="btn sm" data-o="retreat">Retreat</button>
      <button class="btn sm ${pending?.kind === 'redeploy' ? 'active' : ''}" data-o="redeploy" title="Fast move through friendly land; organisation drops">Redeploy</button>
      <button class="btn sm" data-o="split" ${one && list[0].units.length > 1 ? '' : 'disabled'}>Split</button>
      <button class="btn sm" data-o="merge" ${list.length > 1 && sameProv ? '' : 'disabled'} title="Armies must share a province">Merge</button>
      <button class="btn sm" data-o="recruit" ${one ? '' : 'disabled'}>Reinforce</button></div>`;
    if (list.length > 1 && !sameProv) html += '<p class="note">Merging needs all selected armies in the same province.</p>';
    return html;
  }
  function recruitPanel() {
    const G = Sim.G, c = G.countries[G.player];
    const target = myArmiesSel().length === 1 ? myArmiesSel()[0] : null;
    let html = `<dl class="kv"><dt>Manpower</dt><dd>${fmtN(c.manpower)}</dd><dt>Equipment</dt><dd>${fmtN(c.equipment)} (+${Math.round(c.mil * 12 * (0.7 + 0.5 * c.stab))}/day)</dd></dl>
      <p class="note">New divisions ${target ? 'join <b>' + esc(target.name) + '</b> if it is inside your borders when training ends, otherwise they' : ''} gather in a reserve army at ${esc(MAP.provs[c.capital]?.name || 'the capital')}.</p><div class="list">`;
    for (const t of LAND_TYPES) {
      const u = UNIT_TYPES[t];
      html += `<div class="row">${unitIcon(t, COUNTRY_BY_TAG[G.player].color).replace('<svg', '<svg style="width:34px;height:22px;flex:none"')}<div class="grow"><div>${u.name}</div>
        <div class="sub">Atk ${u.atk} · Def ${u.def} · ${u.speed} km/h · Org ${u.org}</div><div class="sub">${fmtN(u.mp)} men · ${u.eq} equipment · ${u.days} days</div></div>
        <button class="btn sm" data-rec="${t}" ${Sim.canRecruit(G.player, t) ? '' : 'disabled'}>Train</button></div>`;
    }
    html += '</div>';
    if (c.queue.length) {
      html += '<hr class="sep"><div class="label">In training</div><div class="list" style="margin-top:6px">' + c.queue.map(q => `<div class="row"><div class="grow"><div>${UNIT_TYPES[q.type].name}</div><div class="bar prog"><i style="width:${Math.round((1 - q.hours / q.total) * 100)}%"></i></div></div><span class="sub">${Math.ceil(q.hours / 24)} d</span></div>`).join('') + '</div>';
    }
    return html;
  }
  let diploQuery = '';
  function diploPanel() {
    const G = Sim.G, me = G.countries[G.player];
    const rows = Object.values(G.countries).filter(c => c.alive && c.tag !== G.player && c.name.toLowerCase().includes(diploQuery.toLowerCase()))
      .sort((a, b) => (Sim.atWar(b.tag, G.player) - Sim.atWar(a.tag, G.player)) || a.name.localeCompare(b.name));
    return `<p class="note">Treaties, trade and factions arrive with the diplomacy update. For now you can inspect nations and declare war.</p>
      <input class="search" id="dp-search" placeholder="Search nations" value="${esc(diploQuery)}" aria-label="Search nations">
      <div class="list">${rows.map(c => {
        const canWar = !Sim.atWar(c.tag, G.player) && !Sim.allied(c.tag, G.player) && !G.over;
        const divs = G.armies.filter(a => a.owner === c.tag).reduce((s, a) => s + a.units.length, 0);
        return `<div class="row">${flagSVG(c.tag)}<div class="grow"><div class="click" data-cap="${c.capital}" style="cursor:pointer">${esc(c.name)}</div><div class="sub">${c.gov} · ${divs} divisions ${relationPill(c.tag)}</div></div>
          ${canWar ? `<button class="btn sm danger" data-war="${c.tag}" ${me.pp < DECLARE_COST ? 'disabled' : ''}>War</button>` : ''}</div>`;
      }).join('')}</div>`;
  }
  function warsPanel() {
    const G = Sim.G;
    if (!G.wars.length) return '<p class="note">The world is at peace.</p>';
    return G.wars.map(w => {
      const side = list => list.map(t => `<div class="owner" style="margin:3px 0">${flagSVG(t)}<span>${esc(G.countries[t].name)}</span></div>`).join('');
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
    body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => armyOrder(b.dataset.o));
    body.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
      const t = myArmiesSel().length === 1 ? myArmiesSel()[0].id : 0;
      if (Sim.recruit(G.player, b.dataset.rec, t)) { renderRight(); refreshTop(); }
    });
    body.querySelectorAll('[data-war]').forEach(b => b.onclick = () => confirmWar(b.dataset.war));
    body.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => selectProvince(+b.dataset.cap, true));
    body.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { if (+b.dataset.prov >= 0) selectProvince(+b.dataset.prov, true); });
    const s = $('#dp-search');
    if (s) s.oninput = e => { diploQuery = e.target.value; renderRight(); const n = $('#dp-search'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }

  function armyOrder(kind) {
    const list = myArmiesSel();
    if (!list.length) return;
    if (kind === 'move' || kind === 'attack' || kind === 'redeploy' || kind === 'front') {
      pending = pending && pending.kind === kind ? null : { kind };
      showHint(); renderRight(); return;
    }
    pending = null; showHint();
    if (kind === 'hold') list.forEach(Sim.orderHold);
    if (kind === 'retreat') list.forEach(a => Sim.orderRetreat(a));
    if (kind === 'split') { const b = Sim.splitArmy(list[0]); if (b) selectArmies([list[0].id, b.id], false); }
    if (kind === 'merge') { const m = Sim.mergeArmies(list); if (m) selectArmies([m.id], false); }
    if (kind === 'recruit') { sel.tab = 'recruit'; }
    renderRight(); renderTrays();
  }
  function showHint() {
    const h = $('#hint');
    const txt = { move: 'Choose a destination province', attack: 'Choose an enemy objective to push toward', redeploy: 'Choose a friendly province to redeploy to', front: 'Choose an enemy province to set the front against' };
    if (!pending) { h.hidden = true; $('#map').classList.remove('targeting'); return; }
    h.hidden = false; h.textContent = txt[pending.kind] + ' · Esc to cancel';
    $('#map').classList.add('targeting');
  }
  function resolvePending(prov) {
    const G = Sim.G, list = myArmiesSel();
    const kind = pending.kind; pending = null; showHint();
    if (prov < 0 || !list.length) return;
    if (kind === 'front') {
      const tag = G.owner[prov];
      if (!Sim.atWar(tag, G.player)) { toast('Pick a province of a country you are at war with.', -1, 'info'); return; }
      list.forEach(a => Sim.orderDefend(a, tag));
      toast(list.length + ' ' + (list.length > 1 ? 'armies' : 'army') + ' now defending the front against ' + G.countries[tag].name + '.', -1, 'info');
    } else issueMove(list, prov, kind);
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
      const why = o !== G.player && !Sim.allied(o, G.player) && !Sim.atWar(o, G.player) ? 'You need to be at war with ' + G.countries[o].name + ' or allied to enter.' : kind === 'redeploy' ? 'Redeployment only uses friendly land.' : 'No land route (sea crossings arrive with the navy).';
      toast('No route to ' + MAP.provs[prov].name + '. ' + why, prov, 'info');
    }
    renderRight();
  }

  // ---------- trays ----------
  function renderTrays() {
    const G = Sim.G; if (!G) return;
    const mine = G.armies.filter(a => a.owner === G.player);
    const status = a => a.battle ? '⚔ In battle' : a.retreating ? 'Retreating' : a.path.length ? (a.order === 'attack' ? 'Advancing' : 'Moving') : a.order === 'defend' ? 'Defending front' : 'Holding';
    const trayHTML = mine.map(a => {
      const st = Sim.armyStats(a);
      return `<button class="acard ${sel.armies.includes(a.id) ? 'sel' : ''}" data-a="${a.id}"><div class="t"><span>${esc(a.name)}</span><span class="num">${a.units.length}</span></div>
        <div class="s">${esc(MAP.provs[a.prov].name)} · ${status(a)}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div><div class="bar org"><i style="width:${st.org * 100}%"></i></div></button>`;
    }).join('');
    if (setHTML($('#armytray'), trayHTML)) document.querySelectorAll('#armytray .acard').forEach(b => {
      b.onclick = e => selectArmies([+b.dataset.a], e.shiftKey || e.ctrlKey || e.metaKey);
      b.ondblclick = () => { const a = Sim.army(+b.dataset.a); if (a) { const p = MAP.provs[a.prov]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); } };
    });
    const list = selectedArmies();
    const units = list.length === 1 ? list[0].units : [];
    const col = list.length ? COUNTRY_BY_TAG[list[0].owner].color : '#777';
    setHTML($('#unittray'), units.map(u => `<div class="ucard">${unitIcon(u.type, col)}<div>${UNIT_TYPES[u.type].short}</div><div class="bar str"><i style="width:${u.str * 100}%"></i></div><div class="bar org"><i style="width:${u.org * 100}%"></i></div></div>`).join(''));
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
      <div style="padding-left:24px;display:flex;flex-direction:column;gap:4px">${chk('pauseWar', 'War declared on or by me')}${chk('pauseLoss', 'Loss of a city or my capital')}${chk('pauseBattle', 'Battles involving my armies')}${chk('pauseCapitulation', 'A nation in my wars capitulates')}</div>
      <hr class="sep"><div class="label">Controls</div>
      <p class="note">Drag to pan, scroll or pinch to zoom. Click a counter to select an army, shift-click to add. Right-click to move or attack. Space pauses, + and − change speed, 1–5 pick a speed, Esc clears the selection.</p>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn danger" data-x="new">New game</button><button class="btn primary" data-x="ok">Close</button></div>`,
      x => { if (x === 'new') newGamePrompt(); });
    ['autoPause', 'pauseWar', 'pauseLoss', 'pauseBattle', 'pauseCapitulation'].forEach(k => { $('#set-' + k).onchange = e => { s[k] = e.target.checked; }; });
    G.paused = true; refreshTop();
  }
  function newGamePrompt() {
    modal(`<h2 class="display" style="font-size:24px">Start a new game?</h2><p class="note">The current campaign will be lost.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">New game</button></div>`,
      x => { if (x === 'yes') backToStart(); });
  }
  function backToStart() {
    Sim.G = null; sel.armies = []; sel.prov = -1; sel.battle = 0; pending = null; showHint();
    Render.state.selArmies = new Set(); Render.state.selProv = -1; Render.state.dirtyOwners = true; Render.setFrontEdges(null);
    $('#hud').hidden = true; $('#battle').hidden = true; $('#leftpanel').hidden = true;
    showStart();
  }
  function gameOver(won) {
    const G = Sim.G;
    const days = Math.floor(G.hour / 24);
    modal(`<h2 class="display" style="font-size:28px">${won ? 'Victory' : esc(G.countries[G.player].name) + ' has fallen'}</h2>
      <p class="note">Your government capitulated on ${Sim.dateStr(G.hour)} after ${days} days. Battles won: ${G.stats.battlesWon}, lost: ${G.stats.battlesLost}. Provinces captured: ${G.stats.captured}.</p>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="new">Choose a new nation</button></div>`, () => backToStart());
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
      else { down = { x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, button: e.button }; dragged = false; }
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
      if (!ptrs.size) down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; pinch = null; });
    cv.addEventListener('pointerleave', () => { Render.state.hover = -1; });
    cv.addEventListener('wheel', e => { e.preventDefault(); Render.cam.anim = false; Render.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }
  function click(sx, sy, button, add) {
    const G = Sim.G;
    const [wx, wy] = Render.screenToWorld(sx, sy);
    const prov = Render.provinceAt(wx, wy);
    if (!G) { if (prov >= 0) pickStart(MAP.provs[prov].owner); return; }
    if (pending && button === 0) { resolvePending(prov); return; }
    if (button === 2) {
      pending = null; showHint();
      const list = myArmiesSel();
      if (list.length && prov >= 0) issueMove(list, prov, 'auto');
      return;
    }
    const b = Render.battleAtScreen(sx, sy);
    if (b) { openBattle(b); return; }
    const a = Render.counterAt(sx, sy);
    if (a) {
      // clicking a stack cycles through armies sharing that province
      selectArmies([a.id], add && a.owner === G.player);
      selectProvince(a.prov);
      return;
    }
    if (!add) selectArmies([], false);
    selectProvince(prov);
  }
  function bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const G = Sim.G; if (!G) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === '+' || e.key === '=') setSpeed(G.speed + 1);
      else if (e.key === '-' || e.key === '_') setSpeed(G.speed - 1);
      else if (/^[1-5]$/.test(e.key)) setSpeed(+e.key);
      else if (e.key === 'Escape') {
        if (pending) { pending = null; showHint(); renderRight(); }
        else if (!$('#modal').hidden) $('#modal').hidden = true;
        else if (sel.battle) { sel.battle = 0; $('#battle').hidden = true; }
        else { selectArmies([], false); selectProvince(-1); }
      }
    });
  }

  // ---------- periodic refresh ----------
  let lastRefresh = 0, lastFront = 0;
  function frame(now) {
    const G = Sim.G; if (!G) return;
    if (now - lastRefresh > 300) {
      lastRefresh = now;
      sel.armies = sel.armies.filter(id => Sim.army(id));
      Render.state.selArmies = new Set(sel.armies);
      if (now > lockUntil) {
        refreshTop(); renderTrays();
        if (document.activeElement?.id !== 'dp-search') renderRight();
        if (!$('#leftpanel').hidden) renderLeft();
        if (sel.battle) renderBattle();
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

  return { init, showStart, frame, HPS, toast, flagSVG, refreshTop };
})();
