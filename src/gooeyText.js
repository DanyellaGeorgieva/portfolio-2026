// Text melting in: nothing → gooey → crisp, across every piece of copy in a
// section.
//
// ============================================================================
// Why one animated number is enough
// ============================================================================
// The filter is a blur followed by a steep alpha ramp. A stroke has to survive
// the blur with enough alpha left to clear the ramp's cut point; a stroke
// blurred past that is simply not drawn. So the whole sequence falls out of
// moving the blur radius alone:
//
//   blur well above the stroke width → every stroke falls under the cut → nothing
//   blur near the stroke width       → strokes survive as fat welded blobs → goo
//   blur at zero                     → the letterforms as drawn → crisp text
//
// No opacity is involved in that. The disappearance at the start is the
// threshold doing it, which is why it reads as letters that have not formed yet
// rather than letters turned down.
//
// ============================================================================
// Why the blur is a ratio and not a number
// ============================================================================
// What "too blurred to survive" means depends entirely on stroke width, and
// stroke width scales with type size. Nine pixels of blur erases a 25px title
// beautifully — and erases 16px body copy so thoroughly that no amount of
// un-blurring brings it back cleanly, because the ramp has nothing left to
// rebuild from by the time the strokes are that thin relative to the radius.
//
// Expressing the start blur as a fraction of each element's own font size means
// one constant covers a 48px heading and a 25px title alike, and each melts
// through exactly the same three stages at its own scale. A second tier of
// hand-tuned numbers per text size — which is the obvious alternative — would
// need retuning every time a size changed.
//
// ============================================================================
// Why small copy fades instead
// ============================================================================
// The ratio makes the effect *survivable* at any size. It does not make it
// worth watching at any size.
//
// Goo is a shape effect: what you are seeing is strokes welding into each other
// and pulling apart again, and rounded terminals where corners used to be. That
// needs strokes thick enough, and counters open enough, for the welding to be
// legible as welding. On a 14px meta line the whole letter is about as wide as
// the blur radius, so there is no intermediate shape to read — it goes from
// absent to present through a grey smudge, which is a fade with extra steps and
// a filter repaint on every frame.
//
// So below GOO_MIN_SIZE the same reveal is driven on opacity instead. Same
// duration, same stagger, same easing curve — it takes its place in the
// sequence exactly as a gooey element would, and the effect stays somewhere it
// reads as an effect.
//
// ============================================================================
// The cost
// ============================================================================
// stdDeviation is a filter primitive attribute: changing it invalidates the
// filter and forces its region to be re-rendered. It is the expensive thing to
// animate, and the only property that produces this effect — so the cost is
// managed by scope rather than avoided:
//
//   • only while a section is arriving, never on scroll, hover or idle
//   • the filter is removed outright when each element lands, so the resting
//     page is ordinary text with no filter on it at all
//   • elements below the fold are skipped: nothing animates where nobody is
//     looking, which is what keeps a long section from costing more than a
//     short one

const TEMPLATE_ID = 'goo-title'; // the filter defined once in frame.html

// Start blur as a fraction of the element's font size. 0.35 puts every stroke
// comfortably under the ramp's cut point at any size — measured, a 25px title
// vanishes at 9px of blur, which is this ratio. Lower it and the reveal begins
// with ghosts already on screen.
const START_RATIO = 0.35;

// Where goo stops being worth it, in px of computed font size. The gap it sits
// in is real and the type scale keeps it that way — measured across both kinds
// of page, at the narrow end of every clamp:
//
//   goo    .page__title 48 · .project__title 32 · .section__lead 22 ·
//          .page__heading 21.6 · .section__label 21.6 · .page__lead 20
//   fade   .project__blurb 19.2 · .section__body 18.4 · .page__body 16.8 ·
//          .page__meta 15.2 · .section__meta 14.4 · .page__eyebrow 12
//
// Nothing lands on the wrong side of 20 at any viewport width, and the nearest
// pair is 19.2 against 20. That is a narrow gap: move the type scale and this
// wants re-checking against it.
const GOO_MIN_SIZE = 20;

const DURATION = 1100;

// The gap between one element and the next, and the most the whole set may be
// spread across. The cap is what lets the same settings serve a four-line
// section and a case study: 170ms is the right feel for a handful of elements,
// but a case study has thirteen above the fold, and 12 × 170 would leave the
// last paragraph sitting blank for 2.2s before it even started — long enough to
// read as broken rather than as staged. Past the cap the step closes up instead
// and the reveal keeps its overall length.
//
// Short sections never reach the cap, so their pacing is untouched.
const STAGGER = 170;
const SPREAD_MAX = 900;

// Every piece of copy in a top-level section or a case study. Deliberately a
// structural selector rather than a class list: a page gets the reveal by
// having text in it, so new copy is covered without anyone remembering to opt
// it in. Which of the two reveals it gets is then decided by its size, not by
// its markup.
//
// dt/dd and li are in the list because a case study says a good deal in its
// standing head and its numbered findings, and leaving them out would have the
// prose arrive around two blocks that were simply already there.
//
// Deliberately NOT in the list: .back and .page__exit. Those are ways out, not
// copy — the escape hatch has its own show-on-scroll-up behaviour to stay out
// of, and the exit nav is below the fold on every case study anyway.
const TEXT = ':is(.section, .page) :is(h1, h2, h3, h4, p, dt, dd, li, .contact__email)';

// Cubic ease-out — 1 - (1 - t)³ — the curve the shader eases its own uniforms
// on, so the copy settles at the pace the field does.
const ease = (t) => 1 - (1 - t) ** 3;

export default class GooeyText {
  /** @param {ParentNode} root  the view to find copy inside */
  constructor(root) {
    this.frame = null;
    this.items = [];
    this.defs = document.querySelector(`#${TEMPLATE_ID}`)?.parentNode ?? null;

    // A large, fast change across every word on the page is exactly what this
    // preference asks us not to do. The copy is simply there, unfiltered.
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const template = document.querySelector(`#${TEMPLATE_ID}`);
    if (this.reduced || !template || !root) return;

    const elements = [...root.querySelectorAll(TEXT)].filter(
      (el) => el.textContent.trim() && el.getBoundingClientRect().top < window.innerHeight,
    );

    this.items = elements.map((el, i) => {
      const size = parseFloat(getComputedStyle(el).fontSize) || 16;

      // Small copy carries no filter at all — not a filter left idle, none
      // cloned in the first place. Nothing to repaint, and nothing to clean up.
      if (size < GOO_MIN_SIZE) return { el, blur: null };

      // Each gooey element gets its own filter, so they can be staggered. One
      // shared filter would be a single DOM write per frame instead of several,
      // but it invalidates every region at once anyway — the rendering work is
      // the same, and the stagger is lost for nothing.
      const clone = template.cloneNode(true);
      clone.id = `${TEMPLATE_ID}-${i}`;
      this.defs.append(clone);

      return { el, blur: clone.querySelector('feGaussianBlur'), start: size * START_RATIO, id: clone.id };
    });
  }

  /** Park everything at the start of the reveal: blurred past the cut point,
   *  or — for small copy — simply transparent. Either way, not on screen. */
  reset() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.items.forEach(({ el, blur, start, id }) => {
      if (!blur) {
        el.style.opacity = '0';
        return;
      }
      el.style.filter = `url(#${id})`;
      blur.setAttribute('stdDeviation', start.toFixed(2));
    });
  }

  /**
   * Melt it in. Safe to call again — a running reveal restarts.
   *
   * @param onDone called once the last element has landed. Also called
   *   immediately when there is nothing to reveal — a page with no copy above
   *   the fold, or prefers-reduced-motion, where the constructor collects no
   *   items at all. "The reveal has finished" is true in both cases, and a
   *   caller waiting on it should not be left hanging by the quiet path.
   */
  play(onDone) {
    // Held on the instance rather than closed over, so a restart replaces it:
    // reset() cancels the running frame, so the old tick can never fire a
    // callback that has since been superseded.
    this.onDone = onDone;

    if (!this.items.length) {
      onDone?.();
      return;
    }
    this.reset();

    const started = performance.now();
    const step = Math.min(STAGGER, SPREAD_MAX / Math.max(1, this.items.length - 1));

    const tick = (now) => {
      let running = false;

      this.items.forEach(({ el, blur, start }, i) => {
        const t = (now - started - i * step) / DURATION;

        if (t <= 0) {
          running = true;
          return;
        }
        if (t >= 1) {
          // Landed. Both kinds clear their inline property rather than being
          // left at the resting value. For the fade that is tidiness; for the
          // filter it matters — a zero-radius blur is a no-op, but the ramp
          // behind it still runs, and thresholding the glyphs' own anti-aliased
          // edges leaves them subtly chewed. Removing it gives the real
          // letterforms back, and costs nothing between reveals.
          if (blur) el.style.filter = 'none';
          else el.style.opacity = '';
          return;
        }

        running = true;
        // The same eased 0→1, spent on the only property each kind has.
        if (blur) blur.setAttribute('stdDeviation', (start * (1 - ease(t))).toFixed(2));
        else el.style.opacity = ease(t).toFixed(3);
      });

      if (running) {
        this.frame = requestAnimationFrame(tick);
        return;
      }
      this.frame = null;
      this.onDone?.();
    };

    this.frame = requestAnimationFrame(tick);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.onDone = null;
    this.items.forEach(({ el, blur }) => {
      blur?.closest('filter')?.remove();
      el.style.filter = '';
      el.style.opacity = '';
    });
    this.items = [];
  }
}
