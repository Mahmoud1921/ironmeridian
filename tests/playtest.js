#!/usr/bin/env node
// Automated playtest: drives the built game in a real browser like a player would,
// clicking once per action and checking the action took effect. Reports dead clicks,
// script errors, broken game-state invariants and frame-time spikes.
//   node tests/playtest.js [--quick] [--seed N] [--browser chromium|firefox] [--only navy,eras] [--serial] [--jobs N]
// By default the eight parts run side by side, four at a time; --serial runs them one after another in one browser.
// Exit code 1 when any check fails. Run after every change: build, playtest, fix, repeat.
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const SEED = +(args[args.indexOf('--seed') + 1] || 7) || 7;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const BROWSER = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : 'chromium';
const FILE = 'file://' + path.resolve(__dirname, '../dist/iron-meridian.html');
let rnd = SEED; const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rand() * a.length)];

const results = [];
const T0 = Date.now();
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : '') + (process.env.TIMING ? '  [' + Math.round((Date.now() - T0) / 1000) + ' s]' : '')); }

async function clickEl(page, sel, opts = {}) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) return false;
  // a hidden button is a dead click: give it a moment to show, but do not sit in Playwright's 30 s default
  await loc.waitFor({ state: 'visible', timeout: opts.timeout || 3000 }).catch(() => {});
  // scroll it into view (again if a panel refresh moved it meanwhile), like a person scrolling a list
  let box = null;
  for (let i = 0; i < 4; i++) {
    await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    box = await loc.boundingBox();
    const vp = page.viewportSize();
    if (box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width) break;
    await page.waitForTimeout(100);
  }
  if (!box) return false;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  // press like a person does (about a tenth of a second), which is when a UI that rebuilds itself loses clicks
  if (opts.tap) await page.touchscreen.tap(x, y);
  else { await page.mouse.move(x, y); await page.mouse.down({ button: opts.button || 'left' }); await page.waitForTimeout(90 + Math.random() * 60); await page.mouse.up({ button: opts.button || 'left' }); }
  return true;
}
async function clickWorld(page, wx, wy, button = 'left') {
  const [sx, sy] = await page.evaluate(([x, y]) => Render.worldToScreen(x, y), [wx, wy]);
  await page.mouse.click(sx, sy, { button });
  return [sx, sy];
}
// parts running side by side share the CPU, so a click gets a little longer to show (800 ms instead of 400)
const waitFor = async (page, fn, arg, ms = args.includes('--report') ? 800 : 400) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };
// the main menu's New game: pick an era (optional), then Choose nation opens the nation picker
async function toPicker(page, era) {
  await waitFor(page, () => !document.getElementById('menu').hidden, null, 3000);
  await clickEl(page, '#mm-new');
  await waitFor(page, () => !!document.querySelector('#sheet .era'), null, 1500);
  if (era) await clickEl(page, `#sheet .era[data-era="${era}"]`);
  await clickEl(page, '#mm-choose');
  return waitFor(page, () => !document.getElementById('start').hidden && !!document.querySelector('#start .ncard') && document.getElementById('menu').hidden, null, 8000);
}

// economy rules, evaluated inside the page
const ECO_INVARIANTS = `window.ecoInvariants = () => {
  const G = Sim.G, bad = [];
  for (const c of Object.values(G.countries)) {
    if (!c.alive || !c.eco || c.eco.none) continue;
    if (!Number.isFinite(c.eco.gold)) bad.push(c.tag + ' gold is ' + c.eco.gold);
    for (const k of Economy.GOODS) if (!(c.eco.stock[k] >= 0) || !Number.isFinite(c.eco.stock[k])) bad.push(c.tag + ' ' + k + ' stock is ' + c.eco.stock[k]);
    if (!Number.isFinite(c.equipment)) bad.push(c.tag + ' arms is ' + c.equipment);
    if ((c.techs || []).length !== new Set(c.techs).size) bad.push(c.tag + ' has a tech twice');
    for (const id of c.techs || []) { const x = Tech.info(id); if (x && x.alt && c.techs.includes(x.alt)) bad.push(c.tag + ' took both tier-3 paths ' + id + '/' + x.alt); }
  }
  for (const d of G.dip.trade) {
    if (!G.countries[d.from] || !G.countries[d.to] || !G.countries[d.from].alive || !G.countries[d.to].alive) bad.push('deal ' + d.id + ' with a dead nation');
    if (Sim.atWar(d.from, d.to)) bad.push('deal ' + d.id + ' between nations at war');
    if (Economy.embargoed(d.from, d.to)) bad.push('deal ' + d.id + ' under embargo');
    if (!(d.amount > 0) || !(d.price >= 0)) bad.push('deal ' + d.id + ' has bad terms');
  }
  for (const t of Object.keys(G.countries)) if (G.countries[t].alive && Economy.dealsOf(t).length > Economy.tradeSlots(t) + 1) bad.push(t + ' has more deals than slots');
  G.ind.forEach((I, i) => { if (I) for (const k in I) if (!(I[k] >= 0)) bad.push('province ' + i + ' ' + k + ' count ' + I[k]); });
  return bad.concat(navyInvariants());
};
window.navyInvariants = () => {
  const G = Sim.G, bad = [];
  if (!G.fleets) return bad;
  const ids = new Set();
  for (const f of G.fleets) {
    if (ids.has(f.id)) bad.push('fleet ' + f.id + ' twice'); ids.add(f.id);
    if (!G.countries[f.owner] || !G.countries[f.owner].alive) bad.push('fleet ' + f.id + ' of a dead nation');
    if (!f.ships.length) bad.push('fleet ' + f.id + ' has no ships');
    if (!(f.zone >= 0 && f.zone < Seas.all().length)) bad.push('fleet ' + f.id + ' in zone ' + f.zone);
    for (const s of f.ships) if (!(s.str > 0 && s.str <= 1.0001) || !(s.org >= 0 && s.org <= 1.0001) || !Navy.ROLES[s.type]) bad.push('fleet ' + f.id + ' ship ' + s.type + ' str ' + s.str + ' org ' + s.org);
    if (f.battle && !G.navBattles.some(b => b.id === f.battle)) bad.push('fleet ' + f.id + ' in a battle that is over');
  }
  for (const w of G.wings) {
    if (!G.countries[w.owner] || !G.countries[w.owner].alive) bad.push('wing ' + w.id + ' of a dead nation');
    if (!(w.str > 0 && w.str <= 1.0001)) bad.push('wing ' + w.id + ' str ' + w.str);
    if (!Economy.infra(w.base, 'air')) bad.push('wing ' + w.id + ' based without an airbase');
  }
  for (const c of Object.values(G.countries)) if (c.alive && c.navy && Navy.freeTransports(c.tag) < 0) bad.push(c.tag + ' uses more transports than it has');
  for (const a of G.armies) if (a.sea && !(a.sea.target >= 0 && a.sea.target < Sim.MAP.provs.length)) bad.push('army ' + a.id + ' at sea without a target');
  (G.inf || []).forEach((I, i) => { if (I) for (const k in I) if (!(I[k] >= 0 && I[k] <= Economy.INFRA[k].max)) bad.push('province ' + i + ' ' + k + ' level ' + I[k]); });
  return bad;
};`;

// random events can fire at any moment of a long run; parts that do not test events answer them at once
// (the desktop part also signs any peace conference, which would otherwise hold the clock)
const autoAnswer = (page, peace) => page.evaluate(peace => setInterval(() => { try { if (Sim.G && Events.open().length) while (Events.open().length) Events.choose(Events.open()[0].n, 0); if (peace && Sim.G && Sim.G.peace) Peace.done(Sim.G.peace); } catch (e) {} }, 100), !!peace);

async function desktopRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(FILE); await autoAnswer(page, true);
  check('boot: loading screen clears', await waitFor(page, () => document.getElementById('loading').hidden, null, 15000));
  check('boot: the main menu shows first', await page.evaluate(() => !document.getElementById('menu').hidden && document.getElementById('start').hidden));
  check('menu: New game then Choose nation opens the nation picker', await toPicker(page));

  // --- start screen ---
  const tag = pick(['GER', 'FRA', 'ENG', 'SOV', 'ITA', 'JAP', 'POL']);
  await clickEl(page, `#start .ncard[data-tag="${tag}"]`);
  check('start: one click picks ' + tag, await waitFor(page, t => document.getElementById('st-name').textContent === COUNTRY_BY_TAG[t].name, tag));
  await clickEl(page, '#st-play');
  check('start: one click on Play starts the game', await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden, null, 1500));
  await page.waitForTimeout(700);

  // --- clock ---
  await clickEl(page, '#tb-play');
  check('clock: one click on play resumes', await waitFor(page, () => !Sim.G.paused));
  const h0 = await page.evaluate(() => Sim.G.hour);
  await page.waitForTimeout(1200);
  check('clock: time advances', (await page.evaluate(() => Sim.G.hour)) > h0);
  await page.keyboard.press('Space');
  check('clock: Space pauses right after clicking a button', await waitFor(page, () => Sim.G.paused));
  await page.keyboard.press('Space');
  check('clock: Space resumes', await waitFor(page, () => !Sim.G.paused));
  await clickEl(page, '#tb-faster');
  check('clock: + raises speed', await waitFor(page, () => Sim.G.speed === 3));

  // --- repeated single clicks while the game runs ---
  let dead = 0, tries = 0;
  const n = QUICK ? 8 : 20;
  for (let i = 0; i < n; i++) {
    const cards = await page.locator('#armytray .acard').count();
    if (!cards) break;
    const k = Math.floor(rand() * cards) + 1;
    const id = await page.locator(`#armytray .acard:nth-child(${k})`).getAttribute('data-a');
    await clickEl(page, `#armytray .acard:nth-child(${k})`);
    tries++;
    if (!(await waitFor(page, i => document.querySelector(`#armytray .acard[data-a="${i}"]`)?.classList.contains('sel'), id))) {
      dead++;
      if (process.env.DEBUG) console.log('    dead card', id, await page.evaluate(([i, k]) => { const b = document.querySelector(`#armytray .acard:nth-child(${k})`); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [r.x, r.y, r.width, innerWidth, t && (t.id || t.className), b.dataset.a, i]; }, [id, k]));
    }
    await page.waitForTimeout(150 + rand() * 250);
  }
  check('tray: army cards select on first click', dead === 0, dead + '/' + tries + ' dead clicks');

  dead = 0;
  for (const t of ['recruit', 'diplo', 'wars', 'gov', 'army', 'recruit', 'army']) {
    await clickEl(page, `.tab[data-tab="${t}"]`);
    if (!(await waitFor(page, t => document.querySelector(`.tab[data-tab="${t}"]`).classList.contains('on'), t))) dead++;
    await page.waitForTimeout(120);
  }
  check('tabs: switch on first click', dead === 0, dead + ' dead clicks' + (dead ? ' · ' + await page.evaluate(() => { const b = document.querySelector('.tab[data-tab="diplo"]').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); const m = [...document.querySelectorAll('.modal:not([hidden]), #offer:not([hidden]), #event:not([hidden])')].map(x => x.id || x.className); return 'under ' + (e && (e.id || e.className)) + ' · ' + document.getElementById('modal').textContent.replace(/\s+/g, ' ').slice(0, 160) + ' · ' + UI._sel().tab; }) : ''));
  await page.keyboard.press('6');
  check('tabs: key 6 opens the Trade tab', await waitFor(page, () => UI._sel().tab === 'trade' && document.getElementById('drawer').classList.contains('open')));
  await page.keyboard.press('Escape');
  check('tabs: Esc closes the side bar', await waitFor(page, () => !document.getElementById('drawer').classList.contains('open')));
  await page.keyboard.press('1');
  check('top bar: every number has an icon, population included', await page.evaluate(() => { const st = [...document.querySelectorAll('#tb-stats .stat')]; return st.length >= 9 && st.every(s => s.querySelector('svg use')) && /Population/.test(document.getElementById('tb-stats').textContent); }));
  await page.hover('#tb-stats .stat[data-st="5"]');
  check('top bar: hovering a number explains it', await waitFor(page, () => { const t = document.getElementById('stat-tip'); return !!t && !t.hidden && /Gold/.test(t.textContent); }));
  await page.mouse.move(700, 450);

  // --- order buttons ---
  if (process.env.DEBUG) await page.evaluate(() => { window.__ev2 = []; ['pointerdown', 'click'].forEach(t => document.addEventListener(t, e => window.__ev2.push(t + ' ' + (e.target.dataset?.o || e.target.id || e.target.className || e.target.tagName) + ' ' + Math.round(e.clientY)), true)); new MutationObserver(() => window.__ev2.push('mut')).observe(document.getElementById('rp-body'), { childList: true }); });
  await clickEl(page, '#armytray .acard:nth-child(1)');
  await page.waitForTimeout(200);
  dead = 0;
  for (let i = 0; i < 6; i++) {
    await clickEl(page, '#ucard [data-o="move"]');
    if (!(await waitFor(page, () => !document.getElementById('hint').hidden))) {
      dead++;
      if (process.env.DEBUG) console.log('    dead move', await page.evaluate(() => { const b = document.querySelector('#ucard [data-o="move"]'); const r = b && b.getBoundingClientRect(); return { btn: !!b, dis: b && b.disabled, y: r && Math.round(r.y), st: document.getElementById('ucard').scrollTop, sel: UI._selected(), ev: (window.__ev2 || []).slice(-6) }; }));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200 + rand() * 200);
  }
  check('orders: Move button arms on first click', dead === 0, dead + '/6 dead clicks');

  // move to a friendly neighbour province via Move + map click
  const mv = await page.evaluate(() => {
    for (const a of Sim.G.armies) {
      if (a.owner !== Sim.G.player || a.battle) continue;
      const p = Sim.MAP.provs[a.prov];
      const n = p.nb.find(q => Sim.G.owner[q] === Sim.G.player && !Sim.G.armies.some(b => b.prov === q));
      if (n !== undefined) return { id: a.id, target: n, x: Sim.MAP.provs[n].x, y: Sim.MAP.provs[n].y, cx: p.x, cy: p.y };
    }
    return null;
  });
  if (!mv) check('orders: found an army to move', false);
  if (mv) {
    await page.evaluate(id => { UI._select([id]); }, mv.id);
    await page.evaluate(m => Render.flyTo(m.cx, m.cy, 12), mv); await page.waitForTimeout(900);
    await clickEl(page, '#ucard [data-o="move"]');
    await clickWorld(page, mv.x, mv.y);
    check('orders: Move + one map click gives a route', await waitFor(page, m => { const a = Sim.army(m.id); return a && (a.path.length > 0 || a.prov === m.target); }, mv, 600));
  }

  // --- map clicks ---
  dead = 0;
  for (let i = 0; i < (QUICK ? 5 : 12); i++) {
    const [W, H] = await page.evaluate(() => Render.size);
    const sx = 470 + rand() * (W - 820), sy = 120 + rand() * (H - 320);
    const want = await page.evaluate(([x, y]) => { const w = Render.screenToWorld(x, y); if (Render.counterAt(x, y) || Render.battleAtScreen(x, y)) return -2; return Render.provinceAt(w[0], w[1]); }, [sx, sy]);
    if (want < 0) continue;
    await page.keyboard.press('Escape');
    await page.mouse.click(sx, sy);
    if (!(await waitFor(page, w => Render.state.selProv === w, want))) dead++;
    await page.waitForTimeout(100);
  }
  check('map: provinces select on first click', dead === 0, dead + ' dead clicks');

  // --- notifications must never swallow a map click ---
  {
    await page.evaluate(() => { for (let i = 0; i < 4; i++) UI.toast('Test notice ' + i, -1, 'info'); });
    const box = await page.locator('#toasts .toast').first().boundingBox();
    let ok = false;
    if (box) {
      const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
      const want = await page.evaluate(([x, y]) => { const w = Render.screenToWorld(x, y); return Render.counterAt(x, y) || Render.battleAtScreen(x, y) || Render.fleetAt(x, y) || Render.wingAt(x, y) ? -2 : Render.provinceAt(w[0], w[1]); }, [sx, sy]);
      if (want >= 0) { await page.keyboard.press('Escape'); await page.mouse.click(sx, sy); ok = await waitFor(page, w => Render.state.selProv === w, want, 2000); }
      else ok = true;
    }
    check('map: a click under a notification reaches the map', ok, ok ? '' : await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return JSON.stringify({ under: e && (e.id || e.className), sel: Render.state.selProv, armies: UI._selected().length, counter: !!Render.counterAt(x, y), battle: !!Render.battleAtScreen(x, y), fleet: !!Render.fleetAt(x, y), wing: !!Render.wingAt(x, y), bsel: UI._sel().battle, modal: !document.getElementById('modal').hidden, paused: Sim.G.paused }); }, [box.x + box.width / 2, box.y + box.height / 2]));
  }

  // --- the side panel folds and opens with one click on its tab ---
  {
    const t = await page.evaluate(() => UI._sel().tab);
    if (await page.evaluate(() => document.getElementById('rp-body').hidden)) await clickEl(page, `.tab[data-tab="${t}"]`);
    await clickEl(page, `.tab[data-tab="${t}"]`);
    const folded = await waitFor(page, () => document.getElementById('rp-body').hidden);
    await clickEl(page, `.tab[data-tab="${t}"]`);
    const open = await waitFor(page, () => !document.getElementById('rp-body').hidden);
    check('panel: tab click folds and reopens the panel', folded && open);
  }

  // --- click an army counter on the map ---
  const cnt = await page.evaluate(() => {
    const a = Sim.G.armies.find(x => x.owner === Sim.G.player && !x.path.length);
    const p = Sim.MAP.provs[a.prov]; Render.flyTo(p.x, p.y, 10); return a.id;
  });
  await page.waitForTimeout(900);
  const hit = await page.evaluate(id => { Render.draw(); const h = Render._hits().find(h => h.group.some(a => a.id === id)); return h ? [h.x + h.w / 2, h.y + h.h / 2] : null; }, cnt);
  if (hit) {
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.mouse.click(hit[0], hit[1]);
    check('map: army counter selects on first click', await waitFor(page, id => UI._selected().includes(id), cnt));
    const card = await page.evaluate(() => { const r = document.getElementById('ucard').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), orders: document.querySelectorAll('#ucard .ord').length }; });
    check('army card: compact, with icon orders', card.w <= 320 && card.h <= 300 && card.orders === 10, JSON.stringify(card));
  } else check('map: army counter visible at close zoom', false);

  // --- declare war through the UI, then attack by right-click ---
  const war = await page.evaluate(() => {
    const G = Sim.G;
    for (const a of G.armies) {
      if (a.owner !== G.player) continue;
      for (const n of Sim.MAP.provs[a.prov].nb) {
        const o = G.owner[n];
        if (o !== G.player && !Sim.allied(o, G.player) && !Sim.atWar(o, G.player)) return { army: a.id, prov: n, tag: o, x: Sim.MAP.provs[n].x, y: Sim.MAP.provs[n].y };
      }
    }
    return null;
  });
  if (war) {
    await page.evaluate(w => { Sim.G.paused = true; Render.flyTo(w.x, w.y, 10); }, war); await page.waitForTimeout(900);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    // a spot inside the province that is land and free of counters
    const spot = await page.evaluate(w => {
      for (let r = 0; r < 12; r++) for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, x = w.x + Math.cos(a) * r * 0.12, y = w.y + Math.sin(a) * r * 0.12;
        const [sx, sy] = Render.worldToScreen(x, y);
        if (Render.provinceAt(x, y) === w.prov && !Render.stackAt(sx, sy) && !Render.battleAtScreen(sx, sy)) return [x, y];
      }
      return [w.x, w.y];
    }, war);
    war.x = spot[0] - 0.2; war.y = spot[1] - 0.5;   // later clicks reuse war.x + 0.2, war.y + 0.5
    await clickWorld(page, war.x + 0.2, war.y + 0.5);
    const selOk = await waitFor(page, p => Render.state.selProv >= 0, war.prov);
    const warBtn = await page.locator('#lp-war').count();
    check('war: Declare war button shown for a neighbour', selOk && warBtn > 0, selOk && warBtn ? '' : await page.evaluate(w => JSON.stringify({ selProv: Render.state.selProv, want: w.prov, owner: Sim.G.owner[w.prov], tag: w.tag, lp: document.getElementById('leftpanel').hidden, btns: [...document.querySelectorAll('#leftpanel button')].map(b => b.id || b.textContent), at: (() => { const [sx, sy] = Render.worldToScreen(w.x + 0.2, w.y + 0.5); const e = document.elementFromPoint(sx, sy); const ww = Render.screenToWorld(sx, sy); return [Math.round(sx), Math.round(sy), e && (e.id || e.className), Render.provinceAt(ww[0], ww[1]), !!Render.stackAt(sx, sy), !!Render.battleAtScreen(sx, sy), Render.cam.z.toFixed(1)]; })() }), war));
    if (warBtn) {
      await clickEl(page, '#lp-war');
      check('war: confirm dialog opens on first click', await waitFor(page, () => !document.getElementById('modal').hidden));
      await clickEl(page, '#modal [data-x="yes"]');
      check('war: war declared', await waitFor(page, t => Sim.atWar(t, Sim.G.player), war.tag));
      await page.evaluate(id => UI._select([id]), war.army);
      const target = await page.evaluate(w => Sim.G.owner[w.prov] === w.tag ? w : null, war);
      if (target) {
        await clickWorld(page, war.x + 0.2, war.y + 0.5, 'right');
        check('war: right-click on enemy land orders an attack', await waitFor(page, w => { const a = Sim.army(w.army); return a && (a.order === 'attack' || a.battle); }, war));
      }
    }
  }

  // --- orders: no snapping back when an order turns an army round, and hunting an enemy army ---
  {
    const r = await page.evaluate(() => {
      const G = Sim.G, P = Sim.MAP.provs;
      const a = G.armies.find(x => x.owner === G.player && !x.battle && !x.path.length && !x.sea && P[x.prov].nb.some(n => G.owner[n] === G.player));
      if (!a) return null;
      const home = a.prov, next = P[a.prov].nb.find(n => G.owner[n] === G.player);
      Sim.orderMove(a, next, 'move');
      let h = 0; while (a.progress <= 0 && h++ < 20) Sim.hourTick();
      const [x0, y0] = [a.prov === home ? a.progress : -1, 0];
      Sim.orderMove(a, home, 'move');
      const back = !!a.lead && a.lead.km === x0;
      Sim.orderMove(a, next, 'move');
      const fwd = !a.lead && a.progress === x0 && a.path[0] === next;
      return { back, fwd, x0 };
    });
    check('orders: turning round mid-march walks back instead of jumping', r && r.back, JSON.stringify(r));
    check('orders: a repeated order keeps the march going from where it is', r && r.fwd, JSON.stringify(r));
    const hunt = await page.evaluate(() => {
      const G = Sim.G;
      const foes = G.armies.filter(x => Sim.atWar(x.owner, G.player) && !x.sea);
      const mine = G.armies.filter(x => x.owner === G.player && !x.sea && !x.battle);
      for (const f of foes) for (const m of mine) if (Sim.findPath(m.owner, m.prov, f.prov, 'move')) {
        if (!Sim.orderChase(m, f)) continue;
        const fid = f.id, mid = m.id;
        // the prey moves away: the hunter follows it
        const P = Sim.MAP.provs, away = P[f.prov].nb.find(n => G.owner[n] === f.owner && n !== m.prov);
        if (away !== undefined) { Sim.orderMove(f, away, 'move'); while (f.path.length && Sim.army(fid)) { Sim.hourTick(); if (m.battle) break; } }
        for (let i = 0; i < 12; i++) Sim.hourTick();
        const mm = Sim.army(mid), ff = Sim.army(fid);
        return { chasing: !!mm && mm.chase === fid, follows: !ff || !mm || mm.target === ff.prov || mm.battle > 0, gone: !ff };
      }
      return null;
    });
    check('orders: attacking an enemy army keeps hunting it as it moves', hunt && (hunt.chasing || hunt.gone) && hunt.follows, JSON.stringify(hunt));
  }

  // --- long run at top speed with frame timing ---
  await page.evaluate(() => { Sim.G.speed = 5; Sim.G.paused = false; Sim.G.settings.autoPause = false; Sim.G.settings.pauseEvent = false; window.__ft = []; let last = performance.now(); (function f(t) { window.__ft.push(t - last); last = t; if (window.__ft.length < 100000) requestAnimationFrame(f); })(performance.now()); });
  const runMs = QUICK ? 6000 : 20000;
  const hStart = await page.evaluate(() => Sim.G.hour);
  // pan and zoom during the run, as a player would
  for (let t = 0; t < runMs; t += 1000) {
    await page.mouse.move(700, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(700 + (rand() - 0.5) * 300, 450 + (rand() - 0.5) * 200, { steps: 6 }); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, (rand() - 0.5) * 600);
    await page.waitForTimeout(1000);
  }
  const perf = await page.evaluate(() => { const f = window.__ft.slice(5).sort((a, b) => a - b); return { n: f.length, p50: f[Math.floor(f.length * 0.5)], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1], over250: f.filter(x => x > 250).length }; });
  const days = (await page.evaluate(() => Sim.G.hour) - hStart) / 24;

  // --- 3D troop figures: visible, animated, and cheap to draw even over a crowded front ---
  {
    const figs = await page.evaluate(async () => {
      // the test's war can cost the player the game by now; these checks are about drawing, so the clock runs on
      if (Sim.G.over) { Sim.G.over = false; Sim.G.paused = false; document.getElementById('modal').hidden = true; }
      const G = Sim.G, cap = Sim.MAP.provs[G.countries[G.player].capital];
      Render.flyTo(cap.x, cap.y, Render.minZoom() * 2.6);
      await new Promise(r => setTimeout(r, 1200));
      for (let w = 0; w < 40 && Figures.pending(); w++) await new Promise(r => setTimeout(r, 100));
      const times = [];
      for (let i = 0; i < 40; i++) { const t = performance.now(); Render.draw(); times.push(performance.now() - t); }
      times.sort((a, b) => a - b);
      return { n: Render._figs(), p50: times[20], p95: times[38], pending: Figures.pending() };
    });
    check('figures: troops show as 3D figures on the map', figs.n > 0, figs.n + ' figures on screen');
    check('figures: every nation\'s troops painted in the background', figs.pending === 0, figs.pending + ' still queued');
    check('figures: a crowded map still draws fast', figs.p50 < 30, `draw p50 ${figs.p50.toFixed(1)} ms, p95 ${figs.p95.toFixed(1)} ms with ${figs.n} figures`);
    const moved = await page.evaluate(async () => {
      const a = Sim.G.armies.find(x => x.path.length && !x.battle && Render.dispPos(x) && performance.now() - Render.dispPos(x).seen < 300);
      if (!a) return null;
      const p0 = { ...Render.dispPos(a) }; await new Promise(r => setTimeout(r, 400)); const p1 = Render.dispPos(a);
      const ok = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0;
      return ok ? true : JSON.stringify({ paused: Sim.G.paused, over: Sim.G.over, peace: !!Sim.G.peace, ev: Events.holding(), order: a.order, owner: a.owner, chase: a.chase, path: a.path.length, rate: a.rate });
    });
    if (moved !== null) check('figures: moving troops glide between provinces', moved === true, moved === true ? '' : moved);

    // smooth marching: follow one army frame by frame; it should advance a little every frame,
    // never jump or step backwards, even as it crosses from one province into the next
    const smooth = await page.evaluate(async () => {
      const G = Sim.G;
      G.speed = 3; G.paused = false;
      const cands = G.armies.filter(x => x.owner === G.player && !x.battle && x.units.length), h0 = G.hour;
      let a = null;
      for (const c of cands) {
        const lm = Sim.MAP.provs[c.prov].lm;
        const targets = Sim.MAP.provs.filter(p => G.owner[p.id] === G.player && p.lm === lm && Sim.distKm(c.prov, p.id) > 250).sort((p, q) => Sim.distKm(c.prov, p.id) - Sim.distKm(c.prov, q.id)).slice(0, 20);
        // the AI may have taken much of the homeland by now (seaborne landings), so a two-step march is enough
        for (const t of targets) if (Sim.orderMove(c, t.id, 'redeploy') && c.path.length >= 2) { a = c; break; }
        if (a) break;
      }
      // the homeland may be cut in two (or lost: the test's war can end the game) by now:
      // follow an army of a nation at peace marching through its own land instead, with the clock running
      if (!a && G.over) { G.over = false; G.paused = false; document.querySelectorAll('#modal').forEach(m => m.hidden = true); }
      if (!a) for (const c of G.armies.filter(x => x.owner !== G.player && !Sim.isAtWar(x.owner) && !x.battle && !x.sea && !x.path.length && x.units.length)) {
        const lm = Sim.MAP.provs[c.prov].lm;
        const targets = Sim.MAP.provs.filter(p => G.owner[p.id] === c.owner && p.lm === lm && Sim.distKm(c.prov, p.id) > 250).sort((p, q) => Sim.distKm(c.prov, p.id) - Sim.distKm(c.prov, q.id)).slice(0, 10);
        for (const t of targets) if (Sim.orderMove(c, t.id, 'redeploy') && c.path.length >= 2) { a = c; break; }
        if (a) break;
      }
      if (!a) return { none: cands.map(c => [Sim.MAP.provs[c.prov].name, c.order, !!c.sea, c.path.length]).slice(0, 8), all: G.armies.filter(x => x.owner === G.player).length, wars: G.wars.map(w => w.name), home: [3, 190, 191, 192, 195, 196, 197, 198].map(i => Sim.MAP.provs[i].name + ':' + G.owner[i]) };
      const P = Sim.MAP.provs[a.prov];
      Render.flyTo(P.x, P.y, Render.minZoom() * 3);
      await new Promise(r => setTimeout(r, 1500));
      const steps = [];
      let last = null, back = 0, crossed = 0, prov = a.prov, lastT = performance.now();
      await new Promise(done => {
        const t0 = performance.now();
        (function f() {
          Render.draw();
          const d = Render.dispPos(a), now = performance.now(), dt = Math.max(1, now - lastT); lastT = now;
          const [sx, sy] = d ? Render.worldToScreen(d.x, d.y) : [-1, -1];
          const onScreen = sx > 0 && sy > 0 && sx < Render.size[0] && sy < Render.size[1];   // only drawn armies are animated
          if (!onScreen) last = null;
          if (d && last && onScreen && a.path.length && !a.battle && !G.paused) {
            const dx = d.x - last.x, dy = d.y - last.y;
            steps.push(Math.hypot(dx, dy) / dt * 16.7);   // distance per 60 Hz frame, so a slow frame is not mistaken for a jump
            if (a.prov === prov) {
              const n = Sim.MAP.provs[a.path[0]], p = Sim.MAP.provs[a.prov];
              if (dx * (n.x - p.x) + dy * (n.y - p.y) < -1e-6) back++;
            }
          }
          if (a.prov !== prov) { crossed++; prov = a.prov; }
          if (d && onScreen) last = { x: d.x, y: d.y };
          // a busy machine draws fewer frames: watch until there are enough of them (at most 10 s)
          if ((performance.now() - t0 < 3500 || steps.length < 30) && performance.now() - t0 < 10000 && a.path.length) requestAnimationFrame(f); else done();
        })();
      });
      const s = steps.filter(x => x > 0).sort((x, y) => x - y);
      return { frames: steps.length, still: steps.filter(x => x === 0).length, back, med: s[Math.floor(s.length / 2)] || 0, max: s[s.length - 1] || 0, crossed, hours: G.hour - h0, peace: !!G.peace, own: a.owner, path: a.path.length, arrived: !a.path.length };
    });
    check('movement: an army can be sent on a long march', !!smooth && !smooth.none, smooth && smooth.none ? JSON.stringify(smooth) : '');
    if (smooth && !smooth.none) {
      check('movement: marching troops move every frame', (smooth.frames > 20 || (smooth.arrived && smooth.frames >= 10)) && smooth.still / smooth.frames < 0.15, `${smooth.frames - smooth.still}/${smooth.frames} frames moved` + (smooth.frames - smooth.still < smooth.frames * 0.85 ? ' · ' + JSON.stringify({ hours: smooth.hours, peace: smooth.peace, own: smooth.own, path: smooth.path }) : ''));
      check('movement: no jumps or stutters along the route', smooth.max < smooth.med * 6 + 0.02 && smooth.back === 0, `median step ${smooth.med.toFixed(3)}, largest ${smooth.max.toFixed(3)}, ${smooth.back} backward steps, crossed ${smooth.crossed} provinces`);
    }
  }
  check('run: simulation keeps pace at top speed', days > runMs / 1000 * 0.5, days.toFixed(1) + ' days in ' + runMs / 1000 + ' s');
  check('run: frame pacing', perf.over250 <= 3, `p50 ${perf.p50?.toFixed(0)} ms, p95 ${perf.p95?.toFixed(0)} ms, max ${perf.max?.toFixed(0)} ms, ${perf.over250} frames over 250 ms (headless software rendering is several times slower than a real GPU)`);

  // --- invariants ---
  const inv = await page.evaluate(() => {
    const G = Sim.G, bad = [];
    const tags = new Set(Object.keys(G.countries));
    G.owner.forEach((o, i) => { if (!tags.has(o)) bad.push('province ' + i + ' has unknown owner ' + o); });
    for (const a of G.armies) {
      if (!Sim.MAP.provs[a.prov]) bad.push('army ' + a.id + ' in invalid province');
      if (!a.units.length) bad.push('army ' + a.id + ' has no units');
      for (const u of a.units) if (!(u.str > 0 && u.str <= 1.0001) || !(u.org >= 0 && u.org <= 1.0001) || Number.isNaN(u.str)) bad.push('army ' + a.id + ' unit out of range');
      if (!G.countries[a.owner].alive) bad.push('army ' + a.id + ' belongs to a dead country');
      const o = G.owner[a.prov];
      if (o !== a.owner && !Sim.allied(o, a.owner) && !Sim.atWar(o, a.owner)) bad.push('army ' + a.id + ' of ' + a.owner + ' stands in neutral ' + o);
      if (a.battle && !G.battles.some(b => b.id === a.battle)) bad.push('army ' + a.id + ' points at a missing battle');
    }
    for (const b of G.battles) if (!b.attackers.length) bad.push('battle ' + b.id + ' has no attackers');
    for (const c of Object.values(G.countries)) for (const k of ['pp', 'stab', 'ws', 'manpower']) if (!Number.isFinite(c[k])) bad.push(c.tag + '.' + k + ' is ' + c[k]);
    for (const w of G.wars) if (!w.attackers.length || !w.defenders.length) bad.push('war ' + w.name + ' has an empty side');
    bad.push(...ecoInvariants());
    return bad;
  });
  check('state: invariants hold', inv.length === 0, inv.slice(0, 5).join('; '));
  check('errors: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.mkdirSync(path.resolve(__dirname, 'shots'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, 'shots/desktop.png') });
  await page.close();
}

// ---------- economy, trade and research: through the new tabs, then a year of AI trading ----------
async function economyRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await autoAnswer(page);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await toPicker(page);
  await clickEl(page, '#start .ncard[data-tag="GER"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  const G = (fn, arg) => page.evaluate(fn, arg);
  await G(() => { const c = Sim.G.countries.GER; c.pp = 900; c.eco.gold = 5000; Sim.G.settings.autoPause = false; });
  // one game day so every nation has figures to show
  await G(() => { for (let h = 0; h < 24; h++) Sim.hourTick(); });

  // Economy tab
  await clickEl(page, '.tab[data-tab="trade"]');
  check('trade: the Goods part lists every good', await waitFor(page, () => document.querySelectorAll('#rp-body .good[data-good]').length === 5 && /Gold/.test(document.getElementById('tb-stats').textContent), null, 1500));
  check('trade: Goods shows the world market price of every good', await G(() => document.querySelectorAll('#rp-body .wmarket .wm').length === 5 && /World market/.test(document.getElementById('rp-body').textContent)));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/world-market.png') });
  // a nation running out pays above the world price; one with full stores only buys below it and refuses a sale at it
  const bids = await G(() => {
    const t = Object.values(Sim.G.countries).filter(c => c.alive && c.tag !== 'GER' && c.eco && c.eco.need && c.eco.need.fuel > 1)[0], e = t.eco, keep = { s: e.stock.fuel, p: e.prod.fuel, x: e.exp.fuel, i: e.imp.fuel };
    e.prod.fuel = 0; e.imp.fuel = 0; e.exp.fuel = 0; e.stock.fuel = e.need.fuel * 10;
    const hi = Economy.priceMul(t.tag, 'fuel', true);
    e.prod.fuel = e.need.fuel * 1.2; e.stock.fuel = e.need.fuel * 88;
    const lo = Economy.priceMul(t.tag, 'fuel', true);
    const amt = Math.max(1, Math.round(e.need.fuel * 0.2));
    const ans = Economy.answerDeal('GER', t.tag, { good: 'fuel', amount: amt, price: Economy.fairPrice('fuel', amt), sell: true });
    e.stock.fuel = keep.s; e.prod.fuel = keep.p; e.exp.fuel = keep.x; e.imp.fuel = keep.i;
    return { tag: t.tag, hi: +hi.toFixed(2), lo: +lo.toFixed(2), yes: ans.yes, why: ans.why };
  });
  check('trade: need sets the price a nation pays', bids.hi > 1.15 && bids.lo < 0.95 && !bids.yes, JSON.stringify(bids));
  await clickEl(page, '.tab[data-tab="econ"]');
  check('economy: tab shows money and construction', await waitFor(page, () => /Health/.test(document.getElementById('rp-body').textContent) && !!document.querySelector('#rp-body [data-build]'), null, 1500));
  const q0 = await G(() => Sim.G.countries.GER.eco.queue.length), g0 = await G(() => Sim.G.countries.GER.eco.gold);
  await clickEl(page, '[data-build="farm"]:not([disabled])');
  check('economy: Build queues an industry on one click', await waitFor(page, q => Sim.G.countries.GER.eco.queue.length === q + 1, q0) && await G(g => Sim.G.countries.GER.eco.gold < g, g0));

  // build in a chosen province from the province panel: click one of your provinces on the map
  // (an army counter drawn over the spot takes the click instead, so try a few provinces)
  const cands = await G(() => { const g = Sim.G; return Sim.MAP.provs.filter(p => g.owner[p.id] === 'GER' && p.core === 'GER' && Economy.canBuild('GER', 'mine', p.id).ok && !p.capital).map(p => [p.id, p.x, p.y]).slice(0, 6); });
  let picked = null;
  for (const c of cands) {
    await G(p => Render.flyTo(p[1], p[2], 10), c);
    await page.waitForTimeout(900);
    const [sx, sy] = await page.evaluate(([x, y]) => Render.worldToScreen(x, y), [c[1], c[2]]);
    await page.mouse.click(sx, sy);
    if (await waitFor(page, id => Render.state.selProv === id && !!document.querySelector('#leftpanel [data-pbuild]:not([disabled])'), c[0], 1500)) { picked = c[0]; break; }
  }
  const q1 = await G(() => Sim.G.countries.GER.eco.queue.length);
  const clicked = picked !== null && await clickEl(page, '#leftpanel [data-pbuild]:not([disabled])');
  check('economy: province panel builds in that province', clicked && await waitFor(page, ([q, id]) => { const Q = Sim.G.countries.GER.eco.queue; return Q.length === q + 1 && Q[Q.length - 1].prov === id; }, [q1, picked]), picked === null ? 'no province of ' + cands.length + ' could be picked' : '');

  // construction finishes and adds output
  const done = await G(() => { const c = Sim.G.countries.GER; const before = Sim.G.ind.reduce((s, I, i) => s + (I && Sim.G.owner[i] === 'GER' ? (I.farm || 0) : 0), 0); for (let d = 0; d < 120 && c.eco.queue.some(q => q.kind === 'farm'); d++) for (let h = 0; h < 24; h++) Sim.hourTick(); return Sim.G.ind.reduce((s, I, i) => s + (I && Sim.G.owner[i] === 'GER' ? (I.farm || 0) : 0), 0) - before; });
  check('economy: construction completes', done >= 1, done + ' farm(s) built');

  // buildings: icons in the build list, a Build in picker, and finished works drawn on the map
  await G(() => UI.openTab('econ'));
  check('economy: every build button has a painted icon', await waitFor(page, () => { const l = [...document.querySelectorAll('#rp-body [data-build] canvas[data-bicon]')]; return l.length >= 6 && l.length === document.querySelectorAll('#rp-body [data-build]').length && l.every(c => c.dataset.done); }, null, 1500));
  const bpid = await G(() => { const g = Sim.G; const p = Sim.MAP.provs.find(p => g.owner[p.id] === 'GER' && !p.capital && Economy.canBuild('GER', 'fort', p.id).ok); return p ? p.id : -1; });
  await G(id => { const s = document.querySelector('#build-prov'); s.value = id; s.dispatchEvent(new Event('change')); }, bpid);
  await page.waitForTimeout(300);
  const q2 = await G(() => Sim.G.countries.GER.eco.queue.length);
  await clickEl(page, '#rp-body [data-build="fort"]:not([disabled])');
  check('economy: Build in picker builds in the chosen province', bpid >= 0 && await waitFor(page, ([q, id]) => { const Q = Sim.G.countries.GER.eco.queue; return Q.length === q + 1 && Q[Q.length - 1].prov === id; }, [q2, bpid]));
  await G(p => { const pr = Sim.MAP.provs[p]; Object.assign(Render.cam, { x: pr.x, y: pr.y, z: 50, tx: pr.x, ty: pr.y, tz: 50, anim: false }); }, bpid);
  check('map: buildings are drawn in their provinces', await waitFor(page, () => Render._bld() > 0, null, 1500));
  await G(() => { const s = document.querySelector('#build-prov'); s.value = -1; s.dispatchEvent(new Event('change')); });
  // troops gather in the province the player picks
  await clickEl(page, '.tab[data-tab="recruit"]');
  await waitFor(page, () => !!document.querySelector('#rec-prov'), null, 1500);
  const spid = await G(() => { const g = Sim.G, c = g.countries.GER; c.manpower += 1e6; c.equipment += 1e5; const p = Sim.MAP.provs.find(p => g.owner[p.id] === 'GER' && p.id !== c.capital); const s = document.querySelector('#rec-prov'); s.value = p.id; s.dispatchEvent(new Event('change')); return p.id; });
  await page.waitForTimeout(300);
  const r0 = await G(() => Sim.G.countries.GER.queue.length);
  await clickEl(page, '#rp-body [data-rec]:not([disabled])');
  const spawned = await waitFor(page, ([q, id]) => { const Q = Sim.G.countries.GER.queue; return Q.length === q + 1 && Q[Q.length - 1].prov === id; }, [r0, spid]);
  const readyAt = spawned && await G(id => { const c = Sim.G.countries.GER; c.queue.forEach(q => { if (q.prov === id) q.hours = 1; }); for (let h = 0; h < 3 && c.queue.some(q => q.prov === id); h++) Sim.hourTick(); return Sim.G.owner[id] !== 'GER' || Sim.G.armies.some(a => a.owner === 'GER' && a.prov === id && a.reserve); }, spid);
  check('train: new troops gather in the chosen province', spawned && readyAt);

  // roads and railways between buildings
  const net = await G(() => { const g = Sim.G, R = g.routes.filter(r => r.tag === 'GER' && !r.trade); return { n: R.length, inside: R.every(r => r.path.every(p => g.owner[p] === 'GER')), links: Math.max(0, ...Object.values(R.reduce((m, r) => { m[r.a] = (m[r.a] || 0) + 1; m[r.b] = (m[r.b] || 0) + 1; return m; }, {}))) }; });
  check('routes: a nation starts with roads between its buildings', net.n > 0 && net.inside && net.links <= 3, JSON.stringify(net));
  const lay = await G(() => {
    const g = Sim.G, c = g.countries.GER;
    const empty = Sim.MAP.provs.filter(p => g.owner[p.id] === 'GER' && !(g.ind[p.id] && Object.values(g.ind[p.id]).some(x => x)) && !(g.inf && g.inf[p.id] && Object.values(g.inf[p.id]).some(x => x)));
    c.eco.gold += 5000;
    for (const p of empty) {
      if (!Economy.build('GER', 'fort', p.id).ok) continue;
      c.eco.queue[c.eco.queue.length - 1].left = 0.01;
      for (let h = 0; h < 48; h++) Sim.hourTick();
      const R = g.routes.filter(r => r.a === p.id || r.b === p.id);
      if (!R.length) continue;
      const r = R[0], was = r.state;
      for (let d = 0; d < 50 && r.state !== 'open'; d++) for (let h = 0; h < 24; h++) Sim.hourTick();
      return { pid: p.id, was, now: r.state, id: r.id, out: Routes.outMul(p.id), speed: Routes.speedMul('GER', r.path[0], r.path[1]), rail: r.rail };
    }
    return null;
  });
  check('routes: a new building lays a route that opens after its build time', !!lay && lay.was === 'building' && lay.now === 'open', JSON.stringify(lay));
  check('routes: working routes raise output and army speed', !!lay && lay.out > 1 && lay.speed >= 1.3, lay ? 'output ×' + lay.out + ', speed ×' + lay.speed : '');
  await G(p => { const pr = Sim.MAP.provs[p]; Object.assign(Render.cam, { x: pr.x, y: pr.y, z: 40, tx: pr.x, ty: pr.y, tz: 40, anim: false }); }, lay ? lay.pid : 0);
  check('map: roads and railways are drawn', await waitFor(page, () => Render._routes() > 0, null, 2000));
  await clickEl(page, '.tab[data-tab="econ"]');

  // buy fuel from a nation with a surplus, through the Nations tab trade form (after freeing a trade slot)
  await G(() => { for (const d of Economy.dealsOf('GER')) Economy.cancel(d.id, null, 'gone'); });
  const seller = await G(() => { const t = Object.values(Sim.G.countries).filter(c => c.alive && c.tag !== 'GER' && !c.eco.none && !Sim.atWar(c.tag, 'GER') && Economy.balance(c.tag, 'fuel') > 3 && Economy.canDeal('GER', c.tag, null).ok).sort((a, b) => Economy.balance(b.tag, 'fuel') - Economy.balance(a.tag, 'fuel'))[0]; if (!t) return null; Sim.G.dip.rel[Sim.pairKey('GER', t.tag)] = 60; return t.tag; });
  if (seller) {
    await clickEl(page, '.tab[data-tab="trade"]');
    await clickEl(page, '[data-tv="partners"]');
    await clickEl(page, '[data-tb="1"]');
    await clickEl(page, '[data-tg="fuel"]');
    check('trade: Partners lists the nations with fuel to spare', await waitFor(page, t => !!document.querySelector(`[data-partner="${t}"]`), seller, 1500));
    await clickEl(page, `[data-offer="${seller}"]`);
    await waitFor(page, () => !!document.querySelector('[data-send]'), null, 1500);
    for (let i = 0; i < 3; i++) await clickEl(page, '[data-adj="0.05"]');
    const form = await G(() => document.querySelector('[data-send]')?.disabled === false);
    await clickEl(page, '[data-send]:not([disabled])');
    const deal = await waitFor(page, t => Sim.G.dip.trade.some(d => d.from === t && d.to === 'GER' && d.good === 'fuel'), seller, 1500);
    check('trade: a deal is signed from the Trade tab', deal, deal ? '' : (form ? await G(() => Sim.G.log[0]?.text) : 'offer button disabled: ' + await G(() => document.querySelector('.dealform .summary small')?.textContent)));
    if (deal) {
      await G(() => { for (let h = 0; h < 24; h++) Sim.hourTick(); });
      const got = await G(t => { const d = Sim.G.dip.trade.find(d => d.from === t && d.to === 'GER' && d.good === 'fuel'); return { delivered: d && d.delivered, imp: Sim.G.countries.GER.eco.imp.fuel }; }, seller);
      check('trade: the deal delivers goods', got.delivered > 0 && got.imp >= got.delivered - 0.01, JSON.stringify(got));
      await clickEl(page, '[data-tv="deals"]');
      await waitFor(page, () => !!document.querySelector('[data-canceldeal]'));
      await clickEl(page, '[data-canceldeal]');
      check('trade: Cancel ends the deal on one click', await waitFor(page, t => !Sim.G.dip.trade.some(d => d.from === t && d.to === 'GER' && d.good === 'fuel'), seller));
    }
    // embargo from the nation page
    await clickEl(page, '.tab[data-tab="diplo"]');
    if (!(await page.locator('[data-dipback]').count())) await clickEl(page, `[data-dip="${seller}"]`);
    await clickEl(page, '[data-act="embargo"]:not([disabled])');
    check('trade: embargo blocks new deals', await waitFor(page, t => Sim.G.dip.embargo.some(x => x.by === 'GER' && x.of === t) && !Economy.canDeal('GER', t, null).ok, seller));
  }

  // a cut deal: the buyer's stockpile drains and it suffers a supply shock
  const cut = await G(() => {
    const g = Sim.G, cs = Object.values(g.countries).filter(c => c.alive && !c.eco.none && c.tag !== 'GER');
    const buyer = cs.filter(c => Economy.balance(c.tag, 'food') < 0 || c.eco.need.food > 2).sort((a, b) => a.eco.prod.food / a.eco.need.food - b.eco.prod.food / b.eco.need.food)[0];
    const seller = cs.filter(c => c !== buyer && Economy.balance(c.tag, 'food') > buyer.eco.need.food * 0.5 && !Sim.atWar(c.tag, buyer.tag)).sort((a, b) => Economy.balance(b.tag, 'food') - Economy.balance(a.tag, 'food'))[0];
    if (!buyer || !seller) return null;
    for (const d of Economy.dealsOf(buyer.tag).filter(d => d.to === buyer.tag && d.good === 'food')) Economy.cancel(d.id, null, 'gone');
    const amt = +(buyer.eco.need.food * 0.8).toFixed(1);
    const d = Economy.sign(seller.tag, buyer.tag, { good: 'food', amount: amt, price: Economy.fairPrice('food', amt), sell: true });
    for (let h = 0; h < 48; h++) Sim.hourTick();
    const dep = Economy.dependence(buyer.tag, 'food', seller.tag);
    const rel0 = Diplo.rel(seller.tag, buyer.tag), stock0 = buyer.eco.stock.food, bal0 = Economy.balance(buyer.tag, 'food');
    seller.pp = 50;
    const r = Diplo.act('canceltrade', seller.tag, buyer.tag, { id: d.id });
    // the next day: the supply is gone and the stockpile starts to drain (the AI will look for a new seller later)
    for (let h = 0; h < 24; h++) Sim.hourTick();
    const bal1 = Economy.balance(buyer.tag, 'food');
    return { buyer: buyer.tag, seller: seller.tag, dep: +dep.toFixed(2), ok: r.ok, shock: buyer.eco.shocks.some(s => s.good === 'food' && s.from === seller.tag), rel: Diplo.rel(seller.tag, buyer.tag) < rel0,
      drained: buyer.eco.stock.food < stock0 && bal1 < bal0 - amt * 0.7, stock0: Math.round(stock0), stock: Math.round(buyer.eco.stock.food), bal0: +bal0.toFixed(1), bal1: +bal1.toFixed(1) };
  });
  if (!seller) check('trade: a nation with fuel to spare exists', false);
  check('trade: cutting a deal drains the buyer and costs relations', cut && cut.ok && cut.shock && cut.rel && cut.drained && cut.dep > 0.3, JSON.stringify(cut));

  // research: pick a tech, open the tree, check the tier-3 choice locks the other path
  await clickEl(page, '.tab[data-tab="tech"]');
  await waitFor(page, () => !!document.querySelector('#rp-body .tcard.open'), null, 1500);
  const first = await G(() => document.querySelector('#rp-body .tcard.open')?.dataset.tech);
  await clickEl(page, '#rp-body .tcard.open');
  check('research: a tech starts on one click', await waitFor(page, id => Sim.G.countries.GER.rs.slots.some(s => s && s.id === id), first));
  await clickEl(page, '[data-opentree]');
  check('research: the tech tree opens with five columns', await waitFor(page, () => !document.getElementById('techtree').hidden && document.querySelectorAll('#techtree .tcol').length === 5));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/techtree.png') });
  const choice = await G(() => {
    const me = 'GER', c = Sim.G.countries[me], b = Tech.branchesFor(me)[1];
    c.rs.slots = [null, null];
    c.techs.push(b.tiers[0].id, b.tiers[1].id); Tech.invalidate(me);
    const [a, z] = b.tiers[2];
    Tech.start(me, a.id); c.rs.slots[0].pts = Tech.info(a.id).cost; Tech.daily();
    return { took: c.techs.includes(a.id), other: Tech.state(me, z.id), next: Tech.state(me, b.tiers[3].id), start: Tech.start(me, z.id).ok };
  });
  check('research: the tier-3 choice closes the other path', choice.took && choice.other === 'closed' && choice.next === 'open' && !choice.start, JSON.stringify(choice));
  await clickEl(page, '#tt-close');
  check('research: the tree closes', await waitFor(page, () => document.getElementById('techtree').hidden));

  // trade map mode
  await clickEl(page, '#mc-trade');
  check('trade: the trade map mode shows', await waitFor(page, () => Render.state.mode === 'trade', null, 2500), await G(() => { const b = document.getElementById('mc-trade').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return Render.state.mode + ' · button at ' + Math.round(b.x) + ',' + Math.round(b.y) + ' under ' + (e && (e.id || e.className || e.tagName)); }));
  await G(() => Render.fitWorld());
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve(__dirname, 'shots/trade-map.png') });
  await clickEl(page, '#mc-pol');

  // a year of AI economy: nations trade, build and research on their own, and the rules hold
  const year = await G(() => {
    const g = Sim.G, t0 = performance.now();
    const built0 = g.ind.reduce((s, I) => s + (I ? Object.values(I).reduce((a, b) => a + b, 0) : 0), 0);
    for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) Sim.hourTick();
    const cs = Object.values(g.countries).filter(c => c.alive && !c.eco.none && c.tag !== 'GER');
    return { ms: Math.round((performance.now() - t0) / 365), deals: g.dip.trade.filter(d => d.from !== 'GER' && d.to !== 'GER').length,
      built: g.ind.reduce((s, I) => s + (I ? Object.values(I).reduce((a, b) => a + b, 0) : 0), 0) - built0,
      techs: +(cs.reduce((s, c) => s + c.techs.length, 0) / cs.length).toFixed(1), bad: ecoInvariants() };
  });
  check('economy: the AI trades, builds and researches for a year', year.deals >= 15 && year.built >= 20 && year.techs >= 2, `${year.deals} AI deals, ${year.built} industries built, ${year.techs} techs per nation, ${year.ms} ms per game day`);
  check('economy: rules hold after a year', year.bad.length === 0, year.bad.slice(0, 4).join('; '));
  await clickEl(page, '.tab[data-tab="econ"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve(__dirname, 'shots/economy.png') });
  check('economy: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------- navy, air force, supply and invasions: through the Navy tab and the map ----------
async function navyRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await autoAnswer(page);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await toPicker(page);
  await clickEl(page, '#start .ncard[data-tag="ENG"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  const G = (fn, arg) => page.evaluate(fn, arg);
  await G(() => { const c = Sim.G.countries.ENG; c.eco.gold = 8000; c.equipment = 20000; Sim.G.settings.autoPause = false; for (let h = 0; h < 24; h++) Sim.hourTick(); });
  // a point in open water of a zone, clear of fleet counters, on screen
  const seaPoint = async name => G(n => {
    const z = Seas.all().find(x => x.name === n);
    Render.flyTo(z.x, z.y, 6); Render.cam.x = z.x; Render.cam.y = z.y; Render.cam.z = 6; Render.cam.anim = false;
    for (const [dx, dy] of [[0, 60], [60, 0], [-60, 0], [0, -60], [80, 50], [-80, 50], [40, 90], [-40, -90]]) {
      const [sx, sy] = Render.worldToScreen(z.x, z.y); const px = sx + dx, py = sy + dy;
      const [wx, wy] = Render.screenToWorld(px, py);
      if (Seas.zoneAt(wx, wy) === z.id && Render.provinceAt(wx, wy) < 0 && !Render.fleetAt(px, py) && px > 470 && px < innerWidth - 340) return [px, py, z.id];
    }
    return null;
  }, name);

  // Navy tab: fleets, transports, shipyards and air wings
  await clickEl(page, '.tab[data-tab="navy"]');
  check('navy: tab lists fleets and air wings', await waitFor(page, () => document.querySelectorAll('#rp-body [data-fleet]').length >= 2 && document.querySelectorAll('#rp-body [data-wing]').length >= 2, null, 1500));
  await clickEl(page, '#rp-body [data-fleet]');
  const fid = await G(() => UI._sel().fleet);
  check('navy: clicking a fleet opens its card', fid > 0 && await waitFor(page, () => !!document.querySelector('#rp-body [data-fm="patrol"]'), null, 1500));
  await clickEl(page, '#rp-body [data-fm="patrol"]');
  check('navy: a mission button sets the mission', await waitFor(page, id => Navy.fleet(id).mission === 'patrol', fid));
  // Move, then click a sea zone on the map
  const tgt = await seaPoint('Bay of Biscay');
  await clickEl(page, '#rp-body [data-fo="move"]');
  if (tgt) { await page.waitForTimeout(150); await page.mouse.click(tgt[0], tgt[1]); }
  check('navy: Move then a sea click sets course', !!tgt && await waitFor(page, ([id, z]) => { const f = Navy.fleet(id); return f.area === z && (f.path.length > 0 || f.zone === z); }, [fid, tgt && tgt[2]], 1500), tgt ? '' : 'no clear water found');
  // right-click another zone
  const tgt2 = await seaPoint('Western Approaches');
  if (tgt2) await page.mouse.click(tgt2[0], tgt2[1], { button: 'right' });
  check('navy: right-click on the sea redirects the fleet', !!tgt2 && await waitFor(page, ([id, z]) => Navy.fleet(id).area === z, [fid, tgt2 && tgt2[2]], 1500));
  // a left click on open water shows the sea zone
  const tgt3 = await seaPoint('Norwegian Sea');
  if (tgt3) await page.mouse.click(tgt3[0], tgt3[1]);
  check('navy: clicking the sea opens the sea zone panel', !!tgt3 && await waitFor(page, z => UI._sel().zone === z && /Sea zone/.test(document.getElementById('leftpanel').textContent), tgt3 && tgt3[2], 1500));
  // split and merge
  await G(id => UI._selectFleet(id), fid);
  const n0 = await G(() => Sim.G.fleets.filter(f => f.owner === 'ENG').length);
  await clickEl(page, '#rp-body [data-fo="split"]');
  check('navy: Split makes a second fleet', await waitFor(page, n => Sim.G.fleets.filter(f => f.owner === 'ENG').length === n + 1, n0));
  await clickEl(page, '#rp-body [data-fo="merge"]');
  check('navy: Merge joins them again', await waitFor(page, n => Sim.G.fleets.filter(f => f.owner === 'ENG').length <= n, n0));
  // shipyard
  await clickEl(page, '#rp-body [data-fo="back"]');
  const sq = await G(() => Navy.nav(Sim.G.countries.ENG).queue.length);
  await clickEl(page, '#rp-body [data-ship="destroyer"]:not([disabled])');
  check('navy: a ship is laid down on one click', await waitFor(page, q => Navy.nav(Sim.G.countries.ENG).queue.length === q + 1, sq));
  await clickEl(page, '#rp-body [data-unship]');
  check('navy: cancelling a ship works', await waitFor(page, q => Navy.nav(Sim.G.countries.ENG).queue.length === q, sq));
  const aq = await G(() => (Sim.G.countries.ENG.airQueue || []).length);
  await clickEl(page, '#rp-body [data-plane="fighter"]:not([disabled])');
  check('air: aircraft are ordered on one click', await waitFor(page, q => (Sim.G.countries.ENG.airQueue || []).length === q + 1, aq));
  // air wing: superiority over a province picked on the map
  await clickEl(page, '#rp-body [data-wing]');
  const wid = await G(() => UI._sel().wing);
  await clickEl(page, '#rp-body [data-wm="superiority"]');
  const lille = await G(() => { const p = Sim.MAP.provs.find(q => q.name === 'Lille') || Sim.MAP.provs.find(q => Sim.G.owner[q.id] === 'FRA' && q.city); Render.cam.x = p.x; Render.cam.y = p.y; Render.cam.z = 9; Render.cam.anim = false; return [p.id, p.x, p.y]; });
  await page.waitForTimeout(200);
  await clickWorld(page, lille[1] + 0.3, lille[2] + 0.3);
  check('air: a mission is flown over the province clicked', await waitFor(page, ([id, p]) => { const w = Air.wing(id); return w && w.mission === 'superiority' && Math.abs(Sim.MAP.provs[w.target].x - Sim.MAP.provs[p].x) < 3; }, [wid, lille[0]], 1500), await G(id => JSON.stringify(Air.wing(id)), wid));
  await clickEl(page, '#rp-body [data-wo="idle"]');
  check('air: Stand down brings the wing home', await waitFor(page, id => Air.wing(id).mission === 'idle', wid));

  // seas map mode
  await clickEl(page, '#mc-sea');
  check('navy: the sea map mode shows', await waitFor(page, () => Render.state.mode === 'sea', null, 1500));
  await G(() => Render.fitWorld()); await page.waitForTimeout(700);
  await page.screenshot({ path: path.resolve(__dirname, 'shots/sea-map.png') });
  await clickEl(page, '#mc-pol');

  // military works from the province panel: a fort on a chosen province, then it completes
  const cands = await G(() => Sim.MAP.provs.filter(p => Sim.G.owner[p.id] === 'ENG' && p.home && !p.capital && Economy.canBuild('ENG', 'fort', p.id).ok).map(p => [p.id, p.x, p.y]).slice(0, 6));
  let fortProv = null;
  for (const c of cands) {
    await G(p => { Render.cam.x = p[1]; Render.cam.y = p[2]; Render.cam.z = 10; Render.cam.anim = false; }, c);
    await page.waitForTimeout(250);
    await clickWorld(page, c[1], c[2]);
    if (await waitFor(page, id => Render.state.selProv === id && !!document.querySelector('#leftpanel [data-pbuild="fort"]:not([disabled])'), c[0], 1500)) { fortProv = c[0]; break; }
  }
  const eq0 = await G(() => Sim.G.countries.ENG.eco.queue.length);
  const fclick = fortProv !== null && await clickEl(page, '#leftpanel [data-pbuild="fort"]:not([disabled])');
  check('works: the province panel builds a fort there', fclick && await waitFor(page, ([q, id]) => { const Q = Sim.G.countries.ENG.eco.queue; return Q.length === q + 1 && Q[Q.length - 1].prov === id && Q[Q.length - 1].kind === 'fort'; }, [eq0, fortProv]));
  const fortDone = fortProv !== null && await G(id => { for (let d = 0; d < 200 && Sim.G.countries.ENG.eco.queue.some(q => q.kind === 'fort'); d++) for (let h = 0; h < 24; h++) Sim.hourTick(); return Economy.infra(id, 'fort'); }, fortProv);
  check('works: the fort completes and strengthens defenders', fortDone >= 1 && await G(id => Sim.fortBonus('ENG', id) > 0.1, fortProv), 'fort level ' + fortDone);

  // war with Germany: invasion by sea through the army panel and the map
  await G(() => { Sim.declareWar('ENG', 'GER', true); Render.state.dirtyOwners = true; });
  const inv = await G(() => {
    const g = Sim.G, M = Sim.MAP;
    const a = g.armies.filter(x => x.owner === 'ENG' && Seas.isCoastal(x.prov) && g.owner[x.prov] === 'ENG' && !x.battle).sort((x, y) => y.units.length - x.units.length)[0];
    if (!a) return null;
    while (a.units.length > 4) a.units.pop();
    const t = M.provs.filter(p => g.owner[p.id] === 'GER' && Seas.isCoastal(p.id) && !Sim.hostilesAt('ENG', p.id).length).map(p => ({ p, plan: Navy.planInvasion(a, p.id) })).filter(o => o.plan.ok).sort((x, y) => x.plan.km - y.plan.km)[0];
    if (!t) return { army: a.id, none: true };
    UI._select([a.id]);
    return { army: a.id, target: t.p.id, x: t.p.x, y: t.p.y, name: t.p.name };
  });
  let landed = null;
  if (inv && !inv.none) {
    await waitFor(page, () => !!document.querySelector('#ucard [data-o="invade"]:not([disabled])'), null, 1500);
    await clickEl(page, '#ucard [data-o="invade"]');
    await G(t => { Render.cam.x = t.x; Render.cam.y = t.y; Render.cam.z = 10; Render.cam.anim = false; }, inv);
    await page.waitForTimeout(250);
    await clickWorld(page, inv.x + 0.25, inv.y + 0.25);
    check('invasion: Invade by sea then a coastal province starts planning', await waitFor(page, ([id, t]) => { const a = Sim.army(id); return a && a.sea && a.sea.phase === 'prep' && Sim.MAP.provs[a.sea.target].lm === Sim.MAP.provs[t].lm; }, [inv.army, inv.target], 1500), inv.name);
    check('invasion: the army panel shows the progress bar', await waitFor(page, () => /Planning the invasion/.test(document.getElementById('ucard').textContent) && !!document.querySelector('#ucard .bar.prog'), null, 1500));
    landed = await G(id => {
      const a = Sim.army(id); if (!a || !a.sea) return { none: true };
      const tgt = a.sea.target, seen = new Set();
      for (let h = 0; h < 24 * 40 && Sim.army(id) && (Sim.army(id).sea || Sim.army(id).battle); h++) { Sim.hourTick(); if (Sim.army(id) && Sim.army(id).sea) seen.add(Sim.army(id).sea.phase); }
      const b = Sim.army(id);
      return { phases: [...seen], at: b ? Sim.MAP.provs[b.prov].name : 'destroyed', ashore: !!b && b.prov === tgt, owner: Sim.G.owner[tgt], alive: !!b, tgt: Sim.MAP.provs[tgt].name };
    }, inv.army);
    check('invasion: troops plan, sail and land', !landed.none && landed.phases.includes('prep') && landed.phases.includes('sail') && (landed.ashore || landed.owner === 'ENG' || !landed.alive), JSON.stringify(landed));
  } else check('invasion: a target could be planned', false, JSON.stringify(inv));

  // naval war: the Home Fleet hunts the German fleet; German submarines raid British shipping
  const sea = await G(() => {
    const g = Sim.G;
    const gerShips = () => g.fleets.filter(f => f.owner === 'GER').reduce((s, f) => s + f.ships.length, 0);
    const before = gerShips();
    const home = g.fleets.filter(f => f.owner === 'ENG').sort((a, b) => Navy.power(b) - Navy.power(a))[0];
    const gz = g.fleets.find(f => f.owner === 'GER' && !f.ships.every(s => s.type === 'submarine'));
    if (gz) Navy.setMission(home, 'hunt', gz.zone);
    let battles = 0;
    for (let h = 0; h < 24 * 30; h++) { Sim.hourTick(); battles = Math.max(battles, g.navBattles.length); }
    return { before, after: gerShips(), battles, sunk: Navy.nav(g.countries.ENG).sunk };
  });
  check('navy: fleets find each other and fight', sea.sunk > 0 && sea.after < sea.before, JSON.stringify(sea));
  const raid = await G(() => {
    const g = Sim.G;
    // fresh German submarines raiding the Western Approaches, where British imports pass
    const z = Seas.all().findIndex(x => x.name === 'Western Approaches');
    const subs = Navy.newFleet('GER', z, Array.from({ length: 10 }, () => ({ type: 'submarine', str: 1, org: 1 })), 'raid');
    subs.area = z;
    Navy.daily();
    const loss = Navy.lossIn('ENG', z);
    const lane = g.dip.trade.filter(d => d.to === 'ENG').map(d => Navy.lane(d.from, d.to)).find(l => l && l.includes(z));
    return { loss, lane: !!lane };
  });
  check('navy: submarines raiding a sea lane sink convoys', raid.loss > 0.1, JSON.stringify(raid));

  // supply: ports and hubs are supply sources, and forts show in battle
  const sup = await G(() => {
    const g = Sim.G, M = Sim.MAP;
    const port = M.provs.find(p => g.owner[p.id] === 'ENG' && !p.home && Navy.isPort(p.id) && Sim.sourceValue('ENG', p.id) > 0.3);
    const far = M.provs.filter(p => g.owner[p.id] === 'ENG' && !p.home && !Navy.isPort(p.id) && p.core === 'ENG' && !p.city).sort((a, b) => Sim.supplyReach('ENG', a.id) - Sim.supplyReach('ENG', b.id))[0];
    const r0 = far ? Sim.supplyReach('ENG', far.id) : 0;
    if (far) Economy.setInfra(far.id, 'hub', 1);
    const r1 = far ? Sim.supplyReach('ENG', far.id) : 0;
    const maginot = M.provs.find(p => g.owner[p.id] === 'FRA' && Economy.infra(p.id, 'fort') === 3);
    return { port: port && port.name, portValue: port && +Sim.sourceValue('ENG', port.id).toFixed(2), far: far && far.name, r0: +r0.toFixed(2), r1: +r1.toFixed(2), maginot: maginot && maginot.name, fort: maginot && Sim.fortBonus('FRA', maginot.id) };
  });
  check('supply: overseas ports feed armies', !!sup.port && sup.portValue > 0.3, JSON.stringify(sup));
  check('supply: a supply hub makes a province a source', sup.r1 > sup.r0 && sup.r1 >= 0.99, `${sup.far}: ${sup.r0} → ${sup.r1}`);
  check('works: the Maginot Line starts fortified', sup.fort >= 0.44, sup.maginot || 'none');
  // air support shows in a land battle
  const airB = await G(() => {
    const g = Sim.G, M = Sim.MAP;
    const b = g.battles.find(x => Sim.allied(x.atkTag, 'ENG') || Sim.allied(x.defTag, 'ENG')) || null;
    const prov = b ? b.prov : M.provs.find(p => g.owner[p.id] === 'GER' && p.nb.some(n => g.owner[n] === 'FRA')).id;
    const pt = [M.provs[prov].lon, M.provs[prov].lat];
    for (const w of g.wings.filter(w => w.owner === 'ENG')) { const nb = Air.freeBase('ENG', prov); if (nb >= 0) Air.rebase(w, nb); Air.setMission(w, w.type === 'fighter' ? 'superiority' : 'cas', prov); }
    return { sup: +Air.superiority('ENG', pt).toFixed(2), mul: +Air.battleBonus('ENG', prov).mul.toFixed(2), flying: g.wings.filter(w => w.owner === 'ENG' && w.mission !== 'idle').length };
  });
  check('air: planes over a battle change its odds', airB.mul > 1.02 && airB.flying > 0, JSON.stringify(airB));

  // half a year of a world at war at sea: AI fleets, raiders, aircraft and landings, and the rules hold
  const run = await G(() => {
    const g = Sim.G, t0 = performance.now();
    Sim.declareWar('ITA', 'FRA', true);
    Sim.declareWar('JAP', 'USA', true);
    const ships0 = {}; for (const c of Object.values(g.countries)) ships0[c.tag] = Navy.nav(c).lost;
    let battles = 0, landings = 0, flying = 0; const seenInv = new Set();
    for (let d = 0; d < 180; d++) {
      // landings are spotted every hour: a short crossing can be planned, sail and land within one day
      for (let h = 0; h < 24; h++) { Sim.hourTick(); battles += g.navBattles.filter(b => b.start === g.hour).length; for (const a of g.armies) if (a.sea && a.owner !== 'ENG') seenInv.add(a.id); }
      flying = Math.max(flying, g.wings.filter(w => w.owner !== 'ENG' && w.mission !== 'idle').length);
    }
    const lost = Object.values(g.countries).reduce((s, c) => s + Navy.nav(c).lost, 0);
    const built = Object.values(g.countries).reduce((s, c) => s + Navy.nav(c).queue.length, 0);
    return { ms: Math.round((performance.now() - t0) / 180), battles, lost, invasions: seenInv.size, flying, queued: built, bad: ecoInvariants() };
  });
  check('navy: the AI fights at sea, raids, flies and lands troops', run.battles >= 3 && run.lost >= 3 && run.flying >= 3 && run.invasions >= 1, `${run.battles} sea battles, ${run.lost} ships lost, ${run.invasions} AI landings, ${run.flying} AI wings flying, ${run.ms} ms per game day`);
  check('navy: rules hold after half a year of war', run.bad.length === 0, run.bad.slice(0, 4).join('; '));
  await clickEl(page, '.tab[data-tab="navy"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve(__dirname, 'shots/navy.png') });
  check('navy: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------- diplomacy: every action through the Nations tab, AI answers, then a long AI run ----------
async function diplomacyRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await autoAnswer(page);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await toPicker(page);
  await clickEl(page, '#start .ncard[data-tag="GER"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  // plenty of political power so every action can be tried; relations are left as they are
  await page.evaluate(() => { Sim.G.countries.GER.pp = 900; Sim.G.countries.GER.equipment = 5000; });
  const openNation = async tag => {
    // a proposal dialog from an AI nation may be waiting: decline it first
    if (await page.locator('#modal:not([hidden]) [data-x="no"]').count()) await clickEl(page, '#modal [data-x="no"]');
    if (!(await page.locator('.tab[data-tab="diplo"].on').count())) await clickEl(page, '.tab[data-tab="diplo"]');
    if (await page.evaluate(() => document.getElementById('rp-body').hidden)) await clickEl(page, '.tab[data-tab="diplo"]');
    if (await page.locator('[data-dipback]').count()) {
      if (process.env.DEBUG) { await page.locator('[data-dipback]').scrollIntoViewIfNeeded(); console.log('    back', await page.evaluate(() => { const b = document.querySelector('[data-dipback]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [Math.round(r.x), Math.round(r.y), t === b ? 'hit' : (t && (t.id || t.className || t.tagName)), document.getElementById('rp-body').scrollTop]; })); }
      await clickEl(page, '[data-dipback]');
      if (process.env.DEBUG) console.log('    after back', await page.evaluate(() => document.querySelector('#rp-body h3')?.textContent || 'list'));
    }
    await page.evaluate(() => { const s = document.getElementById('dp-search'); if (s && s.value) { s.value = ''; s.dispatchEvent(new Event('input')); } });
    const ok = await clickEl(page, `[data-dip="${tag}"]`);
    await page.waitForSelector('[data-dipback]', { timeout: 2000 }).catch(() => {});
    if (process.env.DEBUG) console.log('    open', tag, ok, await page.evaluate(() => [document.querySelector('#rp-body h3')?.textContent, [...document.querySelectorAll('[data-act]')].map(b => b.dataset.act).join(',')]));
    return ok;
  };
  const act = async key => {
    const sel = `[data-act="${key}"]:not([disabled])`;
    await page.waitForSelector(sel, { timeout: 2000 }).catch(() => {});
    if (process.env.DEBUG) console.log('    act', key, await page.evaluate(q => { const b = document.querySelector(q); if (!b) return 'missing'; const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [Math.round(r.y), t === b || b.contains(t) ? 'hit' : 'covered by ' + (t && (t.id || t.className || t.tagName))]; }, sel));
    const ok = await clickEl(page, sel); await page.waitForTimeout(150); return ok;
  };
  const G = (fn, arg) => page.evaluate(fn, arg);

  check('diplomacy: nation page opens from the Nations tab', await openNation('ITA') && await waitFor(page, () => !!document.querySelector('[data-act="improve"]')));
  const r0 = await G(() => Diplo.rel('GER', 'ITA'));
  await act('improve');
  check('diplomacy: improve relations raises relations', await G(() => Diplo.rel('GER', 'ITA')) > r0);

  await act('aid');
  check('diplomacy: military aid ships equipment', await G(() => Sim.G.countries.ITA.equipment) > 0 && await G(() => Sim.G.countries.GER.equipment < 5000));

  // free a trade slot (nations start with their opening deals), then propose
  await G(() => { for (const d of Economy.dealsOf('GER').slice(0, 2)) Economy.cancel(d.id, null, 'gone'); });
  await openNation('ITA');
  await clickEl(page, '[data-tradewith="ITA"]');
  check('diplomacy: Trade with opens an offer in the Trade tab', await waitFor(page, () => UI._sel().tab === 'trade' && !!document.querySelector('[data-partner="ITA"] [data-send]'), null, 1500));
  await clickEl(page, '[data-send="ITA"]:not([disabled])');
  check('diplomacy: trade proposal gets an answer', await G(() => Sim.G.dip.trade.some(d => [d.from, d.to].includes('GER') && [d.from, d.to].includes('ITA')) || Sim.G.dip.cd['trade|GER|ITA'] > Sim.G.hour));

  // faction: create, invite a friend (relations raised so the answer is yes), and check they fight together
  await openNation('ITA');
  if (await page.locator('[data-dipback]').count()) await clickEl(page, '[data-dipback]');
  await act('create');
  check('diplomacy: faction created', await G(() => !!Sim.factionOf('GER')));
  await G(() => { Sim.G.dip.rel[Sim.pairKey('GER', 'ITA')] = 80; });
  await G(() => { window.__ev = []; const b = document.getElementById('rp-body'); new MutationObserver(() => window.__ev.push('mut ' + b.scrollTop + ' ' + (b.querySelector('h3')?.textContent || ''))).observe(b, { childList: true }); ['pointerdown', 'pointerup', 'click'].forEach(t => document.addEventListener(t, e => window.__ev.push(t + ' ' + (e.target.dataset?.dip || e.target.className || e.target.tagName) + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY)), true)); });
  await openNation('ITA');
  await act('invite');
  const invOk = await G(() => Sim.allied('GER', 'ITA') && Sim.factionOf('ITA') === Sim.factionOf('GER'));
  check('diplomacy: invited nation joins the faction', invOk, invOk ? '' : await G(() => JSON.stringify({ itaFac: Sim.factionOf('ITA')?.name, gerFac: Sim.factionOf('GER')?.name, can: Diplo.can('invite', 'GER', 'ITA'), ans: Sim.factionOf('GER') && Diplo.answer('invite', 'GER', 'ITA', { fac: Sim.factionOf('GER') }), ev: window.__ev.slice(-12), log: Sim.G.log.slice(0, 3).map(l => l.text) })));

  // guarantee a small nation, then someone attacks it: the guarantor joins the war
  const small = await G(() => Object.values(Sim.G.countries).find(c => c.alive && c.civ + c.mil < 20 && !Sim.allied(c.tag, 'GER') && !Sim.isAtWar(c.tag) && c.tag !== 'ETH').tag);
  await openNation(small); await act('guarantee');
  check('diplomacy: guarantee recorded', await G(t => Sim.G.dip.guar.some(x => x.by === 'GER' && x.of === t), small));
  await G(t => Sim.declareWar('SPA', t, true), small);
  check('diplomacy: guarantor joins a war on the guaranteed nation', await G(() => Sim.atWar('GER', 'SPA')));
  check('diplomacy: faction members join their leader\'s wars', await G(() => Sim.atWar('ITA', 'SPA')));

  // peace: a white peace between even sides is accepted and ends the fighting
  await openNation('SPA');
  check('diplomacy: war score shown while at war', await page.locator('text=War score').count() > 0);
  await act('peace');
  const peace = await G(() => !Sim.atWar('GER', 'SPA') || Sim.G.dip.cd['peace|GER|SPA'] > Sim.G.hour);
  check('diplomacy: peace offer gets an answer', peace);

  // non-aggression pact, then the declare-war button asks to break it
  await G(() => { Sim.G.dip.rel[Sim.pairKey('GER', 'SOV')] = 90; });
  await openNation('SOV'); await act('pact');
  check('diplomacy: non-aggression pact signed', await G(() => Sim.hasPact('GER', 'SOV')));
  check('diplomacy: an AI cannot declare war through a pact', await G(() => Sim.declareWar('SOV', 'GER', true) === null));
  await openNation('SOV');
  check('diplomacy: declaring war offers to break the pact', await page.locator('[data-war="SOV"]', { hasText: 'Break pact' }).count() > 0);

  // demand territory from the weakest neighbour: either they cede land or refuse (which justifies war)
  const weak = await G(() => { const n = new Set(); Sim.MAP.provs.forEach(p => { if (Sim.G.owner[p.id] === 'GER') p.nb.forEach(q => n.add(Sim.G.owner[q])); }); return [...n].filter(t => t !== 'GER' && !Sim.allied(t, 'GER') && !Sim.atWar(t, 'GER')).sort((a, b) => Diplo.power(a) - Diplo.power(b))[0]; });
  if (weak) {
    const before = await G(() => Sim.G.owner.filter(o => o === 'GER').length);
    await openNation(weak); await act('demand');
    const after = await G(() => Sim.G.owner.filter(o => o === 'GER').length);
    const claim = await G(t => Sim.G.dip.claims['GER>' + t] > Sim.G.hour, weak);
    check('diplomacy: territorial demand is ceded or refused with a claim', after > before || claim, after > before ? 'ceded ' + (after - before) : 'refused, war now free');
  }

  // an AI proposal to the player opens a dialog; accepting it takes effect
  const prop = await G(() => {
    const terms = { good: 'fuel', amount: 2, price: Economy.fairPrice('fuel', 2), sell: true };
    const t = Object.values(Sim.G.countries).find(c => c.alive && c.tag !== 'GER' && !Sim.atWar(c.tag, 'GER') && Economy.balance(c.tag, 'fuel') > 2 && Diplo.can('trade', c.tag, 'GER', terms).ok);
    if (!t) return null; t.pp = 50; Diplo.act('trade', t.tag, 'GER', terms); return t.tag; });
  if (prop) {
    check('diplomacy: an AI proposal shows a card to answer', await waitFor(page, () => !document.getElementById('offer').hidden));
    await clickEl(page, '#offer [data-x="yes"]');
    check('diplomacy: accepting the proposal takes effect', await waitFor(page, t => Sim.G.dip.trade.some(d => d.from === t && d.to === 'GER'), prop));
  }

  // let the AI run its own diplomacy for a while, answering any dialogs, then check the rules still hold
  await G(() => { Sim.G.settings.autoPause = false; Sim.G.settings.pauseEvent = false; Sim.G.speed = 5; Sim.G.paused = false; Sim.G.hour += 300 * 24; });
  const t0 = Date.now();
  while (Date.now() - t0 < (QUICK ? 6000 : 15000)) {
    if (await page.locator('#offer:not([hidden]) [data-x="no"]').count()) await clickEl(page, '#offer [data-x="no"]');
    await page.waitForTimeout(500);
  }
  const dip = await G(() => {
    const g = Sim.G, bad = [];
    for (const f of g.dip.factions) {
      if (!f.members.length) bad.push(f.name + ' is empty');
      if (!f.members.includes(f.leader)) bad.push(f.name + ' leader is not a member');
      for (const m of f.members) { if (g.dip.facOf[m] !== f.id) bad.push(m + ' faction index is wrong'); if (!g.countries[m].alive) bad.push(m + ' is dead but in ' + f.name); }
      for (const a of f.members) for (const b of f.members) if (a < b && Sim.atWar(a, b)) bad.push(a + ' and ' + b + ' share ' + f.name + ' but are at war');
    }
    for (const k of Object.keys(g.dip.pacts)) { const [a, b] = k.split('|'); if (g.dip.pacts[k] > g.hour && Sim.atWar(a, b)) bad.push('pact ' + k + ' but at war'); }
    for (const a of Object.keys(g.countries)) for (const b of Object.keys(g.countries)) if (a < b && g.countries[a].alive && g.countries[b].alive && Sim.atWar(a, b) && Sim.allied(a, b)) bad.push(a + ' and ' + b + ' are allied and at war');
    for (const a of g.armies) { const o = g.owner[a.prov]; if (o !== a.owner && !Sim.allied(o, a.owner) && !Sim.atWar(o, a.owner)) bad.push('army of ' + a.owner + ' stands in neutral ' + o); }
    return { bad, factions: g.dip.factions.map(f => f.name + ' (' + f.members.length + ')'), pacts: Object.keys(g.dip.pacts).length, trades: g.dip.trade.length };
  });
  check('diplomacy: the AI forms factions and treaties', dip.factions.length > 1 || dip.pacts + dip.trades > 3, dip.factions.join(', ') + ` · ${dip.pacts} pacts · ${dip.trades} trade deals`);
  check('diplomacy: rules hold after a long AI run', dip.bad.length === 0, dip.bad.slice(0, 4).join('; '));
  check('diplomacy: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/diplomacy.png') });
  await page.close();
}

// ---------- historical eras: pick each on the start screen, play it for a while, check it holds ----------
async function erasRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const boot = async () => { await page.goto(FILE); await waitFor(page, () => document.getElementById('loading').hidden, null, 15000); };
  await boot();
  const eras = await page.evaluate(() => Eras.list().map(e => ({ id: e.id, label: e.label, base: e.id === Eras.BASE_ID })));
  await clickEl(page, '#mm-new');
  check('eras: New game offers every era', eras.length >= 6 && await waitFor(page, n => document.querySelectorAll('#sheet .era').length === n, eras.length, 1500), eras.map(e => e.label).join(', '));
  const modern = ['tanks', 'motorized', 'mechanized', 'paratroopers', 'recon'];
  for (const era of eras) {
    if (era.base) continue;
    await boot();
    await toPicker(page, era.id);
    const picked = await waitFor(page, id => document.querySelector(`#st-eras button[data-era="${id}"]`)?.classList.contains('sel') && !Eras.isBase() && Eras.info().id === id, era.id, 3000);
    const tag = await page.evaluate(() => document.querySelector('#st-majors .ncard')?.dataset.tag);
    if (tag) await clickEl(page, `#start .ncard[data-tag="${tag}"]`);
    await clickEl(page, '#st-play');
    const started = await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden, null, 3000);
    const res = await page.evaluate(async () => {
      const G = Sim.G; G.settings.autoPause = false; G.settings.pauseEvent = false; G.speed = 5; G.paused = false;
      await new Promise(r => setTimeout(r, 5000));
      const units = new Set(); G.armies.forEach(a => a.units.forEach(u => units.add(u.type)));
      return { date: document.getElementById('tb-date').textContent, days: G.hour / 24, units: [...units], armies: G.armies.length, flag: !!document.querySelector('#tb-nation svg') };
    });
    const bad = res.units.filter(u => modern.includes(u));
    const eco = await page.evaluate(() => { const c = Sim.G.countries[Sim.G.player]; return { goods: document.querySelectorAll('.tab[data-tab="econ"]').length, prod: Object.values(c.eco.prod).reduce((s, v) => s + v, 0), branches: Tech.branchesFor(Sim.G.player).length, bad: ecoInvariants() }; });
    check(`eras: ${era.label} has an economy and a tech tree`, eco.prod > 0 && eco.branches === 5 && eco.bad.length === 0, `${eco.branches} branches` + (eco.bad.length ? ' · ' + eco.bad.slice(0, 3).join('; ') : ''));
    const nv = await page.evaluate(() => ({ fleets: Sim.G.fleets.length, ships: Sim.G.fleets.reduce((s, f) => s + f.ships.length, 0), types: [...new Set(Sim.G.fleets.flatMap(f => f.ships.map(s => Navy.typeName(s.type))))], wings: Sim.G.wings.length, air: Air.available(), ports: (Sim.G.inf || []).filter(I => I && I.port).length }));
    check(`eras: ${era.label} has period navies${nv.air ? ' and aircraft' : ''}`, nv.fleets > 3 && nv.ports > 20 && (nv.air ? nv.wings > 0 : nv.wings === 0), `${nv.ships} ships in ${nv.fleets} fleets: ${nv.types.join(', ')}; ${nv.wings} air wings; ${nv.ports} ports`);
    if (era.id.startsWith('greatwar')) {
      // 1917: tanks and gas troops are already in service, and their figures are the Blender models
      const ww1 = await page.evaluate(() => ({ tanks: Sim.G.armies.some(a => a.units.some(u => u.type === 'landships')), gas: !!UNIT_TYPES.gastroops,
        kinds: ['landships', 'gastroops', 'railguns'].map(t => Figures.kindOf(t)), war: Sim.G.wars.some(w => w.attackers.includes('GER') || w.defenders.includes('GER')) }));
      check('eras: 1917 fields tanks, gas troops and railway guns at war', ww1.tanks && ww1.gas && ww1.war && ww1.kinds.join() === 'mark4,gastroops,railgun', JSON.stringify(ww1));
    }
    if (era.id.startsWith('modern')) {
      // 2026: technology counts twice over, drones and air defence exist, chips are the strategic good
      const m = await page.evaluate(() => {
        const A = Sim.G.armies.find(a => a.units.length > 3), lvl = Tech.level(A.owner);
        return { weight: Eras.techWeight(), drones: !!UNIT_TYPES.drones, sam: !!(UNIT_TYPES.airdefence && UNIT_TYPES.airdefence.aa), chips: Economy.goodName('strategic'),
          kinds: ['infantry', 'tanks', 'drones', 'airdefence'].map(t => Figures.kindOf(t)), ukr: Sim.G.wars.some(w => w.attackers.includes('RUS') && w.defenders.includes('UKR')) };
      });
      check('eras: 2026 runs on technology, drones and chips', m.weight === 2 && m.drones && m.sam && /chip/i.test(m.chips) && m.ukr && m.kinds.join() === 'modern,mbt,drone,sam', JSON.stringify(m));
    }
    check(`eras: ${era.label} plays`, picked && started && res.days > 5 && res.armies > 0 && res.flag, `${res.date}, ${res.armies} armies`);
    if (!era.id.startsWith('greatwar') && !era.id.startsWith('modern')) check(`eras: ${era.label} has only period units`, bad.length === 0, bad.join(', '));
  }
  check('eras: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// Phase 6: decisions, events, the peace conference, saving and loading
async function politicsRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await toPicker(page);
  await clickEl(page, '#start .ncard[data-tag="ITA"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  const G = (fn, arg) => page.evaluate(fn, arg);
  await G(() => { Sim.G.settings.autoPause = false; Sim.G.countries.ITA.pp = 200; Sim.G.countries.ITA.eco.gold = 2000; });

  // map controls: WASD pans, dragging across counters selects several armies
  await G(() => { const p = Sim.MAP.provs[Sim.G.countries.ITA.capital]; Render.cam.x = p.x; Render.cam.y = p.y; Render.cam.z = 7; Render.cam.anim = false; });
  await page.waitForTimeout(300);
  const cam0 = await G(() => ({ x: Render.cam.x, y: Render.cam.y }));
  await page.mouse.move(700, 450);
  await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d');
  await page.keyboard.down('w'); await page.waitForTimeout(450); await page.keyboard.up('w');
  const cam1 = await G(() => ({ x: Render.cam.x, y: Render.cam.y }));
  check('controls: D and W pan the map right and up', cam1.x > cam0.x + 1 && cam1.y < cam0.y - 1, JSON.stringify([cam0, cam1]));
  await G(c => { Render.cam.x = c.x; Render.cam.y = c.y; Render.cam.anim = false; }, cam0);
  await page.waitForTimeout(300);
  // two of our counters on screen, and a point on each
  const pts = await G(() => {
    const out = [];
    for (const a of Sim.G.armies.filter(a => a.owner === 'ITA')) {
      const d = Render.dispPos(a); if (!d) continue;
      const [sx, sy] = Render.worldToScreen(d.x, d.y);
      if (sx < 40 || sy < 80 || sx > innerWidth - 440 || sy > innerHeight - 140) continue;
      for (let dy = -30; dy <= 6; dy += 3) { const g = Render.stackAt(sx, sy + dy); if (g && g.some(x => x.id === a.id)) { if (!out.some(o => o.ids.some(i => g.some(x => x.id === i)))) out.push({ x: sx, y: sy + dy, ids: g.filter(x => x.owner === 'ITA').map(x => x.id) }); break; } }
      if (out.length === 2) break;
    }
    return out;
  });
  if (pts.length === 2) {
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(pts[0].x + (pts[1].x - pts[0].x) * i / 8 + 4, pts[0].y + (pts[1].y - pts[0].y) * i / 8 + 4);
    const boxShown = await G(() => { const b = document.getElementById('selbox'); return !!b && !b.hidden; });
    await page.mouse.up();
    const picked = await G(() => UI._selected());
    check('controls: dragging from a counter across others selects them all', boxShown && pts.every(p => p.ids.every(id => picked.includes(id))), JSON.stringify({ boxShown, pts: pts.map(p => p.ids), picked }));
    const camAfter = await G(() => ({ x: Render.cam.x, y: Render.cam.y }));
    check('controls: a selection drag does not move the map', Math.abs(camAfter.x - cam0.x) < 0.01 && Math.abs(camAfter.y - cam0.y) < 0.01);
  } else check('controls: dragging from a counter across others selects them all', false, 'found ' + pts.length + ' counters on screen');
  await G(() => UI._select([]));

  // decisions
  await clickEl(page, '.tab[data-tab="gov"]');
  check('politics: tab lists the decisions', await waitFor(page, () => document.querySelectorAll('#rp-body [data-dec]').length >= 12, null, 1500));
  check('politics: a decision that does not apply is greyed out', await G(() => { const b = document.querySelector('#rp-body [data-dec="demob"]'); return !!b && b.disabled; }));
  const pp0 = await G(() => Sim.G.countries.ITA.pp);
  await clickEl(page, '#rp-body [data-dec="research"]');
  check('politics: one click takes a decision', await waitFor(page, pp => Sim.G.countries.ITA.pp < pp && Politics.mods('ITA').some(m => m.id === 'dec:research'), pp0, 1500));
  check('politics: the effect shows under In effect', await waitFor(page, () => /In effect[\s\S]*Research drive/i.test(document.getElementById('rp-body').innerText), null, 1500));
  check('politics: the effect raises research speed', await G(() => Tech.mod('ITA', 'research') >= 0.15));
  check('politics: a decision cannot be repeated at once', await G(() => !Politics.can('ITA', 'research').ok));
  const expired = await G(() => { Politics.addMod('ITA', { id: 'test', name: 'Test', days: 1, fx: [{ mod: 'industry', value: 0.5 }] }); const had = Tech.mod('ITA', 'industry'); for (let h = 0; h < 72; h++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); return had >= 0.5 && !Politics.mods('ITA').some(m => m.id === 'test') && Tech.mod('ITA', 'industry') < 0.5; });
  check('politics: timed effects run out', expired);

  // everyday events wait in a side card while the clock keeps running, then the ministers decide
  const minor = await G(() => { const d = Events.defs().find(d => !d.tag && d.options.length >= 2 && Events.check(Sim.G.countries.ITA, d.cond)); if (!d) return null; Sim.G.settings.pauseEvent = true; Sim.G.paused = false; Sim.G.speed = 3; Events.fire(d.id, 'ITA'); return d.id; });
  check('events: an everyday event shows beside the armies, not over the map', !!minor && await waitFor(page, () => !document.getElementById('evside').hidden && document.querySelectorAll('#evside .ev-opt').length >= 2 && document.getElementById('modal').hidden, null, 2000), minor || 'no everyday event applies');
  const hm = await G(() => Sim.G.hour);
  await page.waitForTimeout(900);
  check('events: the clock keeps running for an everyday event', await G(h => Sim.G.hour > h && !Sim.G.paused, hm));
  await clickEl(page, '#evside .ev-opt[data-x="1"]');
  // the card then closes, or moves on to another everyday event that came up while the clock ran
  check('events: answering the side card records it', await waitFor(page, id => { const box = document.getElementById('evside'), top = box.querySelector('[data-evs]'); return (box.hidden || (top && !Events.open().some(e => e.n === +top.dataset.evs && e.id === id))) && Sim.G.ev.hist.some(h => h.id === id && h.tag === 'ITA' && h.pick === 1); }, minor, 1500));
  const auto = await G(() => { const d = Events.defs().find(d => !d.tag && d.options.length >= 2); Sim.G.paused = true; Events.fire(d.id, 'ITA'); const n = Sim.G.ev.next - 1; for (let h = 0; h < 24 * (Events.DECIDE_DAYS + 2); h++) Sim.hourTick(); const r = { left: Events.open().some(e => e.n === n), hist: Sim.G.ev.hist.some(h => h.id === d.id && h.tag === 'ITA') }; while (Events.open().length) Events.choose(Events.open()[0].n, 0); return r; });
  check('events: an unanswered everyday event is decided after a month', !auto.left && auto.hist, JSON.stringify(auto));
  // big historical events: a card with choices, the clock waits for the answer
  const evId = await G(() => { Sim.G.paused = false; const d = Events.defs().find(d => [].concat(d.tag || []).includes('ITA') && (d.options || []).length >= 2) || Events.defs().find(d => d.tag && (d.options || []).length >= 2); if (!d) return null; Events.fire(d.id, 'ITA'); return d.id; });
  check('events: an event opens as a card with choices', !!evId && await waitFor(page, () => !document.getElementById('modal').hidden && document.querySelectorAll('#modal .ev-opt').length >= 2, null, 2000), evId || 'no everyday event applies');
  const h0 = await G(() => Sim.G.hour);
  await page.waitForTimeout(700);
  check('events: the clock waits for an answer', await G(h => Sim.G.hour === h && Sim.G.paused, h0));
  check('events: each choice says what it does', await G(() => [...document.querySelectorAll('#modal .ev-opt small')].every(s => s.textContent.trim().length > 3)));
  await clickEl(page, '#modal .ev-opt[data-x="1"]');
  check('events: picking a choice closes the card and records it', await waitFor(page, id => document.getElementById('modal').hidden && Sim.G.ev.hist.some(h => h.id === id && h.tag === 'ITA' && h.pick === 1), evId, 1500));
  const ai = await G(() => { for (let d = 0; d < 400; d++) { for (let h = 0; h < 24; h++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); if (Sim.G.peace) Peace.done(Sim.G.peace); }
    const fired = Object.keys(Sim.G.ev.fired).map(k => k.split('|')); return { every: fired.filter(([id, t]) => t !== 'ITA' && !Events.def(id).tag).length, hist: fired.filter(([id]) => Events.def(id).tag).map(([id]) => id), aiDec: Object.values(Sim.G.countries).filter(c => c.tag !== 'ITA' && c.dec && Object.keys(c.dec).length).length }; });
  check('events: AI nations get and answer events', ai.every >= 20, ai.every + ' everyday events for AI nations');
  check('events: historical events fire on their dates', ai.hist.includes('h36_rhineland') && ai.hist.length >= 4, ai.hist.join(', '));
  check('politics: AI governments take decisions', ai.aiDec >= 15, ai.aiDec + ' nations');
  check('politics: invariants hold after a year', await G(() => { const bad = ecoInvariants(); for (const c of Object.values(Sim.G.countries)) { if (!(c.stab >= 0 && c.stab <= 1 && c.ws >= 0 && c.ws <= 1 && Number.isFinite(c.pp) && c.pp >= 0)) bad.push(c.tag + ' stab/ws/pp'); } Sim.G.owner.forEach((o, i) => { if (!Sim.G.countries[o].alive) bad.push('province ' + i + ' owned by dead ' + o); }); return bad.length ? bad.slice(0, 5).join('; ') : ''; }) === '');

  // save and load through the menu
  await G(() => { Sim.G.paused = true; });
  await clickEl(page, '#tb-menu');
  await clickEl(page, '#modal [data-x="saves"]');
  check('save: the menu opens the saved games', await waitFor(page, () => document.querySelectorAll('#modal [data-sv]').length === 3, null, 1500), await G(() => document.getElementById('modal').hidden ? 'modal hidden' : document.querySelector('#modal .panel').innerText.slice(0, 120)));
  await clickEl(page, '#modal [data-sv="1"]');
  check('save: one click saves to a slot', await waitFor(page, () => { const i = Save.info('1'); return i && i.nation === 'Italy' && !!document.querySelector('#modal [data-ld="1"]'); }, null, 1500));
  const saved = await G(() => ({ hour: Sim.G.hour, owner: Sim.G.owner.join(), gold: Math.round(Sim.G.countries.ITA.eco.gold), armies: Sim.G.armies.length, techs: Sim.G.countries.ITA.techs.length, deals: Sim.G.dip.trade.length }));
  await G(() => { document.getElementById('modal').hidden = true; for (let h = 0; h < 24 * 20; h++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); if (Sim.G.peace) Peace.done(Sim.G.peace); });
  await clickEl(page, '#tb-menu');
  await clickEl(page, '#modal [data-x="saves"]');
  await clickEl(page, '#modal [data-ld="1"]');
  const back = await G(() => ({ hour: Sim.G.hour, owner: Sim.G.owner.join(), gold: Math.round(Sim.G.countries.ITA.eco.gold), armies: Sim.G.armies.length, techs: Sim.G.countries.ITA.techs.length, deals: Sim.G.dip.trade.length }));
  const brief = o => JSON.stringify(Object.assign({}, o, { owner: o.owner.length }));
  check('save: loading brings the game back as it was', JSON.stringify(back) === JSON.stringify(saved), JSON.stringify(back) === JSON.stringify(saved) ? '' : brief(back) + ' vs ' + brief(saved));
  const cont = await G(() => { const h = Sim.G.hour; for (let i = 0; i < 24 * 30; i++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); return Sim.G.hour - h === 720 && ecoInvariants().length === 0; });
  check('save: a loaded game plays on', cont);
  // autosave, the start screen's Continue button, and files
  await G(() => { Sim.G.settings.autosave = true; for (let i = 0; i < 24 * 65; i++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); if (Sim.G.peace) Peace.done(Sim.G.peace); });
  check('save: the game autosaves every month', await G(() => { const i = Save.info('auto'); return !!i && i.date === Sim.dateStr(Math.floor(Sim.G.hour / 720) * 720) || !!i; }));
  const expText = await G(() => Save.serialise('test'));
  await G(() => { UI._openSaves(false); });
  await G(() => { document.getElementById('modal').hidden = true; });
  await clickEl(page, '#tb-menu'); await clickEl(page, '#modal [data-x="new"]'); await clickEl(page, '#modal [data-x="yes"]');
  check('save: the main menu offers Continue', await waitFor(page, () => !document.getElementById('menu').hidden && !document.getElementById('mm-continue').hidden && /Italy/.test(document.getElementById('mm-cont-sub').textContent), null, 1500));
  await clickEl(page, '#mm-continue');
  check('save: Continue loads the latest save', await waitFor(page, () => Sim.G && Sim.G.player === 'ITA' && !document.getElementById('hud').hidden, null, 3000));
  // a save from another era switches the world back to that era (an event waiting in the save is answered first, as a player must)
  for (let i = 0; i < 5 && await waitFor(page, () => !!document.querySelector('#modal .ev-opt'), null, 600); i++) await clickEl(page, '#modal .ev-opt');
  await clickEl(page, '#tb-menu'); await clickEl(page, '#modal [data-x="new"]'); await clickEl(page, '#modal [data-x="yes"]');
  const startShown = await waitFor(page, () => !document.getElementById('menu').hidden && !Sim.G && !!document.querySelector('#sheet .era'), null, 2000);
  await clickEl(page, '#sheet .era[data-era="napoleonic-1805"]'); await clickEl(page, '#mm-choose');
  const eraPicked = await waitFor(page, () => !Eras.isBase() && !document.getElementById('start').hidden, null, 3000);
  if (!startShown || !eraPicked) console.log('    (era step: start shown ' + startShown + ', era picked ' + eraPicked + ', modal ' + await G(() => document.getElementById('modal').hidden ? 'hidden' : document.querySelector('#modal .panel').innerText.slice(0, 60)) + ')');
  await clickEl(page, '#start .ncard[data-tag="FRA"]'); await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && Sim.G.player === 'FRA');
  const s1805 = await G(() => { for (let h = 0; h < 24 * 10; h++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); Save.write('2'); return { hour: Sim.G.hour, owner: Sim.G.owner.join() }; });
  await G(() => { document.getElementById('modal').hidden = true; });
  await clickEl(page, '#tb-menu'); await clickEl(page, '#modal [data-x="quit"]');
  await waitFor(page, () => !document.getElementById('menu').hidden, null, 2000);
  await G(() => Save.remove('auto'));
  await clickEl(page, '#sheet [data-close]');
  await clickEl(page, '#mm-new'); await clickEl(page, '#sheet .era[data-era="ww2-1936"]'); await clickEl(page, '#mm-choose');
  await waitFor(page, () => Eras.isBase(), null, 3000);
  await clickEl(page, '#st-back');
  await clickEl(page, '#mm-load');
  await clickEl(page, '#sheet [data-ld="2"]');
  check('save: a save from another era loads that era', await waitFor(page, s => Sim.G && !Eras.isBase() && Eras.info().id === 'napoleonic-1805' && Sim.G.hour === s.hour && Sim.G.owner.join() === s.owner, s1805, 3000), await G(() => JSON.stringify({ era: Eras.isBase() ? 'base' : Eras.info().id, g: !!Sim.G, hour: Sim.G && Sim.G.hour, start: !document.getElementById('start').hidden, menu: !document.getElementById('menu').hidden, modal: document.getElementById('modal').hidden ? '' : document.querySelector('#modal .panel').innerText.slice(0, 80), saves: Save.list().map(s => s.slot + ':' + (s.era || '-')) })));
  check('save: an exported file loads again', await G(t => { const r = Save.parse(t); return r.ok && r.data.player === 'ITA' && r.data.era === 'ww2-1936'; }, expText));
  check('save: a broken file is refused with a reason', await G(() => { const a = Save.parse('{"hello":1}'), b = Save.parse('not json'); return !a.ok && !b.ok && a.why.length > 5; }));
  await page.setInputFiles('#sv-file', { name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(expText) }, { timeout: 2000 }).catch(() => {});
  await G(() => { document.getElementById('modal').hidden = true; });
  await clickEl(page, '#tb-menu'); await clickEl(page, '#modal [data-x="saves"]');
  await page.setInputFiles('#sv-file', { name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(expText) });
  check('save: Import from file loads it', await waitFor(page, () => Sim.G && Sim.G.player === 'ITA' && Eras.isBase(), null, 4000));

  // a beaten army is destroyed, not sent running; a hunt aims where the enemy is marching to
  const fight = await G(() => {
    const S = Sim.G; S.paused = true;
    if (!Sim.atWar('ITA', 'ETH')) Sim.declareWar('ITA', 'ETH', true);
    const land = id => !Sim.MAP.provs[id].sea && Sim.MAP.provs[id].nb.length;
    const a = S.armies.find(x => x.owner === 'ITA' && !x.sea && !x.battle && x.units.length >= 2 && Sim.MAP.provs[x.prov].nb.some(n => S.owner[n] === 'ITA' && land(n)));
    if (!a) return null;
    const p = Sim.MAP.provs[a.prov].nb.find(n => S.owner[n] === 'ITA' && land(n));
    const e = Sim.newArmy('ETH', p, [{ type: 'infantry', str: 0.6, org: 0.08 }]);
    a.units.forEach(u => { u.org = 1; u.str = 1; });
    Sim.orderMove(a, p, 'move'); a.order = 'attack';
    let ret = false;
    for (let h = 0; h < 24 * 8 && S.armies.includes(e); h++) { Sim.hourTick(); if (e.retreating) ret = true; }
    const gone = !S.armies.includes(e);
    // the hunt: an enemy marching away is chased to its next stop, not to the province it left
    const far = Sim.MAP.provs.filter(q => S.owner[q.id] === 'ITA' && land(q.id) && Sim.distKm(a.prov, q.id) > 300).map(q => q.id);
    const e2 = Sim.newArmy('ETH', a.prov, [{ type: 'infantry', str: 1, org: 1 }]);
    let moving = false;
    for (const q of far) { if (Sim.orderMove(e2, q, 'move') && e2.path.length >= 2) { moving = true; break; } }
    const hp = moving ? Sim.MAP.provs[e2.prov].nb.find(n => S.owner[n] === 'ITA' && n !== e2.path[0] && land(n) && Sim.findPath('ITA', n, e2.path[0], 'move')) : undefined;
    const h2 = hp !== undefined ? Sim.newArmy('ITA', hp, [{ type: 'infantry', str: 1, org: 1 }]) : null;
    const ok2 = moving && h2 && Sim.orderChase(h2, e2);
    const r = { gone, ran: ret, chased: !!ok2, moving, hunter: !!h2, aim: ok2 ? h2.path[h2.path.length - 1] : null, next: e2.path[0], left: e2.prov };
    Sim.removeArmy(e2); if (h2) Sim.removeArmy(h2);
    return r;
  });
  if (fight) {
    check('battle: a beaten army is destroyed instead of running away', fight.gone && !fight.ran, JSON.stringify(fight));
    if (fight.chased) check('orders: hunting a marching army heads for where it is going', fight.aim === fight.next, JSON.stringify(fight));
  }

  // losing land: no pause, but a red banner (one for several provinces) and the provinces flash on the map
  const lostP = await G(() => { const S = Sim.G; S.paused = false; S.settings.autoPause = true; S.settings.pauseLoss = true; if (!Sim.atWar('ITA', 'ETH')) Sim.declareWar('ITA', 'ETH', true); const ps = Sim.MAP.provs.filter(p => S.owner[p.id] === 'ITA' && !p.capital).slice(0, 2).map(p => p.id); ps.forEach(id => Sim.capture(id, 'ETH')); return { ps, paused: S.paused }; });
  check('war: losing provinces does not pause the clock', !lostP.paused);
  check('war: lost provinces show one red banner and flash on the map', await waitFor(page, ps => { const b = document.getElementById('lossbar'); return b && !b.hidden && /2 provinces lost/.test(b.textContent) && ps.every(id => (Render.state.flash || []).some(f => f.prov === id)); }, lostP.ps, 1500), await G(() => { const b = document.getElementById('lossbar'); return b ? b.textContent : 'no banner'; }));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/lost-banner.png') });
  await clickEl(page, '#lossbar');
  check('war: clicking the banner shows the lost province', await waitFor(page, ps => Render.state.selProv === ps[ps.length - 1] && document.getElementById('lossbar').hidden, lostP.ps, 1500));
  await G(ps => ps.forEach(id => Sim.capture(id, 'ITA')), lostP.ps);

  // the peace conference
  await G(() => { Sim.G.settings.autoPause = false; const S = Sim.G; if (!Sim.atWar('ITA', 'ETH')) Sim.declareWar('ITA', 'ETH', true); const eth = Sim.MAP.provs.filter(p => p.core === 'ETH' && p.home); eth.slice(0, Math.ceil(eth.length * 0.7)).forEach(p => { S.owner[p.id] = 'ITA'; }); S.ownVer++; for (let i = 0; i < 24; i++) Sim.hourTick(); });
  check('peace: a capitulation opens the peace conference', await waitFor(page, () => !!Sim.G.peace && !!document.querySelector('#modal .pz') && document.querySelectorAll('#modal [data-pz]').length >= 3, null, 2000));
  const hp = await G(() => Sim.G.hour); await G(() => { Sim.G.paused = false; }); await page.waitForTimeout(600);
  check('peace: the clock waits for the treaty', await G(h => Sim.G.hour === h, hp));
  const left0 = await G(() => Peace.view(Sim.G.peace).left);
  const pid = await G(() => +document.querySelector('#modal [data-pz]:not([disabled])').dataset.pz);
  await clickEl(page, `#modal [data-pz="${pid}"]`);
  check('peace: taking a province spends points', await waitFor(page, l => Peace.view(Sim.G.peace).left < l && !!document.querySelector('#modal [data-pzu]'), left0, 1500));
  await clickEl(page, `#modal [data-pzu="${pid}"]`);
  check('peace: giving it back refunds them', await waitFor(page, l => Peace.view(Sim.G.peace).left === l, left0, 1500));
  await clickEl(page, '#modal [data-pzd="repar"]');
  await clickEl(page, '#modal [data-pzauto]');
  const plan = await G(() => { const c = Sim.G.peace; return { mine: Object.keys(c.taken).filter(k => c.taken[k] === 'ITA').map(Number), repar: c.repar.length, puppet: c.puppet }; });
  check('peace: Pick for me spends the rest', plan.mine.length >= 2 && plan.repar >= 1, JSON.stringify(plan));
  const gold0 = await G(() => Sim.G.countries.ITA.eco.gold);
  await clickEl(page, '#modal [data-pzdone]');
  const signed = await G(p => ({ own: p.mine.every(id => Sim.G.owner[id] === 'ITA'), open: !!Sim.G.peace, treaty: (Sim.G.treaties || [])[0], eth: Sim.G.countries.ETH.alive, over: Sim.G.countries.ETH.overlord, left: Sim.MAP.provs.filter(q => Sim.G.owner[q.id] === 'ETH').length, repar: (Sim.G.repar || []).filter(r => r.from === 'ETH' && r.to === 'ITA').length }), plan);
  check('peace: signing hands over the land', signed.own && !signed.open && !!signed.treaty, signed.treaty && signed.treaty.text);
  check('peace: the loser keeps the rest, or is gone if nothing is left', signed.eth ? signed.left > 0 : signed.left === 0, JSON.stringify(signed));
  check('peace: reparations are paid every day', await G(g0 => { const e0 = Sim.G.countries.ETH.alive ? Sim.G.countries.ETH.eco.gold : 0; for (let i = 0; i < 24 * 5; i++) Sim.hourTick(); while (Events.open().length) Events.choose(Events.open()[0].n, 0); return !Sim.G.countries.ETH.alive || (Sim.G.repar || []).some(r => r.from === 'ETH'); }, gold0));
  check('peace: the treaty shows in the Politics tab', await G(() => { document.getElementById('modal').hidden = true; return true; }) && (await clickEl(page, '.tab[data-tab="gov"]'), await waitFor(page, () => /Treaty of/.test(document.getElementById('rp-body').innerText), null, 1500)));
  // a war between AI nations ends in a treaty without asking the player
  const aiPeace = await G(() => { const S = Sim.G; Sim.declareWar('GER', 'CZE', true, { breakPact: true }); const cz = Sim.MAP.provs.filter(p => p.core === 'CZE' && p.home); cz.slice(0, Math.ceil(cz.length * 0.8)).forEach(p => { S.owner[p.id] = 'GER'; }); S.ownVer++; for (let i = 0; i < 48; i++) Sim.hourTick(); return { open: !!S.peace, treaty: (S.treaties || []).find(t => t.loser === 'CZE'), ger: Sim.MAP.provs.filter(p => p.core === 'CZE' && S.owner[p.id] === 'GER').length }; });
  check('peace: AI wars end in treaties on their own', !aiPeace.open && !!aiPeace.treaty && aiPeace.ger > 0, aiPeace.treaty && aiPeace.treaty.text);
  check('politics: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// the main menu: its sheets, the greyed-out Join game, and the options that stick
async function menuRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  check('sound: stays silent until the first click', await page.evaluate(() => !Sound.ctx));
  check('menu: the painting is drawn behind the menu', await page.evaluate(() => { const c = document.getElementById('bg-paint'), d = c.getContext('2d').getImageData(960, 700, 1, 1).data; return !c.hidden && d[3] > 0; }));
  check('menu: the battle film plays behind the menu', await waitFor(page, () => { const v = document.getElementById('bg-video'); return !v.hidden && !v.paused && v.currentTime > 0.2 && v.classList.contains('on'); }, null, 8000), await page.evaluate(() => { const v = document.getElementById('bg-video'); return JSON.stringify({ hidden: v.hidden, paused: v.paused, t: v.currentTime, src: v.currentSrc, err: v.error && v.error.code, ready: v.readyState }); }));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/menu-film.png') });
  await clickEl(page, '#mm-join');
  check('menu: Join game opens the online play sheet', await waitFor(page, () => !!document.getElementById('mp-code') || /web version/.test(document.getElementById('sheet').textContent), null, 1500));
  await page.keyboard.press('Escape');
  check('menu: no Continue without a save', await page.evaluate(() => document.getElementById('mm-continue').hidden));
  await clickEl(page, '#mm-load');
  check('menu: Load game opens its sheet', await waitFor(page, () => !document.getElementById('sheet').hidden && /Load game/.test(document.getElementById('sheet').textContent)));
  await clickEl(page, '#mm-options');
  check('menu: Options shows the controls', await waitFor(page, () => /Move the map/.test(document.getElementById('sheet').textContent) && !!document.getElementById('opt-pan')));
  await clickEl(page, '[data-otab="graphics"]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#opt-bg', { name: 'bg.png', mimeType: 'image/png', buffer: png });
  check('menu: your own picture replaces the painting', await waitFor(page, () => !document.getElementById('bg-img').hidden && document.getElementById('bg-paint').hidden && document.getElementById('bg-video').hidden && /^data:image/.test(document.getElementById('bg-img').src), null, 2000));
  await clickEl(page, '#opt-paint');
  check('menu: Battle film brings the film back', await waitFor(page, () => document.getElementById('bg-img').hidden && !document.getElementById('bg-paint').hidden && !document.getElementById('bg-video').hidden && !document.getElementById('bg-video').paused, null, 2000));
  await page.evaluate(() => { const r = document.getElementById('opt-ui'); r.value = 115; r.dispatchEvent(new Event('change')); });
  check('menu: interface size is kept', await page.evaluate(() => Menu.prefs().uiSize === 115 && document.getElementById('hud').style.zoom === '1.15' && JSON.parse(localStorage.getItem('ironmeridian.prefs')).uiSize === 115));
  await page.evaluate(() => Menu.setPref('uiSize', 100));
  check('sound: starts after the first click, menu tune playing', await waitFor(page, () => Sound.ctx && Sound.ctx.state === 'running' && Sound._song.key === 'menu', null, 3000), await page.evaluate(() => JSON.stringify({ st: Sound.ctx && Sound.ctx.state, key: Sound._song.key })));
  await clickEl(page, '[data-otab="sound"]');
  await page.evaluate(() => { const r = document.querySelector('[data-vol="volMusic"]'); r.value = 30; r.dispatchEvent(new Event('change')); });
  await clickEl(page, '[data-pref="soundOn"][data-v="0"]');
  check('sound: Options has volume and mute, and they are kept', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('ironmeridian.prefs')); return document.querySelectorAll('[data-vol]').length === 3 && p.volMusic === 30 && p.soundOn === false; }));
  await clickEl(page, '[data-pref="soundOn"][data-v="1"]');
  await clickEl(page, '[data-otab="game"]');
  await clickEl(page, '[data-pref="pauseWar"][data-v="0"]');
  await clickEl(page, '#mm-credits');
  check('menu: Credits opens', await waitFor(page, () => /Credits/.test(document.getElementById('sheet').textContent)));
  await page.keyboard.press('Escape');
  check('menu: Esc closes the sheet', await waitFor(page, () => document.getElementById('sheet').hidden));
  await toPicker(page, 'napoleonic-1805');
  check('menu: New game in 1805 opens that era', await page.evaluate(() => !Eras.isBase() && Eras.info().id === 'napoleonic-1805'));
  await clickEl(page, '#st-back');
  check('menu: the picker goes back to the menu', await waitFor(page, () => !document.getElementById('menu').hidden && document.getElementById('start').hidden));
  await toPicker(page, 'ww2-1936');
  await clickEl(page, '#st-play');
  check('menu: a new game takes the Game options', await waitFor(page, () => Sim.G && Sim.G.settings.pauseWar === false && Eras.isBase(), null, 2000));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/hud.png') });
  check('goals: the era sets a main goal and two side goals', await page.evaluate(() => { const g = Goals.info(); return !!g && g.main.target > g.startProvs && g.sides.length === 2 && g.deadline > Sim.G.hour; }), await page.evaluate(() => JSON.stringify(Goals.info() && { t: Goals.info().main.target, s: Goals.info().startProvs, dl: Goals.info().deadline })));
  check('goals: a side goal counts only what the player adds', await page.evaluate(() => Goals.info().sides.every(s => Goals.progress(s).now === 0 || s.base === 0)));
  check('goals: the goal bar shows on the map and opens the panel', await page.evaluate(() => !document.getElementById('goalpill').hidden));
  await clickEl(page, '#goalpill');
  check('goals: the panel lists the goals and the date', await waitFor(page, () => /Your goals/.test(document.getElementById('modal').textContent) && /Main goal/.test(document.getElementById('modal').textContent), null, 1500));
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  check('tutorial: the first game opens with the tutorial', await waitFor(page, () => UI._coach() === 0 && (!document.getElementById('coach').hidden || !document.getElementById('evside').hidden || !document.getElementById('offer').hidden), null, 2000), await page.evaluate(() => JSON.stringify({ step: UI._coach(), hidden: document.getElementById('coach').hidden, ev: !document.getElementById('evside').hidden })));
  await clickEl(page, '#co-skip');
  check('tutorial: Skip closes it and it stays closed', await page.evaluate(() => document.getElementById('coach').hidden && Menu.prefs().taught === true && JSON.parse(localStorage.getItem('ironmeridian.prefs')).taught === true));
  const wonUI = await page.evaluate(() => { const g = Sim.G; for (let p = 0; p < g.owner.length; p++) if (g.owner[p] !== g.player) g.owner[p] = g.player; Goals.daily(); return { won: Goals.info().won, paused: g.paused, says: (document.querySelector('#modal .panel') || {}).innerText || '' }; });
  check('goals: reaching the main goal wins the era and the game can go on', wonUI.won && wonUI.paused && /reached its goal/.test(wonUI.says), JSON.stringify(wonUI).slice(0, 120));
  await clickEl(page, '#modal [data-x="ok"]');
  check('goals: Keep playing carries on', await waitFor(page, () => document.getElementById('modal').hidden && !!Sim.G && !document.getElementById('hud').hidden, null, 1500));
  check('sound: the era tune follows into the game', await waitFor(page, () => Sound._song.key === 'ww2-1936' && Sound._song.next > 0, null, 3000), await page.evaluate(() => Sound._song.key));
  await clickEl(page, '#tb-menu');
  check('sound: the Esc menu has the sound controls', await waitFor(page, () => document.querySelectorAll('#menu-sound [data-vol]').length === 3, null, 1500));
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  check('menu: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

async function mobileRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await clickEl(page, '#mm-new', { tap: true });
  await clickEl(page, '#mm-choose', { tap: true });
  await waitFor(page, () => !document.getElementById('start').hidden, null, 6000);
  await clickEl(page, '#st-play', { tap: true });
  check('phone: tap Play starts the game', await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden, null, 1500));
  await page.waitForTimeout(600);
  await clickEl(page, '#armytray .acard:nth-child(2)', { tap: true });
  check('phone: tap selects an army', await waitFor(page, () => document.querySelector('#armytray .acard.sel')));
  await clickEl(page, '.tab[data-tab="recruit"]', { tap: true });
  check('phone: tap switches tab', await waitFor(page, () => document.querySelector('.tab[data-tab="recruit"]').classList.contains('on')));
  const bar = await page.evaluate(() => { const t = document.getElementById('topbar').getBoundingClientRect(), r = document.getElementById('rail').getBoundingClientRect(), m = document.getElementById('tb-menu').getBoundingClientRect(); return { top: Math.round(t.height), rail: Math.round(r.top), menuRow: Math.round(m.top) }; });
  check('phone: top bar fits in two rows', bar.top <= 92 && bar.menuRow < 48 && bar.rail >= bar.top - 1, JSON.stringify(bar));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('phone: no horizontal page scroll', !overflow);
  check('phone: no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/phone.png') });
  await ctx.close();
}

// Without --only (and without --serial) the parts run side by side, each in its own browser, a few at a time.
const SECTIONS = ['diplomacy', 'desktop', 'economy', 'eras', 'navy', 'politics', 'menu', 'mobile'];   // longest first
const REPORT = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
async function parallelRun() {
  const { spawn } = require('child_process');
  const os = require('os');
  const jobs = args.includes('--jobs') ? +args[args.indexOf('--jobs') + 1] : Math.max(1, Math.min(4, os.cpus().length));
  const pass = args.filter((a, i) => ['--quick'].includes(a) || ['--seed', '--browser'].includes(args[i - 1]) || ['--seed', '--browser'].includes(a));
  console.log(`Playtest (${BROWSER}, seed ${SEED}${QUICK ? ', quick' : ''}, ${jobs} parts at a time)`);
  const t0 = Date.now(), queue = SECTIONS.slice(), all = [], times = {};
  async function worker() {
    while (queue.length) {
      const k = queue.shift(), rep = path.resolve(__dirname, '.part-' + k + '.json'), s0 = Date.now();
      let out = '';
      const code = await new Promise(res => {
        const ch = spawn(process.execPath, [__filename, '--only', k, '--report', rep, ...pass], { cwd: process.cwd() });
        ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
        ch.on('close', res);
      });
      times[k] = Math.round((Date.now() - s0) / 1000);
      let part = [];
      try { part = JSON.parse(fs.readFileSync(rep, 'utf8')).results; fs.unlinkSync(rep); } catch { part = [{ name: k + ': part finished', ok: false, detail: 'exit ' + code + ' ' + out.split('\n').slice(-3).join(' ') }]; }
      all.push(...part);
      console.log(`\n── ${k} (${times[k]} s)\n` + out.split('\n').filter(l => /^  (ok|FAIL)/.test(l)).join('\n'));
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  const failed = all.filter(r => !r.ok), secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.resolve(__dirname, 'last-report.json'), JSON.stringify({ when: new Date().toISOString(), browser: BROWSER, seed: SEED, seconds: secs, parts: times, results: all }, null, 1));
  console.log(failed.length ? `\n${failed.length} of ${all.length} checks failed in ${secs} s` + failed.map(r => '\n  FAIL ' + r.name + (r.detail ? ' — ' + r.detail : '')).join('') : `\nAll ${all.length} checks passed in ${secs} s`);
  process.exit(failed.length ? 1 : 0);
}

(async () => {
  if (!fs.existsSync(FILE.slice(7))) { console.error('Build first: python3 build.py'); process.exit(2); }
  if (!ONLY && !args.includes('--serial')) return parallelRun();
  const launcher = pw[BROWSER];
  let browser;
  try { browser = await launcher.launch(); } catch (e) { console.error('Cannot launch ' + BROWSER + ': ' + e.message.split('\n')[0]); process.exit(2); }
  // every page gets the economy invariant checker
  const np = browser.newPage.bind(browser), nc = browser.newContext.bind(browser);
  browser.newPage = async o => { const p = await np(o); await p.addInitScript(ECO_INVARIANTS); return p; };
  browser.newContext = async o => { const c = await nc(o); await c.addInitScript(ECO_INVARIANTS); return c; };
  console.log(`Playtest (${BROWSER}, seed ${SEED}${QUICK ? ', quick' : ''})`);
  const runs = { menu: menuRun, desktop: desktopRun, economy: economyRun, navy: navyRun, diplomacy: diplomacyRun, politics: politicsRun, eras: erasRun, mobile: mobileRun };
  try { for (const [k, fn] of Object.entries(runs)) if (!ONLY || ONLY.split(',').includes(k)) await fn(browser); }
  catch (e) { check('harness: completed without crashing', false, e.message.split('\n')[0]); }
  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(REPORT || path.resolve(__dirname, 'last-report.json'), JSON.stringify({ when: new Date().toISOString(), browser: BROWSER, seed: SEED, results }, null, 1));
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
