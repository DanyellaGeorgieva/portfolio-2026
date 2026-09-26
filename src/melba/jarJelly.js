// <jar-jelly> — "A ring of dots pretending to be jelly". One blob, built the
// way the site built them: a ring of invisible dots, each rigidly linked to its
// neighbour, loosely sprung to the dot two along, and tethered to where it
// started. Paper.js runs a smooth curve through the dots every frame.
//
// The presets and sliders retune the tether and the shape spring live, so the
// blob can be melted or turned to stone. Original is the Review jar's tuning.
//
// Usage:
//   <jar-jelly>
//     <p class="caption">…</p>
//   </jar-jelly>

import paper from 'paper/dist/paper-core';
import {
  Matter, JarDemo, W, H, PRODUCE, makeWalls, drawJar, smoothPath, makeItem, drawShape, nudge,
} from './jarKit.js';

const { Engine, Bodies, Body, Composite, Constraint, Query } = Matter;

// The blob's resting circle.
const C = { x: 160, y: 285, r: 72 };

// [tether, shape spring, dots]
const PRESETS = {
  melt: [0.0006, 0.002, 16],
  original: [0.009, 0.04, 16],
  rubber: [0.06, 0.35, 16],
  stone: [0.5, 1, 16],
};

// The stiffnesses span three orders of magnitude, so the sliders are
// logarithmic: 0–1000 on the input, min–max on the constraint.
const logMap = (min, max) => ({
  to: (v) => min * Math.pow(max / min, v / 1000),
  from: (x) => Math.round((1000 * Math.log(x / min)) / Math.log(max / min)),
});
const tetherMap = logMap(0.0003, 0.6);
const shapeMap = logMap(0.001, 1);
const fmt = (x) => (x >= 0.1 ? x.toFixed(2) : x.toFixed(x < 0.001 ? 4 : 3));

class JarJelly extends JarDemo {
  get label() {
    return 'Jar with a jelly blob. Move the pointer over the blob to poke it.';
  }

  controls() {
    return `
      <div class="row">
        <div class="seg" role="group" aria-label="Preset">
          <button type="button" data-preset="melt" aria-pressed="false">Melt</button>
          <button type="button" data-preset="original" aria-pressed="true">Original</button>
          <button type="button" data-preset="rubber" aria-pressed="false">Rubber</button>
          <button type="button" data-preset="stone" aria-pressed="false">Stone</button>
          <button type="button" data-custom aria-pressed="false">Custom</button>
        </div>
      </div>
      <div class="row">
        <div class="ctl">
          <label for="${this.uid}-tether">Tether <output data-out="tether"></output></label>
          <input type="range" id="${this.uid}-tether" data-in="tether" min="0" max="1000" step="1" />
        </div>
        <div class="ctl">
          <label for="${this.uid}-shape">Shape spring <output data-out="shape"></output></label>
          <input type="range" id="${this.uid}-shape" data-in="shape" min="0" max="1000" step="1" />
        </div>
        <div class="ctl">
          <label for="${this.uid}-dots">Dots <output data-out="dots"></output></label>
          <input type="range" id="${this.uid}-dots" data-in="dots" min="6" max="44" step="2" />
        </div>
      </div>
      <div class="row">
        <button type="button" class="btn" data-structure aria-pressed="true">Hide the dots</button>
        <button type="button" class="btn" data-shake>Shake</button>
      </div>`;
  }

  build() {
    this.engine = Engine.create({ enableSleeping: false, constraintIterations: 4 });
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    Composite.add(this.engine.world, makeWalls());

    // Paper.js does the curve smoothing, as on the original site. Its own
    // scope, so it shares nothing with any other Paper.js on the page.
    const scope = new paper.PaperScope();
    scope.setup(new scope.Size(W, H));
    this.path = new scope.Path({ closed: true, insert: false });

    this.props = [];
    const addProp = (kind, x, y, opts) => {
      const it = makeItem(kind, x, y, opts);
      this.props.push(it);
      Composite.add(this.engine.world, it.body);
    };
    addProp('peach', 88, 144, { scale: 1.05 });
    addProp('peach', 234, 156, { scale: 1.05, angle: 0.5 });
    addProp('peach', 244, 370, { scale: 1.05, angle: 2.4 });
    addProp('cone', 62, 370, { scale: 1.2, angle: -0.6 });
    [[160, 112, 'red'], [150, 190, 'mustard'], [224, 216, 'red'], [48, 250, 'red'], [276, 272, 'mustard']]
      .forEach(([x, y, color]) => addProp('dot', x, y, { r: 7, color }));
    this.propBodies = this.props.map((p) => p.body);

    this.state = { tether: 0.009, shape: 0.04, dots: 16, structure: true };
    this.nodes = [];
    this.links = [];
    this.tethers = [];
    this.springs = [];
    this.homes = [];
    // One collision group for the dots, so they never collide with each other.
    this.group = Body.nextGroup(true);
    this.buildRing();

    this.inputs = {};
    this.outputs = {};
    for (const key of ['tether', 'shape', 'dots']) {
      this.inputs[key] = this.querySelector(`[data-in="${key}"]`);
      this.outputs[key] = this.querySelector(`[data-out="${key}"]`);
    }
    this.inputs.tether.addEventListener('input', () => {
      this.state.tether = tetherMap.to(+this.inputs.tether.value);
      this.sync();
    });
    this.inputs.shape.addEventListener('input', () => {
      this.state.shape = shapeMap.to(+this.inputs.shape.value);
      this.sync();
    });
    this.inputs.dots.addEventListener('input', () => {
      this.state.dots = +this.inputs.dots.value;
      this.buildRing();
      this.sync();
    });

    this.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const [t, s, d] = PRESETS[b.dataset.preset];
        this.state.tether = t;
        this.state.shape = s;
        if (d !== this.state.dots) {
          this.state.dots = d;
          this.buildRing();
        }
        this.sync();
        // A poke, so the new setting shows itself straight away.
        this.poke(C.x - 40, C.y - 30, 0.06);
      }),
    );

    // Custom is lit whenever the sliders match none of the presets, and holds
    // the last such tuning — so after trying a preset, pressing it goes back to
    // what you had dialled in. Until something has been dialled in there is
    // nothing to go back to, and it does nothing.
    this.querySelector('[data-custom]').addEventListener('click', () => {
      if (!this.custom) return;
      const { tether, shape, dots } = this.custom;
      this.state.tether = tether;
      this.state.shape = shape;
      if (dots !== this.state.dots) {
        this.state.dots = dots;
        this.buildRing();
      }
      this.sync();
      this.poke(C.x - 40, C.y - 30, 0.06);
    });

    const structure = this.querySelector('[data-structure]');
    structure.addEventListener('click', () => {
      this.state.structure = !this.state.structure;
      structure.setAttribute('aria-pressed', String(this.state.structure));
      structure.textContent = this.state.structure ? 'Hide the dots' : 'Show the dots';
    });
    this.sync();

    // Moving across the blob pushes the dots along the pointer's own direction;
    // anything else under it gets the ordinary nudge.
    let last = null;
    this.stage.addEventListener('pointermove', (e) => {
      const p = this.toWorld(e);
      const v = last ? { x: p.x - last.x, y: p.y - last.y } : { x: 0, y: 0 };
      last = p;
      this.poke(p.x, p.y, 0.012, v.x, v.y);
      Query.point(this.propBodies, p).forEach((b) => nudge(b, 12));
    });
    this.stage.addEventListener('pointerdown', (e) => {
      const p = this.toWorld(e);
      last = p;
      this.poke(p.x, p.y, 0.08);
    });
    this.stage.addEventListener('pointerleave', () => {
      last = null;
    });
  }

  buildRing() {
    const { engine, state, group } = this;
    Composite.remove(engine.world, [...this.nodes, ...this.links, ...this.tethers, ...this.springs]);

    const n = state.dots;
    this.homes = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: C.x + Math.cos(t) * C.r, y: C.y + Math.sin(t) * C.r };
    });
    this.nodes = this.homes.map((h) =>
      Bodies.circle(h.x, h.y, 6, {
        restitution: 0,
        density: 0.005,
        label: 'node',
        collisionFilter: { group },
      }),
    );
    const nodes = this.nodes;
    // Home: a weak tether to where it started, so the blob always drifts back.
    this.tethers = nodes.map((b, i) =>
      Constraint.create({ pointA: { ...this.homes[i] }, bodyB: b, stiffness: state.tether, length: 0 }),
    );
    // Neighbour: rigid, so the ring keeps its length.
    this.links = nodes.map((b, i) =>
      Constraint.create({ bodyA: b, bodyB: nodes[(i + 1) % n], stiffness: 1 }),
    );
    // Two along: a loose spring, so the ring can't fold in on itself.
    this.springs = nodes.map((b, i) =>
      Constraint.create({ bodyA: b, bodyB: nodes[(i + 2) % n], stiffness: state.shape }),
    );
    Composite.add(engine.world, [...nodes, ...this.tethers, ...this.links, ...this.springs]);

    this.path.removeSegments();
    this.path.addSegments(this.homes.map((h) => [h.x, h.y]));
  }

  sync() {
    const { state, inputs, outputs } = this;
    inputs.tether.value = tetherMap.from(state.tether);
    inputs.shape.value = shapeMap.from(state.shape);
    inputs.dots.value = state.dots;
    outputs.tether.textContent = fmt(state.tether);
    outputs.shape.textContent = fmt(state.shape);
    outputs.dots.textContent = state.dots;

    this.tethers.forEach((c) => (c.stiffness = state.tether));
    this.springs.forEach((c) => (c.stiffness = state.shape));

    // Light up the preset these settings match, if any — within 3%, since the
    // sliders only land on the preset values approximately.
    const near = (a, b) => Math.abs(a - b) / a < 0.03;
    const match = Object.entries(PRESETS).find(
      ([, p]) => near(p[0], state.tether) && near(p[1], state.shape) && p[2] === state.dots,
    );
    this.press('[data-preset]', (b) => !!match && b.dataset.preset === match[0]);
    this.press('[data-custom]', () => !match);
    if (!match) this.custom = { tether: state.tether, shape: state.shape, dots: state.dots };
    const note =
      match?.[0] === 'original' ? 'the Review jar’s settings' : match ? `${match[0]} preset` : 'custom';
    this.readout.innerHTML =
      `${state.dots} dots · ${state.dots * 3} constraints<br>` +
      `tether ${fmt(state.tether)} · shape ${fmt(state.shape)} · ${note}`;
  }

  // Push the dots near (x, y) — along (vx, vy) if the pointer is moving,
  // otherwise straight out from it.
  poke(x, y, strength = 0.03, vx = 0, vy = 0) {
    const len = Math.hypot(vx, vy);
    this.nodes.forEach((b) => {
      const dx = b.position.x - x;
      const dy = b.position.y - y;
      const d = Math.hypot(dx, dy);
      if (d >= 46) return;
      const k = (1 - d / 46) * strength * b.mass;
      const dir = len > 0.5 ? { x: vx / len, y: vy / len } : { x: dx / (d || 1), y: dy / (d || 1) };
      Body.applyForce(b, b.position, { x: dir.x * k, y: dir.y * k });
    });
  }

  shake() {
    this.propBodies.forEach((b) => nudge(b, 22));
    this.nodes.forEach((b) => nudge(b, 30));
  }

  frame(ink) {
    const { ctx } = this;
    Engine.update(this.engine, 1000 / 60);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (this.state.structure) ctx.globalAlpha = 0.35;
    this.drawBlob();
    ctx.restore();

    this.props.forEach((it) => drawShape(ctx, it, ink));
    if (this.state.structure) this.drawStructure(ink);
    drawJar(ctx, ink);
  }

  drawBlob() {
    const { ctx, path } = this;
    const pts = this.nodes.map((b) => b.position);
    if (path.segments.length === pts.length) {
      pts.forEach((p, i) => {
        path.segments[i].point.x = p.x;
        path.segments[i].point.y = p.y;
      });
      path.smooth();
      const s = path.segments;
      const n = s.length;
      ctx.beginPath();
      ctx.moveTo(s[0].point.x, s[0].point.y);
      for (let i = 0; i < n; i++) {
        const a = s[i];
        const b = s[(i + 1) % n];
        ctx.bezierCurveTo(
          a.point.x + a.handleOut.x, a.point.y + a.handleOut.y,
          b.point.x + b.handleIn.x, b.point.y + b.handleIn.y,
          b.point.x, b.point.y,
        );
      }
      ctx.closePath();
    } else smoothPath(ctx, pts);
    ctx.fillStyle = PRODUCE.mustard;
    ctx.fill();
  }

  // The ring laid bare: springs faint, tethers dashed back to their homes (×),
  // links solid, and the dots themselves.
  drawStructure(ink) {
    const { ctx } = this;
    const line = (a, b) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = 0.45;
    this.springs.forEach((c) => line(c.bodyA.position, c.bodyB.position));
    ctx.globalAlpha = 1;
    ctx.setLineDash([2, 3]);
    this.tethers.forEach((c) => line(c.pointA, c.bodyB.position));
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    this.links.forEach((c) => line(c.bodyA.position, c.bodyB.position));
    this.homes.forEach((h) => {
      line({ x: h.x - 3, y: h.y - 3 }, { x: h.x + 3, y: h.y + 3 });
      line({ x: h.x + 3, y: h.y - 3 }, { x: h.x - 3, y: h.y + 3 });
    });
    this.nodes.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, 4, 0, 7);
      ctx.fill();
    });
    ctx.restore();
  }
}

if (!customElements.get('jar-jelly')) customElements.define('jar-jelly', JarJelly);
