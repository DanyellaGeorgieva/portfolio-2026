// <ndc-micro> — a sheet of the site's micro-animations, rebuilt from its
// stylesheets with the same timings. All of them are CSS; this element only
// builds the sheet and, with nobody hovering, plays them one after another.
//
//   VIEW        the eye's V slides out and I, E, W fade in 50 ms apart
//   MENU?       the label rolls over into its data-replace twin
//   Title       the label rolls over into a red, centred twin
//   LET'S TALK  the X from the logo rolls over into the K
//   Pagination  the current page's pill widens
//   Star        spins while hovered, 0.8 s a turn

import { Demo, reducedMotion, frameLoop } from './demo.js';

// The eye and its V, from the site's eye-v.svg.
const EYE =
  '<path d="M16 19C9.52 19 3.47 15.5 .21 9.87L0 9.5l.21-.37C3.47 3.5 9.52 0 16 0s12.53 3.5 15.79 9.13L32 9.5l-.21.37C28.53 15.5 22.48 19 16 19Zm-14.28-9.5C4.76 14.46 10.19 17.52 16 17.52s11.24-3.06 14.28-8.02C27.24 4.54 21.81 1.48 16 1.48S4.76 4.54 1.72 9.5Z"/>';

// The site's star.svg: four thin bars crossing, an eight-point asterisk.
const STAR = `<svg viewBox="-8 -8 16 16" aria-hidden="true">${[0, 45, 90, 135]
  .map((a) => `<rect x="-0.7" y="-8" width="1.4" height="16" transform="rotate(${a})"/>`)
  .join('')}</svg>`;

const SPECIMENS = [
  {
    name: 'view',
    html: `<span class="m-view"><svg class="m-view__eye" viewBox="0 0 32 19" aria-hidden="true">${EYE}</svg><span>V</span><span>I</span><span>E</span><span>W</span></span>`,
    note: 'V 14 → 0 px · I E W +50 ms',
  },
  {
    name: 'menu',
    // The swap sits inside the pill, so the pill's padding is outside the
    // window that hides the parked copy.
    html: '<span class="m-pill"><span class="m-swap" data-replace="MENU?"><span>MENU?</span></span></span>',
    note: 'attr(data-replace) · 0.3 s',
  },
  {
    name: 'title',
    html: '<span class="m-swap m-title" data-replace="Internal"><span>Internal</span></span>',
    note: 'a red twin, centred',
  },
  {
    name: 'talk',
    html: '<span class="m-talk">LET’S TAL<span class="m-talk__x"><span>X</span></span></span>',
    note: 'the logo’s X → K',
  },
  {
    name: 'pages',
    html: '<span class="m-pages"><i>1</i><i class="is-current">2</i><i>3</i></span>',
    note: 'width 32 → 64 px',
  },
  {
    name: 'star',
    html: `<span class="m-star">${STAR}</span>`,
    note: 'rotate 360° · 0.8 s',
  },
];

class NdcMicro extends Demo {
  stage() {
    return `
      <ul class="micro" aria-label="Six of the site's hover animations. Hover each one to play it.">
        ${SPECIMENS.map(
          (s) => `
          <li class="micro__cell" data-name="${s.name}">
            <span class="micro__stage" aria-hidden="true">${s.html}</span>
            <span class="micro__note">${s.note}</span>
          </li>`,
        ).join('')}
      </ul>`;
  }

  build() {
    this.cells = [...this.querySelectorAll('.micro__cell')];
    const sheet = this.querySelector('.micro');
    sheet.addEventListener('pointerover', (e) => {
      const cell = e.target.closest('.micro__cell');
      if (!cell) return;
      this.handOn = true;
      this.play(cell);
    });
    sheet.addEventListener('pointerleave', () => {
      this.handOn = false;
      this.play(null);
    });

    // With nobody hovering, each one plays in turn.
    this.t = 0;
    this.loop = frameLoop((now, ms) => {
      if (this.handOn) return;
      this.t += ms / 1000;
      const turn = Math.floor(this.t / 1.4);
      if (turn !== this.turn) {
        this.turn = turn;
        this.play(this.cells[turn % this.cells.length]);
      }
    });
    this.play(null);
  }

  onVisible(visible) {
    if (visible && !reducedMotion()) this.loop.start();
    else this.loop.stop();
  }

  play(cell) {
    this.cells.forEach((c) => c.classList.toggle('is-on', c === cell));
    this.readout.textContent = cell ? `${this.cells.indexOf(cell) + 1} of ${this.cells.length} · all CSS` : 'hover one';
  }
}

if (!customElements.get('ndc-micro')) customElements.define('ndc-micro', NdcMicro);
