// <ndc-grid> — the work grids, in miniature. The page scrolls; the middle
// column (.preview:nth-child(3n − 1)) drifts from −100 to +100 px against it,
// scrubbed to the scroll, so the grid never reads as a spreadsheet.
//
// Hover a tile and it does what the site's did: the still scales to 1.2
// inside its frame, the corners round off over 0.5 s, and the looping video
// appears in the middle at 80% width, framed by the image. With nobody
// hovering, the tiles take turns.

import { Demo, reducedMotion, frameLoop } from './demo.js';

const TILES = 12;
const DRIFT = 100; // px either way, the site's own
const SCALE = 0.25; // the diagram's px per site px

class NdcGrid extends Demo {
  stage() {
    const tile = (i) => `
      <div class="grid__tile" data-i="${i}">
        <div class="grid__frame">
          <div class="grid__still"></div>
          <div class="grid__video"><i></i></div>
        </div>
        <span class="grid__line"></span>
        <span class="grid__line grid__line--short"></span>
      </div>`;
    return `
      <div class="grid" role="img" aria-label="A three-column grid of project tiles scrolling past, its middle column drifting against the scroll. A hovered tile zooms its still, rounds its corners and shows a video inside.">
        <div class="grid__page">
          ${Array.from({ length: TILES }, (_, i) => tile(i)).join('')}
        </div>
      </div>`;
  }

  controls() {
    return `
      <div class="row">
        <button type="button" class="btn" data-drift aria-pressed="true">Middle column drift</button>
      </div>`;
  }

  build() {
    this.view = this.querySelector('.grid');
    this.page = this.querySelector('.grid__page');
    this.tiles = [...this.querySelectorAll('.grid__tile')];
    this.middle = this.tiles.filter((_, i) => i % 3 === 1);
    this.drift = true;
    this.hovering = null;
    this.t = 0;

    this.toggle('[data-drift]', (on) => {
      this.drift = on;
      this.place();
    });

    this.view.addEventListener('pointerover', (e) => {
      const tile = e.target.closest('.grid__tile');
      if (tile) this.hover(tile, true);
    });
    this.view.addEventListener('pointerleave', () => this.hover(null, true));

    this.loop = frameLoop((now, ms) => {
      this.t += ms / 1000;
      this.place();
      // With no pointer on the grid, a tile every 1.6 s shows its hover.
      if (!this.handOn) {
        const turn = Math.floor(this.t / 1.6);
        if (turn !== this.turn) {
          this.turn = turn;
          this.hover(this.tiles[[4, 0, 7, 2, 9, 5][turn % 6]], false);
        }
      }
    });
    this.place();
  }

  onVisible(visible) {
    if (visible && !reducedMotion()) this.loop.start();
    else this.loop.stop();
  }

  hover(tile, byHand) {
    this.handOn = byHand && !!tile;
    this.tiles.forEach((t) => t.classList.toggle('is-hover', t === tile));
    this.report(tile);
  }

  // The scroll, ping-ponging over the page, and the middle column against it.
  place() {
    const span = Math.max(0, this.page.offsetHeight - this.view.clientHeight);
    const p = (1 - Math.cos((this.t / 7) * Math.PI)) / 2; // 0 → 1 → 0 every 14 s
    const scroll = p * span;
    const drift = this.drift ? (-DRIFT + 2 * DRIFT * p) * SCALE : 0;
    this.page.style.transform = `translateY(${-scroll}px)`;
    this.middle.forEach((t) => (t.style.transform = `translateY(${drift}px)`));
    this.driftPx = this.drift ? Math.round(-DRIFT + 2 * DRIFT * p) : 0;
    if (!this.lastReport || performance.now() - this.lastReport > 200) this.report(this.current);
  }

  report(tile = this.current) {
    this.current = tile;
    this.lastReport = performance.now();
    this.readout.innerHTML =
      `.preview:nth-child(3n − 1) · y ${this.driftPx ?? 0} px<br>` +
      (tile ? 'hover: still ×1.2 · radius 0 → 24 px · video 80%' : 'hover a tile');
  }
}

if (!customElements.get('ndc-grid')) customElements.define('ndc-grid', NdcGrid);
