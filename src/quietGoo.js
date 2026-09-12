// A quiet goo on the projects you are not pointing at.
//
// The dimming next to it is CSS — one opacity on .project__link, the same rule
// shape the header uses. This file exists because the goo cannot be.
//
// ============================================================================
// Why this is not a CSS transition
// ============================================================================
// Measured in Chrome, driving the transition from an explicit timeline so a
// throttled tab could not lie about it: a CSS filter list that contains a url()
// is not interpolable. Sampled at the midpoint of a 1s linear transition —
//
//   blur(0px)            → blur(10px)            = blur(5px)   ✓ interpolates
//   blur(0px) url(#goo)  → blur(10px) url(#goo)  = blur(10px)  ✗ snaps
//   none                 → url(#goo)             = url(#goo)   ✗ snaps
//
// — so the goo would pop on, and (worse) pop off the instant the cursor left,
// while the opacity beside it was still fading. Animating stdDeviation on the
// filter itself is the only way to get a goo that arrives and leaves at the
// same pace as the dimming it belongs to.
//
// ============================================================================
// How much goo
// ============================================================================
// Measured on these titles — 32px, weight 800, uppercase — by rendering the
// same string through the filter at a ladder of values:
//
//   0 … 0.5   indistinguishable from unfiltered text
//   0.8       terminals just beginning to round
//   1.2       rounded, letters starting to touch
//   1.6       counters tightening, the joins spreading  ← here
//   2.24      full melt: M/E welded, G closing up
//
// The top of that ladder is the ceiling rather than a far-off extreme: past
// about 2 the letters stop being letters, and a row you are *not* pointing at
// still has to be readable — it is being stood down, not taken away.
//
// Held as a fraction of the title's own font size, the way the reveal holds
// its own start blur, so the look survives a change to the type scale.
const QUIET_RATIO = 0.05; // 1.6px at 32px

// The resting value is a real 0, and the ladder above is why that is safe: the
// ramp behind the blur does not chew strokes this thick, so a title sitting at
// stdDeviation 0 renders exactly as unfiltered text. That is what lets the
// filter stay attached between hovers instead of being added and removed.
const RESTING = 0;

// Matched to the 0.2s opacity on .project__link, so the two halves of the
// gesture are one gesture.
const DURATION = 200;

const TEMPLATE_ID = 'goo-title';
const ease = (t) => 1 - (1 - t) ** 3;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export default class QuietGoo {
  /** @param {ParentNode} root  the view to find a projects list inside */
  constructor(root) {
    this.frame = null;
    this.items = [];
    this.list = root?.querySelector('.projects') ?? null;

    const template = document.querySelector(`#${TEMPLATE_ID}`);
    // Continuous blur changes across a list of headings is exactly what this
    // preference asks us not to do. The rows simply dim, which CSS does alone.
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.list || !template || this.reduced) return;

    const defs = template.parentNode;

    this.items = [...this.list.querySelectorAll('.project__link')].map((link, i) => {
      const el = link.querySelector('.project__title');
      if (!el) return null;

      // One filter per title rather than one shared: the hovered row has to sit
      // at 0 while its neighbours sit at QUIET, so they cannot read the same
      // stdDeviation. Three filters is also what lets the hovered row ease back
      // down instead of snapping when the cursor moves to another row.
      const clone = template.cloneNode(true);
      clone.id = `goo-quiet-${i}`;
      defs.append(clone);

      const size = parseFloat(getComputedStyle(el).fontSize) || 16;
      return {
        link,
        el,
        blur: clone.querySelector('feGaussianBlur'),
        id: clone.id,
        quiet: size * QUIET_RATIO,
        value: RESTING,
        from: RESTING,
        to: RESTING,
        started: 0,
      };
    }).filter(Boolean);

    if (!this.items.length) return;

    // Four bubbling events rather than enter/leave on each link: moving from one
    // row to the next fires an out and an over in an order that is not worth
    // reasoning about, and sync() does not care — it reads the finished state
    // rather than tracking it.
    this.list.addEventListener('pointerover', this.schedule);
    this.list.addEventListener('pointerout', this.schedule);
    this.list.addEventListener('focusin', this.schedule);
    this.list.addEventListener('focusout', this.schedule);
  }

  // Read on the next frame, not on the event: during a pointerout the element
  // being left can still match :hover, and asking one frame later gets the
  // answer the stylesheet has already settled on. That makes the CSS the single
  // source of truth for "which row is live" — this file never keeps its own.
  schedule = () => {
    if (this.pending) return;
    this.pending = requestAnimationFrame(this.sync);
  };

  sync = () => {
    this.pending = null;
    const live = this.list.querySelector('.project__link:hover, .project__link:focus-visible');
    const now = performance.now();
    let changed = false;

    this.items.forEach((item) => {
      // Nothing hovered anywhere: everything goes home. Otherwise the live row
      // is the sharp one and every other row thickens.
      const to = !live ? RESTING : item.link === live ? RESTING : item.quiet;
      if (to === item.to) return;

      // Attached lazily, and re-attached here every time, because the reveal
      // owns this same inline property while a section is arriving and clears
      // it on landing. Asserting it on each hover means a hover that lands
      // mid-reveal repairs itself on the next one instead of staying broken.
      item.el.style.filter = `url(#${item.id})`;
      item.from = item.value;
      item.to = to;
      item.started = now;
      changed = true;
    });

    if (changed && !this.frame) this.frame = requestAnimationFrame(this.tick);
  };

  tick = (now) => {
    let running = false;

    this.items.forEach((item) => {
      const t = clamp01((now - item.started) / DURATION);
      if (t < 1) running = true;
      item.value = item.from + (item.to - item.from) * ease(t);
      item.blur.setAttribute('stdDeviation', item.value.toFixed(2));
    });

    this.frame = running ? requestAnimationFrame(this.tick) : null;
  };

  destroy() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.pending);
    this.frame = null;
    this.pending = null;
    this.list?.removeEventListener('pointerover', this.schedule);
    this.list?.removeEventListener('pointerout', this.schedule);
    this.list?.removeEventListener('focusin', this.schedule);
    this.list?.removeEventListener('focusout', this.schedule);
    this.items.forEach(({ el, blur }) => {
      blur.closest('filter')?.remove();
      el.style.filter = '';
    });
    this.items = [];
  }
}
