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
  try { await desktopRun(browser); await mobileRun(browser); }
  catch (e) { check('harness: completed without crashing', false, e.message.split('\n')[0]); }
  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.resolve(__dirname, 'last-report.json'), JSON.stringify({ when: new Date().toISOString(), browser: BROWSER, seed: SEED, results }, null, 1));
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
