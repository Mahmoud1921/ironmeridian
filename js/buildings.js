// Buildings as small low-poly 3D models, lit and shaded like the troop figures: industries and
// military works in the look of each era, with roofs and flags in the owner's colours.
// Used on the map (in the province where they were built) and, turning slowly, in the build lists.
'use strict';
const Buildings = (function () {
  // same camera and sun as the troop figures
  const ELEV = 50 * Math.PI / 180, SE = Math.sin(ELEV), CE = Math.cos(ELEV);
  const LIGHT = norm([-0.45, 0.35, 0.82]);
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));

  // era look: ancient (431 BC, 117 AD), medieval, napoleonic, great war, 1936
  function styleOf(era) {
    if (!era) return 'mod';
    if (era.startsWith('greece') || era.startsWith('rome')) return 'anc';
    if (era.startsWith('medieval')) return 'med';
    if (era.startsWith('napoleonic')) return 'nap';
    if (era.startsWith('greatwar')) return 'ind';
    return 'mod';
  }
  const old = s => s === 'anc' || s === 'med';

  // ---------- solids: every face is turned to face outwards, so back faces can be culled ----------
  let parts;
  function face(pts, c, out) {
    const a = pts[0], b = pts[1], d = pts[2];
    const n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) pts = pts.slice().reverse();
    parts.push({ v: pts, c });
  }
  // a prism: polygon (x, y points, any winding) extruded from z0 to z1; top and walls, no floor
  function extrude(poly, z0, z1, c, top) {
    let area = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const ccw = area > 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1];
      face([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], c, ccw ? [dy, -dx, 0] : [-dy, dx, 0]);
    }
    face(poly.map(p => [p[0], p[1], z1]), top || c, [0, 0, 1]);
  }
  const B = (x, y, z, sx, sy, sz, c, top) => extrude([[x - sx / 2, y - sy / 2], [x + sx / 2, y - sy / 2], [x + sx / 2, y + sy / 2], [x - sx / 2, y + sy / 2]], z, z + sz, c, top);
  const ring = (x, y, r, n, a0) => Array.from({ length: n }, (_, i) => { const a = (a0 || 0) + i / n * Math.PI * 2; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
  const cyl = (x, y, z, r, h, c, top) => extrude(ring(x, y, r, 8, Math.PI / 8), z, z + h, c, top);
  // gable roof over a box footprint; the ridge runs along x (or along y with alongY)
  function roof(x, y, z, sx, sy, h, c, alongY) {
    const hx = sx / 2, hy = sy / 2;
    if (!alongY) {
      const r0 = [x - hx, y, z + h], r1 = [x + hx, y, z + h];
      face([[x - hx, y - hy, z], [x + hx, y - hy, z], r1, r0], c, [0, -1, 1]);
      face([[x - hx, y + hy, z], [x + hx, y + hy, z], r1, r0], c, [0, 1, 1]);
      face([[x - hx, y - hy, z], [x - hx, y + hy, z], r0], c, [-1, 0, 0]);
      face([[x + hx, y - hy, z], [x + hx, y + hy, z], r1], c, [1, 0, 0]);
    } else {
      const r0 = [x, y - hy, z + h], r1 = [x, y + hy, z + h];
      face([[x - hx, y - hy, z], [x - hx, y + hy, z], r1, r0], c, [-1, 0, 1]);
      face([[x + hx, y - hy, z], [x + hx, y + hy, z], r1, r0], c, [1, 0, 1]);
      face([[x - hx, y - hy, z], [x + hx, y - hy, z], r0], c, [0, -1, 0]);
      face([[x - hx, y + hy, z], [x + hx, y + hy, z], r1], c, [0, 1, 0]);
    }
  }
  // a pyramid or cone (n sides) standing on z
  function cone(x, y, z, r, h, c, n, sy) {
    const pts = ring(x, y, r, n || 8, Math.PI / (n || 8)).map(p => [p[0], y + (p[1] - y) * (sy || 1), z]), apex = [x, y, z + h];
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; face([p, q, apex], c, [(p[0] + q[0]) / 2 - x, (p[1] + q[1]) / 2 - y, r * 0.5]); }
  }
  // a square beam between two points (legs, girders, masts, rails)
  function beam(a, b, w, c) {
    const d = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let u = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    u = norm([d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]);
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const h = w / 2, off = (p, s, t) => [p[0] + (u[0] * s + v[0] * t) * h, p[1] + (u[1] * s + v[1] * t) * h, p[2] + (u[2] * s + v[2] * t) * h];
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = C[i], [s1, t1] = C[(i + 1) % 4];
      face([off(a, s0, t0), off(a, s1, t1), off(b, s1, t1), off(b, s0, t0)], c, [(u[0] * (s0 + s1) + v[0] * (t0 + t1)), (u[1] * (s0 + s1) + v[1] * (t0 + t1)), (u[2] * (s0 + s1) + v[2] * (t0 + t1))]);
    }
    face([off(b, -1, -1), off(b, 1, -1), off(b, 1, 1), off(b, -1, 1)], c, d);
    face([off(a, -1, -1), off(a, 1, -1), off(a, 1, 1), off(a, -1, 1)], c, d.map(k => -k));
  }
  // a wheel standing up, axle along y
  function wheel(x, y, z, r, w, c) {
    const pts = ring(0, 0, r, 8, Math.PI / 8);
    const L = pts.map(p => [x + p[0], y - w / 2, z + r + p[1]]), R = pts.map(p => [x + p[0], y + w / 2, z + r + p[1]]);
    face(L, c, [0, -1, 0]); face(R, c, [0, 1, 0]);
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; face([L[i], L[j], R[j], R[i]], c, [pts[i][0] + pts[j][0], 0, pts[i][1] + pts[j][1]]); }
  }
  // a half-round roof (hangars, wagon covers), axis along x
  function vault(x, y, z, len, r, c) {
    const arc = Array.from({ length: 7 }, (_, i) => { const a = Math.PI - i / 6 * Math.PI; return [Math.cos(a) * r, Math.sin(a) * r]; });
    for (let i = 0; i < 6; i++) { const p = arc[i], q = arc[i + 1]; face([[x - len / 2, y + p[0], z + p[1]], [x + len / 2, y + p[0], z + p[1]], [x + len / 2, y + q[0], z + q[1]], [x - len / 2, y + q[0], z + q[1]]], c, [0, p[0] + q[0], p[1] + q[1]]); }
    face(arc.map(p => [x + len / 2, y + p[0], z + p[1]]), c, [1, 0, 0]);
    face(arc.map(p => [x - len / 2, y + p[0], z + p[1]]), c, [-1, 0, 0]);
  }
  const puff = (x, y, z, s, c) => B(x, y, z, s, s, s, c || [214, 210, 202]);

  // palette: roofs, awnings and flags lean toward the owner's colour, the rest stays natural
  function palette(color) {
    const base = hexRGB(color || '#8a7a5c');
    return {
      nat: mix(base, [120, 100, 80], 0.25), natDark: mix(mix(base, [60, 50, 40], 0.4), [0, 0, 0], 0.15), natLight: mix(base, [236, 226, 204], 0.35),
      tile: mix([176, 86, 58], base, 0.3), thatch: mix([178, 146, 78], base, 0.25), wood: [128, 94, 58], woodD: [92, 66, 40], plaster: mix([222, 210, 180], base, 0.1), stone: [176, 168, 150], stoneD: [140, 132, 116],
      brick: [150, 74, 52], brickD: [112, 56, 42], slate: mix([88, 90, 96], base, 0.35), flag: mix(base, [255, 255, 255], 0.1), steel: [120, 126, 128], concrete: [158, 158, 150], dark: [40, 38, 34],
      grain: [214, 186, 88], soil: [128, 102, 66], grass: [104, 128, 70], water: [66, 112, 150], glow: [240, 140, 50], white: [232, 228, 216], coal: [46, 44, 42], ore: [150, 170, 190]
    };
  }

  const house = (x, y, sx, sy, h, rh, wall, rf, alongY) => { B(x, y, 0, sx, sy, h, wall); roof(x, y, h, sx + 0.5, sy + 0.5, rh, rf, alongY); };
  const flag = (x, y, z, P) => { beam([x, y, z], [x, y, z + 5], 0.25, P.dark); B(x, y + 1, z + 3.8, 0.12, 2, 1.2, P.flag); };
  function horse(x, y, P) {
    for (const [lx, ly] of [[0.9, -0.3], [0.9, 0.3], [-0.9, -0.3], [-0.9, 0.3]]) B(x + lx, y + ly, 0, 0.3, 0.3, 1.5, [112, 82, 56]);
    B(x, y, 1.4, 2.6, 0.8, 1.0, [112, 82, 56]); B(x + 1.5, y, 2.0, 0.6, 0.5, 1.4, [112, 82, 56]); B(x + 1.9, y, 3.0, 0.9, 0.45, 0.45, [100, 72, 48]);
  }

  const ART = {
    farm(s, P) {
      for (let i = 0; i < 4; i++) B(-2 + i * 1.6, 0, 0, 1.1, 9, 0.35, P.grain);           // rows of grain
      B(-2 + 2.4, 0, 0, 7.4, 9.6, 0.12, P.soil);
      if (s === 'anc') house(4.5, 0, 4, 3.4, 2.4, 1.3, P.plaster, P.tile);
      else if (s === 'med') { house(4.5, 0, 4, 3.4, 2.2, 2.2, P.plaster, P.thatch); B(4.5, -1.75, 0, 1, 0.1, 1.6, P.woodD); }
      else if (s === 'nap') { house(4.5, 0.5, 4.2, 3.6, 2.8, 1.8, P.white, P.natDark); B(4.5, -1.35, 0, 1, 0.1, 1.7, P.woodD); }
      else { house(4.2, 1, 3.8, 4.4, 3.2, 2, P.natDark, P.slate, true); B(4.2, -1.25, 0, 1.6, 0.1, 2.2, P.white); cyl(4.5, -3.4, 0, 1.1, 6, P.concrete, P.steel); cone(4.5, -3.4, 6, 1.2, 1.1, P.steel); }
    },
    mine(s, P) {
      if (old(s) || s === 'nap') {
        cone(-1, 1, 0, 5.2, 4.2, [138, 122, 102], 6, 0.85);                              // the hillside
        B(-1, -3.6, 0, 2.2, 0.6, 2.2, P.dark);                                              // adit mouth
        beam([-2.3, -3.9, 0], [-2.3, -3.9, 2.4], 0.4, P.wood); beam([0.3, -3.9, 0], [0.3, -3.9, 2.4], 0.4, P.wood); beam([-2.5, -3.9, 2.4], [0.5, -3.9, 2.4], 0.45, P.wood);
        cone(3.8, -2.6, 0, 1.6, 1.4, s === 'anc' ? [190, 124, 76] : [110, 106, 100], 6);   // ore heap
        B(2.6, -4.4, 0, 1.6, 1, 0.8, P.woodD); wheel(2.0, -4.4, 0, 0.35, 0.2, P.dark); wheel(3.2, -4.4, 0, 0.35, 0.2, P.dark);
      } else {
        house(-3, 0, 4, 4.4, 3.4, 1.5, P.brick, P.slate);                                   // winding house
        for (const [dx, dy] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) beam([2.5 + dx, dy, 0], [2.5 + dx * 0.25, dy * 0.25, 8], 0.35, P.steel);
        beam([2.5, 0, 8], [-1.8, 0, 3.4], 0.3, P.steel);                                    // cable
        wheel(2.5, 0, 7.2, 1.1, 0.35, P.dark);
        cone(5.4, -2.6, 0, 1.8, 1.6, P.coal, 6);
      }
    },
    fuel(s, P) {
      if (s === 'mod') {
        for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) beam([-2 + dx, dy, 0], [-2 + dx * 0.2, dy * 0.2, 10], 0.35, P.dark);
        for (const z of [3, 6]) { const k = 1 - z / 10 * 0.8; B(-2, 0, z, 3.2 * k + 0.3, 3.2 * k + 0.3, 0.25, P.dark); }
        cyl(3.8, 1.2, 0, 2.2, 3, P.white, P.natLight); cyl(3.4, -3, 0, 1.4, 2.2, P.white, P.natLight);
      } else if (s === 'ind' || s === 'nap') {
        house(-3, 0, 4.4, 3.8, 3, 1.6, s === 'ind' ? P.brick : P.wood, P.slate);
        cone(2.2, -1.6, 0, 2.2, 2.4, P.coal, 6); cone(3.6, 2, 0, 1.9, 2, [58, 56, 52], 6);
        if (s === 'ind') { cyl(-4.2, 1, 0, 0.6, 7, P.brickD); puff(-4.2, 1.4, 7.6, 0.9); puff(-3.8, 2.2, 8.7, 1.1); }
      } else {
        cone(-1.5, 0, 0, 3.2, 2.8, [74, 62, 50], 8);                                        // charcoal clamp
        puff(-1.5, 0, 3.0, 0.9); puff(-1.1, 0.8, 4.0, 1.1); puff(-1.8, 1.6, 5.2, 0.9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) beam([3 + j * 0.8 + i * 0.4, -2, 0.35 + i * 0.7], [3 + j * 0.8 + i * 0.4, 2, 0.35 + i * 0.7], 0.65, P.wood);
      }
    },
    strat(s, P, era) {
      if (era && (era.startsWith('rome') || era.startsWith('medieval'))) {
        house(-3, 0, 4.6, 4, 2.4, 1.6, era.startsWith('rome') ? P.plaster : P.wood, era.startsWith('rome') ? P.tile : P.thatch);
        for (const [a, b] of [[[0.5, -3], [5.5, -3]], [[5.5, -3], [5.5, 3]], [[5.5, 3], [0.5, 3]]]) { beam([a[0], a[1], 1.1], [b[0], b[1], 1.1], 0.2, P.woodD); beam([a[0], a[1], 0.6], [b[0], b[1], 0.6], 0.2, P.woodD); beam([a[0], a[1], 0], [a[0], a[1], 1.3], 0.25, P.woodD); }
        horse(3, 0.5, P);
      } else if (s === 'anc') {
        cone(-1, 1, 0, 4.2, 3.4, [138, 122, 102], 6, 0.8); B(-1, -2.4, 0, 1.8, 0.5, 1.8, P.dark);
        cone(3.4, -2, 0, 1.8, 1.4, P.ore, 6); cone(4.4, 0.4, 0, 1.2, 1, [120, 140, 160], 6);
      } else if (s === 'nap') {
        B(-2.5, 0, 0, 4.4, 4, 2, P.wood); roof(-2.5, 0, 2, 4.8, 4.4, 1.4, P.slate);
        cone(2.4, -2, 0, 1.9, 1.8, P.white, 6); cone(3.6, 1.6, 0, 1.6, 1.4, [226, 220, 204], 6);
      } else {
        B(-3, 0, 0, 4, 4, 3.4, P.concrete, P.steel);
        cyl(1.5, -1, 0, 1, 8, P.steel, P.white); cyl(4.2, 1.2, 0, 1.6, 2.6, P.nat, P.natLight);
        beam([-1, -1, 2.6], [1.5, -1, 2.6], 0.35, P.dark); beam([1.5, -1, 1.6], [4.2, 1.2, 1.6], 0.35, P.dark);
        if (s === 'ind') puff(1.5, -0.6, 8.6, 1);
      }
    },
    shop(s, P) {
      if (old(s)) {
        for (const [x, y] of [[-2.4, -1.4], [2.4, 1.4]]) {
          for (const [dx, dy] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) beam([x + dx, y + dy, 0], [x + dx, y + dy, 2.4], 0.25, P.woodD);
          for (let i = 0; i < 4; i++) B(x - 1.35 + i * 0.9, y, 2.4, 0.9, 2.4, 0.18, i % 2 ? P.white : P.nat);
          B(x, y, 0, 3.4, 2.2, 1, P.wood, [150, 116, 76]);
          cyl(x - 0.8, y, 1, 0.35, 0.6, [182, 116, 70]); cyl(x + 0.6, y + 0.3, 1, 0.3, 0.5, [150, 100, 60]);
        }
      } else if (s === 'nap') {
        B(0, 0, 0, 7, 4, 4.2, P.plaster); roof(0, 0, 4.2, 7.4, 4.4, 1.6, P.natDark);
        for (let i = 0; i < 4; i++) for (const z of [1.1, 2.7]) B(-2.6 + i * 1.75, -2.02, z, 0.7, 0.06, 0.9, [60, 80, 104]);
        B(0, -2.02, 0, 1, 0.06, 1.1, P.woodD);
      } else {
        B(0, 0, 0, 8, 5, 3, P.brick);
        for (let i = 0; i < 4; i++) { const x = -4 + i * 2; face([[x, -2.5, 3], [x, 2.5, 3], [x + 2, 2.5, 3], [x + 2, -2.5, 3]], P.brick, [0, 0, 1]); face([[x, -2.5, 3], [x, 2.5, 3], [x, 2.5, 4.6], [x, -2.5, 4.6]], [150, 180, 190], [-1, 0, 0]); face([[x, -2.5, 4.6], [x, 2.5, 4.6], [x + 2, 2.5, 3], [x + 2, -2.5, 3]], P.nat, [1, 0, 1]); face([[x, -2.5, 3], [x + 2, -2.5, 3], [x, -2.5, 4.6]], P.brick, [0, -1, 0]); }
        for (let i = 0; i < 4; i++) B(-3 + i * 2, -2.52, 1, 1, 0.06, 1, [232, 214, 140]);
      }
    },
    arsenal(s, P) {
      if (old(s)) {
        house(-1.5, 0, 5, 4, 2.4, 1.6, s === 'anc' ? P.plaster : P.wood, s === 'anc' ? P.tile : P.thatch);
        B(-3, 1, 0, 1, 1, 5, P.stone); puff(-3, 1, 5.4, 0.8); puff(-2.6, 1.6, 6.3, 1);
        B(-1.5, -2.02, 0, 1.4, 0.08, 1.2, P.glow);
        B(3, -1, 0, 0.7, 0.6, 0.8, P.dark); B(3, -1, 0.8, 1.5, 0.7, 0.4, P.dark);            // anvil
      } else if (s === 'nap') {
        B(-1.5, 0, 0, 6, 4.4, 3, P.stone); roof(-1.5, 0, 3, 6.4, 4.8, 1.4, P.slate);
        cyl(-3.5, 1.2, 0, 0.7, 7.4, P.brickD); puff(-3.5, 1.4, 8, 0.9); puff(-3.1, 2.1, 9, 1.1);
        B(3.4, -2.2, 0, 1.8, 1.4, 0.8, P.wood); beam([2.2, -2.2, 1.2], [5.6, -2.2, 1.5], 0.55, [60, 62, 60]);
        wheel(3.4, -3.1, 0, 0.7, 0.25, P.woodD); wheel(3.4, -1.3, 0, 0.7, 0.25, P.woodD);
      } else {
        B(0, 0, 0, 8, 5, 3.4, P.brick); roof(0, 0, 3.4, 8.4, 5.4, 1.3, P.natDark);
        for (let i = 0; i < 4; i++) B(-2.7 + i * 1.8, -2.52, 1.1, 1, 0.06, 1.2, [232, 214, 140]);
        cyl(-2.4, 1.6, 0, 0.6, 8.4, P.brickD); cyl(0.2, 1.6, 0, 0.6, 7.2, P.brickD);
        puff(-2.4, 2, 9, 1); puff(-2, 2.8, 10.2, 1.3); puff(0.2, 2, 7.8, 0.9);
      }
    },
    port(s, P) {
      B(1, 0, 0, 12, 10, 0.08, P.water);
      B(-3.5, 0, 0, 3, 10, 0.3, P.soil);
      B(-0.5, -1.2, 0.5, 6, 1.6, 0.25, P.wood);                                              // pier
      for (let i = 0; i < 4; i++) beam([-2.6 + i * 1.5, -1.9, 0], [-2.6 + i * 1.5, -1.9, 0.55], 0.25, P.woodD);
      if (old(s) || s === 'nap') {
        extrude([[1, 1.2], [5.6, 1.2], [6.6, 2], [5.6, 2.8], [1, 2.8], [0.4, 2]], 0.1, 1, P.wood);
        beam([3.4, 2, 1], [3.4, 2, 5.4], 0.2, P.woodD);
        B(3.4, 2, 2, 0.1, s === 'anc' ? 2.8 : 3.2, 3, s === 'anc' ? P.natLight : P.white);
      } else {
        extrude([[0.6, 1], [5.8, 1], [7, 2], [5.8, 3], [0.6, 3]], 0.1, 1.2, [70, 74, 80]);
        B(2.6, 2, 1.2, 2.4, 1.4, 1.2, P.white); cyl(4.2, 2, 1.2, 0.4, 1.8, P.nat);
      }
    },
    dock(s, P) {
      B(0, 0, 0, 12, 10, 0.08, P.water);
      if (old(s)) {
        for (let i = 0; i < 3; i++) {
          const x = -3.4 + i * 3.4;
          for (const dy of [-2.6, 2.6]) beam([x - 1.4, dy, 0], [x - 1.4, dy, 2.2], 0.3, P.stone);
          roof(x, 0, 2.2, 3, 6, 1.4, s === 'anc' ? P.tile : P.natDark, true);
        }
        extrude([[-4, -1], [-2.6, -1.4], [-2.6, 0.6], [-4, 0.2]], 0, 0.8, P.wood);
      } else {
        B(-1, 0, 0, 8, 4.4, 0.5, P.concrete);
        extrude([[-4.5, -1.2], [1.5, -1.2], [3, 0], [1.5, 1.2], [-4.5, 1.2]], 0.5, 2, [96, 100, 106]);
        beam([4.6, 3, 0], [4.6, 3, 9], 0.45, P.nat); beam([4.6, 3, 9], [-1.5, 0, 9], 0.4, P.nat); beam([4.6, 3, 7], [1.5, 1.5, 9], 0.3, P.nat);
        beam([-1, 0, 9], [-1, 0, 4], 0.1, P.dark); B(-1, 0, 3.6, 0.8, 0.8, 0.5, P.dark);
      }
    },
    air(s, P) {
      B(1, -1, 0, 12, 3.4, 0.1, [96, 102, 94]);
      vault(-2.6, 2.6, 0, 5, 2.2, s === 'ind' ? [150, 128, 96] : P.concrete);
      const px = 2.6, py = -1, h = 0.8;
      B(px, py, h, 3.6, 0.6, 0.6, s === 'ind' ? [168, 150, 110] : P.nat);                  // fuselage
      B(px + 0.6, py, h + 0.3, 1.1, 5.4, 0.12, s === 'ind' ? [190, 172, 128] : P.natLight); // wing
      if (s === 'ind') { B(px + 0.6, py, h + 1.2, 1.1, 5.4, 0.12, [190, 172, 128]); beam([px + 0.6, py - 2.2, h + 0.3], [px + 0.6, py - 2.2, h + 1.2], 0.1, P.dark); beam([px + 0.6, py + 2.2, h + 0.3], [px + 0.6, py + 2.2, h + 1.2], 0.1, P.dark); }
      B(px - 1.6, py, h + 0.2, 0.7, 2, 0.1, P.natLight); B(px - 1.7, py, h + 0.4, 0.6, 0.1, 0.8, P.natLight);
      beam([px + 0.4, py - 0.4, 0], [px + 0.4, py - 0.4, h], 0.12, P.dark); beam([px + 0.4, py + 0.4, 0], [px + 0.4, py + 0.4, h], 0.12, P.dark);
      flag(-5.4, -2, 0, P);
    },
    hub(s, P) {
      if (s === 'ind' || s === 'mod') {
        for (let x = -5; x <= 5; x += 1.25) B(x, -2.4, 0, 0.35, 2.4, 0.12, P.woodD);
        beam([-5.5, -3.1, 0.2], [5.5, -3.1, 0.2], 0.16, P.steel); beam([-5.5, -1.7, 0.2], [5.5, -1.7, 0.2], 0.16, P.steel);
        house(-2, 2, 6, 3.2, 2.8, 1.2, s === 'ind' ? P.brick : P.concrete, P.natDark);
        B(2.4, -2.4, 0.7, 3.4, 1.8, 1.6, P.natDark); wheel(1.4, -3.3, 0.1, 0.35, 0.15, P.dark); wheel(3.4, -3.3, 0.1, 0.35, 0.15, P.dark);
        B(3.6, 2.2, 0, 1.4, 1.4, 1.2, P.wood); B(3.6, 2.2, 1.2, 1.2, 1.2, 1, [150, 116, 76]);
      } else {
        B(-3, 1, 0, 1.6, 1.6, 1.4, P.wood); B(-1.3, 1, 0, 1.6, 1.6, 1.4, [150, 116, 76]); B(-2.2, 1, 1.4, 1.6, 1.6, 1.4, P.wood);
        cyl(-3.4, -1.6, 0, 0.7, 1.4, [140, 104, 64]); cyl(-2, -2, 0, 0.7, 1.4, [140, 104, 64]);
        B(3, 0, 0.9, 3.8, 2, 1, P.wood);                                                    // wagon
        for (const [dx, dy] of [[-1.3, -1.15], [1.3, -1.15], [-1.3, 1.15], [1.3, 1.15]]) wheel(3 + dx, dy, 0, 0.6, 0.2, P.woodD);
        if (s !== 'anc') vault(3, 0, 1.9, 3.6, 1.1, P.white);
      }
    },
    fort(s, P) {
      if (s === 'med') {
        B(0, 0, 0, 6, 6, 3, P.stone, P.stoneD);                                            // curtain walls
        B(0, 0, 0, 3, 3, 6, P.stone);                                                       // keep
        for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { cyl(dx, dy, 0, 1.1, 4.4, P.stoneD); cone(dx, dy, 4.4, 1.3, 1.6, P.natDark); }
        for (let i = 0; i < 3; i++) { B(-1 + i, -1.5, 6, 0.5, 0.3, 0.5, P.stone); B(-1 + i, 1.5, 6, 0.5, 0.3, 0.5, P.stone); }
        B(0, -3.02, 0, 1.4, 0.1, 1.9, P.dark);
        flag(0, 0, 6, P);
      } else if (s === 'anc') {
        const W = 5.4;
        for (const [x, y, sx, sy] of [[0, -W / 2, W, 0.8], [0, W / 2, W, 0.8], [-W / 2, 0, 0.8, W], [W / 2, 0, 0.8, W]]) {
          if (y < 0) { B(-1.8, y, 0, 1.8, sy, 2.6, P.plaster); B(1.8, y, 0, 1.8, sy, 2.6, P.plaster); B(0, y, 2, 1.8, sy, 0.6, P.plaster); }
          else B(x, y, 0, sx, sy, 2.6, P.plaster);
        }
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(dx * W / 2, dy * W / 2, 0, 1.4, 1.4, 3.4, P.stone);
        house(0.6, 0.6, 2.6, 2, 1.8, 1, P.plaster, P.tile);
        flag(-W / 2, -W / 2, 3.4, P);
      } else if (s === 'nap') {
        const star = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 3.2 : 5.4; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
        extrude(star, 0, 1.4, [132, 142, 104], [148, 160, 116]);
        B(0, 0, 1.4, 3, 3, 1.4, P.stone); roof(0, 0, 2.8, 3.2, 3.2, 0.9, P.slate);
        beam([3.2, -1, 1.5], [4.8, -1.4, 1.8], 0.35, P.dark);
        flag(1.3, 1.3, 2.8, P);
      } else {
        cone(0, 0, 0, 5.2, 1.2, s === 'ind' ? [120, 108, 84] : [112, 120, 92], 8);        // earthworks
        extrude(ring(0, 0, 3, 8, Math.PI / 8), 0.8, 2.3, P.concrete, [170, 170, 162]);
        B(0, -2.9, 1.3, 2.6, 0.2, 0.5, P.dark);
        beam([0, -2.4, 1.6], [0.3, -5, 1.9], 0.4, P.dark);
        if (s === 'ind') for (let i = -2; i <= 2; i++) beam([i * 1.6 - 0.6, 4.2, 0.1], [i * 1.6 + 0.6, 4.8, 0.9], 0.12, P.dark);
        flag(2, 1.5, 2.3, P);
      }
    },
    radar(s, P) {
      B(0, 1.6, 0, 3, 2.6, 2.2, P.concrete, P.steel);
      for (const [dx, dy] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) beam([dx - 1, dy - 1.6, 0], [-1 + dx * 0.2, -1.6 + dy * 0.2, 6], 0.25, P.steel);
      // the dish: a shallow cone tipped toward the sky
      const tilt = -0.7, cs = Math.cos(tilt), sn = Math.sin(tilt), cx = -1, cy = -1.6, cz = 6.6;
      const rim = ring(0, 0, 2.8, 10).map(p => { const x = 0, y = p[0], z = p[1]; return [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs]; });
      const apex = [cx - 1 * cs, cy, cz + 1 * sn];
      for (let i = 0; i < rim.length; i++) { const p = rim[i], q = rim[(i + 1) % rim.length]; parts.push({ v: [p, q, apex], c: P.white, two: true }); }
    }
  };

  // ---------- rasterise (the same flat-shaded painter as the troop figures) ----------
  const models = new Map();
  function model(kind, era, color) {
    const key = kind + '|' + era + '|' + color;
    let m = models.get(key);
    if (m) return m;
    parts = [];
    const P = palette(color);
    ART[kind](styleOf(era), P, era);
    // every building flies its owner's flag, like the troops wear their colours
    if (kind !== 'air' && kind !== 'fort') {
      let x0 = Infinity, y1 = -Infinity;
      for (const f of parts) for (const v of f.v) { x0 = Math.min(x0, v[0]); y1 = Math.max(y1, v[1]); }
      flag(x0 + 0.4, y1 - 0.4, 0, P);
    }
    m = parts; parts = null;
    let r = 1, top = 1;
    for (const f of m) for (const v of f.v) { r = Math.max(r, Math.hypot(v[0], v[1])); top = Math.max(top, v[2]); }
    m.r = r; m.top = top;
    if (models.size > 400) models.clear();
    models.set(key, m);
    return m;
  }
  // draw a model into ctx with its footprint centred at (cx, cy), fitted to a box px wide
  function render(g, m, yaw, cx, cy, px) {
    const k = Math.min(px * 0.46 / m.r, px * 0.8 / (m.top * CE + m.r * SE));
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const faces = [];
    for (const p of m) {
      const w = p.v.map(v => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2]]);
      const a = w[0], b = w[1], c = w[2];
      let n = norm([(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]);
      let facing = n[1] * -CE + n[2] * SE;
      if (facing <= 0.001) { if (!p.two) continue; n = n.map(q => -q); }
      const lit = 0.62 + 0.6 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      let depth = 0; for (const v of w) depth += -v[1] * CE + v[2] * SE;
      faces.push({ w, depth: depth / w.length, col: 'rgb(' + p.c.map(q => Math.min(255, Math.round(q * lit))).join(',') + ')' });
    }
    faces.sort((a, b) => a.depth - b.depth);
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.beginPath(); g.ellipse(cx + m.r * k * 0.08, cy + m.r * k * SE * 0.05, m.r * k * 0.95, m.r * k * SE * 0.85, 0, 0, Math.PI * 2); g.fill();
    g.lineJoin = 'round'; g.lineWidth = Math.max(0.5, px / 90);
    for (const f of faces) {
      g.beginPath();
      f.w.forEach((v, i) => { const x = cx + v[0] * k, y = cy - (v[1] * SE + v[2] * CE) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.fillStyle = f.col; g.strokeStyle = f.col; g.fill(); g.stroke();
    }
  }
  const YAW0 = -0.55;   // a three-quarter view
  // a cached sprite for the map: px square (device pixels), four slightly different angles
  // Map icons come in a few fixed sizes and live on shared sheets, one per size: zooming then reuses the same
  // pictures (drawn a little larger or smaller) instead of painting new ones at every step, and the browser draws
  // hundreds of icons from one source canvas cheaply. A new icon is painted on its own small canvas and moved onto
  // its sheet at the start of the next frame (flush), since changing a sheet between draws from it is costly.
  const SIZES = [16, 24, 32, 48, 64, 96], SHEET = 512;   // small sheets: the browser re-copies a sheet when it changes
  const cache = new Map();          // kind|era|color|turn|size -> { cv, sx, sy, s }
  const sheets = new Map();         // size -> { cv, g, next }
  const fresh = [];
  let paintedThisFrame = 0, frameMark = 0;
  function icon(kind, era, color, px, turn) {
    const base = kind + '|' + era + '|' + color + '|' + (turn || 0) + '|';
    const size = SIZES.find(b => b >= px) || SIZES[SIZES.length - 1];
    let e = cache.get(base + size);
    if (e) return e;
    // new pictures are painted a few per frame so zooming into a busy region never stalls;
    // meanwhile the nearest size already painted stands in
    const now = performance.now();
    if (now - frameMark > 12) { frameMark = now; paintedThisFrame = 0; }
    if (paintedThisFrame++ > 12) {
      const i = SIZES.indexOf(size);
      for (let d = 1; d < SIZES.length; d++) for (const j of [i - d, i + d]) { const q = SIZES[j] && cache.get(base + SIZES[j]); if (q) return q; }
      return null;
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    render(cv.getContext('2d'), model(kind, era, color), YAW0 + (turn || 0) * 0.5, size / 2, size * 0.66, size * 0.92);
    e = { cv, sx: 0, sy: 0, s: size, key: base + size };
    cache.set(e.key, e); fresh.push(e);
    return e;
  }
  function flush() {
    for (const e of fresh) {
      if (cache.get(e.key) !== e) continue;
      let list = sheets.get(e.s); if (!list) sheets.set(e.s, list = []);
      const per = Math.floor(SHEET / e.s);
      let sh = list[list.length - 1];
      if (!sh || sh.next >= per * per) {
        if (list.length >= 12) {   // this size is full: start afresh and forget what was on its sheets
          for (const old of list) for (const [k, q] of cache) if (q.cv === old.cv) cache.delete(k);
          list.length = 0; cache.set(e.key, e);
        }
        sh = { cv: document.createElement('canvas'), g: null, next: 0 }; sh.cv.width = sh.cv.height = SHEET; sh.g = sh.cv.getContext('2d'); list.push(sh);
      }
      const sx = (sh.next % per) * e.s, sy = Math.floor(sh.next / per) * e.s; sh.next++;
      sh.g.drawImage(e.cv, sx, sy);
      e.cv = sh.cv; e.sx = sx; e.sy = sy;
    }
    fresh.length = 0;
  }
  // a live drawing at any angle, for the slowly turning icons in the build lists
  function paint(ctx, kind, era, color, x, y, px, yaw) {
    if (!ART[kind]) return;
    render(ctx, model(kind, era, color), yaw === undefined ? YAW0 : yaw, x + px / 2, y + px * 0.66, px * 0.92);
  }
  // turn every <canvas data-bicon="kind"> under a root element to the given angle
  function spin(root, era, color, yaw) {
    root.querySelectorAll('canvas[data-bicon]').forEach(cv => {
      const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
      paint(c, cv.dataset.bicon, era, color, 0, 0, cv.width, yaw);
      cv.dataset.done = '1';
    });
  }
  return { icon, flush, paint, spin, styleOf, KINDS: Object.keys(ART) };
})();
