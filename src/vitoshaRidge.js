// The contours. One copy, under public/, because the widget kit in the same
// case study reads the same two files by URL and cannot be given an import.
// Pointing both at one place is what keeps it one file and one request instead
// of two of each. Same origin, which is what lets the measuring step read their
// pixels off a canvas.
const TOP = '/assets/vitosha-top_D.svg';
const BOTTOM = '/assets/vitosha-bottom_D.svg';

// <vitosha-ridge> — the Vitosha cloth that opens its case study.
//
// Plain 2D canvas: the two contours measured column by column into lists of
// heights, a band filled between them, drifting sideways for ever. It draws the
// shape the WebGL version drew at a fraction of the cost — no three, no second
// WebGL context, no mesh. What it gives up is the drag.
//
// It keeps the shaping mask, which is the part that reads as the teaser rather
// than as a mountain graphic: the bending eases off across the width and the
// last stretch of cloth hangs flat. On the real site that is the clean zone the
// labels sit in.
//
// The framing numbers are the site's own (distortConfig / DISTORT_PROFILES), so
// the silhouette matches the teaser's rather than being redrawn by eye.
//
// It is a custom element rather than the snippet's inline <script> because
// scripts inside #swup are not re-run when swup swaps a page in: an inline
// version would draw on a full load and never again. A defined custom element
// upgrades itself whenever it is inserted.
//
// Colour: filled with the element's own computed `color`, read on every frame,
// so it inherits the palette's ink and cross-fades with the rest of the page.
//
// Usage:
//   <vitosha-ridge></vitosha-ridge>
//   <vitosha-ridge data-speed="0.012" data-start="0.6" data-mask-end="0.79"></vitosha-ridge>

const LIST = 1024; // heights per contour
const RASTER_H = 1024; // how tall each contour is rasterised before measuring

// The site's own framing and amplitudes.
const TOP_MAX = 0.85; // how far the ridge rises
const BOTTOM_MAX = -0.25; // how the hem answers
const BAND = 0.55; // cloth height, share of the view
const DROP = -0.12; // how far down the cloth hangs
const WIDE = 2; // how wide the contour is drawn (panoramaScale)
const MASK_END = 0.79; // where the shaping has eased off completely
const MASK_FALLOFF = 0.2; // how long it takes to get there
const IMAGE_ASPECT = 2049 / 319;

/* ---- measure an SVG into a list of heights ------------------------
   Column by column, top down, to the first pixel of the line. Then the
   two ends are eased together so the list repeats, and each value is
   averaged with its neighbours to take out the whole-pixel steps. */
async function measure(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();

  const w = LIST;
  // Drawn tall on purpose, rather than at the contour's own aspect. Each height
  // is stored as a FRACTION of the bitmap, so stretching it vertically changes
  // no shape — it only buys resolution. At its own aspect the top contour
  // rasterises 80px tall, which quantises every height to a 1/80 step: measured,
  // the ridge then held still for several frames and hopped 1.3px at once, which
  // is the stepping you see as a jump. At RASTER_H the step is under a fifth of
  // a pixel at the size this draws.
  const h = RASTER_H;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;

  const heights = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let top = h;
    for (let y = 0; y < h; y++) {
      if (px[(y * w + x) * 4 + 3] > 20) {
        top = y;
        break;
      }
    }
    heights[x] = 1 - top / h;
  }

  // make the ends agree, so it can loop for ever
  const ends = Math.floor(w * 0.08);
  const target = (heights[0] + heights[w - 1]) / 2;
  for (let i = 0; i < ends; i++) {
    const t = i / ends;
    const ease = t * t * (3 - 2 * t);
    heights[i] = target * (1 - ease) + heights[i] * ease;
    const j = w - 1 - i;
    heights[j] = target * (1 - ease) + heights[j] * ease;
  }

  // average with the immediate neighbours
  const smooth = Float32Array.from(heights);
  for (let x = 0; x < w; x++) {
    const a = heights[(x - 1 + w) % w];
    const b = heights[x];
    const c2 = heights[(x + 1) % w];
    smooth[x] = (a + b + c2) / 3;
  }
  return smooth;
}

// Measured once for the whole site, however many ridges ask: the lists are the
// same every time, and each measuring reads a full 1024-wide bitmap.
const lists = new Map();
const measureOnce = (url) => {
  if (!lists.has(url)) lists.set(url, measure(url));
  return lists.get(url);
};

// Wrapping lookup with the same linear interpolation the GPU gave the height
// texture, so the profile is as smooth between samples as it was on the mesh.
const at = (list, u) => {
  const f = (((u % 1) + 1) % 1) * (LIST - 1);
  const i = Math.floor(f);
  const k = f - i;
  return list[i] * (1 - k) + list[(i + 1) % LIST] * k;
};

// The places, at their positions along the panorama — the teaser's own numbers.
// A peak and the neighbourhood under it share an x: that pairing is the piece,
// each summit answered by the part of Sofia at its foot.
const PEAKS = [
  { name: 'Kopitoto', x: 0.1586 },
  { name: 'Kamen Del', x: 0.2788 },
  { name: 'Bistrishko Branishte', x: 0.3594 },
  { name: 'Zlatnite Mostove', x: 0.5233 },
  { name: 'Aleko', x: 0.5778 },
  { name: 'Momina Skala', x: 0.6377 },
  { name: 'Cherni Vrah', x: 0.7592 },
];

const PLACES = [
  { name: 'Knyazhevo', x: 0.1586 },
  { name: 'Simeonovo', x: 0.2788 },
  { name: 'Boyana', x: 0.3594 },
  { name: 'Ovcha Kupel', x: 0.5233 },
  { name: 'Dragalevtsi', x: 0.5778 },
  { name: 'Borisova Gradina', x: 0.6377 },
  { name: 'Cinema Lumière', x: 0.7592, star: true },
  { name: 'Toplocentrala', x: 0.793, star: true },
];

// The two festival venues are marked with a star rather than a dot, as they are
// on the teaser's last screen: they are the only places you can actually go to.
const STAR =
  '<svg class="vitosha-ridge__star" viewBox="0 0 23 22" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M15.929 12.5401L20.4094 18.7037L15.929 22L11.3921 15.7832' +
  'L7.01459 21.7073L2.64375 18.4176L7.17401 12.5401L0 10.0553L1.72708 4.92289L8.7948 7.46084' +
  'V0H14.3148V7.46084L21.3792 5.13577L23 10.2715L15.929 12.5401Z" /></svg>';

// Below this much shaping a label has nothing to point at: the cloth is flat
// there, so the marker fades out with the ridge it belongs to.
const MARKER_FADE = 0.35;

// What one frame is worth, and the point past which a frame is late rather than
// slow. 50ms is three frames at 60Hz and one and a half at 30: long enough not
// to fire on an ordinary busy frame, short enough to catch a real stall.
const FRAME = 1000 / 60;
const LATE_FRAME = 50;

// How long a flick takes to give itself up, as an exponential time constant:
// after TAU the throw has spent about two thirds of the difference between its
// own speed and the drift's. Long enough to feel like weight, short enough that
// the cloth is back to its own pace within a couple of seconds.
const TAU = 520;

// The fastest a throw may leave the hand, in panoramas per second. A flick is
// measured between two pointer events, and two that arrive close together can
// report a speed nothing on screen should ever move at — measured, a quick drag
// handed back 14 panoramas a second, which is the width of this element forty
// times over. Two thirds of a panorama a second is fast and still a mountain.
const MAX_THROW = 0.75;

// How much of the recent past a throw is measured over, and the least it can be
// measured across at all. 90ms is a few frames of movement — enough to be a
// gesture rather than a twitch.
const THROW_WINDOW = 90;
const MIN_THROW_MS = 25;

// How solid the cloth is. Short of opaque, so the field behind it carries
// through the mountain rather than stopping at it — the shader is the ground
// this whole site stands on, and a silhouette that blacks it out reads as a
// hole cut in the page. Override per element with data-opacity.
const CLOTH_ALPHA = 0.82;

// GLSL's smoothstep, because the mask it shapes is the shader's own.
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

class VitoshaRidge extends HTMLElement {
  connectedCallback() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.append(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      // The names are HTML, not painted into the canvas — sharp at any size,
      // selectable, and readable by a screen reader, which is the whole
      // argument the case study makes below about the teaser's own labels.
      this.markers = document.createElement('ul');
      this.markers.className = 'vitosha-ridge__markers';
      this.places = [...PEAKS.map((p) => ({ ...p, side: 'peak' })),
                     ...PLACES.map((p) => ({ ...p, side: 'place' }))]
        .map((place) => {
          const el = document.createElement('li');
          el.className = `vitosha-ridge__marker vitosha-ridge__marker--${place.side}`;
          el.innerHTML = `${place.star ? STAR : '<i class="vitosha-ridge__dot"></i>'}<span>${place.name}</span>`;
          this.markers.append(el);
          return { ...place, el, shown: null };
        });
      this.append(this.markers);

      this.speed = +this.dataset.speed || 0.012; // panoramas drifting past per second
      this.maskEnd = this.dataset.maskEnd === undefined ? MASK_END : +this.dataset.maskEnd;
      this.maskFalloff =
        this.dataset.maskFalloff === undefined ? MASK_FALLOFF : +this.dataset.maskFalloff;
      this.offset = this.dataset.start === undefined ? 0.6 : +this.dataset.start;
      this.alpha = this.dataset.opacity === undefined ? CLOTH_ALPHA : +this.dataset.opacity;
      this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Panoramas per second. It starts at the drift's own pace and returns to
      // it after a throw — one number covers the ambient movement, the flick
      // and the settling back, so there are no modes to be in.
      this.velocity = this.drift;
      this.w = 0;
      this.h = 0;

      this.canvas.addEventListener('pointerdown', this.onDown);
      this.canvas.addEventListener('pointermove', this.onMove);
      this.canvas.addEventListener('pointerup', this.onUp);
      this.canvas.addEventListener('pointercancel', this.onUp);
    }

    this.playing = true;
    this.last = performance.now();

    this.resizes = new ResizeObserver(() => {
      this.size();
      this.draw();
    });
    this.resizes.observe(this);

    // Nothing moves while it is off screen.
    this.views = new IntersectionObserver(([e]) => {
      this.playing = e.isIntersecting;
    });
    this.views.observe(this);

    Promise.all([
      measureOnce(this.dataset.top || TOP),
      measureOnce(this.dataset.bottom || BOTTOM),
    ])
      .then(([top, bottom]) => {
        this.top = top;
        this.bottom = bottom;
        this.hidden = false;
        this.size();
        this.draw();
        this.frame = requestAnimationFrame(this.tick);
      })
      // No contours, no cloth: it takes up no space rather than leaving a gap
      // where a drawing was meant to be.
      .catch(() => {
        this.hidden = true;
      });
  }

  /** The pace it moves at when nobody is touching it. */
  get drift() {
    return this.still ? 0 : this.speed;
  }

  /** How much of one panorama is across the element, at its current size. */
  get tiles() {
    return this.w / (this.h * BAND * IMAGE_ASPECT) / WIDE;
  }

  disconnectedCallback() {
    this.resizes?.disconnect();
    this.views?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.clientWidth;
    this.h = this.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw = () => {
    const { ctx, w, h, top, bottom } = this;
    if (!top || !bottom || !w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(this).color; // the palette's ink
    ctx.globalAlpha = this.alpha;

    // The same framing the mesh had: a band of the view's height, hung below
    // centre, with the contour drawn WIDE panoramas across.
    const cloth = h * BAND;
    const middle = h / 2 - h * DROP;
    const tiles = this.tiles;
    const step = 2; // px between samples

    // How much of the shaping survives at this column: full on the left, gone
    // by maskEnd. Past there both edges sit at their resting height and the
    // cloth hangs flat — the shader's mask, in two dimensions.
    const mask = (x) => 1 - smoothstep(this.maskEnd - this.maskFalloff, this.maskEnd, x / w);

    // Both edges as functions of a screen column, so the markers can ask for
    // the same heights the cloth is drawn from rather than a second guess at
    // them. This is the case study's "one map, two readers" in miniature.
    const ridgeY = (x) =>
      middle - cloth / 2 - (at(top, (x / w) * tiles + this.offset) - 0.5) * TOP_MAX * cloth * mask(x);
    const hemY = (x) =>
      middle + cloth / 2 - (at(bottom, (x / w) * tiles + this.offset) - 0.5) * BOTTOM_MAX * cloth * mask(x);

    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      const y = ridgeY(x);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let x = w; x >= 0; x -= step) ctx.lineTo(x, hemY(x));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    this.placeMarkers(ridgeY, hemY, mask, tiles);
  };

  /**
   * Put each name on the cloth, where its own column has ended up.
   *
   * The panorama is drawn from a moving window into a list that repeats, so a
   * place is on screen only while its position falls inside that window:
   * turning a position into a column is the drawing's own sum run backwards.
   */
  placeMarkers(ridgeY, hemY, mask, tiles) {
    const { w } = this;

    this.places.forEach((place) => {
      // Where this place sits in the window right now, as a fraction of one
      // panorama, wrapped into 0–1. Past `tiles` it is off the right edge.
      const ahead = (((place.x - this.offset) % 1) + 1) % 1;
      const x = (ahead / tiles) * w;
      const shaping = x <= w ? mask(x) : 0;
      const shown = shaping > MARKER_FADE;

      if (shown !== place.shown) {
        place.el.classList.toggle('is-shown', shown);
        place.shown = shown;
      }
      if (!shown) return;

      const y = place.side === 'peak' ? ridgeY(x) : hemY(x);
      place.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // It goes with the ridge it belongs to: as the shaping eases off toward
      // the right, the name that pointed at a summit fades out with it.
      place.el.style.opacity = Math.min(1, (shaping - MARKER_FADE) / 0.25).toFixed(2);
    });
  }

  tick = (now) => {
    const elapsed = now - this.last;
    this.last = now;

    // A frame that arrives late is a gap, not movement. The browser hands back
    // the real elapsed time after a stall — another tab, a scroll that had work
    // to do, one of the widgets further down this very page recomputing its
    // pipeline — and spending all of it at once moves the cloth by six frames
    // in the time of one. Measured: the old clamp let a stalled frame jump
    // ~3.5px where a normal one moves 0.58px, which is the hop you could see.
    //
    // So a late frame is worth exactly one frame of drift; only real frames
    // carry their own time.
    const dt = elapsed > LATE_FRAME ? FRAME : elapsed;

    // While a hand is on it, the hand is the only thing moving it.
    if (this.playing && !this.dragging) {
      // Whatever speed it is going, it is always giving that up in favour of
      // the drift. A throw is just a large head start on that, and the drift is
      // the case where there is nothing to give up — which is why this one line
      // serves the ambient movement, the flick and the settle alike.
      this.velocity += (this.drift - this.velocity) * (1 - Math.exp(-dt / TAU));
      if (this.velocity) {
        this.offset += (this.velocity * dt) / 1000;
        this.draw();
      }
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  onDown = (event) => {
    this.dragging = true;
    this.dragX = event.clientX;
    this.velocity = 0; // taken out of the drift; the hand decides now
    // Where it has been, so releasing can ask how fast it was going. A short
    // history rather than the gap between the last two events: those two can
    // arrive in the same millisecond, which measures as no speed at all or an
    // impossible one, and the last twitch before letting go is not the throw.
    this.history = [{ t: event.timeStamp, offset: this.offset }];
    this.classList.add('is-dragging');
    this.canvas.setPointerCapture(event.pointerId);
  };

  onMove = (event) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragX;
    this.dragX = event.clientX;

    // Dragging right pulls the panorama back the way it came.
    this.offset -= (dx / this.w) * this.tiles;

    this.history.push({ t: event.timeStamp, offset: this.offset });
    while (this.history.length > 2 && event.timeStamp - this.history[0].t > THROW_WINDOW) {
      this.history.shift();
    }

    this.draw();
  };

  onUp = (event) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.classList.remove('is-dragging');

    // How far it travelled across the window, over how long: that is the speed
    // it keeps going at. Too short a window to measure, and it simply rejoins
    // the drift rather than guessing.
    const first = this.history[0];
    const span = (event?.timeStamp ?? performance.now()) - first.t;
    const thrown = span >= MIN_THROW_MS ? ((this.offset - first.offset) / span) * 1000 : this.drift;
    this.velocity = Math.max(-MAX_THROW, Math.min(MAX_THROW, thrown));
    this.history = null;

    // The drag's own frames are not the loop's: without this the first tick
    // after a release would bill it for the whole time the hand was down.
    this.last = performance.now();
  };
}

if (!customElements.get('vitosha-ridge')) {
  customElements.define('vitosha-ridge', VitoshaRidge);
}
