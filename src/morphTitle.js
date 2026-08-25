// Gooey text morph for the pinned section title.
//
// Two copies of the word sit on top of each other. The outgoing one blurs out
// and fades while the incoming one blurs in, and the pair is fed through an SVG
// alpha threshold (see #threshold in chrome.html) which snaps every
// half-transparent pixel to either fully on or fully off. The two blur halos
// overlap in the middle of the transition, so the threshold reads them as a
// single shape and the letters appear to melt into each other rather than
// cross-fade. Comment the filter out in .morph to see the plain blur underneath.
//
// Adapted from the well-known "Morphing Text" pen: the blur/opacity curves are
// its, but this runs on demand — one morph per view change, driven from wherever
// the last one finished — instead of cycling a fixed list on a timer.

const MORPH_TIME = 0.9; // seconds for one word to become the next

// Blur in px at the very start of a word's arrival. The curve is BLUR/f - BLUR,
// so it falls to 0 as the fraction reaches 1 — sharp only at the very end, which
// is what keeps the letters gooey for most of the transition.
const BLUR = 8;
const MAX_BLUR = 100; // cap, since the curve is unbounded at f = 0

export default class MorphTitle {
  constructor(root) {
    this.root = root;
    [this.from, this.to] = root.querySelectorAll('.morph__text');

    this.text = ''; // what the title currently reads
    this.fraction = 1; // 0 = fully the old word, 1 = fully the new one
    this.frame = null;
    this.lastTime = 0;

    this.tick = this.tick.bind(this);

    // Honour a reduced-motion preference by swapping the word outright: the
    // whole effect is a large, fast blur, which is exactly what that setting
    // asks us not to do.
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Morph from whatever is showing to `text`. Same word: nothing to do. */
  morphTo(text) {
    if (text === this.text) return;

    this.from.textContent = this.text;
    this.to.textContent = text;
    this.text = text;

    if (this.reduced) {
      this.settle();
      return;
    }

    // Restart from zero even if a morph is already running: `from` now holds
    // whatever was showing, so the new one picks up from the current word
    // rather than snapping back to the one before it.
    this.fraction = 0;
    this.lastTime = performance.now();
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
  }

  /** Whether the title is shown at all (home only — detail pages have their own). */
  setVisible(visible) {
    this.root.classList.toggle('is-hidden', !visible);
  }

  tick(now) {
    this.fraction += (now - this.lastTime) / 1000 / MORPH_TIME;
    this.lastTime = now;

    if (this.fraction >= 1) {
      this.frame = null;
      this.settle();
      return;
    }

    this.paint(this.to, this.fraction);
    this.paint(this.from, 1 - this.fraction);
    this.frame = requestAnimationFrame(this.tick);
  }

  /**
   * One layer's share of the transition. `f` runs 0 → 1 as the layer arrives:
   * blur collapses to nothing and opacity rises on a shallow curve, so the word
   * is legible well before it is fully opaque.
   */
  paint(el, f) {
    el.style.filter = `blur(${Math.min(BLUR / f - BLUR, MAX_BLUR)}px)`;
    el.style.opacity = `${Math.pow(f, 0.4) * 100}%`;
  }

  /** End state: the new word sharp and solid, the old one gone. */
  settle() {
    this.fraction = 1;
    this.to.style.filter = '';
    this.to.style.opacity = '100%';
    this.from.style.filter = '';
    this.from.style.opacity = '0%';
  }

  dispose() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
