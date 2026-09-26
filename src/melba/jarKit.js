// What the two Melba jar demos share: the jar, its invisible walls, the
// produce outlines, the hover nudge, and the element that runs a jar on the
// page. Each demo is its own module (jarSkin.js, jarJelly.js) and builds on
// this one.
//
// Ported from reference/melba-jar-demos.html, which loaded the same libraries
// from a CDN. The numbers are that file's, and they are the original site's:
// the wall layout, the 5× density, zero restitution, the nudge.
//
// Why a custom element, like <vitosha-ridge>: swup swaps #swup without running
// the scripts inside it, so an inline script would start the jars on a cold
// load and never again. A defined element upgrades itself whenever it is
// inserted, and tidies up when swup takes it away.

import Matter from 'matter-js';
import decomp from 'poly-decomp';

// The festival's own illustrations, exported at 2× the collider outlines they
// sit on. Imported rather than referenced by URL so the build fingerprints
// them alongside the code that draws them.
import peachPng from '../../work/melba/shapes/peach_graphics.png';
import conePng from '../../work/melba/shapes/cone_graphics.png';
import carrotRedPng from '../../work/melba/shapes/carrot_graphics_red.png';
import carrotGreenPng from '../../work/melba/shapes/carrot_graphics_green.png';
import brokoliPng from '../../work/melba/shapes/brokoli_graphics.png';

export { Matter };
const { Bodies, Body, Common, Sleeping, Bounds } = Matter;

// A concave outline — of the real ones, only the leaf — is cut into convex
// pieces by poly-decomp before Matter.js can simulate it.
Common.setDecomp(decomp);

// The jar's own coordinate space. The canvas is drawn at this size and scaled
// by CSS, so every position below is in these units whatever the screen.
export const W = 320;
export const H = 440;

// The produce keeps the festival's illustration colours: they are the skins,
// and the skins are the point. Everything structural — the glass, the
// colliders, the walls, the lettering — is drawn in the palette's ink.
export const PRODUCE = {
  peach: '#ea8b00',
  mustard: '#e2a41a',
  red: '#ff3c15',
  carrot: '#ff0d2a',
  half: '#ff5331',
  green: '#69db26',
  greenDk: '#185615',
  cream: '#e2dccf',
  partA: 'rgba(226, 164, 26, 0.28)',
  partB: 'rgba(255, 60, 21, 0.22)',
};

// The same settings every body on the original site carried. A function, so
// no two bodies are ever handed the same options object.
const bodyOptions = () => ({ restitution: 0, density: 0.005, frictionAir: 0.025, label: 'dynamic' });

/* ---- the glass ------------------------------------------------------ */

// Lid, two shoulders that make the neck, two sides and a floor. Invisible:
// they only keep the contents in. The drawn jar below agrees with them on
// where the glass is.
export function makeWalls() {
  const o = { isStatic: true, chamfer: { radius: 14 }, label: 'wall' };
  return [
    Bodies.rectangle(160, 14, 180, 40, o),
    Bodies.rectangle(57, 55, 76, 70, o),
    Bodies.rectangle(263, 55, 76, 70, o),
    Bodies.rectangle(4, 230, 40, 460, o),
    Bodies.rectangle(316, 230, 40, 460, o),
    Bodies.rectangle(160, 420, 320, 40, o),
  ];
}

function jarPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(95, 34);
  ctx.lineTo(95, 62);
  ctx.bezierCurveTo(95, 86, 24, 84, 24, 114);
  ctx.lineTo(24, 368);
  ctx.quadraticCurveTo(24, 400, 56, 400);
  ctx.lineTo(264, 400);
  ctx.quadraticCurveTo(296, 400, 296, 368);
  ctx.lineTo(296, 114);
  ctx.bezierCurveTo(296, 84, 225, 86, 225, 62);
  ctx.lineTo(225, 34);
}

export function drawJar(ctx, ink, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'round';
  jarPath(ctx);
  ctx.stroke();
  ctx.fillStyle = ink;
  roundRect(ctx, 84, 14, 152, 20, 6);
  ctx.fill();
  ctx.restore();
}

/* ---- paths ---------------------------------------------------------- */

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function polyPath(ctx, verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
}

// Closed quadratic smoothing through the midpoints of a ring of points.
export function smoothPath(ctx, pts) {
  const n = pts.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  ctx.beginPath();
  const m = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m.x, m.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p.x, p.y, q.x, q.y);
  }
  ctx.closePath();
}

/* ---- the real collider outlines --------------------------------------- */

// Copied from the hidden SVG on the live site: deliberately simple polygons,
// three to twelve points each. They are what Matter.js simulates.
const SVG = {
  peach: 'M 6.1 60.2 L 0.7999999999999998 57.300000000000004 L 1.4 46.7 L 7.9 26.800000000000004 L 24.9 9.400000000000006 L 49.9 0.7000000000000064 L 73.6 4 L 88.8 13 L 99.2 24.5 L 102 32 L 98.9 35.6 L 6.1 60.2 z',
  cone: 'M 0.6 36.5 L 0.1 0.6 L 11.2 2.3 L 23.9 9.5 L 31.299999999999997 18.6 L 35.199999999999996 29.1 L 35.9 35.4 L 0.6 36.5 z',
  carrot: 'M 29.6 331.4 L 0.3 0 H 56.099999999999994',
  brokoli: 'M 50 98 L 1.1 31.1 L 2.9000000000000004 19.900000000000002 L 24.2 5.3 L 50 0 L 77 5.3 L 97.8 19.9 L 99.5 31.299999999999997 L 50 98 z',
  half: 'M51.8791 0.391968H24.2151L0.782471 121.118H51.8791V0.391968Z',
  leaf: 'M10.6835 65.4817H34.8272L44.3923 17.1841L27.7157 55.1957L21.3508 0.135773L15.306 54.8398L0.407227 17.8959L10.6835 65.4817Z',
};

// Which outline each kind is traced from. The two carrots share one.
const SOURCE = {
  peach: 'peach', cone: 'cone', carrot: 'carrot', carrotGreen: 'carrot',
  broccoli: 'brokoli', half: 'half', leaf: 'leaf',
};

// The skins. Each PNG is twice its outline's size, so half its pixels is one
// unit — the same per-illustration scale the site kept in its config. Kinds
// without one (half, leaf) are drawn by drawShape() instead.
const SPRITE_SRC = {
  peach: peachPng,
  cone: conePng,
  carrot: carrotRedPng,
  carrotGreen: carrotGreenPng,
  broccoli: brokoliPng,
};
const SPRITE_SCALE = 0.5;

// Loaded once, the first time a jar asks. Until one has decoded, its kind is
// drawn as a stand-in, so a jar never starts with holes in it.
let sprites;
function loadSprites() {
  sprites ??= Object.fromEntries(
    Object.entries(SPRITE_SRC).map(([kind, src]) => {
      const img = new Image();
      img.src = src;
      return [kind, img];
    }),
  );
  return sprites;
}

// Just the path commands the outlines use: M, L, H, V and Z.
function parsePath(d) {
  const t = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const pts = [];
  let i = 0;
  let c = 'M';
  let x = 0;
  let y = 0;
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) c = t[i++];
    const C = c.toUpperCase();
    if (C === 'Z') continue;
    if (C === 'H') x = +t[i++];
    else if (C === 'V') y = +t[i++];
    else {
      x = +t[i++];
      y = +t[i++];
    }
    pts.push({ x, y });
  }
  // A closed path repeats its first point; the polygon doesn't want it twice.
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (pts.length > 3 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) pts.pop();
  return pts;
}

// An outline centred on its own bounding box, then scaled.
function outlineOf(kind, sx, sy) {
  const p = parsePath(SVG[SOURCE[kind]]);
  const b = Bounds.create(p);
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  return p.map((q) => ({ x: (q.x - cx) * sx, y: (q.y - cy) * sy }));
}

/**
 * One object in a jar: its body, and — for traced kinds — the outline its
 * skin is drawn against, stored relative to the body.
 *
 * @param {string} kind   dot, label, or one of the SOURCE kinds
 * @param {object} opts   scale (or sx/sy), angle; r and color for a dot;
 *                        w, h and text for a label; color for a leaf
 */
export function makeItem(kind, x, y, opts = {}) {
  loadSprites();
  const sx = opts.sx || opts.scale || 1;
  const sy = opts.sy || opts.scale || 1;
  let body;
  let outline = null;

  if (kind === 'dot') body = Bodies.circle(x, y, opts.r, bodyOptions());
  else if (kind === 'label') body = Bodies.rectangle(x, y, opts.w, opts.h || 28, bodyOptions());
  else {
    outline = outlineOf(kind, sx, sy);
    // A copy, always: Matter sorts a convex vertex list in place, and sorting
    // the outline itself would scramble the skin drawn from it.
    body = Bodies.fromVertices(x, y, [outline.map((p) => ({ x: p.x, y: p.y }))], bodyOptions());
    // fromVertices recentres the body on its centre of mass. Keep the drawing
    // locked to the collider: match bounding boxes, then store it relative to
    // the body.
    const ob = Bounds.create(outline);
    const bb = body.bounds;
    const dx = (bb.min.x + bb.max.x) / 2 - (ob.min.x + ob.max.x) / 2;
    const dy = (bb.min.y + bb.max.y) / 2 - (ob.min.y + ob.max.y) / 2;
    outline = outline.map((p) => ({ x: p.x + dx - body.position.x, y: p.y + dy - body.position.y }));
  }
  if (opts.angle) Body.rotate(body, opts.angle);

  const item = { kind, body, outline, opts, sx, sy, s: Math.min(sx, sy) };
  body.item = item;
  return item;
}

/* ---- skins ------------------------------------------------------------ */

/** Draw an item's skin, in its body's place. */
export function drawShape(ctx, it, ink) {
  const b = it.body;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);

  const img = sprites?.[it.kind];
  if (img?.complete && img.naturalWidth) drawSprite(ctx, it, img);
  else drawStandIn(ctx, it, ink);

  ctx.restore();
}

// The PNG, centred where its outline is centred.
function drawSprite(ctx, it, img) {
  const b = Bounds.create(it.outline);
  const w = img.naturalWidth * SPRITE_SCALE * it.sx;
  const h = img.naturalHeight * SPRITE_SCALE * it.sy;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// Everything without a PNG, and anything whose PNG hasn't arrived yet.
function drawStandIn(ctx, it, ink) {
  const o = it.outline;
  const k = it.kind;
  const s = it.s;

  if (k === 'dot') {
    ctx.fillStyle = PRODUCE[it.opts.color];
    ctx.beginPath();
    ctx.arc(0, 0, it.opts.r, 0, 7);
    ctx.fill();
  } else if (k === 'label') {
    ctx.fillStyle = ink;
    // The lettering fills its box: the type size follows the collider's height.
    const size = Math.round((it.opts.h || 28) * 0.9);
    ctx.font = `800 ${size}px Satoshi, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.opts.text, 0, 1, it.opts.w);
  } else if (k === 'peach') {
    // A crescent: a rounded back over the hull, hollowed underneath where the
    // collider is a straight chord.
    ctx.beginPath();
    ctx.moveTo(o[0].x, o[0].y);
    for (let i = 1; i < o.length - 1; i++) {
      ctx.quadraticCurveTo(o[i].x, o[i].y, (o[i].x + o[i + 1].x) / 2, (o[i].y + o[i + 1].y) / 2);
    }
    const e = o[o.length - 1];
    ctx.lineTo(e.x, e.y);
    const mx = (e.x + o[0].x) / 2;
    const my = (e.y + o[0].y) / 2;
    const len = Math.hypot(mx, my) || 1;
    ctx.quadraticCurveTo(mx - (mx / len) * 30 * s, my - (my / len) * 30 * s, o[0].x, o[0].y);
    ctx.fillStyle = PRODUCE.peach;
    ctx.fill();
  } else if (k === 'cone') {
    const c = o[0];
    const r = Math.hypot(o[1].x - c.x, o[1].y - c.y);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(o[1].x, o[1].y);
    ctx.arc(c.x, c.y, r, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fillStyle = PRODUCE.mustard;
    ctx.fill();
  } else if (k === 'carrot' || k === 'carrotGreen') {
    polyPath(ctx, o);
    ctx.fillStyle = k === 'carrot' ? PRODUCE.carrot : PRODUCE.greenDk;
    ctx.fill();
  } else if (k === 'broccoli') {
    // A cream "hand": a stem, and fingers fanning out to the collider's upper
    // edge. Edged in the ink, thinly, so it holds against a pale field.
    const palm = { x: (o[0].x + o[4].x) / 2, y: o[0].y + (o[4].y - o[0].y) * 0.55 };
    const strokes = [
      [o[0], 15],
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => [
        { x: palm.x + (o[i].x - palm.x) * 0.82, y: palm.y + (o[i].y - palm.y) * 0.82 },
        17,
      ]),
    ];
    ctx.lineCap = 'round';
    [[ink, 2, EDGE_ALPHA], [PRODUCE.cream, 0, 1]].forEach(([colour, extra, alpha]) => {
      ctx.strokeStyle = colour;
      ctx.globalAlpha = alpha;
      strokes.forEach(([q, w]) => {
        ctx.lineWidth = w * s * 1.8 + extra;
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      });
    });
  } else if (k === 'half') {
    polyPath(ctx, o);
    ctx.fillStyle = PRODUCE.half;
    ctx.fill();
  } else if (k === 'leaf') {
    polyPath(ctx, o);
    ctx.fillStyle = it.opts.color ? PRODUCE[it.opts.color] : PRODUCE.greenDk;
    ctx.fill();
  }
}

// The cream broccoli's edge: the reference's rgba(0,0,0,.16), in the ink.
const EDGE_ALPHA = 0.16;

/* ---- the hover nudge -------------------------------------------------- */

// The original site's: a random direction, a random strength from 1× to k×,
// scaled by the body's own mass so a heavy peach and a light dot react alike.
export function nudge(body, k = 12) {
  if (body.isStatic) return;
  Sleeping.set(body, false);
  const f = 0.0005 * body.mass;
  Body.applyForce(body, body.position, {
    x: (f + Common.random() * f * k) * Common.choose([1, -1]),
    y: (f + Common.random() * f * k) * Common.choose([1, -1]),
  });
}

/* ---- the element ------------------------------------------------------ */

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// For ids inside the markup an element builds, so a label finds its input
// even with two of the same jar on one page.
let instances = 0;

/**
 * A jar on the page. Subclasses provide the markup around the stage
 * (`controls()`), set up their world (`build()`), step and draw it
 * (`frame(ink)`) and say what a shake is (`shake()`).
 *
 * This handles what both share: the stage and its canvas, running only while
 * on screen, the one shake on first view, pointer input in jar units, and
 * cleaning up after swup.
 *
 * Any children written in the page — the caption — are kept, and sit after
 * what the element builds.
 */
export class JarDemo extends HTMLElement {
  connectedCallback() {
    if (!this.stage) {
      this.uid = `jar-${++instances}`;
      const authored = [...this.childNodes];

      this.stage = document.createElement('div');
      this.stage.className = 'jar-demo__stage';
      this.stage.tabIndex = 0;
      this.stage.setAttribute('aria-label', this.label);
      this.canvas = document.createElement('canvas');
      this.stage.append(this.canvas);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const controls = document.createElement('div');
      controls.className = 'controls';
      controls.innerHTML = this.controls();

      this.readout = document.createElement('p');
      this.readout.className = 'readout';
      this.readout.setAttribute('aria-live', 'polite');

      this.replaceChildren(this.stage, controls, this.readout, ...authored);

      this.build();

      this.stage.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.shake();
        }
      });
      this.querySelectorAll('[data-shake]').forEach((b) =>
        b.addEventListener('click', () => this.shake()),
      );
    }

    // Nothing is simulated or drawn while the jar is off screen.
    this.running = false;
    this.views = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !this.running) {
          this.running = true;
          this.loop();
        } else if (!e.isIntersecting && this.running) {
          this.running = false;
          cancelAnimationFrame(this.raf);
        }
      },
      { rootMargin: '100px' },
    );
    this.views.observe(this.stage);

    // One shake the first time it comes properly into view, so the jar
    // introduces itself. Not for anyone who has asked for less motion.
    if (!this.shown && !reducedMotion()) {
      this.firstView = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          this.shown = true;
          this.firstView.disconnect();
          this.shakeCue = setTimeout(() => this.shake(), 400);
        },
        { threshold: 0.6 },
      );
      this.firstView.observe(this.stage);
    }
  }

  disconnectedCallback() {
    this.views?.disconnect();
    this.firstView?.disconnect();
    clearTimeout(this.shakeCue);
    cancelAnimationFrame(this.raf);
    this.running = false;
  }

  loop = () => {
    // The palette's ink, read every frame so the jar cross-fades with the copy.
    this.frame(getComputedStyle(this).color);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** A pointer event, in jar units. */
  toWorld(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  /** Mirror a group of aria-pressed buttons onto the one chosen. */
  press(selector, chosen) {
    this.querySelectorAll(selector).forEach((b) =>
      b.setAttribute('aria-pressed', String(chosen(b))),
    );
  }
}
