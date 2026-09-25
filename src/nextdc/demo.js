// What the Next-DC diagrams share: the element that puts one on the page.
// Each diagram is its own module in this folder and builds on this one.
//
// A custom element for the same reason as the Melba jars and <vitosha-ridge>:
// swup swaps #swup without running the scripts inside it, and a defined
// element upgrades itself whenever it is inserted.
//
// The numbers in these demos are the site's own, read from its source
// (nextdc_frontend/src/js and src/scss).

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Next-DC's red, the one colour the diagrams borrow from the site: it marks
// whatever the diagram is about. Everything else is the palette's ink.
export const ACCENT = '#FF5E5E';

/**
 * A loop that runs only while its element is on screen: `start()` from
 * onVisible(true), `stop()` from onVisible(false). The callback gets the time
 * and the milliseconds since the last frame, capped so a background tab
 * doesn't arrive as one giant step.
 */
export function frameLoop(step) {
  let raf = 0;
  let last = 0;
  const tick = (now) => {
    const ms = Math.min(now - last, 100);
    last = now;
    step(now, ms);
    raf = requestAnimationFrame(tick);
  };
  return {
    start() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

// For ids inside the markup a demo builds.
let instances = 0;

/**
 * A demo on the page. Subclasses provide the stage (`stage()`), the controls
 * (`controls()`), wire them up (`build()`), and may react to coming on and
 * off screen (`onVisible(visible)`).
 *
 * Any children written in the page — the caption — are kept, and sit after
 * what the element builds.
 */
export class Demo extends HTMLElement {
  connectedCallback() {
    if (!this.stageEl) {
      this.uid = `ndc-${++instances}`;
      const authored = [...this.childNodes];

      this.stageEl = document.createElement('div');
      this.stageEl.className = 'demo__stage';
      this.stageEl.innerHTML = this.stage();

      // Controls are optional: a diagram that only needs watching has none.
      const controls = document.createElement('div');
      controls.className = 'controls';
      controls.innerHTML = this.controls?.() ?? '';

      this.readout = document.createElement('p');
      this.readout.className = 'readout';
      this.readout.setAttribute('aria-live', 'polite');

      this.replaceChildren(
        this.stageEl,
        ...(controls.innerHTML.trim() ? [controls] : []),
        this.readout,
        ...authored,
      );
      this.build();
    }

    this.views = new IntersectionObserver(([e]) => this.onVisible?.(e.isIntersecting), {
      rootMargin: '100px',
    });
    this.views.observe(this.stageEl);
  }

  disconnectedCallback() {
    this.views?.disconnect();
    this.onVisible?.(false);
  }

  /** The palette's ink, for anything drawn outside CSS. */
  get ink() {
    return getComputedStyle(this).color;
  }

  /** Mirror a group of aria-pressed buttons onto the one chosen. */
  press(selector, chosen) {
    this.querySelectorAll(selector).forEach((b) =>
      b.setAttribute('aria-pressed', String(chosen(b))),
    );
  }

  /** A button that flips between pressed and not, calling back with the state. */
  toggle(selector, onChange) {
    const b = this.querySelector(selector);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      onChange(on);
    });
  }
}
