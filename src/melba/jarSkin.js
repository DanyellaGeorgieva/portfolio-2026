// <jar-skin> — "Collider and skin". A jar of the festival's produce where you
// can switch between what visitors saw (the skins), what Matter.js simulates
// (the colliders), or both at once.
//
// Usage:
//   <jar-skin>
//     <p class="caption">…</p>
//   </jar-skin>

import {
  Matter, JarDemo, W, H, PRODUCE, makeWalls, drawJar, polyPath, makeItem, drawShape, nudge,
} from './jarKit.js';

const { Engine, Composite, Query } = Matter;

// How the readout names a kind, where its key isn't already the word.
const NAMES = { carrotGreen: 'green carrot' };

class JarSkin extends JarDemo {
  get label() {
    return 'Jar of floating produce. Move the pointer over it to nudge the contents.';
  }

  controls() {
    return `
      <div class="row">
        <div class="seg" role="group" aria-label="View">
          <button type="button" data-view="skin" aria-pressed="false">Skins</button>
          <button type="button" data-view="both" aria-pressed="true">Both</button>
          <button type="button" data-view="collider" aria-pressed="false">Colliders</button>
        </div>
        <button type="button" class="btn" data-shake>Shake</button>
      </div>`;
  }

  build() {
    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.walls = makeWalls();
    Composite.add(this.engine.world, this.walls);

    this.items = [];
    const add = (kind, x, y, opts) => {
      const it = makeItem(kind, x, y, opts);
      this.items.push(it);
      Composite.add(this.engine.world, it.body);
    };

    add('peach', 86, 140, { scale: 1.05 });
    add('peach', 210, 364, { scale: 1.05, angle: -0.2 });
    add('peach', 100, 362, { scale: 1.05, angle: 2.9 });
    add('carrot', 270, 258, { sx: 0.55, sy: 0.48, angle: 0.12 });
    add('carrotGreen', 46, 300, { sx: 0.55, sy: 0.5, angle: -0.08 });
    add('broccoli', 182, 290, { scale: 0.75 });
    add('cone', 160, 130, { scale: 1.2 });
    add('cone', 112, 280, { scale: 1.2, angle: 1.2 });
    add('half', 212, 140, { scale: 0.6, angle: 1.57 });
    add('leaf', 264, 150, { scale: 0.9, angle: -0.2 });
    add('label', 152, 190, { w: 140, h: 34, text: 'SHAKE' });
    add('label', 150, 230, { w: 110, h: 34, text: 'WELL' });
    [
      [236, 196, 'red'], [226, 236, 'mustard'], [70, 232, 'red'], [140, 330, 'mustard'],
      [238, 300, 'red'], [44, 390, 'mustard'], [280, 392, 'red'], [160, 396, 'red'],
    ].forEach(([x, y, color]) => add('dot', x, y, { r: 7, color }));
    add('dot', 56, 190, { r: 18, color: 'green' });

    this.bodies = this.items.map((i) => i.body);
    this.view = 'both';
    this.hovered = null;
    this.nParts = this.items.reduce((a, it) => a + partCount(it.body), 0);
    this.concave = this.items.filter((it) => it.body.parts.length > 2).length;
    this.updateReadout();

    this.querySelectorAll('[data-view]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.view = btn.dataset.view;
        this.press('[data-view]', (b) => b === btn);
      }),
    );

    const onMove = (e) => {
      const h = Query.point(this.bodies, this.toWorld(e))[0] || null;
      if (h) nudge(h, 12);
      if (h !== this.hovered) {
        this.hovered = h;
        this.updateReadout();
      }
    };
    this.stage.addEventListener('pointermove', onMove);
    this.stage.addEventListener('pointerdown', onMove);
    this.stage.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.updateReadout();
    });
  }

  shake() {
    this.bodies.forEach((b) => nudge(b, 22));
  }

  updateReadout() {
    const base = `${this.items.length} bodies → ${this.nParts} convex parts · ${this.walls.length} walls`;
    let detail = `${this.concave} concave shape${this.concave === 1 ? '' : 's'} (the leaf), split by poly-decomp`;
    if (this.hovered) {
      const it = this.hovered.item;
      const parts = partCount(this.hovered);
      const name = it.kind === 'label' ? `“${it.opts.text}”` : NAMES[it.kind] || it.kind;
      const pts = it.outline ? `, ${it.outline.length}-point outline` : '';
      detail = `${name}${pts}: ${parts} convex part${parts > 1 ? 's' : ''}, mass ${this.hovered.mass.toFixed(1)}`;
    }
    this.readout.innerHTML = `${base}<br>${detail}`;
  }

  frame(ink) {
    const { ctx, view } = this;
    Engine.update(this.engine, 1000 / 60);
    ctx.clearRect(0, 0, W, H);

    // The walls hiding behind the drawn glass.
    if (view !== 'skin') {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      this.walls.forEach((w) => {
        polyPath(ctx, w.vertices);
        ctx.stroke();
      });
      ctx.restore();
    }
    if (view !== 'collider') this.items.forEach((it) => drawShape(ctx, it, ink));
    if (view !== 'skin') this.items.forEach((it) => this.drawCollider(it.body, ink));
    drawJar(ctx, ink, view === 'collider' ? 0.18 : 1);
  }

  drawCollider(b, ink) {
    const { ctx } = this;
    const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
    parts.forEach((p, i) => {
      polyPath(ctx, p.vertices);
      ctx.fillStyle = parts.length > 1 ? (i % 2 ? PRODUCE.partB : PRODUCE.partA) : 'transparent';
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = ink;
      ctx.stroke();
    });
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, 2, 0, 7);
    ctx.fill();
    if (b === this.hovered) {
      ctx.lineWidth = 2.5;
      polyPath(ctx, b.vertices);
      ctx.stroke();
    }
  }
}

// A compound body's first part is its own hull; the pieces follow it.
const partCount = (b) => (b.parts.length > 1 ? b.parts.length - 1 : 1);

if (!customElements.get('jar-skin')) customElements.define('jar-skin', JarSkin);
