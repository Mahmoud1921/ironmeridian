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
  // scroll it into view (again if a panel refresh moved it meanwhile), like a person scrolling a list
  let box = null;
  for (let i = 0; i < 4; i++) {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
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
const waitFor = async (page, fn, arg, ms = 400) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

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
  return bad;
};`;

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
  if (process.env.DEBUG) await page.evaluate(() => { window.__ev2 = []; ['pointerdown', 'click'].forEach(t => document.addEventListener(t, e => window.__ev2.push(t + ' ' + (e.target.dataset?.o || e.target.id || e.target.className || e.target.tagName) + ' ' + Math.round(e.clientY)), true)); new MutationObserver(() => window.__ev2.push('mut')).observe(document.getElementById('rp-body'), { childList: true }); });
  await clickEl(page, '#armytray .acard:nth-child(1)');
  await page.waitForTimeout(200);
  dead = 0;
  for (let i = 0; i < 6; i++) {
    await clickEl(page, '#rp-body [data-o="move"]');
    if (!(await waitFor(page, () => !document.getElementById('hint').hidden))) {
      dead++;
      if (process.env.DEBUG) console.log('    dead move', await page.evaluate(() => { const b = document.querySelector('#rp-body [data-o="move"]'); const r = b && b.getBoundingClientRect(); return { btn: !!b, dis: b && b.disabled, y: r && Math.round(r.y), st: document.getElementById('rp-body').scrollTop, sel: UI._selected(), ev: (window.__ev2 || []).slice(-6) }; }));
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

    // smooth marching: follow one army frame by frame; it should advance a little every frame,
    // never jump or step backwards, even as it crosses from one province into the next
    const smooth = await page.evaluate(async () => {
      const G = Sim.G;
      G.speed = 3; G.paused = false;
      const cands = G.armies.filter(x => x.owner === G.player && !x.battle && x.units.length);
      let a = null;
      for (const c of cands) {
        const lm = Sim.MAP.provs[c.prov].lm;
        const targets = Sim.MAP.provs.filter(p => G.owner[p.id] === G.player && p.lm === lm && Sim.distKm(c.prov, p.id) > 250).sort((p, q) => Sim.distKm(c.prov, p.id) - Sim.distKm(c.prov, q.id)).slice(0, 12);
        for (const t of targets) if (Sim.orderMove(c, t.id, 'redeploy') && c.path.length > 2) { a = c; break; }
        if (a) break;
      }
      if (!a) return null;
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
          if (performance.now() - t0 < 3500 && a.path.length) requestAnimationFrame(f); else done();
        })();
      });
      const s = steps.filter(x => x > 0).sort((x, y) => x - y);
      return { frames: steps.length, still: steps.filter(x => x === 0).length, back, med: s[Math.floor(s.length / 2)] || 0, max: s[s.length - 1] || 0, crossed };
    });
    check('movement: an army can be sent on a long march', !!smooth);
    if (smooth) {
      check('movement: marching troops move every frame', smooth.frames > 20 && smooth.still / smooth.frames < 0.15, `${smooth.frames - smooth.still}/${smooth.frames} frames moved`);
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
  await page.goto(FILE);
  await waitFor(page, () => document.getElementById('loading').hidden, null, 15000);
  await clickEl(page, '#start .ncard[data-tag="GER"]');
  await clickEl(page, '#st-play');
  await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden);
  const G = (fn, arg) => page.evaluate(fn, arg);
  await G(() => { const c = Sim.G.countries.GER; c.pp = 900; c.eco.gold = 5000; Sim.G.settings.autoPause = false; });
  // one game day so every nation has figures to show
  await G(() => { for (let h = 0; h < 24; h++) Sim.hourTick(); });

  // Economy tab
  await clickEl(page, '.tab[data-tab="econ"]');
  check('economy: tab shows the six goods', await waitFor(page, () => document.querySelectorAll('#rp-body table.goods tbody tr[data-good]').length === 5 && /Gold/.test(document.getElementById('tb-stats').textContent), null, 1500));
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

  // buy fuel from a nation with a surplus, through the Nations tab trade form (after freeing a trade slot)
  await G(() => { for (const d of Economy.dealsOf('GER')) Economy.cancel(d.id, null, 'gone'); });
  const seller = await G(() => { const t = Object.values(Sim.G.countries).filter(c => c.alive && c.tag !== 'GER' && !c.eco.none && !Sim.atWar(c.tag, 'GER') && Economy.balance(c.tag, 'fuel') > 3 && Economy.canDeal('GER', c.tag, null).ok).sort((a, b) => Economy.balance(b.tag, 'fuel') - Economy.balance(a.tag, 'fuel'))[0]; if (!t) return null; Sim.G.dip.rel[Sim.pairKey('GER', t.tag)] = 60; return t.tag; });
  if (seller) {
    await clickEl(page, '.tab[data-tab="diplo"]');
    await clickEl(page, `[data-dip="${seller}"]`);
    await waitFor(page, () => !!document.querySelector('[data-tf]'), null, 1500);
    await clickEl(page, '[data-tf="buy"]');
    await clickEl(page, '[data-tfg="fuel"]');
    for (let i = 0; i < 3; i++) await clickEl(page, '[data-tfp="0.05"]');
    const form = await G(() => document.querySelector('[data-act="trade"]')?.disabled === false);
    await clickEl(page, '[data-act="trade"]:not([disabled])');
    const deal = await waitFor(page, t => Sim.G.dip.trade.some(d => d.from === t && d.to === 'GER' && d.good === 'fuel'), seller, 1500);
    check('trade: a deal is signed through the trade form', deal, deal ? '' : (form ? await G(() => Sim.G.log[0]?.text) : 'offer button disabled: ' + await G(() => document.querySelector('[data-act="trade"]')?.nextElementSibling?.textContent)));
    if (deal) {
      await G(() => { for (let h = 0; h < 24; h++) Sim.hourTick(); });
      const got = await G(t => { const d = Sim.G.dip.trade.find(d => d.from === t && d.to === 'GER' && d.good === 'fuel'); return { delivered: d && d.delivered, imp: Sim.G.countries.GER.eco.imp.fuel }; }, seller);
      check('trade: the deal delivers goods', got.delivered > 0 && got.imp >= got.delivered - 0.01, JSON.stringify(got));
      await clickEl(page, '.tab[data-tab="econ"]');
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
  await act('trade');
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
  await G(() => { Sim.G.settings.autoPause = false; Sim.G.speed = 5; Sim.G.paused = false; Sim.G.hour += 300 * 24; });
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
  check('eras: era choices shown on the start screen', eras.length >= 6 && await page.locator('#st-eras button').count() === eras.length, eras.map(e => e.label).join(', '));
  const modern = ['tanks', 'motorized', 'mechanized', 'paratroopers', 'recon'];
  for (const era of eras) {
    if (era.base) continue;
    await clickEl(page, `#st-eras button[data-era="${era.id}"]`);
    const picked = await waitFor(page, id => document.querySelector(`#st-eras button[data-era="${id}"]`)?.classList.contains('sel'), era.id, 3000);
    const tag = await page.evaluate(() => document.querySelector('#st-majors .ncard')?.dataset.tag);
    if (tag) await clickEl(page, `#start .ncard[data-tag="${tag}"]`);
    await clickEl(page, '#st-play');
    const started = await waitFor(page, () => Sim.G && !document.getElementById('hud').hidden, null, 3000);
    const res = await page.evaluate(async () => {
      const G = Sim.G; G.settings.autoPause = false; G.speed = 5; G.paused = false;
      await new Promise(r => setTimeout(r, 5000));
      const units = new Set(); G.armies.forEach(a => a.units.forEach(u => units.add(u.type)));
      return { date: document.getElementById('tb-date').textContent, days: G.hour / 24, units: [...units], armies: G.armies.length, flag: !!document.querySelector('#tb-nation svg') };
    });
    const bad = res.units.filter(u => modern.includes(u));
    const eco = await page.evaluate(() => { const c = Sim.G.countries[Sim.G.player]; return { goods: document.querySelectorAll('.tab[data-tab="econ"]').length, prod: Object.values(c.eco.prod).reduce((s, v) => s + v, 0), branches: Tech.branchesFor(Sim.G.player).length, bad: ecoInvariants() }; });
    check(`eras: ${era.label} has an economy and a tech tree`, eco.prod > 0 && eco.branches === 5 && eco.bad.length === 0, `${eco.branches} branches` + (eco.bad.length ? ' · ' + eco.bad.slice(0, 3).join('; ') : ''));
    if (era.id.startsWith('greatwar')) {
      // Landships wait for September 1916 even when fully researched
      const gate = await page.evaluate(() => {
        const me = Sim.G.player, c = Sim.G.countries[me];
        const land = Tech.branchesFor(me)[0].tiers[3];
        const x = Tech.info(land.id);
        c.techs.push(...Tech.branchesFor(me)[0].tiers.slice(0, 3).map(t => Array.isArray(t) ? t[0].id : t.id)); Tech.invalidate(me);
        c.rs.slots = [{ id: land.id, pts: x.cost }, null];
        Tech.daily();
        const waits = c.rs.slots[0] && c.rs.slots[0].id === land.id && !c.techs.includes(land.id);
        Sim.G.hour += Math.ceil((Date.UTC(1916, 8, 16) - Sim.dateTime()) / 3600e3);
        Tech.daily();
        return { name: land.name, waits, done: c.techs.includes(land.id), unit: Sim.canRecruit(me, 'landships') || Tech.unlocked(me, 'landships') };
      });
      check('eras: a date-gated tech waits for its date', gate.waits && gate.done && gate.unit, JSON.stringify(gate));
    }
    check(`eras: ${era.label} plays`, picked && started && res.days > 5 && res.armies > 0 && res.flag, `${res.date}, ${res.armies} armies`);
    if (!era.id.startsWith('greatwar')) check(`eras: ${era.label} has only period units`, bad.length === 0, bad.join(', '));
    await boot();
  }
  check('eras: no script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
  // every page gets the economy invariant checker
  const np = browser.newPage.bind(browser), nc = browser.newContext.bind(browser);
  browser.newPage = async o => { const p = await np(o); await p.addInitScript(ECO_INVARIANTS); return p; };
  browser.newContext = async o => { const c = await nc(o); await c.addInitScript(ECO_INVARIANTS); return c; };
  console.log(`Playtest (${BROWSER}, seed ${SEED}${QUICK ? ', quick' : ''})`);
  try { await desktopRun(browser); await economyRun(browser); await diplomacyRun(browser); await erasRun(browser); await mobileRun(browser); }
  catch (e) { check('harness: completed without crashing', false, e.message.split('\n')[0]); }
  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.resolve(__dirname, 'last-report.json'), JSON.stringify({ when: new Date().toISOString(), browser: BROWSER, seed: SEED, results }, null, 1));
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
