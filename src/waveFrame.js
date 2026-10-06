// The frame round the screen, with an inner edge that is a different shape on
// every page.
//
// One <path> in a fixed, full-screen <svg>: the screen's own rectangle with a
// hole cut out of it, and the hole is what is wavy. Nothing is filtered and
// nothing is morphed between drawn shapes — the wave is in the geometry. The
// hole's outline is walked point by point, each point is pushed in or out by
// smooth noise read at its own place on the screen, and the result is written
// to the path's `d`.
//
// Reading the noise by position is what makes it organic: two points near each
// other get nearly the same push, so the edge swells rather than jitters, and
// the outline closes on itself with no join to hide.
//
// The noise has a third dimension, and that is the page: the frame sits still
// at one depth in it, and each page is a step deeper — a new shape.
//
// It gets there by a ripple. Changing page drops a stone where you clicked: a
// ring spreads out from that point across the screen, and where the ring
// crosses the frame the edge rides over it — one slow swell, in and out — and
// comes down in its new shape behind it. The ring reaches the near side first
// and the far corner last, so the change travels round the frame rather than
// happening to all of it at once. Once the ring has left the screen the frame
// is still, and nothing runs until the next page.

// Everything worth tuning. Lengths are CSS px.
const WAVE = {
  amplitude: 5, // furthest the edge strays from straight, either way
  wavelength: 190, // roughly the length of one swell along the edge
  shift: 0.5, // how far through the noise one page change travels: about 1
  // is a wholly new shape, a fraction of it a variation on the last
  detail: 0.35, // a second, finer swell on top: its share of the first
  step: 14, // distance between points along a straight side
  corner: 5, // points round each rounded corner
};

// The ripple a page change sends across the screen.
const RIPPLE = {
  // How long it lasts is not set here: it is the time the field takes to
  // change palette, handed in by main.js, so the edge and the colour come to
  // rest together. Set in seconds rather than px per second, so a click in a
  // corner — with the whole diagonal to cross — takes no longer than any other.
  swell: 0.45, // the share of that time any one place on the edge is moving
  // for; the rest is the ring travelling from the nearest place to the
  // farthest. At 1 the whole frame moves at once.
  height: 4, // how far the edge is lifted, in and out, at the start
  crests: 0.4, // roughly how many pass a place before it has settled
  fade: 0.7, // how much of its height is gone by the farthest corner
};

const smooth = (t) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

// --- Noise ------------------------------------------------------------------
// Value noise in three dimensions: a random number at every whole-number
// corner of a grid, blended smoothly in between. Two across the screen, one
// for the page. Returns -1..1.

function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function noise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const corner = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  const near = lerp(
    lerp(corner(0, 0, 0), corner(1, 0, 0), u),
    lerp(corner(0, 1, 0), corner(1, 1, 0), u),
    v,
  );
  const far = lerp(
    lerp(corner(0, 0, 1), corner(1, 0, 1), u),
    lerp(corner(0, 1, 1), corner(1, 1, 1), u),
    v,
  );
  return lerp(near, far, w) * 2 - 1;
}

export default class WaveFrame {
  /**
   * @param {SVGSVGElement} svg the shell's .screen-frame
   * @param {{ duration?: number }} options seconds a ripple lasts
   */
  constructor(svg, { duration = 3.6 } = {}) {
    this.duration = duration;
    this.svg = svg;
    this.path = svg.querySelector('path');
    this.points = [];
    // Where the frame is in the noise, and how swollen: 0 is the straight
    // frame the stylesheet draws, 1 the full wave. Both are what the whole
    // edge has settled to; a ripple still crossing carries its own share on
    // top, point by point, until it has passed.
    this.depth = 0;
    this.swell = 0;
    this.ripples = []; // more than one, if pages are changed in a hurry
    this.now = 0;
    this.raf = null;

    this.tick = this.tick.bind(this);
    this.resize = this.resize.bind(this);

    // Asked for stillness: each page still gets its own shape, but the frame
    // is simply in it — nothing flows from one to the next.
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.addEventListener('resize', this.resize);

    this.measure();
    // It starts straight — exactly where the stylesheet's own frame was.
    this.draw();
    // Only now does the stylesheet's plain frame stand down (see main.scss):
    // there is never a moment with no frame, and none with two.
    document.documentElement.classList.add('has-wave-frame');
    // The first page is a page change like any other: a ripple, with the wave
    // rising out of the straight frame behind it.
    this.shift();
  }

  /**
   * Change shape, by a ripple from (x, y) — client px, the middle of the screen
   * if not given. Called again before the last ripple has left, it adds another
   * on top: both keep travelling, and the edge never jumps.
   */
  shift(x = this.width / 2, y = this.height / 2) {
    if (this.still) {
      this.depth += WAVE.shift;
      this.swell = 1;
      this.draw();
      return;
    }
    // `start` is filled in by the first frame it is drawn in, not here: a tab
    // that was in the background plays the ripple when it is looked at.
    //
    // `lead` is how far the nearest part of the frame is. The ring is timed
    // from there, not from the point itself: a ring that began as a point
    // would spend its first moments crossing the page, where there is no
    // frame to move, and the click would seem to do nothing. This way the
    // edge starts to move with the click, and the ring spreads on from there.
    let lead = Infinity;
    for (const p of this.points) lead = Math.min(lead, Math.hypot(p.x - x, p.y - y));
    lead = Math.max(0, lead - 1);
    this.ripples.push({
      x,
      y,
      lead,
      start: null,
      duration: this.duration,
      grow: this.swell < 1,
    });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  /**
   * Have the ripple just set off finish this many seconds from now, whatever
   * it was going to do — so it can end with something that began after it.
   * The stretch is over the whole ripple, so nothing on screen steps.
   */
  settleIn(seconds) {
    const r = this.ripples[this.ripples.length - 1];
    if (!r) return;
    const elapsed = r.start === null ? 0 : (performance.now() - r.start) / 1000;
    r.duration = Math.max(elapsed, 0) + seconds;
  }

  /**
   * Lay the hole's outline out as points, each with the direction it is pushed
   * in: straight out from the page, toward the screen's edge. A rounded
   * rectangle, walked clockwise from the top left.
   */
  measure() {
    const style = getComputedStyle(this.svg);
    const frame = parseFloat(style.getPropertyValue('--frame')) || 16;
    const radius = parseFloat(style.getPropertyValue('--frame-radius')) || 0;
    // The element's own box, not window.inner*: it is fixed at inset 0, so
    // this is the screen less any scrollbar — the same box the old frame had.
    const w = (this.width = this.svg.clientWidth);
    const h = (this.height = this.svg.clientHeight);

    const left = frame;
    const top = frame;
    const right = w - frame;
    const bottom = h - frame;
    const r = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2));

    const points = [];
    const side = (x0, y0, x1, y1, nx, ny) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      const count = Math.max(1, Math.round(length / WAVE.step));
      // Up to but not including the far end: the corner after it starts there.
      for (let i = 0; i < count; i++) {
        const t = i / count;
        points.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), nx, ny });
      }
    };
    const corner = (cx, cy, from) => {
      for (let i = 0; i < WAVE.corner; i++) {
        const a = from + (i / WAVE.corner) * (Math.PI / 2);
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        points.push({ x: cx + nx * r, y: cy + ny * r, nx, ny });
      }
    };

    side(left + r, top, right - r, top, 0, -1);
    corner(right - r, top + r, -Math.PI / 2);
    side(right, top + r, right, bottom - r, 1, 0);
    corner(right - r, bottom - r, 0);
    side(right - r, bottom, left + r, bottom, 0, 1);
    corner(left + r, bottom - r, Math.PI / 2);
    side(left, bottom - r, left, top + r, -1, 0);
    corner(left + r, top + r, Math.PI);

    this.points = points;
    // The push can never reach the screen's edge, or the frame would tear
    // open there — not with a crest on top of the wave, nor two. A pixel and a
    // half of frame is always left. (See draw(): this is approached, not hit.)
    this.limit = Math.max(0, frame - 1.5);
  }

  draw() {
    const { points, width: w, height: h, ripples, limit } = this;
    const scale = 1 / WAVE.wavelength;

    for (const r of ripples) {
      r.time = r.start === null ? 0 : (this.now - r.start) / 1000;
      // How far the ring has to go: the farthest corner of the screen from
      // where it started.
      r.far = Math.hypot(Math.max(r.x, w - r.x), Math.max(r.y, h - r.y));
    }
    const n = points.length;
    const xs = new Array(n);
    const ys = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let depth = this.depth;
      let swell = this.swell;
      let lift = 0;

      for (const r of ripples) {
        const distance = Math.hypot(p.x - r.x, p.y - r.y);
        // When the ring gets here: at once for the nearest place on the frame,
        // `travel` seconds later for the farthest, in step with the distance
        // in between. Then how far through its own swell this place is, 0..1.
        const moving = r.duration * RIPPLE.swell;
        const travel = r.duration - moving;
        const arrives = (travel * (distance - r.lead)) / Math.max(r.far - r.lead, 1);
        const through = Math.min((r.time - arrives) / moving, 1);
        // Not here yet: this place knows nothing about it.
        if (through <= 0) continue;

        // The new shape comes in as the swell goes over: none of it as the
        // ring arrives, all of it by the time it has passed.
        const arrived = smooth(through);
        depth += WAVE.shift * arrived;
        if (r.grow) swell = Math.max(swell, arrived);

        // The swell itself: a wave inside an envelope that rises from nothing
        // as the ring arrives and falls back to nothing as it leaves — so the
        // ripple begins and ends in the resting shape, with no step at either
        // end. Lower the further it has come.
        const envelope = Math.sin(Math.PI * through) ** 2;
        const worn = 1 - RIPPLE.fade * Math.min(distance / r.far, 1);
        lift +=
          RIPPLE.height * worn * envelope * Math.sin(through * (RIPPLE.crests + 1) * Math.PI * 2);
      }

      // Two swells: the long one, and a finer one on top of it that changes
      // faster from page to page, read from elsewhere in the noise so the two
      // never line up.
      const wave =
        (noise(p.x * scale, p.y * scale, depth) +
          WAVE.detail * noise(p.x * scale * 2.3 + 40, p.y * scale * 2.3 + 40, depth * 1.7 + 9)) /
        (1 + WAVE.detail);
      let push = wave * WAVE.amplitude * swell + lift;
      // Into the page there is room for any crest. Toward the screen's edge
      // there is only the frame's own width, so that way the push is eased
      // against the limit rather than cut off at it: a tall crest rounds over
      // under the edge instead of going flat along it.
      if (push > 0) push = limit * Math.tanh(push / limit);
      xs[i] = p.x + p.nx * push;
      ys[i] = p.y + p.ny * push;
    }

    // A smooth line through the points: each one is the control point of a
    // curve that runs from the midpoint before it to the midpoint after it.
    // The curves meet at those midpoints already pointing the same way, so
    // there is no corner anywhere — and it closes on itself the same way.
    const f = (v) => v.toFixed(1);
    let d = `M-1-1H${w + 1}V${h + 1}H-1Z`; // the screen, and a pixel past it
    d += `M${f((xs[n - 1] + xs[0]) / 2)} ${f((ys[n - 1] + ys[0]) / 2)}`;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      d += `Q${f(xs[i])} ${f(ys[i])} ${f((xs[i] + xs[j]) / 2)} ${f((ys[i] + ys[j]) / 2)}`;
    }
    this.path.setAttribute('d', d + 'Z');
  }

  tick(now) {
    this.now = now;
    for (const r of this.ripples) if (r.start === null) r.start = now;

    // A ripple that has run its time has changed every place there is. What
    // it carried becomes what the frame simply is.
    this.ripples = this.ripples.filter((r) => {
      if ((now - r.start) / 1000 < r.duration) return true;
      this.depth += WAVE.shift;
      if (r.grow) this.swell = 1;
      return false;
    });

    this.draw();

    // Still again once the last one has left. The loop ends here; nothing runs
    // until the next page.
    this.raf = this.ripples.length ? requestAnimationFrame(this.tick) : null;
  }

  resize() {
    this.measure();
    this.draw(); // now, not at the next tick: a drag-resize should not lag
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('resize', this.resize);
    document.documentElement.classList.remove('has-wave-frame');
    this.path.removeAttribute('d');
  }
}
