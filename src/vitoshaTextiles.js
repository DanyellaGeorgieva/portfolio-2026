// <vitosha-textiles> — the teaser's end screen on each of its three textiles,
// one at a time, crossfading.
//
// The images are authored in the page, so they are there (and processed by
// the build) before any of this runs; the element only stacks them into one
// stage and puts the controls under it. Every visit to the real site lands on
// one textile at random, so this is the only place all three are seen side by
// side — in time rather than in space.
//
// It advances by itself while it is on screen, and stops for good the moment
// anyone picks a textile: that is a choice, and a carousel that then moves on
// from it would overrule the reader — and it is also the way to stop the
// motion, which anything moving for longer than five seconds must offer. It
// holds still while the pointer is over it or focus is inside it. A reader who
// asks for reduced motion gets no autoplay and no sweep, only the switch.
//
// The change is a sweep rather than a fade: the next textile is drawn across
// from the left behind a soft, slanted edge, like cloth pulled over the one
// before. The edge is a mask; the choreography is in main.scss.
//
// Usage:
//   <vitosha-textiles>
//     <img src="…" alt="…" />  ×3
//     <p class="caption">…</p>
//   </vitosha-textiles>

const INTERVAL = 4000; // ms each textile is shown for while playing

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class VitoshaTextiles extends HTMLElement {
  connectedCallback() {
    // swup can re-insert the same element; build once.
    if (!this.stage) this.build();

    this.playing = !reducedMotion && !this.stopped;
    this.visible = false;
    this.held = false;
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.observer.observe(this);
    this.sync();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    clearTimeout(this.timer);
  }

  build() {
    const images = [...this.querySelectorAll(':scope > img')];
    const authored = [...this.querySelectorAll(':scope > :not(img)')];
    this.index = 0;

    this.stage = document.createElement('div');
    this.stage.className = 'textiles__stage';
    images.forEach((img, i) => {
      img.classList.add('textiles__img');
      img.decoding = 'async';
      // Only the first is on screen at load; the rest can wait their turn.
      if (i) img.loading = 'lazy';
      this.stage.append(img);
    });
    this.images = images;

    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <div class="row">
        <div class="seg" role="group" aria-label="Textile">
          ${images.map((_, i) => `<button type="button" data-textile="${i}" aria-pressed="false">Textile ${i + 1}</button>`).join('')}
        </div>
      </div>`;

    controls.querySelectorAll('[data-textile]').forEach((b) =>
      b.addEventListener('click', () => {
        this.show(+b.dataset.textile);
        this.stop();
      }),
    );

    // Hold still while someone is looking closely: pointer over it, or focus
    // anywhere inside it.
    const hold = (on) => {
      this.held = on;
      this.schedule();
    };
    this.addEventListener('pointerenter', () => hold(true));
    this.addEventListener('pointerleave', () => hold(false));
    this.addEventListener('focusin', () => hold(true));
    this.addEventListener('focusout', (e) => {
      if (!this.contains(e.relatedTarget)) hold(false);
    });

    this.replaceChildren(this.stage, controls, ...authored);
  }

  show(i) {
    const next = (i + this.images.length) % this.images.length;
    if (next === this.index) return;
    // The one going becomes the ground the next is swept over; any earlier
    // leaver is let go, so a quick second click never stacks three.
    this.images.forEach((img) => img.classList.remove('is-leaving'));
    const leaving = this.images[this.index];
    leaving.classList.add('is-leaving');
    leaving.addEventListener('animationend', () => leaving.classList.remove('is-leaving'), { once: true });
    // Only now does a change animate: the first textile is simply there.
    this.stage.classList.add('is-live');
    this.index = next;
    this.sync();
  }

  stop() {
    this.playing = false;
    // Remembered across swup re-insertions: a reader who chose one meant it.
    this.stopped = true;
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.playing || !this.visible || this.held) return;
    this.timer = setTimeout(() => {
      this.show(this.index + 1);
      this.schedule();
    }, INTERVAL);
  }

  sync() {
    this.images.forEach((img, i) => {
      const current = i === this.index;
      img.classList.toggle('is-current', current);
      // The hidden ones are still in the DOM for the crossfade; keep them out
      // of the accessibility tree so only the one on screen is announced.
      img.toggleAttribute('aria-hidden', !current);
    });
    this.querySelectorAll('[data-textile]').forEach((b) =>
      b.setAttribute('aria-pressed', String(+b.dataset.textile === this.index)),
    );
  }
}

if (!customElements.get('vitosha-textiles')) customElements.define('vitosha-textiles', VitoshaTextiles);
