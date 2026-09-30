#!/usr/bin/env node
// Multiplayer playtest: two browser pages, one hosting and one joining with the code, like two friends would.
// The real game loads PeerJS from the internet; here a stand-in with the same API carries the messages between
// the two pages through a BroadcastChannel, so the test runs offline. Everything above that layer is the game's
// own code: the menu, the lobby, the commands and the state sync.
//   node tests/multiplayer.js
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : '')); }
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const waitFor = async (page, fn, arg, ms = 4000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

// a PeerJS look-alike over BroadcastChannel: new Peer(id), peer.connect(id), conn.send/on('data'), errors by type
const MOCK = `(() => {
  const bc = new BroadcastChannel('mock-peerjs');
  const peers = {};
  const rid = () => Math.random().toString(36).slice(2, 10);
  class Emitter { constructor() { this._h = {}; } on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; } emit(e, ...a) { (this._h[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(err); } }); } }
  class Conn extends Emitter {
    constructor(me, other, cid) { super(); this.me = me; this.peer = other; this.connectionId = cid; this.open = false; }
    send(data) { if (this.open) bc.postMessage({ k: 'data', cid: this.connectionId, to: this.peer, data }); }
    close() { if (!this.open) return; this.open = false; bc.postMessage({ k: 'close', cid: this.connectionId, to: this.peer }); this.emit('close'); }
  }
  class Peer extends Emitter {
    constructor(id) {
      super(); this.id = id || rid(); this.conns = {}; this.destroyed = false; this.disconnected = false;
      const self = this;
      bc.postMessage({ k: 'who', id: this.id, from: this.id + '#' + rid() });
      this._probe = setTimeout(() => { if (self._taken) { self.emit('error', { type: 'unavailable-id' }); return; } peers[self.id] = self; bc.postMessage({ k: 'here', id: self.id }); self.emit('open', self.id); }, 150);
    }
    connect(to) {
      const c = new Conn(this.id, to, rid()); this.conns[c.connectionId] = c;
      c._wait = setTimeout(() => { if (!c.open) this.emit('error', { type: 'peer-unavailable' }); }, 1500);
      bc.postMessage({ k: 'connect', cid: c.connectionId, from: this.id, to });
      return c;
    }
    destroy() { this.destroyed = true; Object.values(this.conns).forEach(c => c.close()); delete peers[this.id]; }
    reconnect() {}
  }
  bc.onmessage = e => {
    const m = e.data;
    if (m.k === 'who' && peers[m.id]) bc.postMessage({ k: 'taken', id: m.id });
    else if (m.k === 'taken') { /* someone else has this id */ for (const p of pending) if (p.id === m.id) p._taken = true; }
    else if (m.k === 'connect' && peers[m.to]) {
      const p = peers[m.to], c = new Conn(p.id, m.from, m.cid); p.conns[m.cid] = c; c.open = true;
      p.emit('connection', c); setTimeout(() => c.emit('open'), 0);
      bc.postMessage({ k: 'accept', cid: m.cid, to: m.from });
    }
    else if (m.k === 'accept') { for (const p of Object.values(peers)) { const c = p.conns[m.cid]; if (c && p.id === m.to) { clearTimeout(c._wait); c.open = true; c.emit('open'); } } }
    else if (m.k === 'data') { for (const p of Object.values(peers)) { const c = p.conns[m.cid]; if (c && p.id === m.to && c.open) c.emit('data', m.data); } }
    else if (m.k === 'close') { for (const p of Object.values(peers)) { const c = p.conns[m.cid]; if (c && p.id === m.to && c.open) { c.open = false; c.emit('close'); } } }
  };
  const pending = [];
  const Base = Peer;
  window.Peer = function (id, o) { const p = new Base(id, o); pending.push(p); return p; };
})();`;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/dist/iron-meridian.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(MOCK);
  const errs = { host: [], guest: [] };
  const host = await ctx.newPage(), guest = await ctx.newPage();
  host.on('pageerror', e => errs.host.push(e.message)); guest.on('pageerror', e => errs.guest.push(e.message));
  try {
    // --- the host starts a new game from Join game > Host a new game ---
    await host.goto(base);
    await waitFor(host, () => !document.getElementById('menu').hidden, null, 8000);
    await host.click('#mm-join');
    check('menu: Join game opens the online play sheet', await waitFor(host, () => !!document.getElementById('mp-code')));
    await host.fill('#mp-name', 'Anna');
    await host.click('#mp-host');
    await host.click('#mm-choose');
    await waitFor(host, () => !!document.querySelector('#start .ncard'), null, 8000);
    await host.locator('#start .ncard[data-tag="GER"], #start .ncard').first().click();
    await host.locator('#st-play').click();
    check('host: the game opens to other players with a code', await waitFor(host, () => Net.role === 'host' && Net.code.length === 5, null, 6000), await host.evaluate(() => Net.status));
    const code = await host.evaluate(() => Net.code);
    const hostTag = await host.evaluate(() => Sim.G.player);
    check('host: the menu shows the code and the players', await waitFor(host, c => document.querySelector('#modal .netcode')?.textContent === c, code));
    await shot(host, '1-host-code');
    await host.evaluate(() => { document.querySelector('#modal [data-x="ok"]')?.click(); });

    // --- a friend opens the invite link, enters the lobby and picks a nation ---
    await guest.goto(base + '#join=' + code);
    check('guest: the invite link fills in the code', await waitFor(guest, c => document.getElementById('mp-code')?.value === c, code, 8000));
    await guest.fill('#mp-name', 'Ben');
    await guest.click('#mp-join');
    check('guest: joining shows the nations to pick from', await waitFor(guest, () => document.querySelectorAll('[data-mpick]').length > 10, null, 6000), await guest.evaluate(() => (document.querySelector('.flash') || {}).textContent || Net.status));
    await shot(guest, '2-pick-nation');
    const takenOk = await guest.evaluate(t => document.querySelector(`[data-mpick="${t}"]`)?.disabled, hostTag);
    check('guest: the host\'s nation is shown as taken', takenOk);
    const want = await guest.evaluate(t => [...document.querySelectorAll('[data-mpick]:not([disabled])')].map(b => b.dataset.mpick).find(x => x !== t), hostTag);
    await guest.click(`[data-mpick="${want}"]`);
    check('guest: picking a nation starts the game for the guest', await waitFor(guest, w => Sim.G && Sim.G.player === w && document.getElementById('menu').hidden && !document.getElementById('hud').hidden, want, 8000));
    check('host: sees who joined', await waitFor(host, w => Sim.G.humans && Sim.G.humans[w] && Sim.G.humans[w].name === 'Ben', want));
    check('guest: sees the same world as the host', await guest.evaluate(() => Sim.G.armies.length > 50 && Object.keys(Sim.G.countries).length > 20 && Sim.G.owner.length > 100));

    // --- orders travel to the host; the host's world comes back ---
    const move = await guest.evaluate(() => {
      const G = Sim.G, P = Sim.MAP.provs;
      const a = G.armies.find(x => x.owner === G.player && !x.path.length && P[x.prov].nb.some(n => G.owner[n] === G.player));
      if (!a) return null;
      const to = P[a.prov].nb.find(n => G.owner[n] === G.player);
      Sim.orderMove(a, to, 'move');
      return { id: a.id, to };
    });
    await guest.waitForTimeout(600); await shot(guest, '3-guest-playing');
    check('guest: the order shows at once on the guest\'s map', move && await guest.evaluate(m => Sim.army(m.id).target === m.to, move));
    check('host: the guest\'s move order arrives', move && await waitFor(host, m => { const a = Sim.army(m.id); return a && a.target === m.to && a.path.length > 0; }, move));
    check('guest: the order is still there after the host\'s next update', move && await waitFor(guest, m => !Net._held() && Sim.army(m.id).target === m.to, move));
    const hm = await host.evaluate(() => {
      const G = Sim.G, P = Sim.MAP.provs;
      const a = G.armies.find(x => x.owner === G.player && !x.path.length && P[x.prov].nb.some(n => G.owner[n] === G.player));
      const to = P[a.prov].nb.find(n => G.owner[n] === G.player);
      Sim.orderMove(a, to, 'move');
      return { id: a.id, to };
    });
    check('guest: sees the host\'s orders', await waitFor(guest, m => { const a = Sim.army(m.id); return a && a.target === m.to; }, hm));
    const cheat = await guest.evaluate(t => {
      const G = Sim.G, a = G.armies.find(x => x.owner === t && !x.path.length);
      const to = Sim.MAP.provs[a.prov].nb[0];
      Sim.orderMove(a, to, 'move');
      return { id: a.id, to };
    }, hostTag);
    await guest.waitForTimeout(800);
    check('host: refuses a guest\'s order for the host\'s army', await host.evaluate(m => Sim.army(m.id).target !== m.to || !Sim.army(m.id).path.length, cheat));
    check('guest: the refused order is undone on the guest\'s map', await waitFor(guest, m => { const a = Sim.army(m.id); return a && (a.target !== m.to || !a.path.length); }, cheat));

    // --- the clock runs on the host; the guest follows ---
    const h0 = await guest.evaluate(() => Sim.G.hour);
    await guest.evaluate(() => Net.setPaused(false));
    check('guest: pressing play starts the host\'s clock', await waitFor(host, () => !Sim.G.paused));
    check('guest: the date moves on for the guest', await waitFor(guest, h => Sim.G.hour > h + 2, h0, 6000));
    check('guest: armies glide between updates', await guest.evaluate(() => Net.hourFrac() >= 0 && Net.hourFrac() <= 1));
    const b0 = await host.evaluate(() => { Net.setSpeed(5); Net._stats(true); return Net._bytes(); });
    await host.waitForTimeout(3000);
    const kbs = await host.evaluate(b => (Net._bytes() - b) / 3 / 1024, b0);
    check('host: updates at top speed stay light (under 200 KB a second per player)', kbs < 200, Math.round(kbs) + ' KB/s ' + await host.evaluate(() => JSON.stringify(Object.entries(Net._stats()).sort((a, b) => b[1] - a[1]).slice(0, 8))));
    await host.evaluate(() => Net.setSpeed(2));
    await host.evaluate(() => Net.setPaused(true));
    check('host: pausing stops the clock for the guest too', await waitFor(guest, () => Sim.G.paused));

    // --- people answer each other's proposals ---
    await host.evaluate(g => { Sim.G.dip.rel = Sim.G.dip.rel || {}; Diplo.addRel(Sim.G.player, g, 80); }, want);
    const prop = await guest.evaluate(t => { Sim.G.countries[Sim.G.player].pp = 200; return Diplo.act('pact', Sim.G.player, t); }, hostTag);
    check('guest: a proposal to the host waits for the host', prop && /sent/i.test(prop.text || ''), JSON.stringify(prop));
    check('host: the proposal appears for the host to answer', await waitFor(host, () => !document.getElementById('offer').hidden, null, 5000), await host.evaluate(() => JSON.stringify(Sim.G.dip.offers)));
    await shot(host, '4-proposal-between-players');
    // other nations may have proposals waiting too: answer the guest's one
    const gname = await guest.evaluate(() => Sim.G.countries[Sim.G.player].name);
    for (let i = 0; i < 6; i++) {
      await waitFor(host, () => !document.getElementById('offer').hidden, null, 3000);
      const txt = await host.evaluate(() => document.getElementById('offer').textContent);
      if (txt.includes(gname)) { await host.click('#offer [data-x="yes"]'); break; }
      await host.click('#offer [data-x="no"]');
    }
    check('guest: the accepted pact reaches the guest', await waitFor(guest, t => Sim.hasPact(Sim.G.player, t), hostTag, 5000));
    check('guest: is told the proposal was accepted', await waitFor(guest, () => [...document.querySelectorAll('#toasts *')].some(e => /accepted/i.test(e.textContent)), null, 4000), await guest.evaluate(() => JSON.stringify({ log: Sim.G.log.slice(0, 4), toasts: [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent) })));

    // --- an event for the guest's nation is answered by the guest ---
    const evId = await host.evaluate(w => { const d = Events.defs().find(x => (x.options || []).length > 1 && !x.tag); if (!d) return null; Events.fire(d.id, w); return d.id; }, want);
    check('host: the guest\'s event does not open on the host\'s screen', evId && await host.evaluate(() => !document.querySelector('#modal [data-evn]')));
    check('guest: the guest\'s event opens on the guest\'s screen', evId && await waitFor(guest, () => !!document.querySelector('#modal [data-evn]'), null, 5000));
    await guest.locator('#modal [data-evn] [data-x], #modal [data-x]').first().click();
    check('host: the guest\'s answer closes the event', await waitFor(host, w => !Sim.G.ev.open.some(e => e.tag === w), want, 5000));

    // --- leaving hands the nation back to the computer ---
    await guest.evaluate(() => { Net.stop(); });
    check('host: a player who leaves hands the nation back to the computer', await waitFor(host, w => !Sim.G.humans[w], want, 5000));
    check('host: no script errors', !errs.host.length, errs.host.slice(0, 3).join(' | '));
    check('guest: no script errors', !errs.guest.length, errs.guest.slice(0, 3).join(' | '));
  } catch (e) {
    check('multiplayer run finished', false, e.message.split('\n')[0]);
  }
  await browser.close();
  srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
