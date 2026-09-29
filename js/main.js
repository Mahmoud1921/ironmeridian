// Boot: generate the map, then run the render/simulation loop.
'use strict';
(function () {
  function boot() {
    const map = MapGen.generate();
    Sim.init(map);
    Render.init(document.getElementById('map'), map);
    UI.init(map);
    Render.fitWorld();
    document.getElementById('loading').hidden = true;
    Menu.init();
    Menu.show();
    let last = performance.now(), acc = 0;
    function loop(now) {
      try { tick(now); } catch (e) { console.error(e); }
      requestAnimationFrame(loop);
    }
    function tick(now) {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const G = Sim.G;
      if (G && !G.paused && !G.over && !G.peace && !(G.ev && G.ev.open.length && G.settings.pauseEvent !== false)) {
        acc += dt * UI.HPS[G.speed];
        let n = 0;
        while (acc >= 1 && n < 80) { Sim.hourTick(); acc -= 1; n++; }
        if (n >= 80) acc = 0;
        Render.state.hourFrac = Math.min(1, acc);   // how far into the next game hour we are, for smooth motion
        if (G.ownVer !== Render.state.ownVer) { Render.state.ownVer = G.ownVer; Render.state.dirtyOwners = true; }
      }
      if (!Menu.isOpen()) Render.draw();
      UI.frame(now);
    }
    requestAnimationFrame(loop);
  }
  // let the loading screen paint before the heavy map generation
  window.addEventListener('load', () => setTimeout(boot, 30));
})();
