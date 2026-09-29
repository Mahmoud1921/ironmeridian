// Troop figures: small low-poly 3D models (soldiers, trucks, tanks, guns, planes), rendered once per nation
// by a tiny flat-shaded 3D rasterizer into a sprite atlas: 8 headings x 4 animation frames per model.
// The map then only blits sprites, so hundreds of animated figures cost almost nothing per frame.
'use strict';
const Figures = (function () {
  const DIRS = 8, FRAMES = 4, CELL = 44;          // sprite cell in atlas pixels
  const ELEV = 50 * Math.PI / 180;                // camera looks down at 50 degrees
  const SE = Math.sin(ELEV), CE = Math.cos(ELEV);
  const LIGHT = norm([-0.45, 0.35, 0.82]);         // sun from the north-west, high
  const PX = 2.05;                                 // atlas pixels per model unit
  const KINDS = ['soldiers', 'truck', 'halftrack', 'tank', 'gun', 'plane', 'car'];

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function mix(a, b, t) { return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)); }
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  // ---------- model building: boxes, optionally pitched around a pivot (for swinging legs) ----------
  // coordinates: x forward, y left, z up; 1 unit ~ 0.4 m
  function box(parts, c, x, y, z, sx, sy, sz, color, pitch, px, pz) {
    const hx = sx / 2, hy = sy / 2;
    let v = [[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0], [-hx, -hy, sz], [hx, -hy, sz], [hx, hy, sz], [-hx, hy, sz]].map(p => [p[0] + x, p[1] + y, p[2] + z]);
    if (pitch) {
      const cs = Math.cos(pitch), sn = Math.sin(pitch);
      v = v.map(p => { const dx = p[0] - px, dz = p[2] - pz; return [px + dx * cs + dz * sn, p[1], pz - dx * sn + dz * cs]; });
    }
    const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const f of F) parts.push({ v: f.map(i => v[i]), c: color });
  }
  // a wheel: octagonal prism lying along y
  function wheel(parts, x, y, z, r, w, color, spin) {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2 + spin; pts.push([x + Math.cos(a) * r, z + r + Math.sin(a) * r]); }
    const L = pts.map(p => [p[0], y - w / 2, p[1]]), R = pts.map(p => [p[0], y + w / 2, p[1]]);
    parts.push({ v: L.slice().reverse(), c: color }); parts.push({ v: R, c: color.map(k => k * 0.8 + 30) });
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; parts.push({ v: [L[i], L[j], R[j], R[i]], c: color }); }
  }

  // palette per nation: uniforms and vehicles lean toward the nation's colour, kept muted
  function palette(color) {
    const base = hexRGB(color);
    const olive = [96, 104, 70], steel = [92, 98, 96];
    return {
      cloth: mix(mix(base, olive, 0.55), [0, 0, 0], 0.15),
      vehicle: mix(mix(base, steel, 0.6), [0, 0, 0], 0.1),
      dark: [38, 40, 36], metal: [70, 72, 70], skin: [214, 170, 130], canvas: mix(mix(base, [150, 140, 100], 0.6), [0, 0, 0], 0.05),
      mark: mix(base, [255, 255, 255], 0.15)
    };
  }

  function soldier(parts, P, x, y, f, fighting) {
    const s = fighting ? 0 : Math.sin(f / FRAMES * Math.PI * 2) * 0.55;
    const kneel = fighting ? -1.2 : 0;
    box(parts, 0, x, y - 0.55, 0, 0.8, 0.6, 3.0, P.dark, s, x, 3.0);                   // legs swing at the hip
    box(parts, 0, x, y + 0.55, 0, 0.8, 0.6, 3.0, P.dark, -s, x, 3.0);
    box(parts, 0, x, y, 2.8 + kneel, 1.3, 1.9, 2.8, P.cloth);                           // torso
    box(parts, 0, x, y - 1.2, 3.4 + kneel, 0.6, 0.5, 2.1, P.cloth, -s * 0.8, x, 5.4 + kneel); // arms
    box(parts, 0, x, y + 1.2, 3.4 + kneel, 0.6, 0.5, 2.1, P.cloth, s * 0.8, x, 5.4 + kneel);
    box(parts, 0, x + 0.1, y, 5.6 + kneel, 0.9, 0.9, 0.9, P.skin);                      // head
    box(parts, 0, x, y, 6.3 + kneel, 1.5, 1.5, 0.55, P.cloth);                          // helmet
    if (fighting) box(parts, 0, x + 1.3, y - 0.5, 4.6 + kneel, 2.6, 0.3, 0.3, P.metal); // rifle levelled
    else box(parts, 0, x - 0.6, y - 0.9, 3.8, 0.3, 0.3, 3.2, P.metal, 0.35, x - 0.6, 3.8); // rifle slung
  }
  function build(kind, P, f, fighting) {
    const parts = [];
    const bob = (f % 2) * 0.25;
    const spin = f / FRAMES * Math.PI / 4;
    if (kind === 'soldiers') {
      soldier(parts, P, 1.8, 0, f, fighting); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting);
    } else if (kind === 'truck' || kind === 'halftrack') {
      box(parts, 0, 0, 0, 1.0 + bob, 11, 4.2, 0.6, P.dark);                              // chassis
      box(parts, 0, 3.6, 0, 1.6 + bob, 3.2, 4.0, 2.9, P.vehicle);                        // cab
      box(parts, 0, 5.8, 0, 1.6 + bob, 1.6, 3.6, 1.7, P.vehicle);                        // bonnet
      box(parts, 0, 3.8, 0, 3.0 + bob, 0.4, 3.6, 1.2, [150, 175, 190]);                  // windscreen
      box(parts, 0, -2.0, 0, 1.6 + bob, 6.4, 4.2, 1.4, P.vehicle);                       // bed
      box(parts, 0, -2.0, 0, 3.0 + bob, 6.2, 4.0, 2.2, P.canvas);                        // canvas cover
      wheel(parts, 4.6, -2.2, 0, 1.0, 0.8, P.dark, spin); wheel(parts, 4.6, 2.2, 0, 1.0, 0.8, P.dark, spin);
      if (kind === 'truck') { wheel(parts, -3.2, -2.2, 0, 1.0, 0.8, P.dark, spin); wheel(parts, -3.2, 2.2, 0, 1.0, 0.8, P.dark, spin); }
      else for (const yy of [-2.2, 2.2]) { box(parts, 0, -2.2, yy, 0, 6.6, 0.9, 1.6, P.dark); for (let i = 0; i < 4; i++) box(parts, 0, -4.8 + ((i * 1.7 + f * 0.42) % 6.6), yy + (yy > 0 ? 0.47 : -0.47), 0.2, 0.35, 0.05, 1.2, [24, 24, 22]); }
    } else if (kind === 'tank') {
      for (const yy of [-2.6, 2.6]) {
        box(parts, 0, 0, yy, 0, 10.5, 1.5, 2.0, P.dark);                                // tracks
        for (let i = 0; i < 6; i++) box(parts, 0, -5.0 + ((i * 1.75 + f * 0.44) % 10.5), yy + (yy > 0 ? 0.77 : -0.77), 0.3, 0.4, 0.05, 1.4, [22, 22, 20]);
      }
      box(parts, 0, 0, 0, 1.2 + bob * 0.5, 10, 4.0, 2.2, P.vehicle);                    // hull
      box(parts, 0, 4.6, 0, 1.4 + bob * 0.5, 1.2, 3.8, 1.6, P.vehicle);                  // glacis
      box(parts, 0, -0.6, 0, 3.4 + bob * 0.5, 4.6, 3.4, 1.9, P.vehicle);                 // turret
      box(parts, 0, 3.9, 0, 4.0 + bob * 0.5, 5.2, 0.55, 0.55, P.metal);                  // gun
      box(parts, 0, -1.4, 0.8, 5.3 + bob * 0.5, 1.3, 1.3, 0.4, P.dark);                   // hatch
      box(parts, 0, -1.2, -1.72, 3.9 + bob * 0.5, 1.4, 0.05, 1.0, P.mark);               // nation mark
    } else if (kind === 'gun') {
      box(parts, 0, 4.4, 0, 0.9 + bob, 5.0, 3.6, 0.5, P.dark);                           // tractor
      box(parts, 0, 5.0, 0, 1.4 + bob, 3.4, 3.4, 2.4, P.vehicle);
      wheel(parts, 5.4, -1.9, 0, 0.9, 0.7, P.dark, spin); wheel(parts, 5.4, 1.9, 0, 0.9, 0.7, P.dark, spin);
      wheel(parts, 3.0, -1.9, 0, 0.9, 0.7, P.dark, spin); wheel(parts, 3.0, 1.9, 0, 0.9, 0.7, P.dark, spin);
      box(parts, 0, 0.5, 0, 0.1, 3.4, 0.4, 0.4, P.dark);                                 // tow bar
      box(parts, 0, -2.0, 0, 1.2, 2.0, 3.2, 2.2, P.vehicle);                             // gun shield and carriage
      box(parts, 0, -1.2, 0, 2.4, 5.6, 0.6, 0.6, P.metal, fighting ? 0 : -0.35, -2.0, 2.4); // barrel
      wheel(parts, -2.0, -2.0, 0, 1.1, 0.6, P.dark, spin); wheel(parts, -2.0, 2.0, 0, 1.1, 0.6, P.dark, spin);
    } else if (kind === 'car') {
      box(parts, 0, 0, 0, 1.1 + bob, 7.5, 3.6, 2.2, P.vehicle);
      box(parts, 0, 2.8, 0, 1.3 + bob, 1.8, 3.4, 1.4, P.vehicle);
      box(parts, 0, -0.6, 0, 3.3 + bob, 2.6, 2.4, 1.2, P.vehicle);
      box(parts, 0, 1.8, 0, 3.7 + bob, 2.8, 0.4, 0.4, P.metal);
      for (const xx of [2.5, -2.4]) for (const yy of [-1.9, 1.9]) wheel(parts, xx, yy, 0, 1.0, 0.8, P.dark, spin);
    } else if (kind === 'plane') {
      const h = 9 + bob;
      box(parts, 0, 0, 0, h, 11, 1.8, 1.8, P.vehicle);                                   // fuselage
      box(parts, 0, 5.8, 0, h + 0.2, 0.9, 1.5, 1.4, P.dark);                             // nose
      box(parts, 0, 0.8, 0, h + 0.5, 3.2, 15, 0.35, P.vehicle);                          // wing
      box(parts, 0, -4.9, 0, h + 0.8, 1.8, 5.6, 0.3, P.vehicle);                          // tailplane
      box(parts, 0, -5.0, 0, h + 1.2, 1.6, 0.3, 2.2, P.vehicle);                          // fin
      box(parts, 0, 1.6, 0, h + 1.7, 2.0, 1.1, 0.7, [150, 175, 190]);                    // canopy
      box(parts, 0, 0.8, -5.6, h + 0.86, 1.4, 1.2, 0.05, P.mark); box(parts, 0, 0.8, 5.6, h + 0.86, 1.4, 1.2, 0.05, P.mark);
      const pa = f / FRAMES * Math.PI;                                                     // propeller
      const py = Math.cos(pa) * 2.2, pz = Math.sin(pa) * 2.2;
      parts.push({ v: [[6.4, -py - 0.2, h + 0.9 - pz], [6.4, py - 0.2, h + 0.9 + pz], [6.4, py + 0.2, h + 0.9 + pz], [6.4, -py + 0.2, h + 0.9 - pz]], c: [30, 30, 30], two: true });
    }
    return parts;
  }

  // ---------- rasterize one model at one heading into the atlas ----------
  function renderModel(g, parts, yaw, cx, cy, plane, k) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const faces = [];
    for (const p of parts) {
      const w = p.v.map(v => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2]]);
      const a = w[0], b = w[1], c = w[2];
      let n = norm([(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]);
      let facing = n[1] * -CE + n[2] * SE;
      if (facing <= 0.001) { if (!p.two) continue; n = n.map(k => -k); facing = -facing; }
      const lit = 0.62 + 0.6 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      let depth = 0; for (const v of w) depth += -v[1] * CE + v[2] * SE;
      faces.push({ w, depth: depth / w.length, col: p.c.map(k => Math.min(255, Math.round(k * lit))) });
    }
    faces.sort((a, b) => a.depth - b.depth);
    // soft ground shadow (planes cast theirs far below)
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(cx + (plane ? 5 : 1), cy + (plane ? 2 : 0.5), plane ? 12 : 13, plane ? 5 : 6.5, 0, 0, Math.PI * 2); g.fill();
    g.lineJoin = 'round'; g.lineWidth = 0.6;
    for (const f of faces) {
      g.beginPath();
      f.w.forEach((v, i) => { const x = cx + v[0] * PX * k, y = cy - (v[1] * SE + v[2] * CE) * PX * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath();
      const col = 'rgb(' + f.col.join(',') + ')';
      g.fillStyle = col; g.strokeStyle = col; g.fill(); g.stroke();       // stroke hides seams between faces
    }
  }

  // Atlases are painted a row at a time within a small per-frame budget, so a new nation appearing on
  // screen never stalls the game. Until a nation's atlas is finished, a neutral one stands in.
  const atlases = new Map(); // key -> { cv, g, P, row }
  // one row per model, plus 'fighting' poses for soldiers and guns (vehicles fight in their moving pose)
  const FIGHT_ROW = { soldiers: KINDS.length, gun: KINDS.length + 1 };
  const ROWS = KINDS.length + 2;
  const rowKind = r => r < KINDS.length ? [KINDS[r], false] : [r === KINDS.length ? 'soldiers' : 'gun', true];
  const MAX_ATLASES = 28;   // about 2 MB each; nations off screen for a while are dropped and repainted on return
  function newAtlas(color) {
    const cv = document.createElement('canvas');
    cv.width = CELL * DIRS * FRAMES; cv.height = CELL * ROWS;
    return { cv, g: cv.getContext('2d'), P: palette(color), row: 0, used: 0 };
  }
  function paintRow(A) {
    const [kind, fight] = rowKind(A.row), g = A.g;
    for (let f = 0; f < FRAMES; f++) {
      const parts = build(kind, A.P, f, !!fight);
      for (let d = 0; d < DIRS; d++) {
        // heading d: 0 = east, counter-clockwise in 45 degree steps (map north is up)
        const cx = (d * FRAMES + f) * CELL + CELL / 2, cy = A.row * CELL + CELL * (kind === 'plane' ? 0.78 : 0.66);
        g.save(); g.beginPath(); g.rect((d * FRAMES + f) * CELL, A.row * CELL, CELL, CELL); g.clip();
        renderModel(g, parts, d / DIRS * Math.PI * 2, cx, cy, kind === 'plane', kind === 'soldiers' ? 1.55 : 1.05);
        g.restore();
      }
    }
    A.row++;
  }
  const queue = [];
  let neutral = null;
  function atlasFor(tag, now) {
    let A = atlases.get(tag);
    if (!A) {
      if (atlases.size >= MAX_ATLASES) {
        let old = null; for (const [t, x] of atlases) if (x.row >= ROWS && (!old || x.used < atlases.get(old).used)) old = t;
        if (old) atlases.delete(old);
      }
      A = newAtlas(COUNTRY_BY_TAG[tag].color); atlases.set(tag, A); if (now) while (A.row < ROWS) paintRow(A); else queue.push(A);
    }
    return A;
  }
  function pump(budgetMs) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) { const A = queue[0]; paintRow(A); if (A.row >= ROWS) queue.shift(); }
  }
  function ready() { if (!neutral) { neutral = newAtlas('#6b7058'); while (neutral.row < ROWS) paintRow(neutral); } }

  const KIND_OF = { infantry: 'soldiers', marines: 'soldiers', paratroopers: 'soldiers', motorized: 'truck', mechanized: 'halftrack', tanks: 'tank', artillery: 'gun', recon: 'car' };
  // draw one figure with its feet at (x, y) screen px; size is the on-screen cell size in px
  function draw(ctx, tag, unitType, moving, heading, fighting, x, y, size, t) {
    let kind = KIND_OF[unitType] || 'soldiers';
    if (unitType === 'paratroopers' && moving) kind = 'plane';
    const ki = KINDS.indexOf(kind);
    const d = ((Math.round(heading / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS;
    const f = moving || fighting ? Math.floor(t / (kind === 'plane' ? 60 : kind === 'soldiers' ? 150 : 110)) % FRAMES : 0;
    const row = fighting && FIGHT_ROW[kind] !== undefined ? FIGHT_ROW[kind] : ki;
    const ay = kind === 'plane' ? 0.78 : 0.66;
    ready();
    const A = atlasFor(tag); A.used = t || performance.now();
    ctx.drawImage(A.row >= ROWS ? A.cv : neutral.cv, (d * FRAMES + f) * CELL, row * CELL, CELL, CELL, x - size / 2, y - size * ay, size, size);
  }
  // queue nations to paint ahead of need, most important first
  function warm(tags) { ready(); for (const t of tags) atlasFor(t); }
  return { draw, warm, pump, KINDS, atlasFor, pending: () => queue.length, _atlases: atlases };
})();
