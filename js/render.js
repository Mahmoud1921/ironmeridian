// Canvas map renderer and camera (pan / zoom / picking).
'use strict';
const Render = (function () {
  let canvas, ctx, MAP, dpr = 1, W = 0, H = 0;
  const cam = { x: 20, y: -40, z: 4, tz: 4, tx: 20, ty: -40, anim: false };
  const WORLD = { x0: -180, x1: 180, y0: -125, y1: 72 };
  let provPaths = [], coastPath, lakePath;
  let lmClips = [], lmProvs = [], lmBorders = [], lmCountryBorders = [];
  let fillCache = [], labels = [];
  let provGrid = null;
  const state = { look: 'cartoon', mode: 'political', hover: -1, selProv: -1, selArmies: new Set(), selFleet: 0, selWing: 0, selZone: -1, dirtyOwners: true, frontEdges: null, pendingHint: null };
  let counterHits = [], battleHits = [], fleetHits = [], wingHits = [];
  const stripeCache = {};
  let cityOrder = null;

  function init(c, map) {
    canvas = c; ctx = canvas.getContext('2d'); MAP = map;
    // province geometry
    provPaths = MAP.provs.map(p => { const pa = new Path2D(); const f = p.flat; pa.moveTo(f[0], f[1]); for (let i = 2; i < f.length; i += 2) pa.lineTo(f[i], f[i + 1]); pa.closePath(); return pa; });
    coastPath = new Path2D(); lakePath = new Path2D();
    const addPoly = (path, pts) => { path.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]); path.closePath(); };
    for (const l of MAP.lms) addPoly(coastPath, l.pts);
    for (const l of MAP.lakes) { addPoly(coastPath, l.pts); addPoly(lakePath, l.pts); }
    // each landmass is drawn under its own clip so neighbouring coasts never bleed into each other
    MAP.lms.forEach((l, i) => {
      const c = new Path2D(); addPoly(c, l.pts);
      for (const k of MAP.lakes) if (k.bbox[0] < l.bbox[2] && k.bbox[2] > l.bbox[0] && k.bbox[1] < l.bbox[3] && k.bbox[3] > l.bbox[1]) addPoly(c, k.pts);
      lmClips.push(c); lmProvs.push([]); lmBorders.push(new Path2D());
    });
    MAP.provs.forEach(p => {
      lmProvs[p.lm].push(p);
      const r = p.spacing * 1.8 + 0.5; // land part of a cell sits close to its seed
      p.tb = [Math.max(p.bbox[0], p.x - r), Math.max(p.bbox[1], p.y - r), Math.min(p.bbox[2], p.x + r), Math.min(p.bbox[3], p.y + r)];
    });
    for (const e of MAP.edges) { const b = lmBorders[MAP.provs[e.a].lm]; b.moveTo(e.x1, e.y1); b.lineTo(e.x2, e.y2); }
    // pick grid
    provGrid = new Map();
    for (const p of MAP.provs) {
      const k = Math.floor(p.x / 4) * 1000 + Math.floor(p.y / 4);
      if (!provGrid.has(k)) provGrid.set(k, []); provGrid.get(k).push(p);
    }
    LOOKS.classic = { provPaths, coastPath, lakePath, lmClips, lmBorders };
    setLook(state.look);
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    vc.valid = false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const minZoom = () => Math.max(W / 380, H / 200) * 0.9;

  // ---------- colors ----------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  const rgbStr = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  let lastOwn = null, lastMode = null, lastDead = 0, lastDeadHour = -1;
  const deadCount = () => { let n = 0; for (const t in Sim.G.countries) if (!Sim.G.countries[t].alive) n++; return n; };
  function provColor(p, owner) {
    if (look()) return cartoonColor(p, owner);
    const T = TERRAIN[p.terrain];
    const j = ((p.id * 2654435761) >>> 0) % 100 / 100 - 0.5;
    if (state.mode === 'terrain') return rgbStr(mix(hexToRgb(T.color), j > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(j) * 0.12));
    let c = mix(hexToRgb(COUNTRY_BY_TAG[owner].color), hexToRgb(T.color), 0.12);
    return rgbStr(mix(c, j > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(j) * 0.09));
  }
  // Recompute colours/borders/labels; repaint the cached layer fully or just around changed provinces.
  function recolor() {
    const G = Sim.G;
    const own = G ? G.owner : MAP.provs.map(p => p.owner);
    let changed = null;
    // occupation stripes go once a nation is gone for good: its land is simply the conqueror's now
    const dead = G ? deadCount() : 0;
    if (lastOwn && lastMode === state.mode && lastOwn.length === own.length && dead === lastDead) {
      changed = [];
      for (let i = 0; i < own.length; i++) if (own[i] !== lastOwn[i]) changed.push(i);
    }
    lastOwn = own.slice(); lastMode = state.mode; lastDead = dead;
    if (!changed) fillCache = MAP.provs.map(p => provColor(p, own[p.id]));
    else for (const i of changed) fillCache[i] = provColor(MAP.provs[i], own[i]);
    lmCountryBorders = MAP.lms.map(() => new Path2D());
    MAP.edges.forEach((e, i) => { if (own[e.a] !== own[e.b]) edgeTo(lmCountryBorders[MAP.provs[e.a].lm], i); });
    computeLabels(own);
    state.dirtyOwners = false;
    if (!layer) return;
    if (!changed || changed.length > 80) { buildLayer(); vc.valid = false; }
    else for (const i of changed) { patchLayer(i); patchView(i); }
  }
  function computeLabels(own) {
    labels = [];
    const seen = new Uint8Array(MAP.provs.length);
    for (const p of MAP.provs) {
      if (seen[p.id]) continue;
      const tag = own[p.id];
      const stack = [p.id]; seen[p.id] = 1;
      let sx = 0, sy = 0, w = 0; const members = [];
      while (stack.length) {
        const id = stack.pop(); const q = MAP.provs[id]; members.push(q);
        const a = q.spacing * q.spacing; sx += q.x * a; sy += q.y * a; w += a;
        for (const n of q.nb) if (!seen[n] && own[n] === tag) { seen[n] = 1; stack.push(n); }
      }
      let cx = sx / w, cy = sy / w;
      // keep label anchor on a member province
      let best = members[0], bd = Infinity;
      for (const q of members) { const d = Math.hypot(q.x - cx, q.y - cy); if (d < bd) { bd = d; best = q; } }
      if (bd > Math.sqrt(w) * 0.35) { cx = best.x; cy = best.y; }
      // orientation: spread along x vs y
      let xx = 0, yy = 0;
      for (const q of members) { xx += (q.x - cx) ** 2; yy += (q.y - cy) ** 2; }
      labels.push({ tag, x: cx, y: cy, size: Math.sqrt(w), wide: xx >= yy * 0.6, n: members.length });
    }
    labels.sort((a, b) => b.size - a.size);
  }

  // ---------- camera ----------
  function screenToWorld(sx, sy) { return [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]; }
  function worldToScreen(x, y) { return [(x - cam.x) * cam.z + W / 2, (y - cam.y) * cam.z + H / 2]; }
  function clampCam() {
    cam.z = Math.max(minZoom(), Math.min(70, cam.z));
    const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
    cam.x = Math.max(WORLD.x0 + Math.min(hw, 180) - 10, Math.min(WORLD.x1 - Math.min(hw, 180) + 10, cam.x));
    cam.y = Math.max(WORLD.y0 + Math.min(hh, 98), Math.min(WORLD.y1 - Math.min(hh, 98), cam.y));
  }
  function zoomAt(sx, sy, factor) {
    lastZoomInput = performance.now();
    const [wx, wy] = screenToWorld(sx, sy);
    cam.z *= factor; clampCam();
    const [nx, ny] = screenToWorld(sx, sy);
    cam.x += wx - nx; cam.y += wy - ny; clampCam();
  }
  // eased zoom toward a target, keeping the point under the cursor fixed
  function zoomSmooth(sx, sy, factor) {
    cam.anim = false;
    cam.zt = Math.max(minZoom(), Math.min(70, (cam.zt || cam.z) * factor));
    cam.zax = sx; cam.zay = sy;
  }
  function pan(dx, dy) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); cam.anim = false; }
  function flyTo(x, y, z) { cam.tx = x; cam.ty = y; cam.tz = z || cam.z; cam.anim = true; }
  function fitWorld() { flyTo(0, -25, minZoom()); }
  function stepCamera() {
    if (cam.zt) {
      if (cam.anim || Math.abs(cam.zt / cam.z - 1) < 0.003) cam.zt = 0;
      else zoomAt(cam.zax, cam.zay, Math.pow(cam.zt / cam.z, 0.3));
    }
    if (!cam.anim) return;
    cam.x += (cam.tx - cam.x) * 0.18; cam.y += (cam.ty - cam.y) * 0.18;
    cam.z *= Math.pow(cam.tz / cam.z, 0.18);
    clampCam();
    if (Math.abs(cam.tx - cam.x) < 0.01 && Math.abs(cam.ty - cam.y) < 0.01 && Math.abs(cam.tz / cam.z - 1) < 0.002) cam.anim = false;
  }

  // ---------- picking ----------
  function provinceAt(wx, wy) {
    const lm = MAP.landmassAt(wx, wy);
    if (lm < 0) return -1;
    let best = -1, bd = Infinity;
    const gx = Math.floor(wx / 4), gy = Math.floor(wy / 4);
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        const arr = provGrid.get((gx + i) * 1000 + gy + j); if (!arr) continue;
        for (const p of arr) { if (p.lm !== lm) continue; const d = (p.x - wx) ** 2 + (p.y - wy) ** 2; if (d < bd) { bd = d; best = p.id; } }
      }
    }
    return best;
  }
  function stackAt(sx, sy) {
    for (let i = counterHits.length - 1; i >= 0; i--) { const h = counterHits[i]; if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return h.group; }
    return null;
  }
  // every army whose counter touches a screen rectangle (drag-selection)
  function armiesInRect(x0, y0, x1, y1) {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1), out = new Set();
    for (const h of counterHits) if (h.x <= r && h.x + h.w >= l && h.y <= b && h.y + h.h >= t) for (const a of h.group) out.add(a);
    return [...out];
  }
  function counterAt(sx, sy) { const g = stackAt(sx, sy); return g ? g[0] : null; }
  function battleAtScreen(sx, sy) {
    for (const h of battleHits) if (Math.hypot(sx - h.x, sy - h.y) < 13) return h.battle;
    return null;
  }

  // ---------- drawing ----------
  // where an army is right now: along its current leg, including the part of the hour already elapsed
  function armyPos(a) {
    const p = MAP.provs[a.prov];
    if (a.sea && a.sea.phase !== 'prep') {
      // afloat: somewhere between the port it left and the beach it is heading for
      const s = a.sea, q = MAP.provs[s.target];
      const t = s.phase === 'sail' ? Math.min(0.85, (s.t + (state.hourFrac || 0)) / Math.max(1, s.sail) * 0.85) : s.phase === 'wait' ? 0.85 : Math.max(0, 0.85 - s.t / Math.max(12, s.sail / 2) * 0.85);
      return [p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t];
    }
    if (a.lead) {
      // turned round mid-leg: walking back toward its own province centre
      const n = MAP.provs[a.lead.to];
      const km = Math.max(0, a.lead.km + Math.min(0, a.rate || 0) * (state.hourFrac || 0));
      const t = Math.min(1, km / Sim.distKm(a.prov, a.lead.to));
      return [p.x + (n.x - p.x) * t, p.y + (n.y - p.y) * t];
    }
    if (a.path.length) {
      const n = MAP.provs[a.path[0]];
      const prog = a.progress + (a.battle ? 0 : (a.rate || 0) * (state.hourFrac || 0));
      if (prog <= 0) return [p.x, p.y];
      const t = Math.min(1, prog / Sim.distKm(a.prov, a.path[0]));
      return [p.x + (n.x - p.x) * t, p.y + (n.y - p.y) * t];
    }
    return [p.x, p.y];
  }

  function stripes(color) {
    if (stripeCache[color]) return stripeCache[color];
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-2, 12); g.lineTo(12, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.moveTo(-2, 2); g.lineTo(2, -2); g.stroke();
    return (stripeCache[color] = c);
  }

  // ---------- cartoon look: smooth coasts, wavy borders, bright colours, Blender props, live sea ----------
  // Geometry for both looks is built once; setLook() swaps which set the painters use.
  const LOOKS = {};
  const look = () => state.look === 'cartoon';
  let edgeWob = [];
  let lmCoast = [];          // per landmass coast (smoothed), so shore strokes skip landmasses out of view          // per MAP.edges index: wavy polyline [x0,y0,x1,y1,...] (cartoon) or null
  // centripetal Catmull-Rom through every coast point: rounder shores that still pass through the real coastline
  function smoothRing(pts) {
    const n = pts.length / 2, out = [];
    const P = i => { i = (i + n) % n; return [pts[i * 2], pts[i * 2 + 1]]; };
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.min(10, Math.round(L * 3)));
      const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
      const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
      for (let s = 0; s < k; s++) {
        const t = t1 + (t2 - t1) * s / k;
        const lerp = (a, b, ta, tb) => [(tb - t) / (tb - ta) * a[0] + (t - ta) / (tb - ta) * b[0], (tb - t) / (tb - ta) * a[1] + (t - ta) / (tb - ta) * b[1]];
        const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
        const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
        const C = lerp(B1, B2, t1, t2);
        out.push(C[0], C[1]);
      }
    }
    return out;
  }
  // a gentle hand-drawn wave along a shared province edge; zero at both ends so corners still meet
  function hash3(a, b) { let h = (a * 73856093) ^ (b * 19349663); const r = mulberry32(h >>> 0); return [r(), r(), r()]; }
  function wobble(x1, y1, x2, y2, a, b) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-6;
    const n = Math.max(2, Math.min(8, Math.round(L * 4)));
    const nx = -dy / L, ny = dx / L, [r1, r2, r3] = hash3(a, b);
    const amp = Math.min(0.1 * L, 0.3);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = Math.PI * t;
      const d = amp * ((r1 - 0.5) * 1.5 * Math.sin(s) + (r2 - 0.5) * 0.9 * Math.sin(2 * s) + (r3 - 0.5) * 0.6 * Math.sin(3 * s));
      out.push(x1 + dx * t + nx * d, y1 + dy * t + ny * d);
    }
    return out;
  }
  function buildCartoonGeometry() {
    const addPoly = (path, pts) => { path.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]); path.closePath(); };
    const coastS = MAP.lms.map(l => smoothRing(l.pts)), lakeS = MAP.lakes.map(l => smoothRing(l.pts));
    const L = { coastPath: new Path2D(), lakePath: new Path2D(), lmClips: [], lmBorders: [], provPaths: [] };
    coastS.forEach(pts => addPoly(L.coastPath, pts));
    lmCoast = coastS.map(pts => { const p = new Path2D(); addPoly(p, pts); return p; });
    lakeS.forEach(pts => { addPoly(L.coastPath, pts); addPoly(L.lakePath, pts); });
    MAP.lms.forEach((l, i) => {
      const c = new Path2D(); addPoly(c, coastS[i]);
      MAP.lakes.forEach((k, j) => { if (k.bbox[0] < l.bbox[2] && k.bbox[2] > l.bbox[0] && k.bbox[1] < l.bbox[3] && k.bbox[3] > l.bbox[1]) addPoly(c, lakeS[j]); });
      L.lmClips.push(c); L.lmBorders.push(new Path2D());
    });
    // wavy edges, computed once per pair from the lower id's side so both provinces share the exact same line
    const wob = new Map();
    const key = (a, b) => a < b ? a * 4096 + b : b * 4096 + a;
    L.provPaths = MAP.provs.map(p => {
      const poly = p.poly, path = new Path2D();
      let started = false;
      for (let i = 0; i < poly.length; i++) {
        const v = poly[i], w = poly[(i + 1) % poly.length];
        let seg;
        if (v.n >= 0) {
          const k = key(p.id, v.n);
          if (p.id < v.n) { seg = wob.get(k) || wobble(v.x, v.y, w.x, w.y, p.id, v.n); wob.set(k, seg); }
          else {
            let s = wob.get(k);
            if (!s) { s = wobble(w.x, w.y, v.x, v.y, v.n, p.id); wob.set(k, s); }
            seg = []; for (let j = s.length - 2; j >= 0; j -= 2) seg.push(s[j], s[j + 1]);
          }
        } else seg = [v.x, v.y, w.x, w.y];
        for (let j = started ? 2 : 0; j < seg.length; j += 2) { if (!started) { path.moveTo(seg[j], seg[j + 1]); started = true; } else path.lineTo(seg[j], seg[j + 1]); }
      }
      path.closePath();
      return path;
    });
    edgeWob = MAP.edges.map(e => wob.get(key(e.a, e.b)) || null);
    MAP.edges.forEach((e, i) => { const b = L.lmBorders[MAP.provs[e.a].lm], s = edgeWob[i]; if (!s) { b.moveTo(e.x1, e.y1); b.lineTo(e.x2, e.y2); return; } b.moveTo(s[0], s[1]); for (let j = 2; j < s.length; j += 2) b.lineTo(s[j], s[j + 1]); });
    return L;
  }
  function edgeTo(path, i) {
    const e = MAP.edges[i], s = look() && edgeWob[i];
    if (!s) { path.moveTo(e.x1, e.y1); path.lineTo(e.x2, e.y2); return; }
    path.moveTo(s[0], s[1]); for (let j = 2; j < s.length; j += 2) path.lineTo(s[j], s[j + 1]);
  }
  function setLook(name) {
    if (!LOOKS.cartoon) { LOOKS.cartoon = buildCartoonGeometry(); buildWaves(); }
    state.look = name === 'cartoon' ? 'cartoon' : 'classic';
    const L = LOOKS[state.look];
    provPaths = L.provPaths; coastPath = L.coastPath; lakePath = L.lakePath; lmClips = L.lmClips; lmBorders = L.lmBorders;
    seaClip = null; lastOwn = null; state.dirtyOwners = true; vc.valid = false;
    if (layer) { recolor(); }
    if (state.frontPairs) setFrontEdges(state.frontPairs);
  }

  // bright, friendly palette: nation colours pushed to clear, saturated mid tones
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToRgb([h, s, l]) {
    const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  const CARTOON_TERRAIN = { plains: '#a9d46a', forest: '#5fae55', hills: '#c9b46c', mountains: '#a39486', desert: '#f2d58a', jungle: '#3f9d5a', marsh: '#7fb39a', tundra: '#dfe8e6', urban: '#b9b2c4' };
  const cartoonCache = {};
  function cartoonNation(hex) {
    if (cartoonCache[hex]) return cartoonCache[hex];
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    return (cartoonCache[hex] = hslToRgb([h, Math.min(0.82, s * 1.25 + 0.12), Math.max(0.5, Math.min(0.74, l * 1.05 + 0.1))]));
  }
  function cartoonColor(p, owner) {
    const j = ((p.id * 2654435761) >>> 0) % 100 / 100 - 0.5;
    if (state.mode === 'terrain') return rgbStr(mix(hexToRgb(CARTOON_TERRAIN[p.terrain]), j > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(j) * 0.08));
    const c = mix(cartoonNation(COUNTRY_BY_TAG[owner].color), hexToRgb(CARTOON_TERRAIN[p.terrain]), 0.1);
    return rgbStr(mix(c, j > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(j) * 0.05));
  }

  // ---- Blender props: placed once per province by terrain, drawn into the cached map ----
  const props = { img: null, ready: false, items: null };
  function loadProps() {
    if (props.img || typeof MAP_PROPS === 'undefined') return;
    props.img = new Image();
    props.img.onload = () => { props.ready = true; props.dark = darkClouds(); vc.valid = false; if (layer && look()) buildLayer(); };
    props.img.src = MAP_PROPS.src;
  }
  function darkClouds() {
    const out = {};
    for (const k of ['cloud_a', 'cloud_b']) {
      const r = MAP_PROPS.rects[k], c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      const g = c.getContext('2d'); g.drawImage(props.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#0b2a3c'; g.fillRect(0, 0, r[2], r[3]);
      out[k] = c;
    }
    return out;
  }
  const PROP_SETS = {
    forest:    { n: 9, pick: (r, lat) => lat > 52 ? (r < 0.6 ? 'pine' : 'tree_c') : r < 0.4 ? 'tree_a' : r < 0.7 ? 'tree_c' : r < 0.85 ? 'tree_b' : 'pine' },
    jungle:    { n: 9, pick: r => r < 0.45 ? 'palm' : r < 0.8 ? 'tree_c' : 'tree_a' },
    mountains: { n: 4, pick: (r, lat) => r < 0.5 ? 'mountain_a' : r < 0.85 ? 'mountain_b' : (Math.abs(lat) < 35 ? 'mesa' : 'pine'), big: 1.5 },
    hills:     { n: 4, pick: (r, lat) => Math.abs(lat) < 36 ? (r < 0.6 ? 'hill_dry' : 'mesa') : (r < 0.7 ? 'hill' : 'tree_b'), big: 1.15 },
    desert:    { n: 4, pick: (r, lat, lon) => r < 0.6 ? 'dune' : (lon < -30 && r < 0.85 ? 'cactus' : r < 0.85 ? 'dune' : 'mesa') },
    tundra:    { n: 5, pick: (r, lat) => lat < 0 ? 'hill' : r < 0.7 ? 'pine_snow' : 'pine' },
    marsh:     { n: 4, pick: r => r < 0.7 ? 'reeds' : 'bush' },
    plains:    { n: 3, pick: (r, lat) => Math.abs(lat) < 28 ? (r < 0.5 ? 'bush' : 'palm') : r < 0.55 ? 'bush' : r < 0.85 ? 'tree_b' : 'tree_a' },
    urban:     { n: 0 }
  };
  function placeProps() {
    const items = MAP.lms.map(() => []);
    for (const p of MAP.provs) {
      const set = PROP_SETS[p.terrain]; if (!set || !set.n) continue;
      const rnd = mulberry32(p.id * 7919 + 13), sp = p.spacing || 1;
      const [lon, lat] = GEO.unproject(p.x, p.y);
      let lvl = 0;
      for (let i = 0; i < set.n * 3 && lvl < set.n; i++) {
        const an = rnd() * Math.PI * 2, rr = 0.24 + rnd() * 0.42;
        const x = p.x + Math.cos(an) * sp * rr, y = p.y + Math.sin(an) * sp * rr * 0.8;
        if (provinceAt(x, y) !== p.id) continue;
        items[p.lm].push({ x, y, p: p.id, lvl: lvl++, k: set.pick(rnd(), lat, lon), big: set.big || 1, sp, flip: rnd() < 0.5 });
      }
    }
    for (const a of items) a.sort((u, v) => u.y - v.y);
    props.items = items;
  }
  function paintProps(g, z, li, vx0, vy0, vx1, vy1) {
    // props belong to the terrain map only; each keeps a fixed size on the ground, so it shrinks as you zoom out
    if (!props.ready || state.mode !== 'terrain') return;
    if (!props.items) placeProps();
    const zd = z;
    const maxLvl = z === LS ? 2 : Math.max(2, Math.floor(zd / 5));
    const R = MAP_PROPS.rects, img = props.img;
    for (const it of props.items[li]) {
      if (it.lvl >= maxLvl) continue;
      const hpx = it.sp * zd * 0.42 * it.big;
      const r = R[it.k], s = hpx / zd / r[3];
      const w = r[2] * s, h = r[3] * s, x = it.x - r[4] * s, y = it.y - r[5] * s;
      if (x > vx1 || x + w < vx0 || y > vy1 || y + h < vy0) continue;
      if (it.flip) { g.save(); g.translate(it.x, 0); g.scale(-1, 1); g.drawImage(img, r[0], r[1], r[2], r[3], -r[4] * s, y, w, h); g.restore(); }
      else g.drawImage(img, r[0], r[1], r[2], r[3], x, y, w, h);
    }
  }

  function paintCartoon(g, z, vx0, vy0, vx1, vy1) {
    const G = Sim.G;
    loadProps();
    g.fillStyle = '#3a9acb'; g.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // shallow water rings hugging every shore
    const vis = [];
    MAP.lms.forEach((l, li) => { const b = l.bbox, m = 3; if (!(b[2] < vx0 - m || b[0] > vx1 + m || b[3] < vy0 - m || b[1] > vy1 + m)) vis.push(li); });
    for (const [w, col] of [[16, 'rgba(140,215,238,0.34)'], [7, 'rgba(196,240,248,0.55)']]) {
      g.strokeStyle = col; g.lineWidth = w / z; for (const li of vis) g.stroke(lmCoast[li]);
    }
    MAP.lms.forEach((l, li) => {
      const b = l.bbox;
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) return;
      g.save();
      g.clip(lmClips[li], 'evenodd');
      for (const p of lmProvs[li]) {
        const bb = p.tb;
        if (bb[2] < vx0 || bb[0] > vx1 || bb[3] < vy0 || bb[1] > vy1) continue;
        g.fillStyle = fillCache[p.id];
        g.fill(provPaths[p.id]);
        if (G && state.mode === 'political' && G.owner[p.id] !== p.core && G.countries[p.core] && G.countries[p.core].alive) {
          const pat = g.createPattern(stripes(rgbStr(cartoonNation(COUNTRY_BY_TAG[p.core].color))), 'repeat');
          pat.setTransform(new DOMMatrix().scale(1 / z));
          g.globalAlpha = 0.6; g.fillStyle = pat; g.fill(provPaths[p.id]); g.globalAlpha = 1;
        }
      }
      // sandy beach line and a soft rim just inside the shore
      g.strokeStyle = 'rgba(255,244,205,0.55)'; g.lineWidth = 5 / z; g.stroke(lmClips[li]);
      if (z > 4) {
        g.lineWidth = Math.min(0.1, 1.1 / z); g.strokeStyle = 'rgba(40,40,30,' + Math.min(0.22, (z - 4) * 0.04) + ')';
        // the waves in province lines vanish at world scale, so the cheaper straight lines do there
        g.stroke(z === LS ? LOOKS.classic.lmBorders[li] : lmBorders[li]);
      }
      paintProps(g, z, li, vx0 - 3, vy0 - 3, vx1 + 3, vy1 + 3);
      // nation borders: a light glow both sides, then a chunky ink line
      g.lineWidth = 7 / z; g.strokeStyle = 'rgba(255,255,255,0.28)'; g.stroke(lmCountryBorders[li]);
      g.lineWidth = Math.max(2.1 / z, Math.min(0.16, 2.6 / z)); g.strokeStyle = 'rgba(38,30,44,0.85)'; g.stroke(lmCountryBorders[li]);
      g.restore();
    });
    g.strokeStyle = '#1c3f5c'; g.lineWidth = 2 / z; for (const li of vis) g.stroke(lmCoast[li]);
    g.fillStyle = '#3a9acb'; g.fill(lakePath);
    g.strokeStyle = 'rgba(196,240,248,0.7)'; g.lineWidth = 3 / z; g.stroke(lakePath);
    g.strokeStyle = '#1c3f5c'; g.lineWidth = 1.6 / z; g.stroke(lakePath);
    g.setLineDash([4 / z, 4 / z]); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.6 / z;
    g.beginPath();
    for (const [a, b2] of MAP.straits) { g.moveTo(MAP.provs[a].x, MAP.provs[a].y); g.lineTo(MAP.provs[b2].x, MAP.provs[b2].y); }
    g.stroke(); g.setLineDash([]);
  }

  // ---- the living sea and sky, drawn every frame on top of the cached map ----
  let wavePts = null, waveGrid = null;
  const crestCache = {};
  function crestSprite(sz) {
    const key = sz + ':' + dpr;
    if (crestCache[key]) return crestCache[key];
    const c = document.createElement('canvas'), w = sz * 2 + 4, h = sz * 0.6 + 4;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round';
    const x = w / 2, y = h - 2;
    g.beginPath(); g.moveTo(x - sz, y); g.quadraticCurveTo(x - sz / 2, y - sz * 0.55, x, y); g.quadraticCurveTo(x + sz / 2, y - sz * 0.55, x + sz, y); g.stroke();
    return (crestCache[key] = c);
  }
  function buildWaves() {
    wavePts = [];
    const r = mulberry32(4242);
    for (let x = WORLD.x0 + 1; x < WORLD.x1; x += 1.7) for (let y = WORLD.y0 + 1; y < WORLD.y1; y += 1.3) {
      const px = x + (r() - 0.5) * 1.2, py = y + (r() - 0.5) * 0.9;
      if (MAP.landmassAt(px, py) >= 0) { r(); continue; }
      // stay a little off the shore so waves never sit on a beach
      let near = false;
      for (const [ox, oy] of [[0.7, 0], [-0.7, 0], [0, 0.6], [0, -0.6]]) if (MAP.landmassAt(px + ox, py + oy) >= 0) { near = true; break; }
      if (near) { r(); continue; }
      wavePts.push(px, py, r());
    }
    // bucket the crests into 10-unit cells so a frame only looks at the visible ones
    waveGrid = new Map();
    for (let i = 0; i < wavePts.length; i += 3) {
      const k = Math.floor(wavePts[i] / 10) * 1000 + Math.floor(wavePts[i + 1] / 10);
      let a = waveGrid.get(k); if (!a) waveGrid.set(k, a = []); a.push(i);
    }
  }
  const CLOUDS = (() => { const r = mulberry32(777), a = []; for (let i = 0; i < 22; i++) a.push({ x: -180 + r() * 360, y: -110 + r() * 170, w: 9 + r() * 14, k: r() < 0.5 ? 'cloud_a' : 'cloud_b', v: 0.12 + r() * 0.12 }); return a; })();
  function drawLive(z, vx0, vy0, vx1, vy1) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // little cartoon wave crests that swell and fade
    if (!wavePts) buildWaves();
    const keep = Math.min(1, (1.7 * z / 75) ** 2), sz = Math.max(4, Math.min(9, z * 0.5));
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    // each crest is a tiny pre-drawn sprite; stroking hundreds of curves a frame is too slow without a GPU
    const spr = crestSprite(Math.round(sz));
    const sw = spr.width / dpr, sh = spr.height / dpr;
    const gx0 = Math.floor(vx0 / 10), gx1 = Math.floor(vx1 / 10), gy0 = Math.floor(vy0 / 10), gy1 = Math.floor(vy1 / 10);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const cell = waveGrid.get(gx * 1000 + gy); if (!cell) continue;
      for (const i of cell) {
        const ph = wavePts[i + 2];
        if ((ph * 977) % 1 > keep) continue;
        const s = Math.sin(t * 0.9 + ph * 40);
        if (s < 0.1) continue;
        const wx = wavePts[i] + Math.sin(t * 0.4 + ph * 9) * 0.25, wy = wavePts[i + 1];
        const sx = (wx - cam.x) * z + W / 2, sy = (wy - cam.y) * z + H / 2;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
        const k = 0.7 + 0.3 * s;
        ctx.globalAlpha = Math.min(0.85, (s - 0.1) * 1.1);
        ctx.drawImage(spr, sx - sw * k / 2, sy - sh * k * 0.75, sw * k, sh * k);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  let FLOCKS = null;
  function drawClouds(z) {
    if (!props.ready) return;
    const a = Math.max(0, Math.min(0.85, (10 - z) / 5));
    if (a <= 0.01) return;
    const t = performance.now() / 1000, R = MAP_PROPS.rects;
    for (const c of CLOUDS) {
      let x = c.x + t * c.v; x = ((x + 200) % 400 + 400) % 400 - 200;
      const r = R[c.k], s = c.w / r[2];
      const [sx, sy] = worldToScreen(x - c.w / 2, c.y);
      const w = c.w * z, h = r[3] * s * z;
      if (sx > W || sx + w < 0 || sy > H || sy + h < -60) continue;
      ctx.globalAlpha = a * 0.22; ctx.drawImage(props.dark[c.k], sx + z * 2.5, sy + z * 3.2, w, h);
      ctx.globalAlpha = a; ctx.drawImage(props.img, r[0], r[1], r[2], r[3], sx, sy, w, h);
    }
    // flocks of birds circling their own patch of the world, so they stay put on the map while the camera moves
    if (z > 3.5 && z < 16) {
      if (!FLOCKS) {
        FLOCKS = [];
        const r = mulberry32(31337), land = MAP.provs.filter(p => p.terrain !== 'tundra');
        for (let i = 0; i < 70; i++) { const p = land[Math.floor(r() * land.length)]; FLOCKS.push({ x: p.x, y: p.y, R: 2 + r() * 4, w: (0.05 + r() * 0.05) * (r() < 0.5 ? -1 : 1), ph: r() * 6.3, n: 3 + Math.floor(r() * 4) }); }
      }
      ctx.globalAlpha = Math.min(0.8, (z - 3.5) / 3); ctx.strokeStyle = '#2b2a35'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      const sc = Math.max(0.7, Math.min(1.3, z / 9));
      for (const f of FLOCKS) {
        const an = t * f.w + f.ph;
        const [cx, cy] = worldToScreen(f.x + Math.cos(an) * f.R, f.y + Math.sin(an) * f.R * 0.7);
        if (cx < -60 || cx > W + 60 || cy < -60 || cy > H + 60) continue;
        // heading along the circle; the V trails behind the leader
        const hx = -Math.sin(an) * Math.sign(f.w), hy = Math.cos(an) * 0.7 * Math.sign(f.w), hl = Math.hypot(hx, hy) || 1;
        const ux = hx / hl, uy = hy / hl, px = -uy, py = ux;
        for (let k = 0; k < f.n; k++) {
          const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
          const bx = cx - ux * row * 12 * sc + px * side * row * 9 * sc, by = cy - uy * row * 12 * sc + py * side * row * 9 * sc;
          const flap = Math.sin(t * 7 + k * 1.3 + f.ph) * 2.5 * sc, s5 = 5 * sc;
          ctx.moveTo(bx - s5, by - 2 * sc - flap); ctx.quadraticCurveTo(bx - 2 * sc, by - 3 * sc, bx, by); ctx.quadraticCurveTo(bx + 2 * sc, by - 3 * sc, bx + s5, by - 2 * sc - flap);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Paint ocean, land, borders and coasts into context g (world transform already applied), limited to a view box.
  function paintWorld(g, z, vx0, vy0, vx1, vy1) {
    if (look()) return paintCartoon(g, z, vx0, vy0, vx1, vy1);
    const G = Sim.G;
    g.fillStyle = '#1f384b'; g.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    g.strokeStyle = 'rgba(190,215,230,0.07)'; g.lineWidth = 1 / z;
    g.beginPath();
    for (let lon = -180; lon <= 180; lon += 15) { if (lon >= vx0 - 1 && lon <= vx1 + 1) { g.moveTo(lon, Math.max(vy0, WORLD.y0)); g.lineTo(lon, Math.min(vy1, WORLD.y1)); } }
    for (let lat = -60; lat <= 80; lat += 15) { const y = GEO.project(0, lat)[1]; if (y >= vy0 - 1 && y <= vy1 + 1) { g.moveTo(Math.max(vx0, -180), y); g.lineTo(Math.min(vx1, 180), y); } }
    g.stroke();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(120,160,180,0.16)'; g.lineWidth = Math.max(0.9, 7 / z); g.stroke(coastPath);
    g.strokeStyle = 'rgba(120,160,180,0.12)'; g.lineWidth = Math.max(0.4, 3 / z); g.stroke(coastPath);
    MAP.lms.forEach((l, li) => {
      const b = l.bbox;
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) return;
      g.save();
      g.clip(lmClips[li], 'evenodd');
      for (const p of lmProvs[li]) {
        const bb = p.tb;
        if (bb[2] < vx0 || bb[0] > vx1 || bb[3] < vy0 || bb[1] > vy1) continue;
        g.fillStyle = fillCache[p.id];
        g.fill(provPaths[p.id]);
        if (G && state.mode === 'political' && G.owner[p.id] !== p.core && G.countries[p.core] && G.countries[p.core].alive) {
          const pat = g.createPattern(stripes(COUNTRY_BY_TAG[p.core].color), 'repeat');
          pat.setTransform(new DOMMatrix().scale(1 / z));
          g.globalAlpha = 0.55; g.fillStyle = pat; g.fill(provPaths[p.id]); g.globalAlpha = 1;
        }
      }
      if (z > 5) {
        g.lineWidth = Math.min(0.08, 0.9 / z); g.strokeStyle = 'rgba(20,20,15,' + Math.min(0.35, (z - 5) * 0.05) + ')';
        g.stroke(lmBorders[li]);
      }
      g.lineWidth = Math.max(1.3 / z, Math.min(0.14, 2.2 / z)); g.strokeStyle = 'rgba(16,18,16,0.78)';
      g.stroke(lmCountryBorders[li]);
      g.restore();
    });
    g.strokeStyle = 'rgba(10,20,26,0.85)'; g.lineWidth = 1.1 / z; g.stroke(coastPath);
    g.fillStyle = '#20394b'; g.fill(lakePath);
    g.strokeStyle = 'rgba(10,20,26,0.85)'; g.stroke(lakePath);
    g.setLineDash([3 / z, 3 / z]); g.strokeStyle = 'rgba(230,220,190,0.5)'; g.lineWidth = 1.2 / z;
    g.beginPath();
    for (const [a, b] of MAP.straits) { g.moveTo(MAP.provs[a].x, MAP.provs[a].y); g.lineTo(MAP.provs[b].x, MAP.provs[b].y); }
    g.stroke(); g.setLineDash([]);
  }

  // Cached raster of the whole world, used when zoomed out.
  const LS = 7;
  let layer = null, lctx = null;
  function layerTransform() { lctx.setTransform(LS, 0, 0, LS, -WORLD.x0 * LS, -WORLD.y0 * LS); }
  function buildLayer() {
    if (!layer) {
      layer = document.createElement('canvas');
      layer.width = Math.round((WORLD.x1 - WORLD.x0) * LS); layer.height = Math.round((WORLD.y1 - WORLD.y0) * LS);
      lctx = layer.getContext('2d');
    }
    layerTransform();
    paintWorld(lctx, LS, WORLD.x0, WORLD.y0, WORLD.x1, WORLD.y1);
  }
  function patchLayer(i) {
    const p = MAP.provs[i], r = p.spacing * 1.8 + 0.5;
    const box = [Math.max(p.tb[0], p.x - r) - 0.3, Math.max(p.tb[1], p.y - r) - 0.3, Math.min(p.tb[2], p.x + r) + 0.3, Math.min(p.tb[3], p.y + r) + 0.3];
    layerTransform();
    lctx.save();
    lctx.beginPath(); lctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); lctx.clip();
    paintWorld(lctx, LS, box[0], box[1], box[2], box[3]);
    lctx.restore();
  }

  // Viewport cache for close zoom: a raster of the view plus margin, reused while panning.
  const vc = { canvas: null, g: null, valid: false, z: 0, x0: 0, y0: 0, x1: 0, y1: 0, s: 1 };
  let lastZoomInput = 0;
  function buildView(vx0, vy0, vx1, vy1) {
    const mx = (vx1 - vx0) * 0.35, my = (vy1 - vy0) * 0.35;
    vc.x0 = vx0 - mx; vc.y0 = vy0 - my; vc.x1 = vx1 + mx; vc.y1 = vy1 + my;
    vc.z = cam.z; vc.s = cam.z * dpr;
    if (!vc.canvas) { vc.canvas = document.createElement('canvas'); vc.g = vc.canvas.getContext('2d'); }
    vc.canvas.width = Math.ceil((vc.x1 - vc.x0) * vc.s); vc.canvas.height = Math.ceil((vc.y1 - vc.y0) * vc.s);
    vc.g.setTransform(vc.s, 0, 0, vc.s, -vc.x0 * vc.s, -vc.y0 * vc.s);
    paintWorld(vc.g, vc.z, vc.x0, vc.y0, vc.x1, vc.y1);
    vc.valid = true;
  }
  function patchView(i) {
    if (!vc.valid) return;
    const p = MAP.provs[i], r = p.spacing * 1.8 + 0.5;
    const box = [Math.max(p.tb[0], p.x - r) - 0.3, Math.max(p.tb[1], p.y - r) - 0.3, Math.min(p.tb[2], p.x + r) + 0.3, Math.min(p.tb[3], p.y + r) + 0.3];
    if (box[2] < vc.x0 || box[0] > vc.x1 || box[3] < vc.y0 || box[1] > vc.y1) return;
    const g = vc.g;
    g.setTransform(vc.s, 0, 0, vc.s, -vc.x0 * vc.s, -vc.y0 * vc.s);
    g.save(); g.beginPath(); g.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); g.clip();
    paintWorld(g, vc.z, box[0], box[1], box[2], box[3]);
    g.restore();
  }

  function draw() {
    stepCamera();
    if (state.dirtyOwners || !lmCountryBorders.length || (Sim.G && Sim.G.hour !== lastDeadHour && (lastDeadHour = Sim.G.hour, deadCount() !== lastDead))) recolor();
    if (!layer) buildLayer();
    const G = Sim.G;
    const z = cam.z;
    const [vx0, vy0] = screenToWorld(0, 0), [vx1, vy1] = screenToWorld(W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (z * dpr <= LS * 1.25) {
      ctx.fillStyle = look() ? '#3a9acb' : '#1f384b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = look() && z * dpr < LS * 0.6 ? 'high' : 'low';
      const sx = (vx0 - WORLD.x0) * LS, sy = (vy0 - WORLD.y0) * LS;
      ctx.drawImage(layer, sx, sy, (vx1 - vx0) * LS, (vy1 - vy0) * LS, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    } else {
      const covers = vc.valid && vx0 >= vc.x0 && vy0 >= vc.y0 && vx1 <= vc.x1 && vy1 <= vc.y1;
      const zooming = cam.anim || performance.now() - lastZoomInput < 220;
      if (!(covers && (vc.z === z || zooming))) buildView(vx0, vy0, vx1, vy1);
      ctx.fillStyle = look() ? '#3a9acb' : '#1f384b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(vc.canvas, (vx0 - vc.x0) * vc.s, (vy0 - vc.y0) * vc.s, (vx1 - vx0) * vc.s, (vy1 - vy0) * vc.s, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    }
    if (look()) drawLive(z, vx0, vy0, vx1, vy1);
    // live overlays: front lines, hover, selection
    const overlay = (id, fn) => { const p = MAP.provs[id]; ctx.save(); ctx.clip(lmClips[p.lm], 'evenodd'); fn(p); ctx.restore(); };
    if (state.frontEdges) { ctx.lineWidth = 4 / z; ctx.strokeStyle = 'rgba(214,176,82,0.9)'; ctx.lineCap = 'round'; ctx.stroke(state.frontEdges); }
    if (state.hover >= 0) overlay(state.hover, () => { ctx.fillStyle = 'rgba(255,245,210,0.16)'; ctx.fill(provPaths[state.hover]); });
    // provinces just lost flash red for a few seconds
    if (state.flash && state.flash.length) {
      const now = performance.now();
      state.flash = state.flash.filter(f => now - f.t < 4000);
      for (const f of state.flash) overlay(f.prov, () => {
        const k = (now - f.t) / 4000, pulse = 0.5 + 0.5 * Math.sin((now - f.t) / 1000 * Math.PI * 3);
        ctx.fillStyle = `rgba(214,52,38,${(0.25 + 0.35 * pulse) * (1 - k)})`; ctx.fill(provPaths[f.prov]);
        ctx.lineWidth = 3 / z; ctx.strokeStyle = `rgba(255,90,70,${0.9 * (1 - k)})`; ctx.stroke(provPaths[f.prov]);
      });
    }
    if (state.selProv >= 0) overlay(state.selProv, () => {
      ctx.fillStyle = 'rgba(255,240,190,0.22)'; ctx.fill(provPaths[state.selProv]);
      ctx.lineWidth = 2.2 / z; ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.stroke(provPaths[state.selProv]);
    });

    if (G && state.mode === 'trade') drawTrade(z, vx0, vy0, vx1, vy1);
    if (G && state.mode === 'sea' && typeof Seas !== 'undefined') drawSeaTint(z);
    if (G && state.selZone >= 0 && typeof Seas !== 'undefined') drawZoneOutline(z, state.selZone);
    // ---- screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (look()) drawClouds(z);
    drawLabels(z, vx0, vy0, vx1, vy1);
    if (G && G.routes && G.routes.length) drawRoutes(z, vx0, vy0, vx1, vy1);
    if (G && G.ind) drawBuildings(z, vx0, vy0, vx1, vy1);
    drawCities(z, vx0, vy0, vx1, vy1);
    if (G && state.mode === 'sea' && typeof Seas !== 'undefined') drawZoneLabels(z);
    if (G) { drawPaths(z); if (G.fleets) { drawInvasions(z); drawWings(z, vx0, vy0, vx1, vy1); } drawArmies(z, vx0, vy0, vx1, vy1); drawFx(); if (G.fleets) drawFleets(z, vx0, vy0, vx1, vy1); drawBattles(z); Figures.pump(4); }
  }

  // trade map mode: arcs between trading capitals, coloured by good, thicker for bigger deals; cut deals dashed red
  const TRADE_COL = { food: '#a6d46e', metal: '#d3dbe2', fuel: '#c9a86e', strategic: '#f0a060', luxuries: '#dba6ec' };
  function drawTrade(z, vx0, vy0, vx1, vy1) {
    const G = Sim.G;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,18,0.35)'; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.lineCap = 'round';
    const cap = t => { const c = G.countries[t]; return c && c.alive && c.capital >= 0 ? MAP.provs[c.capital] : null; };
    const arc = (d, bend) => {
      const a = cap(d.from), b = cap(d.to); if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, off = len * bend;
      const cx = (a.x + b.x) / 2 - dy / len * off, cy = (a.y + b.y) / 2 + dx / len * off;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      // a dot at the buyer's end shows the direction
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.6 / z, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    };
    ctx.setLineDash([6 / z, 5 / z]); ctx.strokeStyle = 'rgba(226,80,62,0.9)'; ctx.lineWidth = 1.8 / z;
    for (const d of (G.eco && G.eco.cut) || []) if (d.cutAt > G.hour - 60 * 24) arc(d, 0.18);
    ctx.setLineDash([]);
    for (const d of G.dip.trade) { ctx.strokeStyle = TRADE_COL[d.good] || '#ccc'; ctx.lineWidth = (1 + Math.min(5, Math.sqrt(d.amount))) / z; arc(d, 0.12); }
    ctx.restore();
  }

  function drawLabels(z) {
    if (z > 11) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    for (const l of labels) {
      const px = l.size * z * (l.wide ? 0.34 : 0.26);
      if (px < 10 || l.n < 2 && px < 16) continue;
      const fs = Math.min(px, 64);
      const [sx, sy] = worldToScreen(l.x, l.y);
      if (sx < -200 || sx > W + 200 || sy < -50 || sy > H + 50) continue;
      const name = COUNTRY_BY_TAG[l.tag].name.toUpperCase();
      const toon = look();
      ctx.font = toon ? fs.toFixed(1) + 'px "Lilita One", "Barlow Semi Condensed", sans-serif' : '600 ' + fs.toFixed(1) + 'px "Saira Stencil One", "Barlow Semi Condensed", sans-serif';
      const spacing = fs * (toon ? 0.07 : 0.12);
      const w = ctx.measureText(name).width + spacing * name.length;
      if (w > l.size * z * 1.6 && fs > 14) continue;
      const box = [sx - w / 2, sy - fs / 2, sx + w / 2, sy + fs / 2];
      if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      ctx.globalAlpha = Math.max(0, Math.min(1, (11 - z) / 3));
      ctx.fillStyle = 'rgba(18,16,12,0.62)';
      let x = sx - w / 2;
      if (toon) {
        // chunky storybook lettering: white with a dark outline
        ctx.globalAlpha *= 0.92; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, fs * 0.16); ctx.strokeStyle = 'rgba(44,34,52,0.55)'; ctx.fillStyle = 'rgba(255,252,240,0.9)';
        for (const ch of name) { const cw = ctx.measureText(ch).width; ctx.strokeText(ch, x + cw / 2, sy); x += cw + spacing; }
        x = sx - w / 2;
      }
      for (const ch of name) { const cw = ctx.measureText(ch).width; ctx.fillText(ch, x + cw / 2, sy); x += cw + spacing; }
      ctx.globalAlpha = 1;
    }
  }

  function star(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function drawCities(z) {
    const G = Sim.G;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const caps = G ? new Set(Object.values(G.countries).filter(c => c.alive).map(c => c.capital)) : null;
    const placedCity = [], starPts = [], dotPts = [];
    const order = cityOrder || (cityOrder = MAP.provs.filter(p => p.city).sort((a, b) => b.pop - a.pop));
    const sorted = caps ? order.slice().sort((a, b) => caps.has(b.id) - caps.has(a.id)) : order.slice().sort((a, b) => b.capital - a.capital);
    for (const p of sorted) {
      const isCap = caps ? caps.has(p.id) : p.capital;
      if (!isCap && z < 9) continue;
      if (isCap && z < 2.2) continue;
      const [sx, sy] = worldToScreen(p.x, p.y);
      if (sx < -40 || sx > W + 40 || sy < -20 || sy > H + 20) continue;
      (isCap ? starPts : dotPts).push(sx, sy);
      if ((isCap && z > 4.5) || z > 13) {
        ctx.font = look() ? (isCap ? '600 14px' : '500 12.5px') + ' "Fredoka", "Barlow Semi Condensed", sans-serif' : (isCap ? '600 13px' : '500 12px') + ' "Barlow Semi Condensed", sans-serif';
        const w = ctx.measureText(p.city).width;
        const box = [sx + 6, sy - 8, sx + 10 + w, sy + 8];
        if (placedCity.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
        placedCity.push(box);
        ctx.lineJoin = 'round'; ctx.lineWidth = look() ? 4 : 3; ctx.strokeStyle = look() ? 'rgba(40,30,50,0.9)' : 'rgba(16,16,12,0.85)'; ctx.strokeText(p.city, sx + 8, sy);
        ctx.fillStyle = look() ? '#ffffff' : '#f1ead2'; ctx.fillText(p.city, sx + 8, sy);
      }
    }
    ctx.beginPath();
    for (let i = 0; i < dotPts.length; i += 2) { ctx.moveTo(dotPts[i] + 2.6, dotPts[i + 1]); ctx.arc(dotPts[i], dotPts[i + 1], 2.6, 0, Math.PI * 2); }
    ctx.fillStyle = '#e8dfc2'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#1b1a14'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < starPts.length; i += 2) {
      const cx = starPts[i], cy = starPts[i + 1];
      for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 2.7 : 6; const px = cx + Math.cos(an) * rr, py = cy + Math.sin(an) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath();
    }
    ctx.fillStyle = look() ? '#ffd447' : '#efe6c8'; ctx.fill(); ctx.lineWidth = look() ? 1.6 : 1.2; ctx.strokeStyle = look() ? '#3a2a10' : '#1b1a14'; ctx.stroke();
    if (z > 16) {
      ctx.font = 'italic 500 11px "Barlow Semi Condensed", sans-serif'; ctx.textAlign = 'center';
      for (const p of MAP.provs) {
        if (p.city) continue;
        const [sx, sy] = worldToScreen(p.x, p.y);
        if (sx < -40 || sx > W + 40 || sy < -20 || sy > H + 20) continue;
        ctx.fillStyle = 'rgba(20,18,12,0.55)'; ctx.fillText(p.name, sx, sy + 16);
      }
    }
  }

  // ---------- buildings: each finished industry or military work stands in its own province ----------
  const bSpots = new Map();
  function spotsFor(p) {
    let s = bSpots.get(p.id); if (s) return s;
    s = [];
    const sp = p.spacing || 1;
    for (let i = 0; i < 40 && s.length < 8; i++) {
      const ring = i < 16 ? 0.48 : i < 30 ? 0.34 : 0.22;
      const an = i * 2.39996 + p.id * 0.61;
      const x = p.x + Math.cos(an) * sp * ring, y = p.y + Math.sin(an) * sp * ring * 0.85;
      if (provinceAt(x, y) !== p.id) continue;
      if (s.some(q => Math.hypot(q[0] - x, q[1] - y) < sp * 0.2)) continue;
      s.push([x, y]);
    }
    for (let i = 0; s.length < 8; i++) s.push([p.x + (i - 2) * sp * 0.12, p.y + sp * 0.2]);
    bSpots.set(p.id, s);
    return s;
  }
  function buildingsIn(pid) {
    const I = Sim.G.ind[pid], out = [];
    if (I) for (const k of Economy.KIND_KEYS) if (I[k]) out.push([k, I[k]]);
    for (const k of Economy.INFRA_KEYS) { const l = Economy.infra(pid, k); if (l) out.push([k, l]); }
    return out;
  }
  let bDrawn = 0;
  function drawBuildings(z, vx0, vy0, vx1, vy1) {
    bDrawn = 0;
    if (typeof Buildings === 'undefined' || typeof Economy === 'undefined') return;
    const G = Sim.G, era = Economy.eraId();
    const me = G.countries[G.player];
    const pend = new Map();
    if (me && me.eco && me.eco.queue) for (const q of me.eco.queue) { if (!pend.has(q.prov)) pend.set(q.prov, []); pend.get(q.prov).push(q); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of MAP.provs) {
      if (p.x < vx0 - 3 || p.x > vx1 + 3 || p.y < vy0 - 3 || p.y > vy1 + 3) continue;
      const px = (p.spacing || 1) * z;
      if (px < 30) continue;
      const list = buildingsIn(p.id), q = pend.get(p.id);
      if (!list.length && !q) continue;
      const size = Math.max(20, Math.min(44, px * 0.36));
      const col = COUNTRY_BY_TAG[G.owner[p.id]] ? COUNTRY_BY_TAG[G.owner[p.id]].color : '#8a7a5c';
      const spots = spotsFor(p).slice(0, px < 50 ? 3 : px < 80 ? 5 : 8);
      let n = 0;
      const put = (kind, count, job) => {
        if (n >= spots.length) return;
        const [wx, wy] = spots[n++];
        const [sx, sy] = worldToScreen(wx, wy);
        if (sx < -size || sx > W + size || sy < -size || sy > H + size) return;
        const x = sx - size / 2, y = sy - size * 0.8;
        const img = Buildings.icon(kind, era, col, size * dpr, (p.id + n) % 4);
        if (!img) return;
        if (job) ctx.globalAlpha = 0.5;
        bDrawn++;
        ctx.drawImage(img, x, y, size, size);
        ctx.globalAlpha = 1;
        if (job) {
          // scaffolding and a ring that fills as the work goes on
          ctx.strokeStyle = 'rgba(214,176,82,0.95)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + size * 0.15, y + size * 0.9); ctx.lineTo(x + size * 0.15, y + size * 0.25); ctx.moveTo(x + size * 0.85, y + size * 0.9); ctx.lineTo(x + size * 0.85, y + size * 0.25);
          ctx.moveTo(x + size * 0.15, y + size * 0.45); ctx.lineTo(x + size * 0.85, y + size * 0.45); ctx.moveTo(x + size * 0.15, y + size * 0.7); ctx.lineTo(x + size * 0.85, y + size * 0.7); ctx.stroke();
          const f = Math.max(0, Math.min(1, 1 - job.left / job.total)), r = Math.max(3, size * 0.16), cx = x + size - r * 0.4, cy = y + r;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,18,14,0.8)'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#d6b052'; ctx.fill();
        } else if (count > 1 && size >= 16) {
          const bx = x + size - 3, by = y + size - 3;
          ctx.font = '700 ' + Math.round(Math.max(9, size * 0.36)) + 'px "Barlow Semi Condensed", sans-serif';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,16,12,0.9)'; ctx.strokeText(count, bx, by);
          ctx.fillStyle = '#f1ead2'; ctx.fillText(count, bx, by);
        }
      };
      if (q) for (const j of q) put(j.kind, 1, j);
      for (const [k, c] of list) put(k, c, null);
    }
  }

  // ---------- roads and railways: drawn under the buildings, with era traffic and a laying animation ----------
  const ROAD_LOOK = {
    'greece-431bc': { w: 3, col: '#b39264', edge: 'rgba(52,36,18,.6)' },
    'rome-117': { w: 3.8, col: '#cbc3b1', edge: '#4a4339', stones: '#8b8374' },
    'medieval-1200': { w: 3.2, col: '#a17f55', edge: 'rgba(46,32,18,.65)', ruts: '#6f5434' },
    'napoleonic-1805': { w: 3.5, col: '#cfbb92', edge: '#56462f' },
    'greatwar-1914': { w: 3.8, col: '#8c8980', edge: '#2d2b27' },
    'ww2-1936': { w: 4.2, col: '#3d3d3b', edge: '#171716', centre: '#e6ddbb' }
  };
  const LAY_MS = 2200, STAGGER_MS = 380;
  const rGeo = new Map(), rAnim = new Map();
  const rSmoke = [], rSparks = [];
  let rLast = 0, rStagger = 0, rStaggerAt = 0, rDrawn = 0;
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // world-space centre line: from a building spot, through the province centres on the way, to a building spot
  function routeGeo(r) {
    const key = r.id + ':' + r.path.join(',');
    let g = rGeo.get(r.id);
    if (g && g.key === key) return g;
    const P = MAP.provs, a = P[r.a], b = P[r.b];
    const sa = spotsFor(a)[0], sb = spotsFor(b)[0];
    let pts = [[sa[0], sa[1]]].concat(r.path.slice(1, -1).map(i => [P[i].x, P[i].y]), [[sb[0], sb[1]]]);
    if (pts.length === 2) {
      // a gentle bend, so neighbouring routes don't look ruled
      const [p0, p1] = pts, d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, side = r.id & 1 ? 1 : -1, bend = d * (0.06 + (r.id % 5) * 0.012) * side;
      const cx = (p0[0] + p1[0]) / 2 - (p1[1] - p0[1]) / d * bend, cy = (p0[1] + p1[1]) / 2 + (p1[0] - p0[0]) / d * bend;
      pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * cx + t * t * p1[0], u * u * p0[1] + 2 * u * t * cy + t * t * p1[1]]); }
    } else for (let k = 0; k < 2; k++) {             // Chaikin: round the corners at each province centre
      const q = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const A = pts[i], B = pts[i + 1]; q.push([A[0] * 0.75 + B[0] * 0.25, A[1] * 0.75 + B[1] * 0.25], [A[0] * 0.25 + B[0] * 0.75, A[1] * 0.25 + B[1] * 0.75]); }
      q.push(pts[pts.length - 1]); pts = q;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    // the border post stands where the route enters the partner's land
    let post = null;
    if (r.trade && r.cross > 0) { const A = P[r.path[r.cross - 1]], B = P[r.path[r.cross]]; post = [(A.x + B.x) / 2, (A.y + B.y) / 2]; }
    else if (r.trade) post = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
    g = { key, pts, box: [x0, y0, x1, y1], sp: ((a.spacing || 1) + (b.spacing || 1)) / 2, post };
    rGeo.set(r.id, g);
    if (rGeo.size > 4000) rGeo.clear();
    return g;
  }
  // the same line in screen pixels, with the running length
  function screenLine(g) {
    const out = []; let L = 0;
    for (let i = 0; i < g.pts.length; i++) {
      const [x, y] = worldToScreen(g.pts[i][0], g.pts[i][1]);
      if (i) { const o = out[i - 1]; L += Math.hypot(x - o.x, y - o.y); o.ang = Math.atan2(y - o.y, x - o.x); }
      out.push({ x, y, s: L, ang: 0 });
    }
    if (out.length > 1) out[out.length - 1].ang = out[out.length - 2].ang;
    out.len = L;
    return out;
  }
  function lineAt(l, s) {
    s = Math.max(0, Math.min(l.len, s));
    let lo = 1, hi = l.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (l[m].s < s) lo = m + 1; else hi = m; }
    const a = l[lo - 1], b = l[lo] || a, f = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: a.ang };
  }
  function traceLine(l, upto, off, pa) {
    const lim = upto === undefined ? l.len : upto;
    const c = pa || ctx;
    if (!pa) ctx.beginPath();
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (p.s > lim) { const q = lineAt(l, lim); c.lineTo(q.x - (off ? Math.sin(q.ang) * off : 0), q.y + (off ? Math.cos(q.ang) * off : 0)); break; }
      const x = off ? p.x - Math.sin(p.ang) * off : p.x, y = off ? p.y + Math.cos(p.ang) * off : p.y;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
  }
  function tickPath(l, upto, every, half, pa) {
    for (let s = every / 2; s < upto; s += every) { const q = lineAt(l, s), nx = -Math.sin(q.ang), ny = Math.cos(q.ang); pa.moveTo(q.x - nx * half, q.y - ny * half); pa.lineTo(q.x + nx * half, q.y + ny * half); }
  }
  function tickMarks(l, upto, every, half, col, w) {
    ctx.beginPath(); tickPath(l, upto, every, half, ctx);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  // finished routes are stroked together, one path per layer and width, which is far cheaper
  let rBatch = null;
  function layerStroke(stat, layer, col, w, dash, fn) {
    if (stat) {
      const key = layer + '|' + col + '|' + w.toFixed(2) + '|' + (dash || '');
      let b = rBatch.get(key);
      if (!b) { b = { layer, col, w, dash, pa: new Path2D() }; rBatch.set(key, b); }
      fn(b.pa);
      return;
    }
    ctx.beginPath(); fn(ctx);
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }
  // little vehicles, facing +x, about 10 px long at scale 1
  const vRect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const vEll = (x, y, rx, ry, c) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
  const vLine = (x, y, w, h) => { ctx.strokeStyle = 'rgba(10,10,8,.85)'; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, w, h); };
  const vAnimal = (x, y, c, ph) => { const b = Math.sin(ph) * 0.35; vEll(x, y + b, 2.4, 1.05, c); vEll(x + 2.5, y + b, 0.9, 0.7, c); };
  function vCart(bed, cover) { vRect(-7, -2.2, 6, 4.4, bed); vLine(-7, -2.2, 6, 4.4); if (cover) vEll(-4, 0, 3.1, 2.1, cover); vRect(-6, -2.9, 1.6, 0.7, '#1b1812'); vRect(-6, 2.2, 1.6, 0.7, '#1b1812'); vRect(-1, -0.3, 2, 0.6, '#5a4128'); }
  function vLorry(cab, bed) { vRect(-6, -2.2, 7, 4.4, bed); vLine(-6, -2.2, 7, 4.4); vRect(1.4, -2, 3.2, 4, cab); vLine(1.4, -2, 3.2, 4); vRect(3.2, -1.6, 0.8, 3.2, 'rgba(170,190,200,.7)'); }
  function vehicle(era, war, pick, col, ph) {
    if (war) {
      if (era === 'greatwar-1914' || era === 'ww2-1936') return vLorry('#4d5634', '#667046');
      vCart('#6b5436', '#b8ae8a'); vAnimal(3.5, -1, '#5a3c26', ph); vAnimal(3.5, 1.1, '#4a3120', ph + 1); return;
    }
    if (era === 'greece-431bc') { vCart('#8a6a3c'); vAnimal(3.6, -1.1, '#d6c8ad', ph * 0.6); vAnimal(3.6, 1.1, '#c2b394', ph * 0.6 + 1); return; }
    if (era === 'rome-117') { if (pick < 0.35) { vAnimal(0, 0, '#7a6a58', ph); vRect(-1.6, -1.8, 3, 3.6, 'rgba(160,120,70,.95)'); return; } vCart('#9b6b3e'); vAnimal(3.6, 0, '#6b4a2e', ph); return; }
    if (era === 'medieval-1200') { if (pick < 0.4) { vAnimal(0, 0, '#6d5a47', ph); vRect(-1.5, -2, 2.6, 4, '#8f7a52'); return; } vCart('#7e6240', '#d9cfb4'); vAnimal(3.6, 0, '#5b3f28', ph); return; }
    if (era === 'napoleonic-1805') {
      if (pick < 0.5) { vRect(-7, -2.4, 6.4, 4.8, '#2d2620'); vRect(-6.4, -1.8, 5.2, 3.6, col % 2 ? '#6b2a24' : '#2b3f5a'); vLine(-7, -2.4, 6.4, 4.8); vAnimal(3.4, -1.1, '#3a2a1c', ph); vAnimal(3.4, 1.1, '#5b3f28', ph + 1); return; }
      vCart('#7b5f3d', '#e2d8bd'); vAnimal(3.6, -1, '#6b4a2e', ph); vAnimal(3.6, 1.1, '#4a3120', ph + 1); return;
    }
    if (era === 'greatwar-1914') { if (pick < 0.5) { vCart('#6d5a3a'); vAnimal(3.6, 0, '#5b3f28', ph); return; } return vLorry('#4a4a44', '#8a8570'); }
    if (pick < 0.3) return vLorry('#5a5f55', '#8e8c80');
    const cols = ['#a8382c', '#2f4c78', '#1e1e1e', '#d6c79d', '#3c6848'];
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-4, -1.9, 8, 3.8, 1.4); else ctx.rect(-4, -1.9, 8, 3.8);
    ctx.fillStyle = cols[col % 5]; ctx.fill(); ctx.strokeStyle = 'rgba(8,8,8,.8)'; ctx.lineWidth = 0.5; ctx.stroke();
    vRect(-1.4, -1.5, 3, 3, 'rgba(20,24,28,.7)'); vRect(1.8, -1.5, 0.8, 3, 'rgba(160,190,210,.8)');
  }
  function drawTrain(l, s, dir, f, war, era, world) {
    const cars = war ? ['#4d5634', '#4d5634', '#5a6340', '#4d5634'] : (era === 'ww2-1936' ? ['#6b3b2a', '#56585a', '#2a3b52', '#6b3b2a'] : ['#6b3b2a', '#5d5448', '#6b3b2a']);
    const L = 9.5, k = 1.3 * f;
    [null].concat(cars).forEach((c, i) => {
      const at = s - dir * k * (i ? i * (L + 1) + 3 : 0);
      if (at < 0 || at > l.len) return;
      const q = lineAt(l, at);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang + (dir < 0 ? Math.PI : 0)); ctx.scale(k, k);
      if (!c) {
        vRect(-6.5, -2.3, 3.2, 4.6, '#26221f'); vLine(-6.5, -2.3, 3.2, 4.6);
        vEll(0.5, 0, 5.6, 2.1, '#1a1918'); vRect(-3.8, -2.4, 3, 4.8, '#1a1918'); vLine(-3.8, -2.4, 3, 4.8);
        vEll(3.6, 0, 1, 1, '#3a3a38'); vRect(5.4, -1.6, 0.8, 3.2, '#8c2a22');
      } else { vRect(-L / 2, -2.2, L, 4.4, c); vLine(-L / 2, -2.2, L, 4.4); vRect(-L / 2 + 0.6, -0.2, L - 1.2, 0.4, 'rgba(0,0,0,.35)'); }
      ctx.restore();
      if (!c && rSmoke.length < 160 && Math.random() < 0.12) rSmoke.push({ w: screenToWorld(q.x + Math.cos(q.ang) * 4.7 * dir * k, q.y + Math.sin(q.ang) * 4.7 * dir * k), r: 1.4 * f, a: 0.75 });
    });
  }
  function drawRoutes(z, vx0, vy0, vx1, vy1) {
    const G = Sim.G, now = performance.now(), era = typeof Economy !== 'undefined' ? Economy.eraId() : 'ww2-1936';
    const S = ROAD_LOOK[era] || ROAD_LOOK['ww2-1936'];
    const dt = rLast ? Math.min(0.1, (now - rLast) / 1000) : 0; rLast = now;
    const still = reduceMotion(), paused = G.paused;
    if (now - rStaggerAt > 3000) rStagger = 0;
    const R = G.routes.slice().sort((a, b) => (a.rail === b.rail ? 0 : a.rail ? 1 : -1));
    rBatch = new Map();
    const traffic = [];
    rDrawn = 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of R) {
      const g = routeGeo(r), b = g.box;
      if (b[2] < vx0 - 2 || b[0] > vx1 + 2 || b[3] < vy0 - 2 || b[1] > vy1 + 2) continue;
      const px = g.sp * z;
      // first sight of a new route: lay it down over two seconds, one after another
      let A = rAnim.get(r.id);
      if (!A) {
        const fresh = r.state === 'building' && G.hour - r.born < 72 && !still;
        A = { t0: fresh ? now + 250 + (rStagger++) * STAGGER_MS : -1e9, state: r.state, flash: 0 };
        if (fresh) rStaggerAt = now;
        rAnim.set(r.id, A);
      }
      if (A.state !== r.state) { if (r.state === 'open' && !still) A.flash = now; A.state = r.state; }
      if (px < 30) continue;
      let f = Math.max(0.45, Math.min(1.4, px / 80));
      const l = screenLine(g);
      if (l.len < 4) continue;
      const lay = still ? 1 : Math.max(0, Math.min(1, (now - A.t0) / LAY_MS));
      if (lay <= 0) continue;
      const reveal = 1 - Math.pow(1 - lay, 2.2);
      const cutNow = Routes.isCut(r);
      const idle = r.idle !== undefined;
      ctx.save();
      if (cutNow) ctx.globalAlpha = 0.45;
      if (idle && !cutNow) ctx.globalAlpha = 0.3;
      const prog = r.state === 'building' ? Math.max(0, Math.min(1, 1 - r.left / r.total)) : 1;
      if (r.state === 'building') {
        ctx.setLineDash([5 * f, 5 * f]); traceLine(l); ctx.strokeStyle = r.rail ? '#27231f' : S.edge; ctx.lineWidth = (r.rail ? 3 : S.w) * f; ctx.stroke(); ctx.setLineDash([]);
      }
      const upto = l.len * prog * reveal;
      rDrawn++;
      const st = lay >= 1 && r.state === 'open' && !cutNow && !idle && !(A.flash && now - A.flash < 900);
      if (st) f = Math.round(f * 10) / 10;
      if (r.rail) {
        // ballast and sleepers first, the rails a little behind
        layerStroke(st, 0, '#6a635a', 6.2 * f, null, pa => traceLine(l, upto, 0, pa));
        if (f >= 0.7) layerStroke(st, 1, '#3b2d21', 1.2 * f, null, pa => tickPath(l, upto, 3.6 * f, 3.4 * f, pa));
        const railTo = lay >= 1 ? upto : Math.max(0, upto - 22 * f);
        layerStroke(st, 2, '#1c1c1d', 0.9 * f, null, pa => { traceLine(l, railTo, -1.4 * f, pa); traceLine(l, railTo, 1.4 * f, pa); });
      } else {
        layerStroke(st, 0, S.edge, (S.w + 1.8) * f, null, pa => traceLine(l, upto, 0, pa));
        layerStroke(st, 1, S.col, S.w * f, null, pa => traceLine(l, upto, 0, pa));
        if (S.stones && f >= 0.7) layerStroke(st, 2, S.stones, 0.6 * f, null, pa => tickPath(l, upto, 3 * f, S.w / 2 * f, pa));
        if (S.ruts && f >= 0.7) layerStroke(st, 2, S.ruts, 0.5 * f, null, pa => { traceLine(l, upto, -0.8 * f, pa); traceLine(l, upto, 0.8 * f, pa); });
        if (S.centre) layerStroke(st, 2, S.centre, 0.6 * f, [3 * f, 3 * f], pa => traceLine(l, upto, 0, pa));
      }
      ctx.restore();
      // the working end while it is being laid: a work cart, with dust on roads and sparks on rails
      if (lay < 1) {
        const q = lineAt(l, upto);
        if (Math.random() < 0.6) rSmoke.push({ w: screenToWorld(q.x + (Math.random() - 0.5) * 4, q.y + (Math.random() - 0.5) * 4), r: 1.2 * f, a: 0.55, dust: !r.rail });
        if (r.rail && Math.random() < 0.5) rSparks.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 25, a: 1 });
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang); ctx.scale(1.35 * f, 1.35 * f);
        if (r.rail) { vRect(-5, -2.2, 6, 4.4, '#4a4036'); vLine(-5, -2.2, 6, 4.4); vRect(-4.4, -1.6, 4.8, 1.2, '#8a6a44'); vRect(-4.4, 0.4, 4.8, 1.2, '#8a6a44'); }
        else if (era === 'greatwar-1914' || era === 'ww2-1936') vLorry('#6a5a3a', '#9a8a60');
        else { vCart('#7a5c38'); vAnimal(3.6, 0, '#5b3f28', now / 140); }
        ctx.restore();
      } else if (A.flash && now - A.flash < 900 && !cutNow) {
        // a brass flash runs along a route the moment it is finished
        const k = (now - A.flash) / 900;
        ctx.save(); ctx.globalAlpha = 0.6 * (1 - k); traceLine(l); ctx.strokeStyle = '#f0c56a'; ctx.lineWidth = ((r.rail ? 6 : S.w) + 5 * (1 - k)) * f; ctx.stroke(); ctx.restore();
      }
      if (lay >= 1 && r.state === 'building') {
        const q = lineAt(l, l.len / 2), rad = 7 * f;
        ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,18,14,.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(q.x, q.y, rad - 1.5 * f, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.strokeStyle = '#d6b052'; ctx.lineWidth = 2.2 * f; ctx.stroke();
      }
      if (g.post && reveal >= 0.6) {
        const [sx, sy] = worldToScreen(g.post[0], g.post[1]), q = lineAt(l, l.len * 0.55);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.ang + Math.PI / 2); ctx.scale(f, f);
        vRect(-5.5, -0.9, 11, 1.8, '#f2eee4'); for (let i = -4; i < 5; i += 3) vRect(i, -0.9, 1.5, 1.8, !cutNow && !idle ? '#b8392c' : '#77706a');
        ctx.strokeStyle = '#1b1a14'; ctx.lineWidth = 0.5; ctx.strokeRect(-5.5, -0.9, 11, 1.8); vRect(-6.8, -1.6, 1.8, 3.2, '#3a3a36');
        ctx.restore();
      }
      if (cutNow && lay >= 1) for (const k of [0.42, 0.58]) {
        const q = lineAt(l, l.len * k);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang); ctx.strokeStyle = '#e0503d'; ctx.lineWidth = 2.4 * f; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-3.5 * f, -3.5 * f); ctx.lineTo(3.5 * f, 3.5 * f); ctx.moveTo(3.5 * f, -3.5 * f); ctx.lineTo(-3.5 * f, 3.5 * f); ctx.stroke(); ctx.restore();
      }
      // traffic on working routes, more of it between busy buildings; wartime traffic is military
      if (lay < 1 || r.state !== 'open' || cutNow || idle || px < 50) continue;
      traffic.push([r, l, f, A]);
    }
    // the batched strokes, bottom layer first
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of [...rBatch.values()].sort((a, c) => a.layer - c.layer)) {
      if (b.dash) ctx.setLineDash(b.dash);
      ctx.strokeStyle = b.col; ctx.lineWidth = b.w; ctx.stroke(b.pa);
      if (b.dash) ctx.setLineDash([]);
    }
    rBatch = null;
    let vehicles = 0;
    for (const [r, l, f, A] of traffic) {
      if (vehicles > 80) break;
      const war = Sim.isAtWar(r.tag);
      const t = still || paused ? (A.frozen || (A.frozen = now)) : (A.frozen = 0, now);
      if (r.rail) {
        const cyc = r.km / 26 + 2.4, u = ((t / 1000 + r.id * 7.3) % (cyc * 2)) / cyc;   // out and back, waiting at each end
        const dir = u < 1 ? 1 : -1, v = u < 1 ? u : u - 1, frac = Math.min(1, Math.max(0, (v * cyc - 1.2) / (cyc - 2.4)));
        const s = dir > 0 ? frac * (l.len + 40 * f) - 20 * f : l.len + 20 * f - frac * (l.len + 40 * f);
        drawTrain(l, s, dir, f, war, era);
        vehicles += 4;
        continue;
      }
      const I = G.ind, busy = [r.a, r.b].reduce((n, p) => n + (I[p] ? Object.values(I[p]).reduce((x, y) => x + y, 0) : 0), 0);
      const n = Math.max(1, Math.min(5, Math.round(r.km / 110) + Math.floor(busy / 3)));
      const speed = era === 'greatwar-1914' || era === 'ww2-1936' ? 16 : 7;
      for (let i = 0; i < n; i++) {
        const h = ((r.id * 2654435761 + i * 40503) >>> 0) / 4294967296;
        const vs = speed * (0.8 + h * 0.4), per = r.km / vs;
        const u = ((t / 1000 / per + h * 2 + i * 0.37) % 2 + 2) % 2, dir = u < 1 ? 1 : -1, frac = u < 1 ? u : 2 - u;
        const q = lineAt(l, frac * l.len), lane = (dir > 0 ? 1.6 : -1.6) * f;
        ctx.save(); ctx.translate(q.x - Math.sin(q.ang) * lane, q.y + Math.cos(q.ang) * lane); ctx.rotate(q.ang + (dir < 0 ? Math.PI : 0)); ctx.scale(1.35 * f, 1.35 * f);
        vehicle(era, war, h, i, t / 160 + frac * 20);
        ctx.restore();
        vehicles++;
      }
    }
    // smoke, dust and sparks
    for (let i = rSmoke.length - 1; i >= 0; i--) {
      const p = rSmoke[i]; if (!still) { p.r += dt * 4; p.a -= dt * 0.55; }
      if (p.a <= 0) { rSmoke.splice(i, 1); continue; }
      const [x, y] = worldToScreen(p.w[0], p.w[1]);
      vEll(x, y - (0.75 - p.a) * 8, p.r, p.r, p.dust ? `rgba(196,170,120,${p.a.toFixed(3)})` : `rgba(215,210,200,${p.a.toFixed(3)})`);
    }
    for (let i = rSparks.length - 1; i >= 0; i--) {
      const p = rSparks[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.a -= dt * 2.5;
      if (p.a <= 0) { rSparks.splice(i, 1); continue; }
      vEll(p.x, p.y, 0.7, 0.7, `rgba(255,${190 + Math.round(50 * p.a)},90,${p.a.toFixed(3)})`);
    }
    if (rSmoke.length > 400) rSmoke.splice(0, rSmoke.length - 400);
    if (rSparks.length > 200) rSparks.splice(0, rSparks.length - 200);
  }

  function drawPaths(z) {
    const G = Sim.G;
    for (const a of G.armies) {
      if (a.owner !== G.player || !a.path.length) continue;
      const sel = state.selArmies.has(a.id);
      const pts = [armyPos(a), ...a.path.map(id => [MAP.provs[id].x, MAP.provs[id].y])].map(p => worldToScreen(p[0], p[1]));
      const col = a.order === 'attack' ? '214,82,64' : a.order === 'redeploy' ? '110,170,220' : a.order === 'retreat' ? '200,200,200' : '150,200,110';
      ctx.lineWidth = sel ? 4 : 2.5; ctx.strokeStyle = 'rgba(' + col + ',' + (sel ? 0.95 : 0.6) + ')';
      if (a.order === 'redeploy') ctx.setLineDash([6, 5]);
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.setLineDash([]);
      const e = pts[pts.length - 1], s = pts[pts.length - 2];
      const ang = Math.atan2(e[1] - s[1], e[0] - s[0]), L = sel ? 14 : 10;
      ctx.beginPath(); ctx.moveTo(e[0], e[1]);
      ctx.lineTo(e[0] - Math.cos(ang - 0.45) * L, e[1] - Math.sin(ang - 0.45) * L);
      ctx.lineTo(e[0] - Math.cos(ang + 0.45) * L, e[1] - Math.sin(ang + 0.45) * L);
      ctx.closePath(); ctx.fillStyle = 'rgba(' + col + ',0.95)'; ctx.fill();
    }
    // offensive targets still ahead (army regrouping)
    for (const a of G.armies) {
      if (a.owner !== G.player || a.order !== 'attack' || a.path.length || a.target < 0 || a.target === a.prov) continue;
      const [sx, sy] = worldToScreen(...armyPos(a)), t = MAP.provs[a.target], [tx, ty] = worldToScreen(t.x, t.y);
      ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214,82,64,0.7)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  const SYM = {
    inf(x, y, w, h) { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); },
    arm(x, y, w, h) { ctx.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.3, 0, 0, Math.PI * 2); },
    mec(x, y, w, h) { SYM.inf(x, y, w, h); ctx.moveTo(x + w * 0.86, y + h / 2); ctx.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.3, 0, 0, Math.PI * 2); },
    mot(x, y, w, h) { SYM.inf(x, y, w, h); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); },
    art(x, y, w, h) { ctx.moveTo(x + w / 2 + 2.2, y + h / 2); ctx.arc(x + w / 2, y + h / 2, 2.2, 0, Math.PI * 2); },
    rec(x, y, w, h) { ctx.moveTo(x, y + h); ctx.lineTo(x + w, y); },
    mar(x, y, w, h) { SYM.inf(x, y, w, h); ctx.moveTo(x + w * 0.2, y + h * 0.85); ctx.quadraticCurveTo(x + w / 2, y + h * 1.25, x + w * 0.8, y + h * 0.85); },
    par(x, y, w, h) { SYM.inf(x, y, w, h); ctx.moveTo(x + w * 0.2, y + h * 0.35); ctx.quadraticCurveTo(x + w / 2, y - h * 0.2, x + w * 0.8, y + h * 0.35); }
  };
  function mainType(a) {
    const cnt = {};
    for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + (u.type === 'tanks' ? 2.5 : u.type === 'artillery' ? 0.5 : 1);
    return Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0] || LAND_TYPES[0];
  }

  // smoothed on-screen positions and headings, so figures glide between hourly simulation steps
  const disp = new Map();
  let lastDisp = 0, figCount = 0;
  // who each fighting army is fighting: attackers face the province they attack, defenders face the
  // province the attack comes from (so both sides of a battle show it, not only the attacker)
  let fights = new Map();
  function buildFights(G) {
    fights = new Map();
    for (const b of G.battles) {
      const atts = b.attackers.filter(id => b.from[id] !== undefined);
      if (!atts.length) continue;
      for (const id of atts) fights.set(id, { prov: b.prov, b });
      for (const d of Sim.hostilesAt(b.atkTag, b.prov)) if (!fights.has(d.id)) fights.set(d.id, { prov: b.from[atts[0]], b });
    }
  }
  const fightTarget = a => fights.get(a.id) || null;

  // ---------- battle effects, matched to the weapons of the era ----------
  // rifles fire tracers, muskets and cannon give flashes and white smoke, bows and slings send arrows in
  // volleys, siege engines lob stones, and spears, swords, horsemen and elephants clash in melee
  const fx = [];
  let fxLast = 0;
  function fightStyle(type) {
    const kind = Figures.kindOf(type), look = UNIT_TYPES[type] && UNIT_TYPES[type].look;
    if (look === 'horsearcher' || look === 'chariot') return 'arrow';
    return { soldiers: 'rifle', truck: 'rifle', halftrack: 'rifle', car: 'rifle', tank: 'shell', gun: 'shell', musket: 'musket', cannon: 'cannon',
      archer: 'arrow', riderbow: 'arrow', engine: 'stone' }[kind] || 'melee';
  }
  // rates per figure per second
  const FX_RATE = { rifle: 5, shell: 0.7, musket: 0.45, cannon: 0.4, arrow: 0.6, stone: 0.3, melee: 7 };
  function spawnFightFx(wx, wy, figs, foe, dt, fig) {
    if (!foe) return;
    const tp = MAP.provs[foe.prov];
    const [ox, oy] = worldToScreen(wx, wy), [tx, ty] = worldToScreen(tp.x, tp.y);
    const now = performance.now();
    const dist = Math.hypot(tx - ox, ty - oy) || 1;
    // where the enemy line stands: toward the foe, but not further than the battle marker
    const reach = Math.min(dist * 0.6, fig * 3.2);
    const ex = (tx - ox) / dist, ey = (ty - oy) / dist;
    const S = Math.max(0.8, fig / 26);                          // effects grow with the figures
    for (const [fx0, fy0, ty0] of figs) {
      const st = fightStyle(ty0);
      if (Math.random() > FX_RATE[st] * dt) continue;
      const x0 = fx0 - ox, y0 = fy0 - oy - fig * 0.35;          // from the figure's hands, relative to the army
      const aimX = ex * reach + (Math.random() - 0.5) * fig * 0.9, aimY = ey * reach + (Math.random() - 0.5) * fig * 0.5 - fig * 0.1;
      const base = { wx, wy, t0: now };
      if (st === 'rifle') {
        fx.push({ ...base, k: 'flash', x: x0 + ex * fig * 0.25, y: y0 + ey * fig * 0.1, r: (1.8 + Math.random() * 1.4) * S, dur: 70 });
        fx.push({ ...base, k: 'tracer', w: S, x: x0 + ex * fig * 0.25, y: y0, x1: aimX, y1: aimY, dur: 180 + Math.random() * 80 });
      } else if (st === 'shell') {
        fx.push({ ...base, k: 'flash', x: x0 + ex * fig * 0.35, y: y0, r: (3.5) * S, dur: 110 });
        fx.push({ ...base, k: 'smoke', x: x0 + ex * fig * 0.35, y: y0, r: (3) * S, dur: 1400, grey: 120 });
        fx.push({ ...base, k: 'burst', x: aimX * 1.3, y: aimY * 1.3, r: (5) * S, dur: 600, t0: now + 250 });
      } else if (st === 'musket') {
        // a volley: every man in the line fires at once
        for (let i = 0; i < 3; i++) {
          const sx = x0 + ex * fig * 0.3 + (Math.random() - 0.5) * fig * 0.5, sy = y0 + (Math.random() - 0.5) * fig * 0.25;
          fx.push({ ...base, k: 'flash', x: sx, y: sy, r: (1.6 + Math.random()) * S, dur: 90 });
          fx.push({ ...base, k: 'smoke', x: sx, y: sy, r: (2.5) * S, dur: 1800 + Math.random() * 600, grey: 225 });
        }
      } else if (st === 'cannon') {
        fx.push({ ...base, k: 'flash', x: x0 + ex * fig * 0.4, y: y0, r: (4) * S, dur: 120 });
        fx.push({ ...base, k: 'smoke', x: x0 + ex * fig * 0.4, y: y0, r: (4) * S, dur: 2400, grey: 230 });
        fx.push({ ...base, k: 'ball', s: S, x: x0 + ex * fig * 0.4, y: y0, x1: aimX * 1.3, y1: aimY * 1.3, dur: 450, arc: fig * 0.3 });
        fx.push({ ...base, k: 'dust', x: aimX * 1.3, y: aimY * 1.3, r: (3) * S, dur: 700, t0: now + 450 });
      } else if (st === 'arrow') {
        // a volley of arrows (or slingstones) on a high arc
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const d = 650 + Math.random() * 250;
          fx.push({ ...base, k: 'arrow', len: 5 * S, x: x0 + (Math.random() - 0.5) * fig * 0.4, y: y0, x1: aimX + (Math.random() - 0.5) * fig * 0.6, y1: aimY + (Math.random() - 0.5) * fig * 0.3, dur: d, arc: fig * (0.7 + Math.random() * 0.4), t0: now + i * 40 });
        }
      } else if (st === 'stone') {
        fx.push({ ...base, k: 'ball', s: S, x: x0, y: y0 - fig * 0.3, x1: aimX * 1.4, y1: aimY * 1.4, dur: 1100, arc: fig * 1.6, big: true });
        fx.push({ ...base, k: 'dust', x: aimX * 1.4, y: aimY * 1.4, r: (4) * S, dur: 900, t0: now + 1100 });
      } else {
        // melee: blades catching the light where the lines meet, and dust kicked up
        const mx = x0 + ex * fig * 0.55 + (Math.random() - 0.5) * fig * 0.4, my = y0 + ey * fig * 0.2 + (Math.random() - 0.5) * fig * 0.3;
        fx.push({ ...base, k: 'spark', x: mx, y: my, r: (2.5 + Math.random() * 2) * S, dur: 220, rot: Math.random() * 3 });
        if (Math.random() < 0.25) fx.push({ ...base, k: 'dust', x: mx, y: my + fig * 0.3, r: (2.5) * S, dur: 900 });
      }
    }
    if (fx.length > 600) fx.splice(0, fx.length - 600);
  }
  function drawFx() {
    const now = performance.now();
    let w = 0;
    for (let i = 0; i < fx.length; i++) {
      const e = fx[i], age = now - e.t0;
      if (age > e.dur) continue;
      fx[w++] = e;
      if (age < 0) continue;
      const u = age / e.dur;
      const [bx, by] = worldToScreen(e.wx, e.wy);
      const x = bx + e.x, y = by + e.y;
      if (e.k === 'flash') {
        ctx.globalAlpha = 1 - u; ctx.fillStyle = '#ffe07a';
        ctx.beginPath(); ctx.arc(x, y, e.r * (1 + u), 0, 7); ctx.fill();
      } else if (e.k === 'tracer') {
        const a = Math.max(0, u - 0.25), b = u;
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 1.1 * e.w;
        ctx.beginPath(); ctx.moveTo(x + (bx + e.x1 - x) * a, y + (by + e.y1 - y) * a); ctx.lineTo(x + (bx + e.x1 - x) * b, y + (by + e.y1 - y) * b); ctx.stroke();
      } else if (e.k === 'smoke' || e.k === 'dust' || e.k === 'burst') {
        const g = e.k === 'dust' ? '150,128,96' : e.k === 'burst' ? '90,80,70' : `${e.grey},${e.grey},${e.grey - 8}`;
        if (e.k === 'burst' && u < 0.15) { ctx.globalAlpha = 1 - u / 0.15; ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x, y, e.r, 0, 7); ctx.fill(); }
        ctx.globalAlpha = (e.k === 'smoke' ? 0.55 : 0.5) * (1 - u);
        ctx.fillStyle = 'rgb(' + g + ')';
        ctx.beginPath(); ctx.arc(x + u * 4, y - u * (e.k === 'smoke' ? 10 : 4), e.r * (1 + u * 2.2), 0, 7); ctx.fill();
      } else if (e.k === 'arrow' || e.k === 'ball') {
        const px = x + (bx + e.x1 - x) * u, py = y + (by + e.y1 - y) * u - Math.sin(u * Math.PI) * e.arc;
        if (e.k === 'arrow') {
          const u2 = Math.min(1, u + 0.04);
          const qx = x + (bx + e.x1 - x) * u2, qy = y + (by + e.y1 - y) * u2 - Math.sin(u2 * Math.PI) * e.arc;
          const l = Math.hypot(qx - px, qy - py) || 1;
          ctx.globalAlpha = 0.95; ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(px - (qx - px) / l * e.len, py - (qy - py) / l * e.len); ctx.lineTo(px, py); ctx.stroke();
        } else {
          ctx.globalAlpha = 1; ctx.fillStyle = e.big ? '#5a5248' : '#222';
          ctx.beginPath(); ctx.arc(px, py, (e.big ? 2.6 : 1.6) * e.s, 0, 7); ctx.fill();
        }
      } else if (e.k === 'spark') {
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#fff4c8'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let j = 0; j < 4; j++) { const a = e.rot + j * Math.PI / 2; ctx.moveTo(x + Math.cos(a) * 1, y + Math.sin(a) * 1); ctx.lineTo(x + Math.cos(a) * e.r * (1 + u), y + Math.sin(a) * e.r * (1 + u)); }
        ctx.stroke();
      }
    }
    fx.length = w;
    ctx.globalAlpha = 1;
  }
  function dispPos(a, k) {
    const [tx, ty] = armyPos(a);
    let d = disp.get(a.id);
    if (!d) { d = { x: tx, y: ty, h: Math.PI * 1.5, seen: 0 }; disp.set(a.id, d); }
    const jump = Math.hypot(tx - d.x, ty - d.y);
    // marching positions are exact; only sudden jumps (a retreat, a new route) are eased
    if (jump > 6 || jump < 0.35) { d.x = tx; d.y = ty; } else { d.x += (tx - d.x) * Math.max(k, 0.3); d.y += (ty - d.y) * Math.max(k, 0.3); }
    d.seen = lastDisp;
    let want = null;
    const face = (from, to) => { const p = MAP.provs[from], n = MAP.provs[to]; return Math.atan2(-(n.y - p.y), n.x - p.x); };
    const foe = fightTarget(a);
    if (a.lead) want = face(a.lead.to, a.prov);
    else if (a.path.length && !a.battle) want = face(a.prov, a.path[0]);
    else if (foe && foe.prov !== a.prov) want = face(a.prov, foe.prov);
    if (want !== null) { let dh = want - d.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; d.h += dh * Math.min(1, k * 1.5); }
    return d;
  }
  // the unit types an army shows as figures: its main type first, then the next most common
  function figureTypes(grp) {
    const cnt = {};
    for (const a of grp) for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + (u.type === 'tanks' ? 2.5 : u.type === 'artillery' ? 0.6 : 1);
    return Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]);
  }

  function drawArmies(z, vx0, vy0, vx1, vy1) {
    const G = Sim.G;
    const now = performance.now();
    const k = lastDisp ? 1 - Math.exp(-(now - lastDisp) / 1000 * 9) : 1;
    lastDisp = now;
    buildFights(G);
    const fxDt = fxLast ? Math.min(0.1, (now - fxLast) / 1000) : 0; fxLast = now;
    counterHits = [];
    figCount = 0;
    const rel = z / minZoom();
    const byProv = new Map();
    for (const a of G.armies) {
      const [x, y] = armyPos(a);
      if (x < vx0 - 2 || x > vx1 + 2 || y < vy0 - 2 || y > vy1 + 2) continue;
      // zoomed out, only armies that matter to the player are drawn
      if (rel < 1.8 && a.owner !== G.player && !Sim.atWar(a.owner, G.player) && !Sim.allied(a.owner, G.player)) continue;
      const key = a.prov + ':' + (a.path.length ? a.path[0] : '');
      if (!byProv.has(key)) byProv.set(key, []); byProv.get(key).push(a);
    }
    if (disp.size > G.armies.length * 2 + 50) for (const [id, d] of disp) if (now - d.seen > 5000) disp.delete(id);
    // world view: figures with a division count only; closer in, full counters for the armies that
    // concern the player, while neutral nations keep the light look until zoomed right in
    const small = rel < 1.8;
    const fig = small ? 20 : Math.max(24, Math.min(46, z * 1.7));   // figure cell size in px
    const symbols = [];
    const t = G.paused ? 0 : now;
    for (const [, list] of byProv) {
      // one counter per owner in each province; the stack shows total divisions
      const groups = new Map();
      for (const a of list) { if (!groups.has(a.owner)) groups.set(a.owner, []); groups.get(a.owner).push(a); }
      const stacks = [...groups.values()].sort((a, b) => (a[0].owner === G.player) - (b[0].owner === G.player));
      stacks.forEach((grp, i) => {
        const a = grp[0];
        const d = dispPos(a, k);
        for (let q = 1; q < grp.length; q++) dispPos(grp[q], k);
        let [sx, sy] = worldToScreen(d.x, d.y);
        sx += (i - (stacks.length - 1) / 2) * fig * 0.8;           // several nations in one province stand side by side
        const c = COUNTRY_BY_TAG[a.owner];
        const mine = a.owner === G.player;
        const hostile = Sim.atWar(a.owner, G.player);
        const compact = small || (!mine && !hostile && !Sim.allied(a.owner, G.player) && z < 16);
        let divs = 0; for (const g of grp) divs += g.units.length;
        const moving = grp.some(g => g.path.length) && !G.paused;
        const foe = grp.map(fightTarget).find(Boolean) || null;
        const fighting = !!foe;
        // --- 3D figures: 1 to 3 depending on size, in a small column behind the leader ---
        const types = figureTypes(grp);
        const nFig = compact ? 1 : divs >= 10 ? 3 : divs >= 4 ? 2 : 1;
        const hx = Math.cos(d.h), hy = -Math.sin(d.h);
        const slots = [[0, 0], [-0.42, -0.36], [-0.42, 0.36]];
        const figs = [];
        for (let f = 0; f < nFig; f++) {
          const [bk, sd] = slots[f];
          figs.push([sx + (hx * bk - hy * sd) * fig, sy + 4 + (hy * bk + hx * sd) * fig * 0.7, types[f % types.length] || 'infantry', f]);
        }
        figs.sort((p, q) => p[1] - q[1]);
        // nation-coloured ground ring so ownership reads at a glance
        ctx.beginPath(); ctx.ellipse(sx, sy + 4, fig * 0.46, fig * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = c.color; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 1.2; ctx.strokeStyle = hostile ? '#e04a3a' : mine ? '#f2e3a8' : 'rgba(0,0,0,0.6)'; ctx.stroke();
        if (state.figures !== false) for (const [fx, fy, ty, f] of figs) { Figures.draw(ctx, a.owner, ty, moving, d.h, fighting, fx, fy, fig * (f ? 0.86 : 1), t + f * 97); figCount++; }
        if (fighting && !G.paused && state.figures !== false) spawnFightFx(d.x, d.y, figs, foe, fxDt, fig);
        const figTop = sy + 4 - fig * 0.62;
        if (compact) {
          if (grp.some(g => state.selArmies.has(g.id))) { ctx.beginPath(); ctx.ellipse(sx, sy + 4, fig * 0.52, fig * 0.24, 0, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe28a'; ctx.stroke(); }
          counterHits.push({ x: sx - fig * 0.4, y: figTop, w: fig * 0.8, h: fig * 0.75, army: a, group: grp });
          ctx.font = '700 10px "Barlow Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(String(divs), sx + fig * 0.42, figTop + 3); ctx.fillStyle = '#f0e8cc'; ctx.fillText(String(divs), sx + fig * 0.42, figTop + 3);
          return;
        }
        const w = 44, h = 20;
        const x = sx - w / 2, y = figTop - h - 1;
        const sel = grp.some(g => state.selArmies.has(g.id));
        let str = 0, org = 0, lowSup = false, defend = false;
        for (const g of grp) { const st = Sim.armyStats(g); const n = g.units.length; str += st.str * n; org += st.org * n; if (g.supply < 0.5) lowSup = true; if (g.order === 'defend') defend = true; }
        str /= divs || 1; org /= divs || 1;
        // shadow, plus a second card behind when several armies share the spot
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 1.5, y + 2, w, h);
        if (grp.length > 1) { ctx.fillStyle = mine ? '#1d2418' : '#1e1e1e'; ctx.fillRect(x + 3, y - 3, w, h); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y - 2.5, w - 1, h - 1); }
        ctx.fillStyle = mine ? '#27301f' : hostile ? '#3a1d1a' : '#262626'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = c.color; ctx.fillRect(x + 2, y + 2, 17, h - 7);
        symbols.push([x + 2.5, y + 2.5, UNIT_TYPES[mainType(a)].symbol]);
        ctx.font = '700 12px "Barlow Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f0e8cc'; ctx.fillText(String(divs), x + 31, y + 7.5);
        ctx.fillStyle = '#111'; ctx.fillRect(x + 2, y + h - 4.5, w - 4, 3.5);
        ctx.fillStyle = '#6fbf57'; ctx.fillRect(x + 2, y + h - 4.5, (w - 4) * str, 1.6);
        ctx.fillStyle = '#d8b44a'; ctx.fillRect(x + 2, y + h - 2.6, (w - 4) * org, 1.6);
        ctx.lineWidth = sel ? 2.2 : 1; ctx.strokeStyle = sel ? '#ffe28a' : hostile ? '#c2493d' : mine ? '#8fa368' : '#555';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (sel) { ctx.beginPath(); ctx.ellipse(sx, sy + 4, fig * 0.52, fig * 0.24, 0, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe28a'; ctx.stroke(); }
        if (defend && mine) { ctx.fillStyle = '#d6b052'; ctx.fillRect(x + w - 6, y + 2, 4, 4); }
        if (lowSup) { ctx.fillStyle = '#e0503c'; ctx.beginPath(); ctx.arc(x + w - 4, y + h - 8, 2.2, 0, 7); ctx.fill(); }
        // the card and the figures below it are one click target
        const top = y - (grp.length > 1 ? 3 : 0);
        counterHits.push({ x: Math.min(x, sx - fig * 0.5), y: top, w: Math.max(w + 3, fig), h: sy + 4 + fig * 0.25 - top, army: a, group: grp });
      });
    }
    if (symbols.length) {
      // one batched stroke for every counter symbol
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const [x, y, sym] of symbols) { ctx.rect(x, y, 16, 12); ctx.moveTo(x, y); (SYM[sym] || SYM.inf)(x, y, 16, 12); }
      ctx.stroke();
    }
  }

  function drawBattles(z) {
    const G = Sim.G;
    battleHits = [];
    for (const b of G.battles) {
      const p = MAP.provs[b.prov];
      const froms = Object.values(b.from);
      const f = MAP.provs[froms[0]];
      const [sx, sy] = worldToScreen((p.x * 2 + f.x) / 3, (p.y * 2 + f.y) / 3);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const pl = G.player;
      const mineAtt = Sim.allied(b.atkTag, pl), mineDef = Sim.allied(b.defTag, pl);
      const winning = mineAtt ? b.progress > 0.5 : mineDef ? b.progress < 0.5 : null;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      ctx.beginPath(); ctx.arc(sx, sy, 11 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = winning === null ? 'rgba(60,60,60,0.9)' : winning ? 'rgba(70,120,50,0.95)' : 'rgba(150,45,35,0.95)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#f0e2b0'; ctx.stroke();
      // crossed sabres
      ctx.strokeStyle = '#f4ecd0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 6, sy + 2); ctx.lineTo(sx - 2, sy + 6); ctx.moveTo(sx + 6, sy + 2); ctx.lineTo(sx + 2, sy + 6); ctx.stroke();
      battleHits.push({ x: sx, y: sy, battle: b });
    }
  }

  // ---------- the sea: zone control tint, fleets, air wings, invasions ----------
  let seaTint = null, seaTintAt = -1e9, seaClip = null;
  function buildSeaTint() {
    const g = Seas.grid, G = Sim.G;
    if (!seaTint) { seaTint = document.createElement('canvas'); seaTint.width = g.NX; seaTint.height = g.NY; }
    const cx = seaTint.getContext('2d'), img = cx.createImageData(g.NX, g.NY), d = img.data;
    const col = Seas.all().map(z => { const t = Navy.controller(z.id); return t && G.countries[t] ? hexToRgb(G.countries[t].color) : null; });
    for (let k = 0; k < g.cell.length; k++) {
      const z = g.cell[k]; if (z < 0) continue;
      const c = col[z], o = k * 4;
      // zone edges show as a faint line of lighter cells
      const i = k % g.NX, edge = (i + 1 < g.NX && g.cell[k + 1] >= 0 && g.cell[k + 1] !== z) || (k + g.NX < g.cell.length && g.cell[k + g.NX] >= 0 && g.cell[k + g.NX] !== z);
      if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = edge ? 190 : 120; }
      else if (edge) { d[o] = 170; d[o + 1] = 200; d[o + 2] = 220; d[o + 3] = 60; }
    }
    cx.putImageData(img, 0, 0);
    seaTintAt = performance.now();
  }
  function drawSeaTint(z) {
    if (performance.now() - seaTintAt > 1500) buildSeaTint();
    if (!seaClip) { seaClip = new Path2D(); seaClip.rect(WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, WORLD.y1 - WORLD.y0); seaClip.addPath(coastPath); }
    const g = Seas.grid;
    ctx.save(); ctx.clip(seaClip, 'evenodd');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(seaTint, g.X0, g.Y0, g.NX * g.RES, g.NY * g.RES);
    ctx.restore();
  }
  function drawZoneOutline(z, id) {
    const g = Seas.grid;
    ctx.save(); ctx.clip(seaClip || (seaClip = (() => { const p = new Path2D(); p.rect(WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, WORLD.y1 - WORLD.y0); p.addPath(coastPath); return p; })()), 'evenodd');
    ctx.fillStyle = 'rgba(255,236,170,0.16)';
    ctx.beginPath();
    for (let k = 0; k < g.cell.length; k++) if (g.cell[k] === id) ctx.rect(g.X0 + (k % g.NX) * g.RES, g.Y0 + Math.floor(k / g.NX) * g.RES, g.RES, g.RES);
    ctx.fill();
    ctx.restore();
  }
  function drawZoneLabels(z) {
    const rel = z / minZoom();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 600 ' + (rel < 1.8 ? 10 : 12) + 'px "Barlow Semi Condensed", sans-serif';
    for (const zn of Seas.all()) {
      if (rel < 1.4 && zn.cells < 150) continue;
      const [sx, sy] = worldToScreen(zn.x, zn.y);
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,25,35,0.7)'; ctx.strokeText(zn.name, sx, sy + 18);
      ctx.fillStyle = 'rgba(175,210,230,0.9)'; ctx.fillText(zn.name, sx, sy + 18);
    }
  }
  function zonePt(id) { const zn = Seas.zone(id); return [zn.x, zn.y]; }
  function fleetPos(f) {
    const [ax, ay] = zonePt(f.zone);
    if (!f.path.length) return [ax, ay];
    let [bx, by] = zonePt(f.path[0]);
    if (bx - ax > 180) bx -= 360; else if (ax - bx > 180) bx += 360;   // across the date line
    const za = Seas.zone(f.zone), zb = Seas.zone(f.path[0]);
    const km = GEO.haversineKm(za.lon, za.lat, zb.lon, zb.lat) || 1;
    const t = Math.min(1, (f.progress + (f.battle ? 0 : (f.rate || 0) * (state.hourFrac || 0))) / km);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }
  function hull(x, y, w, h, sub) {
    ctx.beginPath();
    if (sub) { ctx.ellipse(x + w / 2, y + h * 0.62, w * 0.46, h * 0.22, 0, 0, Math.PI * 2); ctx.rect(x + w * 0.44, y + h * 0.18, w * 0.14, h * 0.3); }
    else { ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.5); ctx.lineTo(x + w * 0.84, y + h * 0.85); ctx.lineTo(x + w * 0.12, y + h * 0.85); ctx.closePath(); ctx.rect(x + w * 0.34, y + h * 0.2, w * 0.26, h * 0.3); }
    ctx.fill();
  }
  function drawFleets(z, vx0, vy0, vx1, vy1) {
    const G = Sim.G, pl = G.player;
    fleetHits = [];
    const rel = z / minZoom();
    const groups = new Map();
    for (const f of G.fleets) {
      const [x, y] = fleetPos(f);
      if (x < vx0 - 3 || x > vx1 + 3 || y < vy0 - 3 || y > vy1 + 3) continue;
      if (rel < 1.8 && f.owner !== pl && !Sim.atWar(f.owner, pl) && !Sim.allied(f.owner, pl)) continue;
      const key = f.zone + '>' + (f.path[0] ?? '') + ':' + f.owner;
      if (!groups.has(key)) groups.set(key, { x, y, list: [] });
      groups.get(key).list.push(f);
    }
    // groups in the same spot fan out
    const spots = new Map();
    const sorted = [...groups.values()].sort((a, b) => (a.list[0].owner === pl) - (b.list[0].owner === pl));
    for (const g of sorted) {
      const k = Math.round(g.x * 4) + ':' + Math.round(g.y * 4);
      const n = spots.get(k) || 0; spots.set(k, n + 1);
      let [sx, sy] = worldToScreen(g.x, g.y);
      sx += (n % 3 - 1) * 42 * (n ? 1 : 0); sy += Math.floor(n / 3) * 20 - 6;
      const f = g.list[0], mine = f.owner === pl, hostile = Sim.atWar(f.owner, pl);
      const ships = g.list.reduce((s, x) => s + x.ships.length, 0);
      const subs = g.list.every(x => x.ships.every(s => s.type === 'submarine'));
      const sel = g.list.some(x => x.id === state.selFleet);
      const w = 40, h = 16, x = sx - w / 2, y = sy - h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 1.5, y + 2, w, h);
      ctx.fillStyle = mine ? '#1d2a33' : hostile ? '#3a1d1a' : '#20262b'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COUNTRY_BY_TAG[f.owner].color; ctx.fillRect(x + 2, y + 2, 17, h - 4);
      ctx.fillStyle = '#10161a'; hull(x + 3, y + 2, 15, h - 4, subs);
      ctx.font = '700 11px "Barlow Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e6eef2'; ctx.fillText(String(ships), x + 30, y + h / 2 + 0.5);
      const busy = g.list.some(x => x.battle);
      ctx.lineWidth = sel ? 2.2 : 1; ctx.strokeStyle = sel ? '#ffe28a' : busy ? '#ff9a5a' : hostile ? '#c2493d' : mine ? '#7fa6bf' : '#4d5a63';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (mine && g.list.some(x => x.mission !== 'hold')) { ctx.fillStyle = '#9fd0ea'; ctx.fillRect(x + w - 5, y + 2, 3, 3); }
      fleetHits.push({ x, y, w, h, fleets: g.list });
    }
    // the selected fleet's course
    const sf = state.selFleet && G.fleets.find(x => x.id === state.selFleet);
    if (sf && sf.path.length) {
      const pts = [fleetPos(sf), ...sf.path.map(zonePt)].map(p => worldToScreen(p[0], p[1]));
      ctx.setLineDash([5, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(140,200,235,0.9)';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.setLineDash([]);
    }
    // naval battles
    for (const b of G.navBattles) {
      const [sx, sy] = worldToScreen(...zonePt(b.zone));
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
      ctx.beginPath(); ctx.arc(sx, sy - 22, 9 + pulse * 2, 0, 7); ctx.fillStyle = 'rgba(190,90,40,0.92)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#f0e2b0'; ctx.stroke();
      ctx.strokeStyle = '#f4ecd0'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = -1; i <= 1; i += 2) { ctx.moveTo(sx - 5, sy - 22 + i * 2.5); ctx.quadraticCurveTo(sx - 2, sy - 25 + i * 2.5, sx, sy - 22 + i * 2.5); ctx.quadraticCurveTo(sx + 2, sy - 19 + i * 2.5, sx + 5, sy - 22 + i * 2.5); }
      ctx.stroke();
    }
  }
  function fleetAt(sx, sy) { for (let i = fleetHits.length - 1; i >= 0; i--) { const h = fleetHits[i]; if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return h.fleets; } return null; }
  const MISSION_COL = { superiority: '120,180,235', cas: '230,150,70', bomb: '220,90,70', naval: '120,210,200' };
  function drawWings(z, vx0, vy0, vx1, vy1) {
    const G = Sim.G, pl = G.player;
    wingHits = [];
    if (!G.wings.length) return;
    const rel = z / minZoom();
    // mission lines for the player's wings
    for (const w of G.wings) {
      if (w.owner !== pl || w.mission === 'idle' || w.target < 0) continue;
      const b = MAP.provs[w.base];
      const t = w.sea ? zonePt(w.target) : [MAP.provs[w.target].x, MAP.provs[w.target].y];
      const [ax, ay] = worldToScreen(b.x, b.y), [bx, by] = worldToScreen(t[0], t[1]);
      const col = MISSION_COL[w.mission] || '200,200,200', sel = w.id === state.selWing;
      ctx.setLineDash([3, 5]); ctx.lineWidth = sel ? 2.5 : 1.5; ctx.strokeStyle = 'rgba(' + col + ',' + (sel ? 0.95 : 0.55) + ')';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 30, bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(bx, by, sel ? 7 : 5, 0, 7); ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (sel) { const r = Air.range(w.type, w.owner) / 111 * z * 0.9; ctx.beginPath(); ctx.arc(ax, ay, r, 0, 7); ctx.setLineDash([2, 6]); ctx.strokeStyle = 'rgba(' + col + ',0.35)'; ctx.stroke(); ctx.setLineDash([]); }
    }
    if (rel < 1.8) return;
    const groups = new Map();
    for (const w of G.wings) {
      const p = MAP.provs[w.base];
      if (p.x < vx0 - 2 || p.x > vx1 + 2 || p.y < vy0 - 2 || p.y > vy1 + 2) continue;
      const k = w.base + ':' + w.owner;
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w);
    }
    for (const list of groups.values()) {
      const p = MAP.provs[list[0].base];
      let [sx, sy] = worldToScreen(p.x, p.y); sx += 26; sy -= 30;
      const mine = list[0].owner === pl, sel = list.some(w => w.id === state.selWing);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx - 1, sy - 1, 30, 14);
      ctx.fillStyle = COUNTRY_BY_TAG[list[0].owner].color; ctx.fillRect(sx, sy, 12, 12);
      // a small plane
      ctx.fillStyle = '#10161a'; ctx.beginPath();
      ctx.moveTo(sx + 6, sy + 1.5); ctx.lineTo(sx + 7, sy + 5); ctx.lineTo(sx + 11, sy + 6.5); ctx.lineTo(sx + 7, sy + 7); ctx.lineTo(sx + 6.6, sy + 9.5); ctx.lineTo(sx + 8, sy + 10.5);
      ctx.lineTo(sx + 4, sy + 10.5); ctx.lineTo(sx + 5.4, sy + 9.5); ctx.lineTo(sx + 5, sy + 7); ctx.lineTo(sx + 1, sy + 6.5); ctx.lineTo(sx + 5, sy + 5); ctx.closePath(); ctx.fill();
      ctx.font = '700 10px "Barlow Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e6eef2'; ctx.fillText(String(list.length), sx + 21, sy + 6.5);
      ctx.lineWidth = sel ? 2 : 1; ctx.strokeStyle = sel ? '#ffe28a' : mine ? '#9fb8c8' : '#4d5a63'; ctx.strokeRect(sx - 0.5, sy - 0.5, 29, 13);
      wingHits.push({ x: sx - 1, y: sy - 1, w: 30, h: 14, wings: list });
    }
  }
  function wingAt(sx, sy) { for (const h of wingHits) if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return h.wings; return null; }
  function drawInvasions(z) {
    const G = Sim.G, pl = G.player;
    for (const a of G.armies) {
      if (!a.sea) continue;
      if (a.owner !== pl && !Sim.atWar(a.owner, pl) && !Sim.allied(a.owner, pl)) continue;
      const p = MAP.provs[a.sea.origin ?? a.prov], q = MAP.provs[a.sea.target];
      const [ax, ay] = worldToScreen(p.x, p.y), [bx, by] = worldToScreen(q.x, q.y);
      const col = a.owner === pl ? '140,200,235' : Sim.atWar(a.owner, pl) ? '224,90,70' : '160,200,140';
      ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(' + col + ',0.85)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      const ang = Math.atan2(by - ay, bx - ax);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(ang - 0.45) * 12, by - Math.sin(ang - 0.45) * 12); ctx.lineTo(bx - Math.cos(ang + 0.45) * 12, by - Math.sin(ang + 0.45) * 12); ctx.closePath();
      ctx.fillStyle = 'rgba(' + col + ',0.95)'; ctx.fill();
      // progress pill: planning, sailing, waiting for the sea to clear
      const pr = Navy.progress(a), mx = (ax + bx) / 2, my = (ay + by) / 2 - 14;
      const label = (a.sea.phase === 'wait' ? 'Waiting ' : a.sea.hostile ? 'Invasion ' : 'Transport ') + Math.round(pr * 100) + '%';
      ctx.font = '700 11px "Barlow Semi Condensed", sans-serif';
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(16,22,26,0.9)'; ctx.fillRect(mx - tw / 2, my - 9, tw, 18);
      ctx.fillStyle = 'rgba(' + col + ',0.45)'; ctx.fillRect(mx - tw / 2, my + 6, tw * pr, 3);
      ctx.strokeStyle = 'rgba(' + col + ',0.9)'; ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2 + 0.5, my - 8.5, tw - 1, 17);
      ctx.fillStyle = '#e6eef2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, mx, my);
    }
  }

  function setFrontEdges(pairs) {
    state.frontPairs = pairs;
    if (!pairs || !pairs.size) { state.frontEdges = null; return; }
    const path = new Path2D();
    MAP.edges.forEach((e, i) => { if (pairs.has(e.a + ':' + e.b) || pairs.has(e.b + ':' + e.a)) edgeTo(path, i); });
    state.frontEdges = path;
  }

  // repaint every province, e.g. after an era change recolours nations that keep their tags
  function refreshAll() { lastOwn = null; cityOrder = null; state.dirtyOwners = true; }
  return { setLook, armiesInRect, init, draw, refreshAll, cam, state, resize, screenToWorld, worldToScreen, zoomAt, zoomSmooth, pan, flyTo, fitWorld, provinceAt, counterAt, stackAt, battleAtScreen, fleetAt, wingAt, fleetPos, setFrontEdges, minZoom, _hits: () => counterHits, _figs: () => figCount, _fx: () => fx.length, _bld: () => bDrawn, _routes: () => rDrawn, dispPos: a => disp.get(a.id), get size() { return [W, H]; } };
})();
