// Multiplayer over the internet with a join code: one player hosts, the others join from their own browser.
// The host's browser runs the whole game. Every other player's orders travel to the host as commands, the
// host checks they belong to that player's nation and applies them, and sends the changed parts of the game
// back a few times a second. Connections are direct between browsers (WebRTC through PeerJS); the free PeerJS
// service only introduces the browsers to each other. Nations nobody picked stay with the computer.
'use strict';
const Net = (function () {
  const PEER_SRC = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  const ID_PREFIX = 'ironmeridian-';
  const SEND_MS = 250, FRAME = 48000;
  const MODS = { Sim, Economy, Tech, Navy, Air, Diplo, Events, Politics, Peace };
  let role = null;             // null (playing alone), 'host' or 'client'
  let peer = null, code = '', status = '', myName = '';
  const players = new Map();   // host: connection id -> { conn, name, tag, ack, last }
  let hostConn = null;         // client: the connection to the host
  const hooks = { lobby: null, joined: null, left: null, ended: null, status: null, synced: null, players: null };

  // ---------- commands: the player's actions, wrapped so a joined player's go to the host ----------
  // what each command acts for: t = index of the acting nation's tag, o = index of an army/fleet/wing it
  // must own, l = index of a list of them; none = checked inside the function against the acting player
  const SPEC = {
    'Sim.orderMove': { o: 0 }, 'Sim.orderHold': { o: 0 }, 'Sim.orderDefend': { o: 0 }, 'Sim.orderRetreat': { o: 0 }, 'Sim.orderChase': { o: 0 },
    'Sim.splitArmy': { o: 0 }, 'Sim.mergeArmies': { l: 0 }, 'Sim.recruit': { t: 0 },
    'Economy.build': { t: 0 }, 'Economy.cancelBuild': { t: 0 },
    'Tech.start': { t: 0 }, 'Tech.stop': { t: 0 },
    'Navy.orderMove': { o: 0 }, 'Navy.setMission': { o: 0 }, 'Navy.splitFleet': { o: 0 }, 'Navy.mergeFleets': { l: 0 }, 'Navy.invade': { o: 0 }, 'Navy.cancelInvasion': { o: 0 },
    'Navy.build': { t: 0 }, 'Navy.cancelBuild': { t: 0 },
    'Air.setMission': { o: 0 }, 'Air.rebase': { o: 0 }, 'Air.build': { t: 0 }, 'Air.cancelBuild': { t: 0 },
    'Diplo.act': { t: 1 }, 'Diplo.declare': { t: 0 }, 'Diplo.answerOffer': {},
    'Events.choose': {}, 'Politics.take': { t: 0 },
    'Peace.demand': { t: 1 }, 'Peace.undo': { t: 1 }, 'Peace.aiPick': { t: 1 }, 'Peace.done': {},
    'Net.setPaused': {}, 'Net.setSpeed': {}
  };
  const REG = {};
  let depth = 0, seq = 0;
  // game-wide controls: anyone may pause or change the speed
  const game = {
    setPaused(v) { const G = Sim.G; if (G && !G.over) G.paused = !!v; },
    setSpeed(s) { const G = Sim.G; if (G) G.speed = Math.max(1, Math.min(5, +s || 1)); }
  };
  MODS.Net = game;
  for (const path in SPEC) {
    const [m, k] = path.split('.'), M = MODS[m], orig = M[k];
    if (typeof orig !== 'function') continue;
    REG[path] = orig;
    M[k] = function (...args) {
      if (role === 'client' && depth === 0) { send(hostConn, { t: 'cmd', s: ++seq, f: path, a: encode(args) }); localDirty = true; }
      depth++;
      try { return orig.apply(M, args); } finally { depth--; }
    };
  }
  // objects in the game travel as references: {$a: army id}, {$f: fleet id}, {$w: wing id}, {$p: 1} for the peace table
  function encode(v) {
    const G = Sim.G;
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(encode);
    if (G) {
      if (G.armies && G.armies.includes(v)) return { $a: v.id };
      if (G.fleets && G.fleets.includes(v)) return { $f: v.id };
      if (G.wings && G.wings.includes(v)) return { $w: v.id };
      if (v === G.peace) return { $p: 1 };
    }
    const o = {}; for (const k in v) o[k] = encode(v[k]); return o;
  }
  const MISSING = {};
  function decode(v) {
    const G = Sim.G;
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(decode);
    if ('$a' in v) return G.armies.find(a => a.id === v.$a) || MISSING;
    if ('$f' in v) return (G.fleets || []).find(f => f.id === v.$f) || MISSING;
    if ('$w' in v) return (G.wings || []).find(w => w.id === v.$w) || MISSING;
    if ('$p' in v) return G.peace || MISSING;
    const o = {}; for (const k in v) o[k] = decode(v[k]); return o;
  }
  const hasMissing = v => v === MISSING || (Array.isArray(v) ? v.some(hasMissing) : false);
  function allowed(tag, spec, args) {
    if (args.some(hasMissing)) return false;
    if (spec.t !== undefined && args[spec.t] !== tag) return false;
    if (spec.o !== undefined && (!args[spec.o] || args[spec.o].owner !== tag)) return false;
    if (spec.l !== undefined && (!Array.isArray(args[spec.l]) || args[spec.l].some(x => !x || x.owner !== tag))) return false;
    return true;
  }
  // the host applies a joined player's command as if that player were at the keyboard
  function exec(p, m) {
    p.ack = Math.max(p.ack, m.s | 0);
    const G = Sim.G, spec = SPEC[m.f], fn = REG[m.f];
    if (!G || !spec || !fn || !p.tag || !G.countries[p.tag] || !G.countries[p.tag].alive) return;
    const args = decode(Array.isArray(m.a) ? m.a : []);
    if (!allowed(p.tag, spec, args)) return;
    const mod = MODS[m.f.split('.')[0]], saved = G.player;
    G.player = p.tag; depth++;
    try { fn.apply(mod, args); } catch (e) { console.error(e); } finally { depth--; G.player = saved; }
    if (m.f.startsWith('Diplo.') || m.f.startsWith('Peace.')) Render.state.dirtyOwners = true;
  }

  // ---------- the game state in pieces, so only what changed is sent ----------
  const round = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v;
  // troops change a little every hour (organisation recovers, supply drifts): to the nearest 1% is plenty to show them
  const round2 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
  const LISTS = { armies: 'a', fleets: 'f', wings: 'w' };
  function pieces(G) {
    const out = {};
    for (const k in G) {
      if (k === 'player' || G[k] === undefined) continue;
      if (k === 'countries') {
        // field by field (and the economy key by key): a day changes a few numbers in every nation
        for (const t in G.countries) {
          const c = G.countries[t];
          out['c.' + t] = '1';
          for (const f in c) {
            const v = c[f];
            if (v === undefined) continue;
            if (f === 'eco' && v && typeof v === 'object' && !Array.isArray(v)) { for (const e in v) if (v[e] !== undefined) out['c.' + t + '.eco.' + e] = JSON.stringify(v[e], round); out['c.' + t + '.eco'] = '{}'; }
            else out['c.' + t + '.' + f] = JSON.stringify(v, round);
          }
        }
        continue;
      }
      if (LISTS[k] && Array.isArray(G[k])) {
        const p = LISTS[k];
        out[p.toUpperCase()] = JSON.stringify(G[k].map(x => x.id));
        for (const x of G[k]) out[p + '.' + x.id] = JSON.stringify(x, round2);
        continue;
      }
      const v = G[k];
      // big tables go in blocks (arrays) or key by key (objects), so a change sends only its part
      if (Array.isArray(v) && v.length > 64) {
        const n = Math.ceil(v.length / 64);
        out['g.' + k] = JSON.stringify({ $blocks: n });
        for (let i = 0; i < n; i++) out['B.' + k + '.' + i] = JSON.stringify(v.slice(i * 64, i * 64 + 64), round);
        continue;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const txt = JSON.stringify(v, round);
        if (txt.length > 2000) {
          out['g.' + k] = JSON.stringify({ $keys: 1 });
          for (const e in v) if (v[e] !== undefined) out['K.' + k + '.' + e] = JSON.stringify(v[e], round);
          continue;
        }
        out['g.' + k] = txt;
        continue;
      }
      out['g.' + k] = JSON.stringify(v, round);
    }
    return out;
  }
  let lastPieces = null, stats = null;
  function diff(cur) {
    const set = {}, del = [];
    for (const k in cur) if (!lastPieces || lastPieces[k] !== cur[k]) set[k] = cur[k];
    if (lastPieces) for (const k in lastPieces) if (!(k in cur)) del.push(k);
    return { set, del };
  }

  // client side: the host's pieces, and the objects parsed from them
  let strings = {}, parsed = {}, localDirty = false, held = false, lastAck = 0, myTag = null;
  let hourAt = 0, lastHour = -1;
  function applyPieces(m) {
    if (m.full) { strings = {}; parsed = {}; }
    for (const k in m.set) { strings[k] = m.set[k]; delete parsed[k]; }
    for (const k of m.del || []) { delete strings[k]; delete parsed[k]; }
    lastAck = Math.max(lastAck, m.ack | 0);
    // while the host has not yet applied our latest order, keep showing our own version of it
    if (lastAck < seq && !m.full) { held = true; return false; }
    held = false;
    rebuild();
    return true;
  }
  const get = k => k in parsed ? parsed[k] : (parsed[k] = JSON.parse(strings[k]));
  function rebuild() {
    if (localDirty) { parsed = {}; localDirty = false; }
    const G = Sim.G && role === 'client' && Sim.G.__net ? Sim.G : { __net: true };
    const keep = new Set(['__net']);
    const countries = {};
    const blocks = {}, keyed = {};
    for (const k in strings) {
      if (k.startsWith('B.')) { const i = k.lastIndexOf('.'); const name = k.slice(2, i); (blocks[name] || (blocks[name] = []))[+k.slice(i + 1)] = k; }
      else if (k.startsWith('K.')) { const i = k.indexOf('.', 2); const name = k.slice(2, i); (keyed[name] || (keyed[name] = {}))[k.slice(i + 1)] = k; }
    }
    for (const k in strings) {
      if (k.startsWith('g.')) {
        const name = k.slice(2), v = get(k);
        if (v && v.$blocks) { let arr = []; for (let i = 0; i < v.$blocks; i++) { const bk = blocks[name] && blocks[name][i]; if (bk) arr = arr.concat(get(bk)); } G[name] = arr; }
        else if (v && v.$keys) { const o = {}; for (const e in keyed[name] || {}) o[e] = get(keyed[name][e]); G[name] = o; }
        else G[name] = v;
        keep.add(name);
      }
      else if (k.startsWith('c.')) {
        const parts = k.split('.'), t = parts[1];
        const c = countries[t] || (countries[t] = {});
        if (parts.length === 3) { if (parts[2] === 'eco') c.eco = c.eco || {}; else c[parts[2]] = get(k); }
        else if (parts.length === 4) (c.eco || (c.eco = {}))[parts[3]] = get(k);
      }
    }
    G.countries = countries; keep.add('countries');
    for (const name in LISTS) {
      const p = LISTS[name], K = p.toUpperCase();
      if (!(K in strings)) continue;
      G[name] = get(K).map(id => strings[p + '.' + id] !== undefined ? get(p + '.' + id) : null).filter(Boolean);
      keep.add(name);
    }
    for (const k of Object.keys(G)) if (!keep.has(k) && k !== 'player') delete G[k];
    G.player = myTag;
    if (G.hour !== lastHour) { lastHour = G.hour; hourAt = performance.now(); }
    return G;
  }

  // ---------- transport: PeerJS, with long messages sent in frames ----------
  let peerLib = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLib) return peerLib;
    peerLib = new Promise((res, rej) => {
      let i = 0;
      const next = () => {
        if (i >= PEER_SRC.length) { peerLib = null; rej(new Error('The connection library could not be loaded. Check the internet connection.')); return; }
        const s = document.createElement('script'); s.src = PEER_SRC[i++]; s.async = true;
        s.onload = () => window.Peer ? res(window.Peer) : next();
        s.onerror = () => { s.remove(); next(); };
        document.head.appendChild(s);
      };
      next();
    });
    return peerLib;
  }
  let frameId = 0, bytesSent = 0;
  function send(conn, msg) {
    if (!conn || !conn.open) return;
    const txt = JSON.stringify(msg);
    bytesSent += txt.length;
    try {
      if (txt.length <= FRAME) { conn.send(txt); return; }
      const id = ++frameId, n = Math.ceil(txt.length / FRAME);
      for (let i = 0; i < n; i++) conn.send('\u0001' + id + '|' + i + '|' + n + '|' + txt.slice(i * FRAME, (i + 1) * FRAME));
    } catch (e) { console.error(e); }
  }
  function receiver(onMsg) {
    const parts = {};
    return data => {
      if (typeof data !== 'string') return;
      if (data.charCodeAt(0) === 1) {
        const a = data.indexOf('|'), b = data.indexOf('|', a + 1), c = data.indexOf('|', b + 1);
        const id = data.slice(1, a), i = +data.slice(a + 1, b), n = +data.slice(b + 1, c);
        const P = parts[id] || (parts[id] = { n, got: 0, s: [] });
        if (P.s[i] === undefined) { P.s[i] = data.slice(c + 1); P.got++; }
        if (P.got < P.n) return;
        delete parts[id];
        data = P.s.join('');
      }
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      onMsg(m);
    };
  }
  const say = s => { status = s; if (hooks.status) hooks.status(s); };
  const WHY = { 'unavailable-id': 'That code is in use. Try again for a new one.', 'peer-unavailable': 'No game with that code. Check the code, and that the host still has the game open.',
    'network': 'Lost the connection to the matchmaking service.', 'browser-incompatible': 'This browser cannot make direct connections.', 'server-error': 'The matchmaking service is not answering. Try again in a minute.',
    'socket-error': 'The matchmaking service is not answering. Try again in a minute.', 'webrtc': 'The direct connection failed. Some school or office networks block it; try another network.' };
  const why = e => WHY[e && e.type] || (e && e.message) || 'Something went wrong with the connection.';
  const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
  const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ---------- hosting ----------
  let sendTimer = 0;
  async function host(name) {
    if (role) return { ok: true, code };
    const G = Sim.G;
    if (!G) return { ok: false, why: 'Start or load a game first.' };
    myName = name || 'Host';
    say('Opening the game to other players…');
    let PeerC;
    try { PeerC = await loadPeer(); } catch (e) { say(''); return { ok: false, why: e.message }; }
    for (let tries = 0; tries < 3; tries++) {
      const c = newCode();
      const r = await new Promise(res => {
        const p = new PeerC(ID_PREFIX + c, { debug: 0 });
        const t = setTimeout(() => { p.destroy(); res({ ok: false, why: 'The matchmaking service did not answer in time.' }); }, 15000);
        p.on('open', () => { clearTimeout(t); res({ ok: true, p, c }); });
        p.on('error', e => { clearTimeout(t); p.destroy(); res({ ok: false, why: why(e), again: e && e.type === 'unavailable-id' }); });
      });
      if (!r.ok) { if (r.again) continue; say(''); return r; }
      peer = r.p; code = r.c; role = 'host';
      G.humans = G.humans || {};
      G.humans[G.player] = { name: myName, host: true };
      peer.on('connection', conn => accept(conn));
      peer.on('error', e => { if (e && e.type === 'peer-unavailable') return; say(why(e)); });
      peer.on('disconnected', () => { if (role === 'host' && peer && !peer.destroyed) try { peer.reconnect(); } catch (e) { } });
      lastPieces = null;
      clearInterval(sendTimer); sendTimer = setInterval(broadcast, SEND_MS);
      say('');
      if (hooks.players) hooks.players();
      return { ok: true, code };
    }
    say(''); return { ok: false, why: 'Could not get a free code. Try again.' };
  }
  function lobbyInfo() {
    const G = Sim.G, taken = {};
    for (const t in G.humans || {}) taken[t] = G.humans[t].name;
    const nations = Object.values(G.countries).filter(c => c.alive).map(c => ({ tag: c.tag, name: c.name, color: c.color, prov: G.owner.filter(o => o === c.tag).length }))
      .sort((a, b) => b.prov - a.prov);
    return { t: 'lobby', era: typeof Eras === 'undefined' || Eras.isBase() ? Eras.BASE_ID : Eras.info().id, date: Sim.dateStr(G.hour), host: myName, hostTag: G.player, taken, nations };
  }
  function accept(conn) {
    const p = { conn, name: 'Player', tag: null, ack: 0, last: performance.now() };
    players.set(conn.connectionId || conn.peer, p);
    conn.on('open', () => send(conn, lobbyInfo()));
    conn.on('data', receiver(m => onHostMsg(p, m)));
    conn.on('close', () => drop(p));
    conn.on('error', () => drop(p));
  }
  function drop(p) {
    const key = [...players].find(([, x]) => x === p);
    if (!key) return;
    players.delete(key[0]);
    const G = Sim.G;
    if (p.tag && G && G.humans && G.humans[p.tag] && !G.humans[p.tag].host) {
      delete G.humans[p.tag];
      if (hooks.left) hooks.left(p);
    }
    if (hooks.players) hooks.players();
  }
  function onHostMsg(p, m) {
    const G = Sim.G;
    if (!G) return;
    p.last = performance.now();
    if (m.t === 'hello') { p.name = String(m.name || 'Player').slice(0, 24); send(p.conn, lobbyInfo()); }
    else if (m.t === 'pick') {
      const tag = String(m.tag || ''), c = G.countries[tag];
      if (p.tag) return;
      if (!c || !c.alive) { send(p.conn, { t: 'deny', why: 'That nation is no longer in the game.' }); return; }
      if (G.humans[tag]) { send(p.conn, Object.assign(lobbyInfo(), { deny: (G.humans[tag].name || 'Someone') + ' already leads ' + c.name + '.' })); return; }
      p.name = String(m.name || p.name).slice(0, 24);
      p.tag = tag; G.humans[tag] = { name: p.name };
      const cur = pieces(G);
      send(p.conn, { t: 'welcome', tag, era: lobbyInfo().era, full: true, set: cur, del: [], ack: 0, hostName: myName });
      if (hooks.joined) hooks.joined(p);
      if (hooks.players) hooks.players();
    }
    else if (m.t === 'cmd') exec(p, m);
    else if (m.t === 'ping') send(p.conn, { t: 'pong' });
  }
  // at most about BUDGET bytes a second go to each player: a busy update waits a little longer, and the
  // players' maps glide the troops between updates anyway
  const BUDGET = 110 * 1024;
  let nextSend = 0;
  function broadcast() {
    if (role !== 'host') return;
    if (performance.now() < nextSend) return;
    const G = Sim.G;
    const live = [...players.values()].filter(p => p.tag && p.conn.open);
    if (!G || !live.length) { lastPieces = null; return; }
    const cur = pieces(G), d = diff(cur);
    lastPieces = cur;
    if (stats) for (const k in d.set) { const g = k.replace(/\.[^.]*$/, '').replace(/^([ac]\.)[^.]*/, '$1*').replace(/^([fw])\.\d+/, '$1'); stats[g] = (stats[g] || 0) + d.set[k].length + k.length; }
    let size = 0; for (const k in d.set) size += d.set[k].length + k.length;
    nextSend = performance.now() + Math.max(0, size / BUDGET * 1000 - SEND_MS);
    for (const p of live) send(p.conn, { t: 'd', h: G.hour, set: d.set, del: d.del, ack: p.ack });
  }

  // ---------- joining ----------
  let lobby = null;
  async function join(rawCode, name) {
    if (role) stop();
    const c = clean(rawCode);
    if (c.length < 4) return { ok: false, why: 'Enter the code the host gave you.' };
    myName = name || 'Player';
    say('Connecting…');
    let PeerC;
    try { PeerC = await loadPeer(); } catch (e) { say(''); return { ok: false, why: e.message }; }
    return new Promise(res => {
      const p = new PeerC(undefined, { debug: 0 });
      let done = false;
      const fail = w => { if (done) return; done = true; clearTimeout(t); try { p.destroy(); } catch (e) { } say(''); res({ ok: false, why: w }); };
      const t = setTimeout(() => fail('The host did not answer. Check the code, and that the host still has the game open.'), 20000);
      p.on('error', e => fail(why(e)));
      p.on('open', () => {
        const conn = p.connect(ID_PREFIX + c, { reliable: true });
        conn.on('open', () => {
          if (done) return;
          done = true; clearTimeout(t);
          peer = p; hostConn = conn; code = c; role = 'client'; seq = 0; lastAck = 0; strings = {}; parsed = {}; myTag = null;
          conn.on('data', receiver(onClientMsg));
          conn.on('close', () => ended('The host closed the game.'));
          send(conn, { t: 'hello', name: myName });
          say('Connected. Waiting for the host…');
          res({ ok: true });
        });
        conn.on('error', () => fail('The connection to the host failed.'));
      });
    });
  }
  function pick(tag) { if (role === 'client' && hostConn) send(hostConn, { t: 'pick', tag, name: myName }); }
  function onClientMsg(m) {
    if (m.t === 'lobby') { lobby = m; say(''); if (hooks.lobby) hooks.lobby(m); }
    else if (m.t === 'deny') { if (hooks.lobby) hooks.lobby(Object.assign({}, lobby || {}, { deny: m.why })); }
    else if (m.t === 'welcome') {
      myTag = m.tag; strings = {}; parsed = {}; localDirty = false; lastAck = 0; seq = 0;
      for (const k in m.set) strings[k] = m.set[k];
      const G = rebuild();
      if (hooks.synced) hooks.synced({ first: true, era: m.era, G, tag: m.tag, hostName: m.hostName });
    }
    else if (m.t === 'd') {
      if (!myTag) return;
      if (applyPieces(m) && hooks.synced) hooks.synced({ first: false });
    }
  }
  function ended(text) {
    if (role !== 'client') return;
    const had = !!myTag;
    stop();
    if (hooks.ended) hooks.ended(text, had);
  }

  function stop() {
    clearInterval(sendTimer); sendTimer = 0;
    for (const p of players.values()) try { p.conn.close(); } catch (e) { }
    players.clear();
    if (hostConn) try { hostConn.close(); } catch (e) { }
    hostConn = null;
    if (peer) try { peer.destroy(); } catch (e) { }
    peer = null;
    const G = Sim.G;
    if (role === 'host' && G && G.humans) { for (const t in G.humans) if (!G.humans[t].host) delete G.humans[t]; }
    if (role === 'client') { myTag = null; if (Sim.G && Sim.G.__net) delete Sim.G.__net; }
    role = null; code = ''; lastPieces = null; lobby = null;
    if (hooks.players) hooks.players();
  }
  // how far into the next game hour we are, estimated from when the host's hour last changed
  function hourFrac() {
    const G = Sim.G; if (!G || G.paused) return 0;
    return Math.min(1, (performance.now() - hourAt) / 1000 * (typeof UI !== 'undefined' ? UI.HPS[G.speed] : 1));
  }
  function playerList() {
    const G = Sim.G, out = [];
    if (!G || !G.humans) return out;
    for (const t in G.humans) out.push({ tag: t, name: G.humans[t].name, host: !!G.humans[t].host, me: t === G.player });
    return out;
  }
  return {
    hooks, host, join, pick, stop, hourFrac, playerList,
    setPaused: v => game.setPaused(v), setSpeed: s => game.setSpeed(s),
    get role() { return role; }, get code() { return code; }, get status() { return status; }, get lobby() { return lobby; },
    ticks: () => role !== 'client', isClient: () => role === 'client', active: () => !!role,
    clean, _pieces: pieces, _held: () => held, _players: players, _bytes: () => bytesSent, _stats: on => { if (on) stats = {}; return stats; }
  };
})();
