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
// Held as a fraction of the element's own font size, the way the reveal holds
// its own start blur, so the look survives a change to the type scale.
//
// It is a fraction per list rather than one for the site, because the ratio is
// NOT size-invariant — which is worth knowing before reusing this. Laddered
// again at nav size (17.6px, same weight and case):
//
//   0.88   barely rounded        ← what the projects' 0.05 gives at this size
//   1.1    clearly gooey, legible
//   1.32   NTA beginning to merge
//   1.6    letters merging badly
//   2.0    illegible
//
// 1.6px is comfortable on a 32px title and destroys a 17.6px link. The blur
// scales with the type, but the gaps between letters do not scale with it —
// tracking and hinting keep them proportionally tighter as the type gets
// smaller, so small text welds sooner and wants a bigger fraction to reach the
// same look without closing up.

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

/**
 * The two lists that do this. Same behaviour, different furniture — which is
 * the whole reason this takes a config rather than naming .projects inside:
 * the header and the work list were going to drift apart the moment one of
 * them needed a fix.
 *
 *   list  the container whose hover state decides who is quiet
 *   item  the things that can be hovered inside it
 *   text  what actually thickens, within an item
 *   name  prefix for the cloned filters, so two instances cannot collide
 */
export const PROJECT_GOO = {
  list: '.projects',
  item: '.project__link',
  text: '.project__title',
  name: 'goo-quiet-project',
  ratio: 0.05, // 1.6px at 32px
};

export const NAV_GOO = {
  list: '.site-header',
  item: 'a',
  // The label, not the link: the link also holds an eye, and a filter on the
  // link would thicken that too.
  text: '.site-header__label',
  name: 'goo-quiet-nav',
  ratio: 0.0625, // 1.1px at 17.6px
};

// Same treatment as the nav, on the palette numbers under it. A smaller
// fraction than the nav's for the reason above: at 12px the nav's 0.0625 welded
// the digits into blobs, where it only softens the nav's words.
export const PICKER_GOO = {
  list: '.picker__list',
  item: '.picker__link',
  text: '.picker__num',
  name: 'goo-quiet-picker',
  ratio: 0.04, // 0.48px at 12px
};

export default class QuietGoo {
  /**
   * @param {ParentNode} root    where to look for the list
   * @param {object}     config  one of the two above
   */
  constructor(root, config) {
    this.frame = null;
    this.items = [];
    this.config = config;
    this.list = root?.querySelector(config.list) ?? null;

    const template = document.querySelector(`#${TEMPLATE_ID}`);
    // Continuous blur changes across a list of headings is exactly what this
    // preference asks us not to do. The rows simply dim, which CSS does alone.
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.list || !template || this.reduced) return;

    const defs = template.parentNode;

    this.items = [...this.list.querySelectorAll(config.item)].map((link, i) => {
      const el = link.querySelector(config.text);
      if (!el) return null;

      // One filter per title rather than one shared: the hovered row has to sit
      // at 0 while its neighbours sit at QUIET, so they cannot read the same
      // stdDeviation. Three filters is also what lets the hovered row ease back
      // down instead of snapping when the cursor moves to another row.
      const clone = template.cloneNode(true);
      clone.id = `${config.name}-${i}`;
      defs.append(clone);

      const size = parseFloat(getComputedStyle(el).fontSize) || 16;
      return {
        link,
        el,
        blur: clone.querySelector('feGaussianBlur'),
        id: clone.id,
        quiet: size * config.ratio,
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
    const { item } = this.config;
    const live = this.list.querySelector(`${item}:hover, ${item}:focus-visible`);
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
