// Menu background: an original painting drawn in code (a dusk battlefield where soldiers of all six eras charge each other), with rising embers.
'use strict';
const MenuArt = (function () {
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function paint(cv) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, R = rng(1936), HY = H * 0.655;
    // sky
    let gr = g.createLinearGradient(0, 0, 0, HY);
    gr.addColorStop(0, '#0f141c'); gr.addColorStop(.38, '#2a2630'); gr.addColorStop(.72, '#6e3420'); gr.addColorStop(1, '#d07033');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(W * .6, HY, 10, W * .6, HY, W * .55);
    gr.addColorStop(0, 'rgba(255,170,90,.75)'); gr.addColorStop(.35, 'rgba(230,110,50,.35)'); gr.addColorStop(1, 'rgba(120,40,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // low sun
    gr = g.createRadialGradient(W * .6, HY - 40, 0, W * .6, HY - 40, 90);
    gr.addColorStop(0, 'rgba(255,225,170,.95)'); gr.addColorStop(.3, 'rgba(255,190,120,.5)'); gr.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // smoke banks
    for (let i = 0; i < 170; i++) {
      const x = R() * W, y = H * (0.04 + R() * 0.6), r = 60 + R() * 240, lit = y > H * .4 ? R() * .5 : 0;
      const c = lit > .25 ? `rgba(${90 + lit * 120},${45 + lit * 50},${30},` : 'rgba(18,15,17,';
      gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c + (0.18 + R() * 0.22) + ')'); gr.addColorStop(1, c + '0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // aircraft in the sky: a biplane and a monoplane fighter
    g.fillStyle = g.strokeStyle = 'rgba(20,14,14,.8)';
    plane(g, W * .7, H * .2, 0.9, false); plane(g, W * .82, H * .14, 1.1, true); plane(g, W * .45, H * .26, .6, false);
    // distant skyline, ancient on the left to modern on the right
    skyline(g, W, HY, R);
    gr = g.createLinearGradient(0, HY - 120, 0, HY + 40);
    gr.addColorStop(0, 'rgba(210,110,55,0)'); gr.addColorStop(.7, 'rgba(210,110,55,.35)'); gr.addColorStop(1, 'rgba(120,55,30,.5)');
    g.fillStyle = gr; g.fillRect(0, HY - 120, W, 160);
    // plain
    gr = g.createLinearGradient(0, HY, 0, H);
    gr.addColorStop(0, '#4a2616'); gr.addColorStop(.25, '#26150e'); gr.addColorStop(1, '#0a0706');
    g.fillStyle = gr; g.fillRect(0, HY, W, H - HY);
    // fires and smoke columns
    [[.3, .69], [.5, .7], [.74, .685], [.88, .7], [.16, .7]].forEach(([fx, fy]) => {
      const x = fx * W, y = fy * H;
      for (let k = 0; k < 16; k++) {
        const yy = y - k * 26, xx = x + k * k * 0.9, r = 20 + k * 9;
        gr = g.createRadialGradient(xx, yy, 0, xx, yy, r); gr.addColorStop(0, `rgba(25,18,18,${.35 - k * .015})`); gr.addColorStop(1, 'rgba(25,18,18,0)');
        g.fillStyle = gr; g.fillRect(xx - r, yy - r, r * 2, r * 2);
      }
      gr = g.createRadialGradient(x, y, 0, x, y, 70); gr.addColorStop(0, 'rgba(255,170,70,.9)'); gr.addColorStop(.3, 'rgba(240,100,30,.45)'); gr.addColorStop(1, 'rgba(200,60,20,0)');
      g.fillStyle = gr; g.fillRect(x - 70, y - 70, 140, 140);
    });
    // distant ranks: two masses of mixed eras converging
    const ERAS = ['hoplite', 'legion', 'knight', 'musket', 'ww1', 'ww2'];
    for (let row = 0; row < 3; row++) {
      const y0 = H * (0.705 + row * 0.03), sc = 0.26 + row * 0.08, col = ['#3b2117', '#2c1810', '#1e110c'][row];
      for (let i = 0; i < 26 - row * 5; i++) {
        const side = i % 2, x = side ? W * (0.62 + R() * 0.38) : W * (0.12 + R() * 0.4);
        g.save(); g.translate(x, y0 + R() * 14); g.scale(side ? -sc : sc, sc); g.fillStyle = g.strokeStyle = col;
        soldier(g, ERAS[Math.floor(R() * 6)], R()); g.restore();
      }
      for (let b = 0; b < 3; b++) { const x = W * (0.2 + R() * 0.7); banner(g, x, y0 + 4, 150 * sc * 1.8, col); }
    }
    // tank, mid distance
    g.save(); g.translate(W * .83, H * .805); g.scale(-1.05, 1.05); g.fillStyle = '#170d09'; tank(g); g.restore();
    // foreground ground with craters and wire
    g.fillStyle = '#0c0807';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.87 + Math.sin(x * 0.006) * 18 + Math.sin(x * 0.021) * 7 + (R() - .5) * 5);
    g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,12,10,.95)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 16) { g.beginPath(); g.ellipse(x, H * 0.905 + Math.sin(x * .01) * 10, 12, 9, 0, 0, Math.PI * 2); g.stroke(); }
    for (let x = 40; x < W; x += 170 + R() * 80) { g.lineWidth = 5; g.beginPath(); g.moveTo(x, H * .92); g.lineTo(x + (R() - .5) * 20, H * .86); g.stroke(); }
    // foreground soldiers, backlit
    const FG = [
      ['ww1', 1030, 972, 1.25, 1], ['ww2', 1260, 975, 1.25, -1], ['hoplite', 880, 1005, 1.5, 1], ['legion', 1430, 1008, 1.5, -1],
      ['knight', 700, 1050, 1.85, 1], ['musket', 1640, 1055, 1.9, -1]
    ];
    const off = document.createElement('canvas'); off.width = 900; off.height = 900; const o = off.getContext('2d');
    FG.forEach(([era, x, y, s, dir], i) => {
      o.clearRect(0, 0, 900, 900); o.save(); o.translate(450, 860); o.scale(dir * s, s); o.fillStyle = o.strokeStyle = '#070505'; soldier(o, era, 0.5 + i * 0.07); o.restore();
      g.save(); g.shadowColor = 'rgba(255,140,60,.75)'; g.shadowBlur = 26; g.drawImage(off, x - 450, y - 860); g.restore();
      g.drawImage(off, x - 450, y - 860);
    });
    // grade: vignette and grain
    gr = g.createRadialGradient(W * .58, H * .6, H * .3, W * .5, H * .5, W * .75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const n = document.createElement('canvas'); n.width = n.height = 256; const nc = n.getContext('2d'), id = nc.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = R() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    nc.putImageData(id, 0, 0); g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H);
  }

  function skyline(g, W, HY, R) {
    g.fillStyle = '#2a1812';
    const base = x => HY + 2;
    // Greek temple, a column fallen
    let x = W * .05;
    g.fillRect(x - 10, HY - 16, 230, 18); g.fillRect(x, HY - 26, 210, 10);
    for (let c = 0; c < 7; c++) g.fillRect(x + 8 + c * 29, HY - (c === 5 ? 70 : 118), 14, c === 5 ? 44 : 92);
    g.fillRect(x - 4, HY - 132, 180, 16);
    g.beginPath(); g.moveTo(x - 6, HY - 132); g.lineTo(x + 70, HY - 168); g.lineTo(x + 140, HY - 132); g.fill();
    // Roman aqueduct
    x = W * .2;
    g.fillRect(x, HY - 120, 330, 16);
    for (let a = 0; a <= 7; a++) g.fillRect(x + a * 44, HY - 110, 12, 112);
    g.beginPath(); for (let a = 0; a < 7; a++) { g.moveTo(x + 12 + a * 44, HY - 104); g.arc(x + 34 + a * 44, HY - 86, 22, Math.PI, 0); } g.fill();
    // castle
    x = W * .39;
    g.fillRect(x, HY - 90, 220, 92);
    [[x - 14, 150, 44], [x + 90, 190, 50], [x + 196, 140, 40]].forEach(([tx, th, tw]) => {
      g.fillRect(tx, HY - th, tw, th);
      for (let m = 0; m < tw; m += 12) g.fillRect(tx + m, HY - th - 10, 7, 10);
    });
    for (let m = 0; m < 220; m += 14) g.fillRect(x + m, HY - 100, 8, 10);
    // domed church and windmill (1805)
    x = W * .56;
    g.fillRect(x, HY - 80, 120, 82); g.beginPath(); g.arc(x + 60, HY - 80, 46, Math.PI, 0); g.fill(); g.fillRect(x + 56, HY - 150, 8, 26);
    g.fillRect(x + 190, HY - 110, 30, 112);
    g.save(); g.translate(x + 205, HY - 110); g.rotate(.35); for (let s = 0; s < 4; s++) { g.rotate(Math.PI / 2); g.fillRect(-3, 0, 6, 80); g.fillRect(3, 20, 14, 58); } g.restore();
    // shattered trees (1914)
    g.strokeStyle = '#2a1812'; g.lineCap = 'round';
    x = W * .69;
    for (let t = 0; t < 6; t++) {
      const tx = x + t * 38 + R() * 16, th = 60 + R() * 90; g.lineWidth = 7; g.beginPath(); g.moveTo(tx, HY); g.lineTo(tx + (R() - .5) * 14, HY - th); g.stroke();
      g.lineWidth = 3; for (let b = 0; b < 3; b++) { const by = HY - th * (0.4 + R() * .5); g.beginPath(); g.moveTo(tx, by); g.lineTo(tx + (R() - .5) * 60, by - 20 - R() * 20); g.stroke(); }
    }
    // factory chimneys and a ruined block (1936)
    x = W * .84;
    g.fillRect(x, HY - 70, 250, 72);
    g.beginPath(); for (let s = 0; s < 5; s++) { g.moveTo(x + s * 50, HY - 70); g.lineTo(x + s * 50 + 25, HY - 96); g.lineTo(x + s * 50 + 50, HY - 70); } g.fill();
    [[x + 30, 200], [x + 110, 240], [x + 190, 170]].forEach(([cx, ch]) => { g.beginPath(); g.moveTo(cx - 10, HY); g.lineTo(cx - 7, HY - ch); g.lineTo(cx + 7, HY - ch); g.lineTo(cx + 10, HY); g.fill(); });
    // low hills joining it all
    g.beginPath(); g.moveTo(0, HY + 4);
    for (let hx = 0; hx <= W; hx += 30) g.lineTo(hx, HY - 8 - Math.sin(hx * 0.004) * 10 - R() * 6);
    g.lineTo(W, HY + 6); g.lineTo(0, HY + 6); g.fill();
  }

  function banner(g, x, y, h, col) {
    g.save(); g.strokeStyle = g.fillStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.beginPath(); g.moveTo(x, y - h); for (let i = 0; i <= 10; i++) g.lineTo(x + i * h * .05, y - h + Math.sin(i * .9) * 5);
    for (let i = 10; i >= 0; i--) g.lineTo(x + i * h * .05, y - h * .72 + Math.sin(i * .9) * 5); g.fill(); g.restore();
  }

  function plane(g, x, y, s, mono) {
    g.save(); g.translate(x, y); g.scale(s, s); g.lineCap = 'round';
    g.lineWidth = 7; g.beginPath(); g.moveTo(-40, 0); g.lineTo(40, -2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(-40, 0); g.lineTo(-46, -14); g.stroke();
    if (mono) { g.beginPath(); g.ellipse(0, 1, 30, 3.5, -.05, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(8, -5, 8, 4, 0, Math.PI, 0); g.fill(); }
    else { g.lineWidth = 3.5; g.beginPath(); g.moveTo(-5, -11); g.lineTo(30, -12); g.moveTo(-5, 5); g.lineTo(28, 4); g.moveTo(6, -11); g.lineTo(6, 5); g.moveTo(20, -11); g.lineTo(20, 4); g.stroke(); }
    g.restore();
  }

  function tank(g) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(-140, -34, 290, 36, 18); g.fill();
    g.beginPath(); g.moveTo(-128, -30); g.lineTo(140, -30); g.lineTo(150, -60); g.lineTo(-118, -66); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-50, -64); g.lineTo(58, -64); g.lineTo(48, -100); g.lineTo(-36, -102); g.closePath(); g.fill();
    g.strokeStyle = g.fillStyle; g.lineWidth = 9; g.beginPath(); g.moveTo(50, -86); g.lineTo(200, -92); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(-10, -102); g.lineTo(-6, -112); g.lineTo(12, -112); g.stroke();
  }

  /* A soldier silhouette, feet at (0,0), about 180 units tall, facing +x. */
  function soldier(g, era, v) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const lean = (v - .5) * 8;
    const P = [0, -95], N = [20 + lean, -150], Hd = [27 + lean, -166];
    const line = (a, b, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    const poly = pts => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => g.lineTo(p[0], p[1])); g.closePath(); g.fill(); };
    const circ = (c, r) => { g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.fill(); };
    const stride = 0.85 + v * 0.3;
    // capes and coat tails trail behind
    if (era === 'legion') poly([[N[0] - 4, N[1] + 2], [-12, -150], [-78, -104], [-64, -76], [-10, -112]]);
    if (era === 'musket') poly([[-4, -104], [-14, -106], [-46, -64], [-30, -60]]);
    if (era === 'knight') poly([[-16, -108], [20, -104], [36, -56], [-34, -58]]);
    if (era === 'hoplite' || era === 'legion') poly([[-15, -106], [16, -102], [24, -74], [-22, -76]]);
    if (era === 'ww1' || era === 'ww2' || era === 'musket') poly([[-6, -148], [-30, -144], [-34, -112], [-8, -110]]);
    // legs
    const Kf = [32 * stride, -52], Ff = [58 * stride, -3], Kb = [-20 * stride, -50], Fb = [-54 * stride, -14];
    line(P, Kf, 17); line(Kf, Ff, 13); line(P, Kb, 17); line(Kb, Fb, 13);
    line(Ff, [Ff[0] + 14, Ff[1] + 1], 8); line(Fb, [Fb[0] + 12, Fb[1] + 4], 8);
    // torso
    const vx = N[0] - P[0], vy = N[1] - P[1], L = Math.hypot(vx, vy), nx = -vy / L, ny = vx / L;
    poly([[P[0] + nx * 13, P[1] + ny * 13], [N[0] + nx * 18, N[1] + ny * 18], [N[0] - nx * 17, N[1] - ny * 17], [P[0] - nx * 14, P[1] - ny * 14]]);
    line(N, Hd, 10); circ(Hd, 12);
    const S = [N[0] - 2, N[1] + 5];
    if (era === 'hoplite') {
      circ(Hd, 14.5);
      g.lineWidth = 8; g.beginPath(); g.moveTo(Hd[0] - 18, Hd[1] + 4); g.quadraticCurveTo(Hd[0] - 8, Hd[1] - 40, Hd[0] + 14, Hd[1] - 16); g.stroke();
      poly([[Hd[0] + 4, Hd[1]], [Hd[0] + 16, Hd[1] + 4], [Hd[0] + 10, Hd[1] + 18]]);
      line(S, [-2, -178], 10); line([-2, -178], [22, -184], 9);
      line([-96, -206], [196, -150], 4.5); poly([[196, -156], [218, -146], [194, -144]]);
      circ([52, -118], 40);
    } else if (era === 'legion') {
      circ(Hd, 13.5); line([Hd[0] - 10, Hd[1] + 4], [Hd[0] - 22, Hd[1] + 11], 5); line([Hd[0], Hd[1] - 12], [Hd[0] - 4, Hd[1] - 24], 6);
      line(S, [44, -120], 10); line([66, -106], [104, -114], 5);
      g.beginPath(); g.roundRect(34, -154, 34, 94, 8); g.fill();
    } else if (era === 'knight') {
      g.beginPath(); g.roundRect(Hd[0] - 13, Hd[1] - 16, 27, 31, 3); g.fill();
      line(S, [-4, -190], 11); line([-4, -190], [-18, -206], 10);
      line([-18, -206], [-84, -268], 6); line([-28, -196], [-8, -216], 5);
      poly([[38, -162], [70, -157], [68, -110], [50, -70], [34, -110]]);
    } else if (era === 'musket') {
      g.beginPath(); g.roundRect(Hd[0] - 10, Hd[1] - 36, 21, 26, 2); g.fill(); line([Hd[0] - 1, Hd[1] - 36], [Hd[0] - 4, Hd[1] - 54], 6);
      line(S, [42, -118], 10); line([42, -118], [70, -128], 9); line(S, [0, -112], 10); line([0, -112], [10, -104], 9);
      line([-34, -94], [116, -142], 6); line([116, -142], [150, -153], 2.5);
    } else if (era === 'ww1') {
      g.beginPath(); g.ellipse(Hd[0], Hd[1] - 5, 22, 5, -.1, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(Hd[0], Hd[1] - 6, 11, Math.PI, 0); g.fill();
      line(S, [40, -122], 10); line([40, -122], [66, -130], 9); line(S, [2, -114], 10); line([2, -114], [12, -106], 9);
      line([-26, -98], [104, -140], 6); line([104, -140], [134, -150], 2.5);
      g.beginPath(); g.roundRect(-30, -150, 22, 34, 4); g.fill();
    } else {
      g.beginPath(); g.arc(Hd[0] - 1, Hd[1] - 1, 15, Math.PI * 1.02, -0.05); g.lineTo(Hd[0] + 14, Hd[1] + 2); g.lineTo(Hd[0] - 17, Hd[1] + 6); g.fill();
      line(S, [48, -146], 10); line([48, -146], [64, -150], 9); line(S, [18, -128], 10); line([18, -128], [34, -140], 9);
      line([4, -142], [104, -154], 7); line([60, -148], [58, -128], 5);
    }
  }

  // rising embers over the painting, drawn only while the menu shows
  function embers(cv, showing) {
    const g = cv.getContext('2d'), R = rng(7), P = [];
    for (let i = 0; i < 70; i++) P.push({ x: R() * 1440, y: 900 * (0.3 + R() * 0.7), v: 12 + R() * 30, r: .8 + R() * 1.8, ph: R() * 6 });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    (function f(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (showing()) {
        g.clearRect(0, 0, 1440, 900);
        for (const p of P) {
          if (!reduce) { p.y -= p.v * dt; p.x += Math.sin(now / 900 + p.ph) * 12 * dt + 6 * dt; if (p.y < 120) { p.y = 900; p.x = R() * 1440; } }
          const a = Math.min(1, (p.y - 120) / 300) * (0.5 + 0.5 * Math.sin(now / 200 + p.ph));
          g.fillStyle = `rgba(255,${150 + p.r * 30 | 0},80,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        }
      }
      requestAnimationFrame(f);
    })(last);
  }
  return { paint, embers };
})();
