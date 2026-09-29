#!/usr/bin/env node
// Automated playtest: drives the built game in a real browser like a player would,
// clicking once per action and checking the action took effect. Reports dead clicks,
// script errors, broken game-state invariants and frame-time spikes.
//   node tests/playtest.js [--quick] [--seed N] [--browser chromium|firefox]
// Exit code 1 when any check fails. Run after every change: build, playtest, fix, repeat.
'use strict';
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const SEED = +(args[args.indexOf('--seed') + 1] || 7) || 7;
const BROWSER = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : 'chromium';
const FILE = 'file://' + path.resolve(__dirname, '../dist/iron-meridian.html');
let rnd = SEED; const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rand() * a.length)];

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : '')); }

async function clickEl(page, sel, opts = {}) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
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
const waitFor = async (page, fn, arg, ms = 400) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

async function desktopRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(FILE);
  check('boot: loading screen clears', await waitFor(page, () => document.getElementById('loading').hidden, null, 15000));
  check('boot: start screen visible', await page.evaluate(() => !document.getElementById('start').hidden));

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
  for (const t of ['recruit', 'diplo', 'wars', 'log', 'army', 'recruit', 'army']) {
    await clickEl(page, `.tab[data-tab="${t}"]`);
    if (!(await waitFor(page, t => document.querySelector(`.tab[data-tab="${t}"]`).classList.contains('on'), t))) dead++;
    await page.waitForTimeout(120);
  }
  check('tabs: switch on first click', dead === 0, dead + ' dead clicks');

  // --- order buttons ---
  await clickEl(page, '#armytray .acard:nth-child(1)');
  await page.waitForTimeout(200);
  dead = 0;
  for (let i = 0; i < 6; i++) {
    await clickEl(page, '#rp-body [data-o="move"]');
    if (!(await waitFor(page, () => !document.getElementById('hint').hidden))) dead++;
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
    await clickEl(page, '#rp-body [data-o="move"]');
    await clickWorld(page, mv.x, mv.y);
    check('orders: Move + one map click gives a route', await waitFor(page, m => { const a = Sim.army(m.id); return a && (a.path.length > 0 || a.prov === m.target); }, mv, 600));
  }

  // --- map clicks ---
  dead = 0;
  for (let i = 0; i < (QUICK ? 5 : 12); i++) {
    const [W, H] = await page.evaluate(() => Render.size);
    const sx = 360 + rand() * (W - 760), sy = 120 + rand() * (H - 320);
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
      const want = await page.evaluate(([x, y]) => { const w = Render.screenToWorld(x, y); return Render.counterAt(x, y) ? -2 : Render.provinceAt(w[0], w[1]); }, [sx, sy]);
      if (want >= 0) { await page.keyboard.press('Escape'); await page.mouse.click(sx, sy); ok = await waitFor(page, w => Render.state.selProv === w, want); }
      else ok = true;
    }
    check('map: a click under a notification reaches the map', ok);
  }

  // --- the side panel folds and opens with one click on its tab ---
  {
    const t = await page.evaluate(() => document.querySelector('.tab.on').dataset.tab);
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
    await clickWorld(page, war.x + 0.2, war.y + 0.5);
    const selOk = await waitFor(page, p => Render.state.selProv >= 0, war.prov);
    const warBtn = await page.locator('#lp-war').count();
    check('war: Declare war button shown for a neighbour', selOk && warBtn > 0);
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

  // --- long run at top speed with frame timing ---
  await page.evaluate(() => { Sim.G.speed = 5; Sim.G.paused = false; Sim.G.settings.autoPause = false; window.__ft = []; let last = performance.now(); (function f(t) { window.__ft.push(t - last); last = t; if (window.__ft.length < 100000) requestAnimationFrame(f); })(performance.now()); });
  const runMs = QUICK ? 6000 : 20000;
  const hStart = await page.evaluate(() => Sim.G.hour);
  // pan and zoom during the run, as a player would
  for (let t = 0; t < runMs; t += 1000) {
    await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(700 + (rand() - 0.5) * 300, 450 + (rand() - 0.5) * 200, { steps: 6 }); await page.mouse.up();
    await page.mouse.wheel(0, (rand() - 0.5) * 600);
    await page.waitForTimeout(1000);
  }
  const perf = await page.evaluate(() => { const f = window.__ft.slice(5).sort((a, b) => a - b); return { n: f.length, p50: f[Math.floor(f.length * 0.5)], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1], over250: f.filter(x => x > 250).length }; });
  const days = (await page.evaluate(() => Sim.G.hour) - hStart) / 24;

  // --- 3D troop figures: visible, animated, and cheap to draw even over a crowded front ---
  {
    const figs = await page.evaluate(async () => {
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
      return Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0;
    });
    if (moved !== null) check('figures: moving troops glide between provinces', moved);
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
    return bad;
  });
  check('state: invariants hold', inv.length === 0, inv.slice(0, 5).join('; '));
  check('errors: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.mkdirSync(path.resolve(__dirname, 'shots'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, 'shots/desktop.png') });
  await page.close();
}

// ---------- diplomacy: every action through the Nations tab, AI answers, then a long AI run ----------
async function diplomacyRun(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await clickEl(page, '#start .ncard[data-tag="GER"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  // plenty of political power so every action can be tried; relations are left as they are
  await page.evaluate(() => { Sim.G.countries.GER.pp = 900; Sim.G.countries.GER.equipment = 5000; });
  const openNation = async tag => {
    if (!(await page.locator('.tab[data-tab="diplo"].on').count())) await clickEl(page, '.tab[data-tab="diplo"]');
    if (await page.locator('[data-dipback]').count()) await clickEl(page, '[data-dipback]');
    await page.fill('#dp-search', '');
    await page.evaluate(() => { document.getElementById('dp-search').dispatchEvent(new Event('input')); });
    return clickEl(page, `[data-dip="${tag}"]`);
  };
  const act = async key => { const ok = await clickEl(page, `[data-act="${key}"]:not([disabled])`); await page.waitForTimeout(150); return ok; };
  const G = (fn, arg) => page.evaluate(fn, arg);

  check('diplomacy: nation page opens from the Nations tab', await openNation('ITA') && await waitFor(page, () => !!document.querySelector('[data-act="improve"]')));
  const r0 = await G(() => Diplo.rel('GER', 'ITA'));
  await act('improve');
  check('diplomacy: improve relations raises relations', await G(() => Diplo.rel('GER', 'ITA')) > r0);

  await act('aid');
  check('diplomacy: military aid ships equipment', await G(() => Sim.G.countries.ITA.equipment) > 0 && await G(() => Sim.G.countries.GER.equipment < 5000));

  await act('trade');
  check('diplomacy: trade proposal gets an answer', await G(() => Sim.G.dip.trade[Sim.pairKey('GER', 'ITA')] > Sim.G.hour || Sim.G.dip.cd['trade|GER|ITA'] > Sim.G.hour));

  // faction: create, invite a friend (relations raised so the answer is yes), and check they fight together
  await openNation('ITA');
  if (await page.locator('[data-dipback]').count()) await clickEl(page, '[data-dipback]');
  await act('create');
  check('diplomacy: faction created', await G(() => !!Sim.factionOf('GER')));
  await G(() => { Sim.G.dip.rel[Sim.pairKey('GER', 'ITA')] = 80; });
  await openNation('ITA'); await act('invite');
  check('diplomacy: invited nation joins the faction', await G(() => Sim.allied('GER', 'ITA') && Sim.factionOf('ITA') === Sim.factionOf('GER')));

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
  const prop = await G(() => { const t = Object.values(Sim.G.countries).find(c => c.alive && c.tag !== 'GER' && !Sim.atWar(c.tag, 'GER') && !(Sim.G.dip.trade[Sim.pairKey(c.tag, 'GER')] > Sim.G.hour) && Diplo.can('trade', c.tag, 'GER').ok); if (!t) return null; t.pp = 50; Diplo.act('trade', t.tag, 'GER'); return t.tag; });
  if (prop) {
    check('diplomacy: an AI proposal opens a dialog', await waitFor(page, () => !document.getElementById('modal').hidden));
    await clickEl(page, '#modal [data-x="yes"]');
    check('diplomacy: accepting the proposal takes effect', await waitFor(page, t => Sim.G.dip.trade[Sim.pairKey(t, 'GER')] > Sim.G.hour, prop));
  }

  // let the AI run its own diplomacy for a while, answering any dialogs, then check the rules still hold
  await G(() => { Sim.G.settings.autoPause = false; Sim.G.speed = 5; Sim.G.paused = false; Sim.G.hour += 300 * 24; });
  const t0 = Date.now();
  while (Date.now() - t0 < (QUICK ? 6000 : 15000)) {
    if (await page.locator('#modal:not([hidden]) [data-x="no"]').count()) await clickEl(page, '#modal [data-x="no"]');
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
    return { bad, factions: g.dip.factions.map(f => f.name + ' (' + f.members.length + ')'), pacts: Object.keys(g.dip.pacts).length, trades: Object.keys(g.dip.trade).length };
  });
  check('diplomacy: the AI forms factions and treaties', dip.factions.length > 1 || dip.pacts + dip.trades > 3, dip.factions.join(', ') + ` · ${dip.pacts} pacts · ${dip.trades} trade deals`);
  check('diplomacy: rules hold after a long AI run', dip.bad.length === 0, dip.bad.slice(0, 4).join('; '));
  check('diplomacy: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/diplomacy.png') });
  await page.close();
}

async function mobileRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await clickEl(page, '#st-play', { tap: true });
  check('phone: tap Play starts the game', await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden, null, 1500));
  await page.waitForTimeout(600);
  await clickEl(page, '#armytray .acard:nth-child(2)', { tap: true });
  check('phone: tap selects an army', await waitFor(page, () => document.querySelector('#armytray .acard.sel')));
  await clickEl(page, '.tab[data-tab="recruit"]', { tap: true });
  check('phone: tap switches tab', await waitFor(page, () => document.querySelector('.tab[data-tab="recruit"]').classList.contains('on')));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('phone: no horizontal page scroll', !overflow);
  check('phone: no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.resolve(__dirname, 'shots/phone.png') });
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(FILE.slice(7))) { console.error('Build first: python3 build.py'); process.exit(2); }
  const launcher = pw[BROWSER];
  let browser;
  try { browser = await launcher.launch(); } catch (e) { console.error('Cannot launch ' + BROWSER + ': ' + e.message.split('\n')[0]); process.exit(2); }
  console.log(`Playtest (${BROWSER}, seed ${SEED}${QUICK ? ', quick' : ''})`);
  try { await desktopRun(browser); await diplomacyRun(browser); await mobileRun(browser); }
  catch (e) { check('harness: completed without crashing', false, e.message.split('\n')[0]); }
  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.resolve(__dirname, 'last-report.json'), JSON.stringify({ when: new Date().toISOString(), browser: BROWSER, seed: SEED, results }, null, 1));
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
