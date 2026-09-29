// National flags as they stood in 1936, drawn as small SVGs (30 x 20).
// Regimes whose 1936 flag carried extremist symbols use a non-extremist historical variant
// (Germany: the black-white-red tricolour), as commercial strategy games do.
'use strict';
const FLAGS = (function () {
  const W = 30, H = 20;
  const r = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const hs = (...c) => c.map((col, i) => r(0, (H * i / c.length).toFixed(3), W, (H / c.length + 0.05).toFixed(3), col)).join('');
  const vs = (...c) => c.map((col, i) => r((W * i / c.length).toFixed(3), 0, (W / c.length + 0.05).toFixed(3), H, col)).join('');
  // weighted horizontal stripes: [[colour, weight], ...]
  const hw = list => { const t = list.reduce((s, x) => s + x[1], 0); let y = 0; return list.map(([c, w]) => { const s = r(0, y.toFixed(3), W, (H * w / t + 0.05).toFixed(3), c); y += H * w / t; return s; }).join(''); };
  const stripes = (n, a, b) => hw(Array.from({ length: n }, (_, i) => [i % 2 ? b : a, 1]));
  function star(cx, cy, rad, fill, rot = 0) {
    cx = +cx; cy = +cy;
    let d = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 5, rr = i % 2 ? rad * 0.4 : rad; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ',' + (cy + Math.sin(a) * rr).toFixed(2); }
    return `<path d="${d}Z" fill="${fill}"/>`;
  }
  const circ = (cx, cy, rad, fill) => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}"/>`;
  const poly = (pts, fill) => `<path d="M${pts}Z" fill="${fill}"/>`;
  // Nordic cross; `inner` draws a narrower second cross (Norway, Iceland)
  const nordic = (bg, cross, inner) => r(0, 0, W, H, bg) + r(8, 0, 5, H, cross) + r(0, 7.5, W, 5, cross) + (inner ? r(9.3, 0, 2.4, H, inner) + r(0, 8.8, W, 2.4, inner) : '');
  // Union Jack in a box (nested svg clips it)
  const jack = (x, y, w, h) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 60 30" preserveAspectRatio="none"><rect width="60" height="30" fill="#012169"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" stroke-width="2"/>
    <path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#c8102e" stroke-width="6"/></svg>`;
  const crescent = (cx, cy, rad, fg, bg) => circ(cx, cy, rad, fg) + circ(cx + rad * 0.3, cy, rad * 0.8, bg);
  const sun = (cx, cy, rad, fill) => { let d = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; d += `M${cx},${cy} L${(cx + Math.cos(a - 0.13) * rad * 1.7).toFixed(2)},${(cy + Math.sin(a - 0.13) * rad * 1.7).toFixed(2)} L${(cx + Math.cos(a + 0.13) * rad * 1.7).toFixed(2)},${(cy + Math.sin(a + 0.13) * rad * 1.7).toFixed(2)}Z`; } return `<path d="${d}" fill="${fill}"/>` + circ(cx, cy, rad, fill); };
  const emblem = (cx, cy, rad, fill, ring) => circ(cx, cy, rad, fill) + (ring ? `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${ring}" stroke-width=".6"/>` : '');

  const F = {
    GER: hs('#000', '#fff', '#dd0000'),
    FRA: vs('#0055a4', '#fff', '#ef4135'),
    ENG: jack(0, 0, W, H),
    ITA: vs('#009246', '#fff', '#ce2b37') + r(13.1, 6.4, 3.8, 5.4, '#003f87') + r(13.6, 6.9, 2.8, 4.4, '#ce2b37') + r(14.6, 6.9, 0.8, 4.4, '#fff') + r(13.6, 8.7, 2.8, 0.8, '#fff'),
    SOV: r(0, 0, W, H, '#cc0000') + star(4.3, 3.3, 1.6, 'none').replace('fill="none"', 'fill="none" stroke="#ffd700" stroke-width=".45"') +
      '<path d="M2.2,10.6 A3.2,3.2 0 1 0 6.4,6.3" fill="none" stroke="#ffd700" stroke-width=".9"/><path d="M2.4,6.4 L6.2,10.4 M1.6,7.3 L3.2,5.6" stroke="#ffd700" stroke-width=".9"/>',
    POL: hs('#fff', '#dc143c'),
    CZE: hs('#fff', '#d7141a') + poly('0,0 15,10 0,20', '#11457e'),
    AUS: hs('#ed2939', '#fff', '#ed2939'),
    HUN: hs('#cd2a3e', '#fff', '#436f4d'),
    ROM: vs('#002b7f', '#fcd116', '#ce1126'),
    YUG: hs('#0c4076', '#fff', '#c6363c'),
    BUL: hs('#fff', '#00966e', '#d62612'),
    GRE: stripes(9, '#0d5eaf', '#fff') + r(0, 0, 11.1, 11.1, '#0d5eaf') + r(4.45, 0, 2.2, 11.1, '#fff') + r(0, 4.45, 11.1, 2.2, '#fff'),
    TUR: r(0, 0, W, H, '#e30a17') + crescent(11, 10, 5, '#fff', '#e30a17') + star(17.2, 10, 2.1, '#fff', Math.PI / 2),
    SPA: hs('#c60b1e', '#ffc400', '#6d2d6d'),
    POR: r(0, 0, 12, H, '#006600') + r(12, 0, 18, H, '#ff0000') + `<circle cx="12" cy="10" r="4.2" fill="none" stroke="#ffcc00" stroke-width="1.2"/>` + r(10.4, 7.8, 3.2, 4.2, '#fff') + r(10.9, 8.3, 2.2, 3.2, '#d00'),
    SWI: r(0, 0, W, H, '#da291c') + r(13, 4, 4, 12, '#fff') + r(9, 8, 12, 4, '#fff'),
    BEL: vs('#000', '#fae042', '#ed2939'),
    HOL: hs('#ae1c28', '#fff', '#21468b'),
    DEN: nordic('#c8102e', '#fff'),
    NOR: nordic('#ba0c2f', '#fff', '#00205b'),
    SWE: nordic('#006aa7', '#fecc02'),
    FIN: nordic('#fff', '#002f6c'),
    EST: hs('#0072ce', '#000', '#fff'),
    LAT: hw([['#9e3039', 2], ['#fff', 1], ['#9e3039', 2]]),
    LIT: hs('#fdb913', '#006a44', '#c1272d'),
    IRE: vs('#169b62', '#fff', '#ff883e'),
    ICE: nordic('#02529c', '#fff', '#dc1e35'),
    EGY: r(0, 0, W, H, '#006c35') + crescent(13.5, 10, 5, '#fff', '#006c35') + star(16.4, 7.2, 1.1, '#fff') + star(17.4, 10, 1.1, '#fff') + star(16.4, 12.8, 1.1, '#fff'),
    IRQ: hs('#000', '#fff', '#007a3d') + poly('0,0 7,5 7,15 0,20', '#ce1126') + star(2.6, 8.2, 1.1, '#fff') + star(2.6, 11.8, 1.1, '#fff'),
    PER: hs('#239f40', '#fff', '#da0000') + emblem(15, 10, 2.2, '#e0a526'),
    SAU: r(0, 0, W, H, '#006c35') + '<path d="M7,7.5 C10,6 13,9 16,7 S21,6 23,7.5 M8,9.6 C11,8.3 15,10.6 19,9.2" stroke="#fff" stroke-width=".7" fill="none"/>' + '<path d="M6,13.5 H23 M22,12.6 L24,13.5 22,14.4" stroke="#fff" stroke-width=".9" fill="none"/>',
    YEM: r(0, 0, W, H, '#ce1126') + '<path d="M6,11 H22 L24,10 M8,10.2 V11.8" stroke="#fff" stroke-width="1" fill="none"/>' + [8, 11.5, 15, 18.5, 22].map(x => star(x, 6.5, 1, '#fff')).join(''),
    AFG: vs('#000', '#be0000', '#009900') + emblem(15, 10, 3, '#fff', '#fff') + emblem(15, 10, 1.8, '#be0000'),
    RAJ: r(0, 0, W, H, '#c8102e') + jack(0, 0, 15, 10) + emblem(22.5, 13.5, 3.2, '#fff') + star(22.5, 13.5, 1.9, '#003f87'),
    NEP: r(0, 0, W, H, '#1b1f1c') + '<path d="M3,1 L19,9.3 H8.5 L19,19 H3Z" fill="#dc143c" stroke="#003893" stroke-width="1.3"/>' + crescent(6.5, 6.4, 1.9, '#fff', '#dc143c') + sun(6.7, 14.6, 1.3, '#fff'),
    TIB: (() => { let d = ''; for (let i = 0; i < 12; i++) { const a0 = Math.PI + i * Math.PI / 12, a1 = a0 + Math.PI / 12; d += `<path d="M15,13 L${(15 + Math.cos(a0) * 40).toFixed(1)},${(13 + Math.sin(a0) * 40).toFixed(1)} L${(15 + Math.cos(a1) * 40).toFixed(1)},${(13 + Math.sin(a1) * 40).toFixed(1)}Z" fill="${i % 2 ? '#002d8f' : '#e30b17'}"/>`; } return d; })() + poly('4,20 15,11 26,20', '#fff') + sun(15, 9, 2.4, '#ffd600'),
    CHI: r(0, 0, W, H, '#fe0000') + r(0, 0, 15, 10, '#000095') + sun(7.5, 5, 2, '#fff') + emblem(7.5, 5, 1.5, '#000095') + emblem(7.5, 5, 1.2, '#fff'),
    PRC: r(0, 0, W, H, '#c60000') + emblem(8, 8, 4.2, '#ffd200') + star(8, 8, 3.4, '#c60000') + '<path d="M5.5,15.5 L10.5,15.5" stroke="#ffd200" stroke-width="1"/>',
    MAN: r(0, 0, W, H, '#ffd700') + r(0, 0, 11, 1.7, '#e00') + r(0, 1.7, 11, 1.7, '#002fa7') + r(0, 3.4, 11, 1.7, '#fff') + r(0, 5.1, 11, 1.8, '#000'),
    MON: vs('#c4272f', '#015197', '#c4272f') + r(3.6, 5, 2.8, 1.4, '#f9cf02') + star(5, 3.4, 1.2, '#f9cf02') + r(3.6, 8, 2.8, 6, '#f9cf02'),
    JAP: r(0, 0, W, H, '#fff') + circ(15, 10, 6, '#bc002d'),
    SIA: hw([['#a51931', 1], ['#f4f5f8', 1], ['#2d2a4a', 2], ['#f4f5f8', 1], ['#a51931', 1]]),
    PHI: hs('#0038a8', '#ce1126') + poly('0,0 17.3,10 0,20', '#fff') + sun(5.3, 10, 1.8, '#fcd116') + star(1.7, 2.7, .9, '#fcd116') + star(1.7, 17.3, .9, '#fcd116') + star(14.4, 10, .9, '#fcd116'),
    AST: r(0, 0, W, H, '#012169') + jack(0, 0, 15, 10) + star(7.5, 15, 2.3, '#fff') + star(22.5, 16.5, 1.2, '#fff') + star(22.5, 4, 1.2, '#fff') + star(18.5, 9, 1.2, '#fff') + star(26, 8, 1.2, '#fff'),
    NZL: r(0, 0, W, H, '#012169') + jack(0, 0, 15, 10) + [[22.5, 16], [22.5, 5], [19.5, 9.5], [25.7, 8.6]].map(([x, y]) => star(x, y, 1.45, '#fff') + star(x, y, 1, '#c8102e')).join(''),
    SAF: hs('#f07b0f', '#fff', '#00247d') + r(12, 7.6, 1.8, 3, '#012169') + r(14.1, 7.6, 1.8, 3, '#c8102e') + r(16.2, 7.6, 1.8, 3, '#ff8c00'),
    ETH: hs('#078930', '#fcdd09', '#da121a') + emblem(15, 10, 2.4, '#fcdd09', '#6e4a1e'),
    LIB: stripes(11, '#bf0a30', '#fff') + r(0, 0, 10, 9.1, '#002868') + star(5, 4.5, 2.6, '#fff'),
    USA: stripes(13, '#b22234', '#fff') + r(0, 0, 12, 10.8, '#3c3b6e') + (() => { let s = ''; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) s += circ((1.1 + x * 2).toFixed(1), (1.2 + y * 2.1).toFixed(1), .42, '#fff'); return s; })(),
    CAN: r(0, 0, W, H, '#c8102e') + jack(0, 0, 15, 10) + '<path d="M20.5,5.5 H26.5 V11 Q26.5,14.5 23.5,15.5 Q20.5,14.5 20.5,11Z" fill="#fff"/>' + r(21.5, 6.4, 4, 2.2, '#c8102e') + r(21.5, 9.2, 4, 3.4, '#1d5d27'),
    MEX: vs('#006847', '#fff', '#ce1126') + emblem(15, 10, 2.3, '#8c5a2b') + '<path d="M12.7,12.3 Q15,14 17.3,12.3" stroke="#006847" stroke-width=".7" fill="none"/>',
    GUA: vs('#4997d0', '#fff', '#4997d0') + emblem(15, 10, 2, '#6aa84f', '#b8860b'),
    NIC: hs('#0067c6', '#fff', '#0067c6') + poly('15,7.6 17.3,11.6 12.7,11.6', '#4aa564'),
    PAN: r(0, 0, 15, 10, '#fff') + r(15, 0, 15, 10, '#d21034') + r(0, 10, 15, 10, '#005293') + r(15, 10, 15, 10, '#fff') + star(7.5, 5, 2.2, '#005293') + star(22.5, 15, 2.2, '#d21034'),
    CUB: stripes(5, '#002a8f', '#fff') + poly('0,0 17.3,10 0,20', '#cf142b') + star(5.8, 10, 2.6, '#fff'),
    HAI: r(0, 0, W, H, '#fff') + r(0, 0, 13, 8, '#002d62') + r(17, 12, 13, 8, '#002d62') + r(17, 0, 13, 8, '#ce1126') + r(0, 12, 13, 8, '#ce1126'),
    COL: hw([['#fcd116', 2], ['#003893', 1], ['#ce1126', 1]]),
    VEN: hs('#ffcc00', '#00247d', '#cf142b') + [0, 1, 2, 3, 4, 5, 6].map(i => { const a = Math.PI * (1.15 + i * 0.7 / 6); return star((15 + Math.cos(a) * 5.2).toFixed(2), (12.6 + Math.sin(a) * 5.2).toFixed(2), .75, '#fff'); }).join(''),
    ECU: hw([['#ffdd00', 2], ['#034ea2', 1], ['#ed1c24', 1]]) + emblem(15, 10, 2.4, '#6b8e23', '#8b5a2b'),
    PRU: vs('#d91023', '#fff', '#d91023'),
    BOL: hs('#d52b1e', '#f9e300', '#007934'),
    CHL: r(0, 0, W, 10, '#fff') + r(0, 10, W, 10, '#d52b1e') + r(0, 0, 10, 10, '#0039a6') + star(5, 5, 2.6, '#fff'),
    ARG: hs('#74acdf', '#fff', '#74acdf') + sun(15, 10, 1.6, '#f6b40e'),
    PAR: hs('#d52b1e', '#fff', '#0038a8') + `<circle cx="15" cy="10" r="2.3" fill="none" stroke="#0038a8" stroke-width=".5"/>` + star(15, 10, 1.1, '#f9e300'),
    URU: stripes(9, '#fff', '#0038a8') + r(0, 0, 11.1, 11.1, '#fff') + sun(5.5, 5.5, 1.8, '#fcd116'),
    BRA: r(0, 0, W, H, '#009c3b') + poly('15,2 27.5,10 15,18 2.5,10', '#ffdf00') + circ(15, 10, 4.9, '#002776') + '<path d="M10.2,9.2 Q15,7.6 19.8,10.8" stroke="#fff" stroke-width=".8" fill="none"/>'
  };
  return F;
})();
