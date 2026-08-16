// Parallax backdrop strips. Far layer: La Cloche mountains with lakes at
// their feet. Mid layer: thick forest that usually hides the far layer's
// lower half — climbing high pans the layers apart and reveals the lakes
// (which is where resting works; see vistas).
//
// Both strips are procedural placeholders drawn here at boot; styled art
// (via tools/backdrop-template.html + tools/normalize_backdrop.py) is
// loaded from game/data/sprites/backdrops/{far,mid}.png when present and
// overrides them. Strips tile horizontally.
"use strict";

const Backdrops = {
  far: null, mid: null,

  async init() {
    this.far = this._far();
    this.mid = this._mid();
    await this._tryLoad("far");
    await this._tryLoad("mid");
  },

  _tryLoad(name) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => { this[name] = i; res(); };
      i.onerror = () => res();
      i.src = `data/sprites/backdrops/${name}.png`;
    });
  },

  _canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d")];
  },

  // 960x170, transparent sky. Mountains up top, lakes at y ~95-130 —
  // the band the mid forest hides until you climb.
  _far() {
    const [c, g] = this._canvas(960, 170);
    const rnd = mulberry32(52);
    const range = (base, amp, period, color) => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, 170);
      let y = base;
      for (let x = 0; x <= 960; x += 16) {
        y = base + Math.sin(x / period * Math.PI * 2 + rnd() * 0.6) * amp * (0.6 + rnd() * 0.8);
        g.lineTo(x, Math.round(y));
      }
      g.lineTo(960, 170); g.fill();
    };
    range(58, 26, 300, "#b9c5c9");      // distant blue-grey range
    range(88, 34, 210, "#efeae0");      // white quartzite ridges
    g.fillStyle = "#dcd5c6";            // ridge shading flecks
    for (let i = 0; i < 60; i++) g.fillRect(rnd() * 960, 70 + rnd() * 40, 6 + rnd() * 10, 2);
    g.fillStyle = "#8fa08a";            // valley floor
    g.fillRect(0, 118, 960, 52);
    for (let i = 0; i < 6; i++) {       // lakes with pale rims
      const lx = 30 + i * 160 + rnd() * 60, lw = 60 + rnd() * 70, ly = 122 + rnd() * 18;
      g.fillStyle = "#cfe4f0"; g.fillRect(lx - 2, ly - 1, lw + 4, 12);
      g.fillStyle = "#5f93b8"; g.fillRect(lx, ly, lw, 10);
      g.fillStyle = "#8fc0dd"; g.fillRect(lx + 4, ly + 3, lw * 0.5, 1);
    }
    return c;
  },

  // 960x140, transparent top. Two dense conifer rows; solid below.
  _mid() {
    const [c, g] = this._canvas(960, 140);
    const rnd = mulberry32(53);
    const row = (baseY, color, size) => {
      g.fillStyle = color;
      for (let x = -10; x < 970; x += 7 + rnd() * 8) {
        const h = size * (0.7 + rnd() * 0.6), w = h * 0.55;
        g.beginPath();
        g.moveTo(x - w / 2, baseY); g.lineTo(x + w / 2, baseY); g.lineTo(x, baseY - h);
        g.fill();
      }
      g.fillRect(0, baseY - 2, 960, 140 - baseY + 2);
    };
    row(52, "#3c5c40", 34);
    row(78, "#2c4930", 42);
    row(110, "#22391f", 46);
    return c;
  },
};
