// Historical flags and banners for the eras, drawn as small SVGs (viewBox 30x20).
// Specs are compact: ['h', colours...] horizontal stripes, ['v', ...] vertical,
// ['hw', weights, colours], ['vw', weights, colours], ['nordic', field, cross, inner],
// ['cross', field, cross], ['union'], ['field', colour]. A spec can be an object
// { b: <base spec>, add: [<emblem>, ...] } to add emblems on top.
// Emblems: ['star', cx, cy, r, colour], ['crescent', cx, cy, r, colour, field],
// ['disc', cx, cy, r, colour], ['text', string, colour, size?, cx?, cy?],
// ['eagle', cx, cy, size, colour, heads?], ['lion', cx, cy, size, colour],
// ['passant', cx, cy, size, colour], ['castle', cx, cy, size, colour],
// ['lis', cx, cy, size, colour], ['canton', <spec>], ['raw', svgString].
// Nations whose era had no flag carry flag: null and keep the game's own abstract flag.
'use strict';
const ERA_DEFS = [];

const EraFlags = (function () {
  const cache = new Map();
  const UJ = '<rect width="30" height="20" fill="#012169"/>' +
    '<path d="M0,0L30,20M30,0L0,20" stroke="#fff" stroke-width="4"/>' +
    '<path d="M0,0L30,20M30,0L0,20" stroke="#C8102E" stroke-width="1.4"/>' +
    '<path d="M15,0V20M0,10H30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M15,0V20M0,10H30" stroke="#C8102E" stroke-width="3.6"/>';

  function stripes(dir, weights, cols) {
    const total = weights.reduce((a, b) => a + b, 0);
    let pos = 0, out = '';
    cols.forEach((c, i) => {
      const len = (dir === 'h' ? 20 : 30) * weights[i] / total;
      out += dir === 'h' ? `<rect y="${pos.toFixed(2)}" width="30" height="${(len + 0.05).toFixed(2)}" fill="${c}"/>`
        : `<rect x="${pos.toFixed(2)}" width="${(len + 0.05).toFixed(2)}" height="20" fill="${c}"/>`;
      pos += len;
    });
    return out;
  }
  function starPath(cx, cy, r) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ',' + (cy + Math.sin(a) * rr).toFixed(2);
    }
    return d + 'Z';
  }
  // Shapes drawn in a 10x10 box, placed with a transform.
  const SHAPES = {
    eagle1: 'M5,0.8C5.9,0.8 6.2,1.8 5.6,2.4L5.6,3.2L9.8,1.8L9,4.4L6.2,5.2L6.6,7L8,9L5.7,8.2L5,9.8L4.3,8.2L2,9L3.4,7L3.8,5.2L1,4.4L0.2,1.8L4.4,3.2L4.4,2.4C3.8,1.8 4.1,0.8 5,0.8Z',
    eagle2: 'M3.2,0.6C4,0.6 4.3,1.4 3.8,2L4.4,3L5,2.6L5.6,3L6.2,2C5.7,1.4 6,0.6 6.8,0.6C7.6,0.6 7.8,1.6 7.1,2.2L6.4,3.4L9.8,2L9,4.6L6.2,5.2L6.6,7L8,9L5.7,8.2L5,9.8L4.3,8.2L2,9L3.4,7L3.8,5.2L1,4.6L0.2,2L3.6,3.4L2.9,2.2C2.2,1.6 2.4,0.6 3.2,0.6Z',
    lion: 'M3.6,1.2L5,0.6L6.2,1.4L6,2.6L7.2,3.2L7.6,4.8L6.8,6.2L7.8,8L8.8,8.4L8.6,9.4L6.8,9.2L5.6,7.4L4.6,8.2L4.8,9.4L3.2,9.4L3.4,7.8L3,6L2.2,4.8L1.4,5.6L0.8,5L2,3.6L3.4,3.4L3,2.4Z',
    passant: 'M1,3.6L2.2,2.8L3,3.2L3.2,4.4L7.2,4.2L8.4,3.2L9.6,2.4L9.2,3.8L8.6,4.6L8.8,6.4L9.2,7.6L8.2,7.6L7.8,6.2L7,6.4L6.8,7.6L5.8,7.6L5.8,6.2L3.8,6.2L3.4,7.6L2.4,7.6L2.6,5.8L2,5L1.2,5Z',
    castle: 'M1,9.6V4.4H2.2V3.4H3.2V4.4H4V2H4.6V1H5.4V2H6V4.4H6.8V3.4H7.8V4.4H9V9.6H6V7.4Q5,6 4,7.4V9.6Z',
    lis: 'M5,0.6C6.2,2 6.2,3.6 5.4,5L5.4,5.6L7.6,5.6C9.6,5.6 9.6,3 8,3C9.6,4.4 7.6,5.4 6.2,5L6.2,5.4L5,5.4L3.8,5.4L3.8,5C2.4,5.4 0.4,4.4 2,3C0.4,3 0.4,5.6 2.4,5.6L4.6,5.6L4.6,5C3.8,3.6 3.8,2 5,0.6ZM3,6.2H7V7H5.6C5.8,8 6.4,9 7,9.4H3C3.6,9 4.2,8 4.4,7H3Z'
  };
  function place(shape, cx, cy, size, colour) {
    const s = size / 10;
    return `<path d="${SHAPES[shape]}" fill="${colour}" transform="translate(${(cx - size / 2).toFixed(2)},${(cy - size / 2).toFixed(2)}) scale(${s.toFixed(3)})"/>`;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function base(b) {
    if (typeof b === 'string') return `<rect width="30" height="20" fill="${b}"/>`;
    const [k, ...a] = b;
    switch (k) {
      case 'h': return stripes('h', a.map(() => 1), a);
      case 'v': return stripes('v', a.map(() => 1), a);
      case 'hw': return stripes('h', a[0], a[1]);
      case 'vw': return stripes('v', a[0], a[1]);
      case 'field': return `<rect width="30" height="20" fill="${a[0]}"/>`;
      case 'nordic': return `<rect width="30" height="20" fill="${a[0]}"/><rect x="8" width="5" height="20" fill="${a[1]}"/><rect y="7.5" width="30" height="5" fill="${a[1]}"/>` +
        (a[2] ? `<rect x="9.5" width="2" height="20" fill="${a[2]}"/><rect y="9" width="30" height="2" fill="${a[2]}"/>` : '');
      case 'cross': return `<rect width="30" height="20" fill="${a[0]}"/><rect x="12.5" width="5" height="20" fill="${a[1]}"/><rect y="7.5" width="30" height="5" fill="${a[1]}"/>`;
      case 'union': return UJ;
      default: return '';
    }
  }
  function emblem(e) {
    const [k, ...a] = e;
    switch (k) {
      case 'star': return `<path d="${starPath(a[0], a[1], a[2])}" fill="${a[3]}"/>`;
      case 'crescent': return `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="${a[3]}"/><circle cx="${a[0] + a[2] * 0.3}" cy="${a[1]}" r="${a[2] * 0.8}" fill="${a[4]}"/>`;
      case 'disc': return `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="${a[3]}"/>`;
      case 'ring': return `<circle cx="${a[0]}" cy="${a[1]}" r="${a[2]}" fill="none" stroke="${a[3]}" stroke-width="${a[4] || 1}"/>`;
      case 'rect': return `<rect x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}" fill="${a[4]}"/>`;
      case 'poly': return `<path d="${a[0]}" fill="${a[1]}"/>`;
      case 'text': return `<text x="${a[3] === undefined ? 15 : a[3]}" y="${a[4] === undefined ? 10 : a[4]}" fill="${a[1]}" font-size="${a[2] || 9}" font-family="Georgia,'Times New Roman',serif" font-weight="700" text-anchor="middle" dominant-baseline="central">${esc(a[0])}</text>`;
      case 'eagle': return place(a[4] === 2 ? 'eagle2' : 'eagle1', a[0], a[1], a[2], a[3]);
      case 'lion': return place('lion', a[0], a[1], a[2], a[3]);
      case 'passant': return place('passant', a[0], a[1], a[2], a[3]);
      case 'castle': return place('castle', a[0], a[1], a[2], a[3]);
      case 'lis': return place('lis', a[0], a[1], a[2], a[3]);
      case 'canton': return `<g transform="scale(0.5)">${body(a[0])}</g>`;
      case 'raw': return a[0];
      default: return '';
    }
  }
  function body(spec) {
    if (Array.isArray(spec) || typeof spec === 'string') return base(spec);
    return base(spec.b) + (spec.add || []).map(emblem).join('');
  }
  function svg(spec) {
    const key = JSON.stringify(spec);
    if (cache.has(key)) return cache.get(key);
    const out = `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${body(spec)}</svg>`;
    cache.set(key, out);
    return out;
  }
  return { svg, body, UJ };
})();

// Geographic names for provinces outside any state, shared by every era.
const ERA_REGIONS = [
  ['Great Plains', -101, 42], ['Prairies', -104, 52], ['Great Basin', -116, 40], ['Sonoran Desert', -112, 31], ['Llano Estacado', -102, 33.5], ['Ozarks', -92.5, 36.5],
  ['Mississippi Valley', -90.5, 36], ['Ohio Valley', -84, 39], ['Appalachians', -80, 38], ['Great Lakes', -84, 45], ['Canadian Shield', -85, 52], ['Hudson Bay Lowlands', -88, 55],
  ['Labrador', -63, 54], ['Yukon', -136, 63], ['Mackenzie', -124, 64], ['Barren Grounds', -104, 64], ['Alaska Range', -150, 63], ['Arctic Archipelago', -95, 74],
  ['Pacific Northwest', -122, 46], ['California', -120, 37], ['Rocky Mountains', -109, 44], ['Florida', -81.5, 28], ['Gulf Coast', -91, 31], ['Atlantic Seaboard', -77, 38],
  ['Greenland', -42, 72], ['Sierra Madre', -106, 26], ['Yucatán', -89, 19.5], ['Central America', -86, 13.5], ['Caribbean', -75, 19.5],
  ['Llanos', -69, 7], ['Guiana Highlands', -60, 4], ['Amazonia', -62, -5], ['Mato Grosso', -55, -13], ['Sertão', -41, -9], ['Atlantic Forest', -45, -21], ['Gran Chaco', -61, -22],
  ['Pampas', -62, -35], ['Patagonia', -69, -45], ['Tierra del Fuego', -68.5, -54], ['Andes', -70, -20], ['Atacama', -69.5, -24], ['Altiplano', -68, -17], ['Araucanía', -72.5, -38.5],
  ['Sahara', 5, 24], ['Western Sahara', -11, 24], ['Libyan Desert', 24, 25], ['Sahel', 0, 15], ['Lake Chad', 14.5, 13], ['Guinea Coast', -3, 7], ['Niger Delta', 6, 5],
  ['Congo Basin', 21, -1], ['Great Lakes of Africa', 31, -2], ['Horn of Africa', 46, 8], ['Kalahari', 22, -23], ['Namib', 15, -23], ['Highveld', 28, -27], ['Karoo', 22, -32],
  ['Zambezi', 30, -16], ['Swahili Coast', 39, -6], ['Katanga', 26.5, -10], ['Angolan Plateau', 16, -12], ['Nubia', 32, 20], ['Madagascar', 46.5, -19],
  ['Arabian Desert', 46, 22], ['Empty Quarter', 50, 19], ['Hejaz', 39.5, 23], ['Najd', 45, 25.5], ['Oman', 57, 22],
  ['Siberia', 95, 62], ['Taiga', 75, 60], ['Yakutia', 125, 64], ['Kamchatka', 159, 56], ['Chukotka', 172, 66], ['Amur', 132, 50], ['Okhotsk Coast', 140, 58],
  ['Kazakh Steppe', 65, 48], ['Pontic Steppe', 36, 47.5], ['Volga', 47, 52], ['Urals', 60, 58], ['Karakum', 60, 39.5], ['Kyzylkum', 64, 42.5], ['Tarim Basin', 83, 39.5],
  ['Dzungaria', 87, 45], ['Mongolian Steppe', 105, 46], ['Gobi', 105, 42], ['Manchuria', 126, 46], ['Tibetan Plateau', 88, 33], ['Pamirs', 73, 38.5], ['Hindu Kush', 69.5, 35.5],
  ['Deccan', 77, 17], ['Western Ghats', 75, 13], ['Ganges Plain', 82, 26], ['Thar', 71, 27], ['Bengal', 89, 23.5], ['Assam', 93, 26], ['Malabar', 76, 10.5],
  ['Indochina', 104, 15], ['Malaya', 101.8, 4], ['Sumatra', 101, 0], ['Java', 110, -7.3], ['Borneo', 114, 0.5], ['Celebes', 120.5, -2], ['New Guinea', 142, -5], ['Philippines', 122, 12],
  ['Formosa', 121, 23.8], ['Hainan', 109.7, 19.2], ['Ezo', 143, 43.5], ['Sakhalin', 142.8, 50], ['Ryukyu', 128, 26.5],
  ['Scandinavia', 16, 64], ['Lapland', 25, 68], ['Finland', 26, 63], ['Karelia', 32, 63], ['Baltic Coast', 22, 56], ['Iceland', -19, 65], ['Novaya Zemlya', 56, 73],
  ['Caledonia', -4.2, 57], ['Hibernia', -8, 53.3], ['Armorica', -3, 48], ['Alps', 10, 46.5], ['Carpathians', 24.5, 48], ['Balkans', 21, 43],
  ['Outback', 134, -25], ['Kimberley', 126, -17], ['Pilbara', 119, -22], ['Nullarbor', 128, -31], ['Cape York', 143, -14], ['Murray Basin', 144, -34], ['Tasmania', 146.5, -42],
  ['Aotearoa North', 175.5, -38.5], ['Aotearoa South', 170.5, -44], ['Hawaii', -155.5, 19.6]
];
