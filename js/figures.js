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
  // the rest are for the historical eras: foot with spear and shield, musketeers, riders, elephants,
  // siege engines, horse-drawn cannon, archers and swordsmen
  const KINDS = ['soldiers', 'truck', 'halftrack', 'tank', 'gun', 'plane', 'car', 'warband', 'musket', 'rider', 'elephant', 'engine', 'cannon', 'archer', 'swords', 'riderbow'];
  // 1917 and 2026 units: models made in Blender, shipped in js/models.js
  const MODELED = typeof Models !== 'undefined' ? Models.kinds : [];
  KINDS.push(...MODELED);
  const FOOT = ['soldiers', 'warband', 'musket', 'archer', 'swords', 'modern', 'militia', 'gastroops', 'drone'];

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
      mark: mix(base, [255, 255, 255], 0.15),
      horse: [112, 82, 56], wood: [124, 94, 62], bronze: [168, 128, 64], hide: [132, 128, 120], white: [226, 222, 208]
    };
  }

  // opt.hat: 'helmet' (default), 'shako' or 'crest'; opt.spear, opt.sword, opt.bow and opt.shield for
  // pre-gunpowder foot. Fighting poses animate over the 4 frames: spears thrust, swords swing, bows draw
  // and loose, firearms kick back on each shot.
  function soldier(parts, P, x, y, f, fighting, opt) {
    opt = opt || {};
    const s = fighting ? 0 : Math.sin(f / FRAMES * Math.PI * 2) * 0.55;
    const melee = opt.spear || opt.sword;
    const kneel = fighting && !melee && !opt.bow ? -1.2 : 0;
    const lunge = fighting && melee ? [0, 0.5, 0.9, 0.3][f] : 0;        // body leans into the blow
    const stride = fighting && melee ? [0.25, -0.35, -0.5, 0][f] : 0;
    box(parts, 0, x, y - 0.55, 0, 0.8, 0.6, 3.0, P.dark, s + stride, x, 3.0);           // legs swing at the hip
    box(parts, 0, x, y + 0.55, 0, 0.8, 0.6, 3.0, P.dark, -s - stride, x, 3.0);
    box(parts, 0, x + lunge * 0.3, y, 2.8 + kneel, 1.3, 1.9, 2.8, P.cloth, lunge * 0.25, x, 2.8 + kneel); // torso
    const armL = fighting ? (opt.bow ? -1.5 : opt.shield ? -0.6 : -1.3) : -s * 0.8;
    const armR = fighting ? (opt.sword ? [-2.4, -1.2, 0.4, -0.6][f] : opt.spear ? -1.4 : opt.bow ? -1.5 : -1.3) : s * 0.8;
    box(parts, 0, x + lunge * 0.3, y - 1.2, 3.4 + kneel, 0.6, 0.5, 2.1, P.cloth, armL, x + lunge * 0.3, 5.4 + kneel); // arms
    box(parts, 0, x + lunge * 0.3, y + 1.2, 3.4 + kneel, 0.6, 0.5, 2.1, P.cloth, armR, x + lunge * 0.3, 5.4 + kneel);
    const hx = x + 0.1 + lunge * 0.55;
    box(parts, 0, hx, y, 5.6 + kneel, 0.9, 0.9, 0.9, P.skin);                          // head
    if (opt.hat === 'shako') { box(parts, 0, hx - 0.1, y, 6.2 + kneel, 1.1, 1.1, 1.4, P.dark); box(parts, 0, hx + 0.2, y, 6.2 + kneel, 0.8, 1.2, 0.2, P.dark); }
    else if (opt.hat === 'crest') { box(parts, 0, hx - 0.1, y, 6.2 + kneel, 1.2, 1.2, 0.6, P.metal); box(parts, 0, hx - 0.2, y, 6.8 + kneel, 1.3, 0.3, 0.6, P.mark); }
    else if (opt.hat === 'hood') box(parts, 0, hx - 0.1, y, 6.2 + kneel, 1.2, 1.2, 0.5, P.cloth);
    else box(parts, 0, hx - 0.1, y, 6.3 + kneel, 1.5, 1.5, 0.55, P.cloth);             // helmet
    if (opt.hat === 'shako') box(parts, 0, x + 0.66, y, 3.2 + kneel, 0.05, 1.5, 2.2, P.white); // crossbelts
    if (opt.shield) box(parts, 0, x + 0.9 + lunge * 0.6, y - 1.3, 2.6 + kneel, 0.3, 1.6, 2.8, P.mark); // shield on the left arm
    if (opt.spear) {
      if (fighting) {
        const th = [0, 1.4, 2.4, 0.8][f];                                                 // thrust and draw back
        box(parts, 0, x + 1.5 + th, y + 1.0, 4.4, 6.5, 0.28, 0.28, P.wood);
        box(parts, 0, x + 4.8 + th, y + 1.0, 4.4, 0.9, 0.3, 0.3, P.metal);
      } else {
        box(parts, 0, x + 0.2, y + 1.3, 0.4, 0.28, 0.28, 9.0, P.wood, 0.12, x + 0.2, 0.4);   // spear upright
        box(parts, 0, x + 1.25, y + 1.3, 9.2, 0.3, 0.3, 0.9, P.metal);
      }
    } else if (opt.sword) {
      // the blade follows the right arm: raised, cutting down, then recovering
      const sw = fighting ? [-2.6, -1.4, 0.5, -0.8][f] : 0.4;
      box(parts, 0, x + 0.2 + lunge * 0.3, y + 1.3, 5.2 + kneel, 0.25, 0.22, 2.6, P.metal, sw, x + 0.2 + lunge * 0.3, 5.2 + kneel);
    } else if (opt.bow) {
      if (fighting) {
        const pull = [1.3, 1.6, 0.2, 0.6][f];                                             // draw, hold, loose, nock
        box(parts, 0, x + 1.8, y - 0.6, 3.0, 0.22, 0.22, 3.6, P.wood, -0.25, x + 1.8, 4.8); // bow held out front
        box(parts, 0, x + 1.8 - pull, y - 0.3, 4.75, pull + 0.05, 0.08, 0.08, P.white);     // string pulled back
        if (f < 2) box(parts, 0, x + 1.9 - pull, y - 0.4, 4.7, 2.2, 0.12, 0.12, P.wood);    // arrow on the string
      } else box(parts, 0, x - 0.7, y - 0.9, 2.4, 0.22, 0.22, 3.8, P.wood, 0.3, x - 0.7, 4.2); // bow on the back
      box(parts, 0, x - 0.8, y + 0.6, 3.4, 0.6, 0.6, 1.8, P.wood);                          // quiver
    } else if (fighting) {
      const kick = f === 1 ? -0.35 : 0;                                                    // recoil on the shot
      box(parts, 0, x + 1.3 + kick, y - 0.5, 4.6 + kneel + (f === 1 ? 0.1 : 0), 2.6, 0.3, 0.3, P.metal); // rifle levelled
    } else box(parts, 0, x - 0.6, y - 0.9, 3.8, 0.3, 0.3, 3.2, P.metal, 0.35, x - 0.6, 3.8); // rifle slung
  }
  function horse(parts, P, x, y, f, moving) {
    const s = moving ? Math.sin(f / FRAMES * Math.PI * 2) * 0.5 : 0, lift = moving ? (f % 2) * 0.3 : 0;
    for (const [lx, ly, ph] of [[1.8, -0.55, 1], [1.8, 0.55, -1], [-1.8, -0.55, -1], [-1.8, 0.55, 1]])
      box(parts, 0, x + lx, y + ly, 0, 0.55, 0.5, 3.4, P.horse, s * ph, x + lx, 3.4);    // legs
    box(parts, 0, x, y, 3.2 + lift, 5.4, 1.6, 2.1, P.horse);                             // barrel
    box(parts, 0, x + 3.0, y, 4.3 + lift, 1.2, 1.0, 2.6, P.horse, -0.55, x + 3.0, 4.3 + lift); // neck
    box(parts, 0, x + 4.1, y, 6.0 + lift, 1.9, 0.9, 0.9, P.horse);                       // head
    box(parts, 0, x - 3.0, y, 3.4 + lift, 0.5, 0.4, 1.8, P.dark, 0.5, x - 2.8, 5.2 + lift); // tail
  }
  function rider(parts, P, x, y, f, fighting, weapon) {
    horse(parts, P, x, y, f, true);
    const z = 5.3 + (f % 2) * 0.3;
    box(parts, 0, x - 0.3, y - 0.95, z - 1.6, 0.6, 0.4, 2.0, P.dark);                    // legs astride
    box(parts, 0, x - 0.3, y + 0.95, z - 1.6, 0.6, 0.4, 2.0, P.dark);
    box(parts, 0, x - 0.3, y, z, 1.2, 1.7, 2.5, P.cloth);                                // torso
    box(parts, 0, x - 0.2, y, z + 2.5, 0.9, 0.9, 0.9, P.skin);                           // head
    box(parts, 0, x - 0.3, y, z + 3.3, 1.3, 1.3, 0.5, P.cloth);                          // cap or helm
    if (weapon === 'lance') { const th = fighting ? [0, 1.2, 2.0, 0.6][f] : 0; box(parts, 0, x + (fighting ? 2.5 + th : 0.2), y + 1.0, z + (fighting ? 1.4 : 0.2), fighting ? 7.5 : 0.25, 0.25, fighting ? 0.25 : 6.5, P.wood); }
    else if (weapon === 'bow') {
      if (fighting) { box(parts, 0, x + 1.2, y - 0.8, z + 0.4, 0.2, 0.2, 3.0, P.wood, -0.2, x + 1.2, z + 1.9); if (f < 2) box(parts, 0, x + 0.2, y - 0.6, z + 1.9, 1.8, 0.12, 0.12, P.wood); }
      else box(parts, 0, x - 0.9, y - 0.8, z, 0.2, 0.2, 3.0, P.wood, 0.3, x - 0.9, z + 1.5);
    }
    else box(parts, 0, x + 0.4, y + 1.0, z + 1.4, 0.25, 0.25, 2.2, P.metal, fighting ? [-2.4, -1.2, 0.3, -0.8][f] : 0.3, x + 0.4, z + 1.4); // sword or sabre, swung when fighting
  }
  function build(kind, P, f, fighting) {
    if (MODELED.includes(kind)) return Models.parts(kind, P, f, fighting);
    const parts = [];
    const bob = (f % 2) * 0.25;
    const spin = f / FRAMES * Math.PI / 4;
    if (kind === 'soldiers') {
      soldier(parts, P, 1.8, 0, f, fighting); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting);
    } else if (kind === 'warband') {
      const o = { hat: 'crest', spear: true, shield: true };
      soldier(parts, P, 1.8, 0, f, fighting, o); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting, o); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting, o);
    } else if (kind === 'musket') {
      const o = { hat: 'shako' };
      soldier(parts, P, 1.8, 0, f, fighting, o); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting, o); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting, o);
    } else if (kind === 'archer') {
      const o = { hat: 'hood', bow: true };
      soldier(parts, P, 1.8, 0, f, fighting, o); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting, o); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting, o);
    } else if (kind === 'swords') {
      const o = { hat: 'crest', sword: true, shield: true };
      soldier(parts, P, 1.8, 0, f, fighting, o); soldier(parts, P, -1.6, -2.6, (f + 2) % FRAMES, fighting, o); soldier(parts, P, -1.6, 2.6, (f + 1) % FRAMES, fighting, o);
    } else if (kind === 'rider') {
      rider(parts, P, 1.6, -1.8, f, fighting, 'lance'); rider(parts, P, -2.0, 2.0, (f + 1) % FRAMES, fighting, 'sword');
    } else if (kind === 'riderbow') {
      rider(parts, P, 1.6, -1.8, f, fighting, 'bow'); rider(parts, P, -2.0, 2.0, (f + 2) % FRAMES, fighting, 'bow');
    } else if (kind === 'elephant') {
      const s = Math.sin(f / FRAMES * Math.PI * 2) * 0.3;
      for (const [lx, ly, ph] of [[2.2, -1.1, 1], [2.2, 1.1, -1], [-2.2, -1.1, -1], [-2.2, 1.1, 1]])
        box(parts, 0, lx, ly, 0, 1.3, 1.2, 3.6, P.hide, s * ph, lx, 3.6);              // legs
      box(parts, 0, 0, 0, 3.3, 7.2, 3.6, 3.4, P.hide);                                   // body
      box(parts, 0, 4.2, 0, 4.4, 2.2, 2.8, 2.8, P.hide);                                 // head
      box(parts, 0, 3.9, -1.9, 4.6, 0.3, 1.4, 2.2, P.hide); box(parts, 0, 3.9, 1.9, 4.6, 0.3, 1.4, 2.2, P.hide); // ears
      box(parts, 0, 5.5, 0, 1.2, 0.8, 0.8, 3.4, P.hide, fighting ? [-0.4, -1.1, -1.6, -0.9][f] : 0.15 + s * 0.3, 5.5, 4.6); // trunk, swinging when fighting
      box(parts, 0, 5.6, -0.8, 3.9, 1.8, 0.3, 0.3, P.white); box(parts, 0, 5.6, 0.8, 3.9, 1.8, 0.3, 0.3, P.white); // tusks
      box(parts, 0, -0.6, 0, 6.7, 3.4, 3.2, 1.8, P.cloth);                               // howdah
      box(parts, 0, 1.6, 0, 7.4, 0.8, 0.8, 0.8, P.skin);                                 // mahout
    } else if (kind === 'engine') {
      box(parts, 0, 0, 0, 1.2, 7.0, 3.6, 0.6, P.wood);                                   // base frame
      box(parts, 0, 0.4, -1.5, 1.8, 0.6, 0.6, 5.2, P.wood); box(parts, 0, 0.4, 1.5, 1.8, 0.6, 0.6, 5.2, P.wood); // uprights
      const sw = fighting ? (f % 2 ? -1.2 : 0.9) : 0.9;
      box(parts, 0, -2.6, 0, 6.8, 9.0, 0.5, 0.5, P.wood, sw, 0.4, 6.8);                  // throwing arm
      box(parts, 0, 2.6, 0, 3.8, 1.4, 1.6, 1.6, P.metal);                                // counterweight
      for (const xx of [2.4, -2.4]) for (const yy of [-2.0, 2.0]) wheel(parts, xx, yy, 0, 0.9, 0.5, P.dark, spin);
    } else if (kind === 'cannon') {
      horse(parts, P, 5.0, -1.2, f, !fighting); horse(parts, P, 5.0, 1.2, (f + 1) % FRAMES, !fighting);
      box(parts, 0, 0.8, 0, 1.0, 3.0, 0.3, 0.3, P.wood);                                 // pole
      box(parts, 0, -2.0, 0, 1.3, 2.6, 2.4, 1.0, P.wood);                                // carriage
      box(parts, 0, -1.6 - (fighting && f === 1 ? 0.8 : fighting && f === 2 ? 0.4 : 0), 0, 2.3, 5.2, 0.8, 0.8, P.bronze, fighting ? 0 : -0.15, -2.4, 2.3); // barrel, kicking back on the shot
      wheel(parts, -2.2, -1.8, 0, 1.4, 0.4, P.wood, spin); wheel(parts, -2.2, 1.8, 0, 1.4, 0.4, P.wood, spin);
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
      box(parts, 0, -1.2 - (fighting && f === 1 ? 0.7 : fighting && f === 2 ? 0.3 : 0), 0, 2.4, 5.6, 0.6, 0.6, P.metal, fighting ? -0.12 : -0.35, -2.0, 2.4); // barrel, recoiling when firing
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

  const scaleOf = kind => MODELED.includes(kind) ? 1 : kind === 'soldiers' || kind === 'warband' || kind === 'musket' || kind === 'archer' || kind === 'swords' ? 1.55 : kind === 'rider' || kind === 'riderbow' || kind === 'elephant' ? 1.3 : 1.05;
  // a single model drawn live at any angle, for the turning previews in the Train list
  const previewParts = new Map();
  function preview(cv, tag, unitType, yaw) {
    const kind = kindOf(unitType), c = COUNTRY_BY_TAG[tag];
    const key = (c ? c.color : '') + '|' + kind;
    let parts = previewParts.get(key);
    if (!parts) {
      parts = build(kind, palette(c ? c.color : '#6b7058'), 0, false);
      // fit the model to the frame whatever its size: a column of soldiers and a tank fill it alike
      let r = 1, top = 1, low = 0;
      for (const f of parts) for (const v of f.v) { r = Math.max(r, Math.hypot(v[0], v[1])); top = Math.max(top, v[2]); }
      if (kind === 'plane') low = 8;
      parts.fit = Math.min(CELL * 0.4 / (r * PX), CELL * 0.62 / (((top - low) * CE + r * SE) * PX));
      parts.low = low;
      previewParts.set(key, parts); if (previewParts.size > 60) previewParts.delete(previewParts.keys().next().value);
    }
    const g = cv.getContext('2d'), s = cv.width / CELL;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    renderModel(g, parts, yaw, CELL / 2, CELL * 0.72 + parts.low * CE * PX * parts.fit, kind === 'plane', parts.fit);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  // Sprites are painted per nation and per model row, and only for the rows actually on screen: one nation's
  // tanks never cost anything until its tanks are seen. Each row (8 headings x 4 poses) is painted one pose at a
  // time inside a small per-frame budget, so a crowded new front never stalls the game. Until a row is ready
  // the neutral grey figure stands in. Rows not drawn for a while are dropped and repainted on return.
  const FIGHTERS = ['soldiers', 'gun', 'warband', 'musket', 'rider', 'engine', 'cannon', 'archer', 'swords', 'riderbow', 'elephant'].concat(MODELED);
  // only the models the current era's units use get rows (about 12 to 20)
  let layout = null;
  function getLayout() {
    if (!layout) {
      const used = new Set(['soldiers', 'plane']);
      for (const t in UNIT_TYPES) used.add(kindOf(t));
      const rows = KINDS.filter(k => used.has(k)).map(k => [k, false]).concat(FIGHTERS.filter(k => used.has(k)).map(k => [k, true]));
      layout = { rows, index: new Map(rows.map(([k, fi], i) => [k + (fi ? '!' : ''), i])) };
    }
    return layout;
  }
  const rowsN = () => getLayout().rows.length;
  const MAX_ROWS = 320;   // painted rows kept, about 250 KB each
  const atlases = new Map(); // tag -> { P, rows: [{ cv, g, done: bitmask of painted poses, used }] }
  let painted = 0;
  function newAtlas(color) { return { P: palette(color), rows: [], used: 0 }; }
  function rowOf(A, r) {
    let R = A.rows[r];
    if (!R) {
      if (painted >= MAX_ROWS) evict();
      const cv = document.createElement('canvas');
      cv.width = CELL * DIRS * FRAMES; cv.height = CELL;
      R = A.rows[r] = { cv, g: cv.getContext('2d'), done: 0, used: 0, queued: false, parts: null };
      painted++;
    }
    return R;
  }
  function evict() {
    let oldA = null, oldR = -1, ou = Infinity;
    for (const A of atlases.values()) A.rows.forEach((R, i) => { if (R && !R.queued && R.used < ou) { ou = R.used; oldA = A; oldR = i; } });
    if (oldA) { delete oldA.rows[oldR]; painted--; }
  }
  // paint one cell of a row: one pose seen from one heading (about 1 ms for a Blender model)
  function paintCell(A, r, cell) {
    const R = rowOf(A, r), [kind, fight] = getLayout().rows[r], g = R.g;
    const d = Math.floor(cell / FRAMES), f = cell % FRAMES;
    const pk = r + ':' + f;
    let parts = R.parts && R.parts.get(pk);
    if (!parts) { parts = build(kind, A.P, f, !!fight); (R.parts || (R.parts = new Map())).set(pk, parts); }
    // heading d: 0 = east, counter-clockwise in 45 degree steps (map north is up)
    const cx = cell * CELL + CELL / 2, cy = CELL * (kind === 'plane' ? 0.78 : 0.66);
    g.save(); g.beginPath(); g.rect(cell * CELL, 0, CELL, CELL); g.clip();
    renderModel(g, parts, d / DIRS * Math.PI * 2, cx, cy, kind === 'plane', scaleOf(kind));
    g.restore();
    R.done = (R.done | 1 << cell) >>> 0;
    if (R.done === ALL) R.parts = null;
  }
  const ALL = 2 ** (DIRS * FRAMES) - 1;   // one bit per cell (32 cells)
  const cellReady = (R, d, f) => (R.done >>> (d * FRAMES + f) & 1) === 1;
  function paintRowNow(A, r) { for (let c = 0; c < DIRS * FRAMES; c++) if (!(rowOf(A, r).done >>> c & 1)) paintCell(A, r, c); }
  const queue = [];   // [atlas, row] waiting to be painted
  function want(A, r, first) {
    const R = rowOf(A, r);
    if (R.done === ALL || R.queued) return R;
    R.queued = true; if (first) queue.unshift([A, r]); else queue.push([A, r]);
    return R;
  }
  let neutral = null;
  function atlasFor(tag, now) {
    let A = atlases.get(tag);
    if (!A) { A = newAtlas(COUNTRY_BY_TAG[tag].color); atlases.set(tag, A); }
    if (now) for (let r = 0; r < rowsN(); r++) paintRowNow(A, r);
    return A;
  }
  function pump(budgetMs) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const [A, r] = queue[0], R = A.rows[r];
      if (!R) { queue.shift(); continue; }   // dropped meanwhile
      let c = 0; while (c < DIRS * FRAMES && R.done >>> c & 1) c++;
      if (c < DIRS * FRAMES) paintCell(A, r, c);
      if (R.done === ALL) { R.queued = false; queue.shift(); }
    }
  }
  function ready() { if (!neutral) neutral = newAtlas('#6b7058'); }
  // the grey stand-in is painted through the same budget, ahead of everything else; until even that is ready
  // the figure is simply left out for a moment (its nation-coloured ring and counter still show)
  function neutralRow(r) { return want(neutral, r, true); }

  const KIND_OF = { infantry: 'soldiers', marines: 'soldiers', paratroopers: 'soldiers', motorized: 'truck', mechanized: 'halftrack', tanks: 'tank', artillery: 'gun', recon: 'car' };
  // draw one figure with its feet at (x, y) screen px; size is the on-screen cell size in px
  // an era unit's own look comes first (2026 infantry are modern soldiers, not 1936 riflemen)
  const kindOf = unitType => {
    const u = typeof UNIT_TYPES !== 'undefined' && UNIT_TYPES[unitType];
    if (u && u.look && typeof Eras !== 'undefined') return Eras.figureKind(unitType, KINDS);
    return KIND_OF[unitType] || (typeof Eras !== 'undefined' && Eras.figureKind(unitType, KINDS)) || 'soldiers';
  };
  function draw(ctx, tag, unitType, moving, heading, fighting, x, y, size, t) {
    let kind = kindOf(unitType);
    if (unitType === 'paratroopers' && moving) kind = 'plane';
    const L = getLayout();
    const d = ((Math.round(heading / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS;
    const f = moving || fighting ? Math.floor(t / (kind === 'plane' ? 60 : FOOT.includes(kind) ? (fighting ? 170 : 150) : kind === 'elephant' ? 200 : 110)) % FRAMES : 0;
    let row = fighting ? L.index.get(kind + '!') : undefined;
    if (row === undefined) row = L.index.get(kind);
    if (row === undefined) row = L.index.get('soldiers');
    const ay = kind === 'plane' ? 0.78 : 0.66;
    ready();
    const A = atlasFor(tag), R = want(A, row);
    R.used = performance.now();
    const src = cellReady(R, d, f) ? R : neutralRow(row);
    if (src !== R && !cellReady(src, d, f)) return;
    ctx.drawImage(src.cv, (d * FRAMES + f) * CELL, 0, CELL, CELL, x - size / 2, y - size * ay, size, size);
  }
  // queue nations to paint ahead of need: the rows their armies will show
  function warm(tags) {
    ready();
    const L = getLayout(), G = typeof Sim !== 'undefined' && Sim.G;
    for (const t of tags) {
      if (!COUNTRY_BY_TAG[t]) continue;
      const A = atlasFor(t), kinds = new Set();
      if (G) for (const a of G.armies) if (a.owner === t) for (const u of a.units) kinds.add(kindOf(u.type));
      for (const k of kinds) { const r = L.index.get(k); if (r !== undefined) want(A, r).used = performance.now(); }
    }
  }
  // forget painted atlases, e.g. after a new era recolours the nations
  function reset() { atlases.clear(); queue.length = 0; painted = 0; layout = null; neutral = null; previewParts.clear(); }
  return { draw, warm, pump, reset, preview, KINDS, kindOf, atlasFor, pending: () => queue.length, painted: () => painted, _atlases: atlases };
})();
