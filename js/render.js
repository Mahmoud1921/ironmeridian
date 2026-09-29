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
  const state = { mode: 'political', hover: -1, selProv: -1, selArmies: new Set(), selFleet: 0, selWing: 0, selZone: -1, dirtyOwners: true, frontEdges: null, pendingHint: null };
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
  let lastOwn = null, lastMode = null;
  function provColor(p, owner) {
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
    if (lastOwn && lastMode === state.mode && lastOwn.length === own.length) {
      changed = [];
      for (let i = 0; i < own.length; i++) if (own[i] !== lastOwn[i]) changed.push(i);
    }
    lastOwn = own.slice(); lastMode = state.mode;
    if (!changed) fillCache = MAP.provs.map(p => provColor(p, own[p.id]));
    else for (const i of changed) fillCache[i] = provColor(MAP.provs[i], own[i]);
    lmCountryBorders = MAP.lms.map(() => new Path2D());
    for (const e of MAP.edges) if (own[e.a] !== own[e.b]) { const bb = lmCountryBorders[MAP.provs[e.a].lm]; bb.moveTo(e.x1, e.y1); bb.lineTo(e.x2, e.y2); }
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

  // Paint ocean, land, borders and coasts into context g (world transform already applied), limited to a view box.
  function paintWorld(g, z, vx0, vy0, vx1, vy1) {
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
        if (G && state.mode === 'political' && G.owner[p.id] !== p.core) {
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
    if (state.dirtyOwners || !lmCountryBorders.length) recolor();
    if (!layer) buildLayer();
    const G = Sim.G;
    const z = cam.z;
    const [vx0, vy0] = screenToWorld(0, 0), [vx1, vy1] = screenToWorld(W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (z * dpr <= LS * 1.25) {
      ctx.fillStyle = '#1f384b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
      const sx = (vx0 - WORLD.x0) * LS, sy = (vy0 - WORLD.y0) * LS;
      ctx.drawImage(layer, sx, sy, (vx1 - vx0) * LS, (vy1 - vy0) * LS, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    } else {
      const covers = vc.valid && vx0 >= vc.x0 && vy0 >= vc.y0 && vx1 <= vc.x1 && vy1 <= vc.y1;
      const zooming = cam.anim || performance.now() - lastZoomInput < 220;
      if (!(covers && (vc.z === z || zooming))) buildView(vx0, vy0, vx1, vy1);
      ctx.fillStyle = '#1f384b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(vc.canvas, (vx0 - vc.x0) * vc.s, (vy0 - vc.y0) * vc.s, (vx1 - vx0) * vc.s, (vy1 - vy0) * vc.s, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    }
    // live overlays: front lines, hover, selection
    const overlay = (id, fn) => { const p = MAP.provs[id]; ctx.save(); ctx.clip(lmClips[p.lm], 'evenodd'); fn(p); ctx.restore(); };
    if (state.frontEdges) { ctx.lineWidth = 4 / z; ctx.strokeStyle = 'rgba(214,176,82,0.9)'; ctx.lineCap = 'round'; ctx.stroke(state.frontEdges); }
    if (state.hover >= 0) overlay(state.hover, () => { ctx.fillStyle = 'rgba(255,245,210,0.16)'; ctx.fill(provPaths[state.hover]); });
    if (state.selProv >= 0) overlay(state.selProv, () => {
      ctx.fillStyle = 'rgba(255,240,190,0.22)'; ctx.fill(provPaths[state.selProv]);
      ctx.lineWidth = 2.2 / z; ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.stroke(provPaths[state.selProv]);
    });

    if (G && state.mode === 'trade') drawTrade(z, vx0, vy0, vx1, vy1);
    if (G && state.mode === 'sea' && typeof Seas !== 'undefined') drawSeaTint(z);
    if (G && state.selZone >= 0 && typeof Seas !== 'undefined') drawZoneOutline(z, state.selZone);
    // ---- screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(z, vx0, vy0, vx1, vy1);
    drawCities(z, vx0, vy0, vx1, vy1);
    if (G && state.mode === 'sea' && typeof Seas !== 'undefined') drawZoneLabels(z);
    if (G) { drawPaths(z); if (G.fleets) { drawInvasions(z); drawWings(z, vx0, vy0, vx1, vy1); } drawArmies(z, vx0, vy0, vx1, vy1); if (G.fleets) drawFleets(z, vx0, vy0, vx1, vy1); drawBattles(z); Figures.pump(4); }
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
      ctx.font = '600 ' + fs.toFixed(1) + 'px "Saira Stencil One", "Barlow Semi Condensed", sans-serif';
      const spacing = fs * 0.12;
      const w = ctx.measureText(name).width + spacing * name.length;
      if (w > l.size * z * 1.6 && fs > 14) continue;
      const box = [sx - w / 2, sy - fs / 2, sx + w / 2, sy + fs / 2];
      if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      ctx.globalAlpha = Math.max(0, Math.min(1, (11 - z) / 3));
      ctx.fillStyle = 'rgba(18,16,12,0.62)';
      let x = sx - w / 2;
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
        ctx.font = (isCap ? '600 13px' : '500 12px') + ' "Barlow Semi Condensed", sans-serif';
        const w = ctx.measureText(p.city).width;
        const box = [sx + 6, sy - 8, sx + 10 + w, sy + 8];
        if (placedCity.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
        placedCity.push(box);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,16,12,0.85)'; ctx.strokeText(p.city, sx + 8, sy);
        ctx.fillStyle = '#f1ead2'; ctx.fillText(p.city, sx + 8, sy);
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
    ctx.fillStyle = '#efe6c8'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#1b1a14'; ctx.stroke();
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
  function dispPos(a, k) {
    const [tx, ty] = armyPos(a);
    let d = disp.get(a.id);
    if (!d) { d = { x: tx, y: ty, h: Math.PI * 1.5, seen: 0 }; disp.set(a.id, d); }
    const jump = Math.hypot(tx - d.x, ty - d.y);
    // marching positions are exact; only sudden jumps (a retreat, a new route) are eased
    if (jump > 6 || jump < 0.35) { d.x = tx; d.y = ty; } else { d.x += (tx - d.x) * Math.max(k, 0.3); d.y += (ty - d.y) * Math.max(k, 0.3); }
    d.seen = lastDisp;
    let want = null;
    if (a.path.length) { const p = MAP.provs[a.prov], n = MAP.provs[a.path[0]]; want = Math.atan2(-(n.y - p.y), n.x - p.x); }
    else if (a.battle) { const b = Sim.G.battles.find(x => x.id === a.battle); if (b && b.prov !== a.prov) { const p = MAP.provs[a.prov], n = MAP.provs[b.prov]; want = Math.atan2(-(n.y - p.y), n.x - p.x); } }
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
        const fighting = grp.some(g => g.battle);
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
        for (const [fx, fy, ty, f] of figs) { Figures.draw(ctx, a.owner, ty, moving, d.h, fighting, fx, fy, fig * (f ? 0.86 : 1), t + f * 97); figCount++; }
        if (fighting && !G.paused && Math.random() < 0.35) {     // muzzle flashes
          ctx.fillStyle = '#ffd36a';
          ctx.beginPath(); ctx.arc(sx + hx * fig * 0.45 + (Math.random() - 0.5) * 6, sy + hy * fig * 0.3 - fig * 0.15, 1.6 + Math.random() * 1.6, 0, 7); ctx.fill();
        }
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
    if (!pairs || !pairs.size) { state.frontEdges = null; return; }
    const path = new Path2D();
    for (const e of MAP.edges) if (pairs.has(e.a + ':' + e.b) || pairs.has(e.b + ':' + e.a)) { path.moveTo(e.x1, e.y1); path.lineTo(e.x2, e.y2); }
    state.frontEdges = path;
  }

  // repaint every province, e.g. after an era change recolours nations that keep their tags
  function refreshAll() { lastOwn = null; cityOrder = null; state.dirtyOwners = true; }
  return { init, draw, refreshAll, cam, state, resize, screenToWorld, worldToScreen, zoomAt, zoomSmooth, pan, flyTo, fitWorld, provinceAt, counterAt, stackAt, battleAtScreen, fleetAt, wingAt, fleetPos, setFrontEdges, minZoom, _hits: () => counterHits, _figs: () => figCount, dispPos: a => disp.get(a.id), get size() { return [W, H]; } };
})();
