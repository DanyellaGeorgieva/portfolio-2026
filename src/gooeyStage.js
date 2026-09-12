// GooeyStage — a merging-text stage built on an SVG feGaussianBlur +
// feColorMatrix filter.
//
// ============================================================================
// How the effect works, in one paragraph
// ============================================================================
// Blur spreads every shape's alpha outward. Where two blurred shapes are close,
// their faded edges overlap and sum into a middle value. feColorMatrix then
// takes that alpha channel and applies a steep linear ramp — alpha × slope +
// intercept — clamped to 0..1, which turns the soft gradient back into a hard
// edge. Anything that summed above the cut point becomes solid, anything below
// disappears. Two shapes near each other therefore weld into one silhouette
// with a curved neck between them, which is the "gooey" part.
//
// So the three numbers do three different jobs, and they are the only three
// worth tuning:
//
//   blur       — HOW FAR APART ELEMENTS STILL MERGE. Bigger blur, wider reach.
//   slope      — HOW SHARP THE MERGED EDGE IS. Bigger slope, crisper cut.
//   intercept  — WHERE the cut sits. With slope, the threshold lands at
//                alpha = -intercept / slope. Raising the magnitude of the
//                intercept eats into the shapes and makes the necks thinner.
//
// ============================================================================
// Architecture
// ============================================================================
// The filter lives on the *stage*, once. It has to: two elements can only merge
// if they are inside the same filter region, so a per-element filter would blur
// each one in isolation and nothing would ever weld. That single decision is
// what shapes everything else here.
//
// A GooeyItem therefore knows nothing about the filter. It knows its text and
// its position, and it expresses that position by writing three CSS custom
// properties. JS never touches layout rules; the stylesheet reads the variables
// and decides what they mean. Repositioning is a data change, never a markup or
// CSS change.

// ============================================================================
// Filter configuration — the tunables, all in one place
// ============================================================================
export const FILTER = {
  // Blur radius as a fraction of the stage's short side, not a fixed pixel
  // value. This is the reason the ResizeObserver below exists: a fixed blur
  // means elements merge at one distance on a desktop and a quite different
  // *relative* distance on a phone, so the composition falls apart at other
  // sizes even though the positions are proportional.
  // The working range is much narrower than it is for the usual gooey demo of
  // plain circles, and the reason is the letterforms. Blur has to stay well
  // under the stroke width or the ramp has nothing left to rebuild: at weight
  // 800 a stem is roughly a seventh of the type size, so a blur approaching
  // that dissolves the counters and the whole word collapses into a slug.
  // Measured on this face: legible up to about 8px at 115px type, gone by 15.
  blurRatio: 0.0085,

  blurMin: 3,
  // Above this, two things happen at once: letterforms stop surviving, and
  // Safari's filter cost climbs steeply. Neither is worth it.
  blurMax: 12,

  // The alpha ramp. 19 / -9 is the well-worn pair: a hard edge with necks that
  // still form at a comfortable distance.
  //   • raise slope alone → crisper edge, same reach
  //   • raise |intercept| alone → shapes shrink, necks thin and break sooner
  slope: 19,
  intercept: -9,
};

// ============================================================================
// The stage
// ============================================================================
export default class GooeyStage {
  /**
   * @param {HTMLElement} root      the element to build the stage inside
   * @param {Array<{id: string, text: string, x: number, y: number, scale?: number, tag?: string}>} items
   *        Positions are normalised 0..1 of the stage box — 0,0 is the top
   *        left, 1,1 the bottom right, 0.5,0.5 the centre. Adding an element is
   *        adding an entry to this array and nothing else.
   * @param {object} [filter]       overrides for FILTER above
   */
  constructor(root, items = [], filter = {}) {
    this.root = root;
    this.filter = { ...FILTER, ...filter };
    this.items = new Map();
    this.frame = null;

    // The effect is an expensive full-region filter, and the reduced-motion
    // preference is the clearest signal available that a visitor wants less of
    // this kind of thing. The stage still renders — the text is the content —
    // it simply renders as plain text.
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.filterId = `goo-${Math.random().toString(36).slice(2, 8)}`;

    this.build(items);
  }

  build(items) {
    this.root.classList.add('goo-stage');
    if (this.reduced) this.root.classList.add('goo-stage--plain');

    // --- the filter, defined once -------------------------------------------
    // Injected rather than written in the HTML so a page can host several
    // stages without colliding ids, and so the tunables have exactly one home.
    //
    // The region is deliberately oversized. A filter's default region is the
    // element's bounding box plus 10%, and blur reaches further than that —
    // anything near an edge gets its halo clipped, which shows up as a shape
    // that flattens against the boundary instead of rounding off. -50%/200%
    // gives the blur room on all four sides.
    //
    // color-interpolation-filters="sRGB" is not optional. The SVG default is
    // linearRGB, and in linear space the alpha ramp lands somewhere else
    // entirely: the classic symptom is a goo that looks washed out and grey
    // rather than solid.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'goo-stage__defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <filter id="${this.filterId}"
                x="-50%" y="-50%" width="200%" height="200%"
                color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blurred" />
          <feColorMatrix in="blurred" type="matrix" result="cut"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 ${this.filter.slope} ${this.filter.intercept}" />
          <!-- Composite the cut against the original so the colour inside the
               shape is the element's own, not the blurred average of it. -->
          <feComposite in="SourceGraphic" in2="cut" operator="atop" />
        </filter>
      </defs>`;
    this.blur = svg.querySelector('feGaussianBlur');
    this.root.append(svg);

    // --- the surface the items sit on ---------------------------------------
    // Separate from the root so the filter can be applied to *only* this layer.
    // Anything added to the stage outside it — a caption, a control, a legend —
    // is then unaffected, which matters because `filter` applies to an element
    // and every descendant with no way to opt a child out.
    this.surface = document.createElement('div');
    this.surface.className = 'goo-stage__surface';
    if (!this.reduced) this.surface.style.filter = `url(#${this.filterId})`;
    this.root.append(this.surface);

    items.forEach((item) => this.add(item));

    // --- resize --------------------------------------------------------------
    // Positions need no help: they are percentages, resolved by the browser.
    // What does need recomputing is anything expressed in absolute pixels —
    // the blur radius, and the type size the items are set at — because those
    // are what decide whether two elements at 0.4 and 0.6 still touch.
    //
    // Batched into a frame: ResizeObserver can fire several times during one
    // drag, and writing a style from inside its own callback can re-trigger it.
    //
    // A background tab does not run rAF, so a resize there is deferred until
    // the tab is looked at again. That is the right behaviour — nothing is
    // visible to be wrong in the meantime — but it does mean measure() is not
    // guaranteed to have run by the time the observer callback returns.
    this.observer = new ResizeObserver(() => {
      if (this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.measure();
      });
    });
    this.observer.observe(this.root);
    this.measure();
  }

  /**
   * Add one item. Returns its element.
   *
   * The element carries real text in a real heading or span — never an image,
   * never a path. It stays selectable, indexable, and readable by a screen
   * reader; the filter changes how it is painted and nothing else. No
   * decorative duplicates exist, so there is no second copy to keep in sync and
   * nothing that needs aria-hiding.
   */
  add({ id, text, x, y, scale = 1, tag = 'span' }) {
    const el = document.createElement(tag);
    el.className = 'goo-item';
    el.dataset.gooId = id;
    el.textContent = text;
    this.position(el, { x, y, scale });
    this.surface.append(el);
    this.items.set(id, { el, x, y, scale });
    return el;
  }

  /**
   * Move or rescale an item. JS writes variables; the stylesheet owns the rules
   * that read them. Nothing here knows how the item is laid out, so changing
   * the layout later is a stylesheet edit with no JS to follow.
   */
  position(el, { x, y, scale }) {
    el.style.setProperty('--blob-x', x);
    el.style.setProperty('--blob-y', y);
    el.style.setProperty('--blob-scale', scale);
  }

  /** Update one item by id — the API for repositioning from data. */
  update(id, next) {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, next);
    this.position(item.el, item);
  }

  /**
   * Recompute everything that is measured in pixels.
   *
   * stdDeviation is written here and only here. It is a filter primitive
   * attribute: changing it invalidates the filter and forces the whole region
   * to be re-rendered, which is far too expensive to do per frame. On resize —
   * rare, and already a heavy moment — it is fine. Anything that needs to
   * animate should animate transform on the items instead, which does not touch
   * the filter at all.
   */
  measure() {
    const box = this.root.getBoundingClientRect();
    if (!box.width || !box.height) return;

    const short = Math.min(box.width, box.height);
    const blur = Math.min(
      this.filter.blurMax,
      Math.max(this.filter.blurMin, short * this.filter.blurRatio),
    );

    if (!this.reduced) this.blur.setAttribute('stdDeviation', blur.toFixed(2));

    // Published so the stylesheet can size type against the same basis the blur
    // uses. If type scaled with the viewport while the blur scaled with the
    // stage, the two would drift apart and the merge distance would wander.
    this.root.style.setProperty('--goo-unit', `${short}px`);
    this.root.style.setProperty('--goo-blur', `${blur.toFixed(2)}px`);
  }

  destroy() {
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.root.classList.remove('goo-stage', 'goo-stage--plain');
    this.root.replaceChildren();
    this.items.clear();
  }
}
