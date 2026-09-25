// <ndc-roll> — "Two copies, one window". The homepage's three subtitle rows,
// rolling the way they did on the site: each line twice, in a box one line
// tall, moved from yPercent 50 to −50 on the site's own text-ease curve.
//
// "Show the window" draws what the overflow normally hides: the box, and the
// copies above and below it.

import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Demo, reducedMotion } from './demo.js';

gsap.registerPlugin(CustomEase);

// The site's curve, exactly as utils.js created it: most of the way there in
// the first third, then a long settle.
const TEXT_EASE = CustomEase.create(
  'text-ease',
  'M0,0 C0,0.408 0.242,0.657 0.295,0.709 0.346,0.76 0.584,1 1,1',
);
const DURATION = 0.6;
const STAGGER = 0.1;

// The homepage's own subtitle.
const LINES = ['An independent creative agency', 'helping brands navigate the', 'unknown since 2010.'];

// The curve plot, in its own units.
const PLOT_W = 200;
const PLOT_H = 110;

class NdcRoll extends Demo {
  stage() {
    const pair = (line) => `<div class="roll__pair"><div>${line}</div><div>${line}</div></div>`;
    return `
      <div class="roll" role="img" aria-label="${LINES.join(' ')} — each line rolling into view.">
        ${LINES.map(
          (line) => `
          <div class="roll__row">
            <div class="roll__ghost" aria-hidden="true">${pair(line)}</div>
            <div class="roll__window" aria-hidden="true">${pair(line)}</div>
          </div>`,
        ).join('')}
      </div>
      <figure class="roll__plot">
        <canvas aria-label="The text-ease curve, with the first row's progress along it"></canvas>
        <figcaption>text-ease</figcaption>
      </figure>`;
  }

  controls() {
    return `
      <div class="row">
        <button type="button" class="btn" data-replay>Replay</button>
        <div class="seg" role="group" aria-label="Speed">
          <button type="button" data-speed="1" aria-pressed="true">1×</button>
          <button type="button" data-speed="0.2" aria-pressed="false">⅕×</button>
        </div>
        <button type="button" class="btn" data-xray aria-pressed="false">Show the window</button>
      </div>`;
  }

  build() {
    // Each row moves its real pair and its ghost together.
    this.rows = [...this.querySelectorAll('.roll__row')].map((row) => row.querySelectorAll('.roll__pair'));
    this.all = this.rows.flatMap((r) => [...r]);
    this.speed = 1;

    const canvas = this.querySelector('.roll__plot canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = PLOT_W * dpr;
    canvas.height = PLOT_H * dpr;
    this.ctx = canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.querySelector('[data-replay]').addEventListener('click', () => this.play());
    this.querySelectorAll('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        this.speed = +b.dataset.speed;
        this.press('[data-speed]', (x) => x === b);
        this.play();
      }),
    );
    this.toggle('[data-xray]', (on) => this.classList.toggle('is-xray', on));

    // Parked where the site parks them: a line below the window, out of sight.
    gsap.set(this.all, { yPercent: 50 });
    this.report(0);
  }

  // ScrollTrigger's "play reset play reset": roll in whenever it comes on
  // screen, and go back to waiting whenever it leaves.
  onVisible(visible) {
    if (visible === this.shown) return;
    this.shown = visible;
    if (!visible) this.reset();
    else if (reducedMotion()) this.settle();
    else this.play();
  }

  play() {
    this.tl?.kill();
    gsap.set(this.all, { yPercent: 50 });
    this.tl = gsap.timeline({ onUpdate: () => this.report(this.tl.time()) });
    this.rows.forEach((pairs, i) =>
      this.tl.to(pairs, { yPercent: -50, duration: DURATION, ease: TEXT_EASE }, i * STAGGER),
    );
    this.tl.timeScale(this.speed);
  }

  reset() {
    this.tl?.kill();
    gsap.set(this.all, { yPercent: 50 });
    this.report(0);
  }

  // Where the roll ends, without the roll.
  settle() {
    this.tl?.kill();
    gsap.set(this.all, { yPercent: -50 });
    this.report(DURATION + STAGGER * (LINES.length - 1));
  }

  /** The readout and the plot, at time t into the roll. */
  report(t) {
    const p = Math.min(1, Math.max(0, t / DURATION)); // the first row's progress
    const y = 50 - 100 * TEXT_EASE(p);
    this.readout.innerHTML =
      `row 1 · ${t.toFixed(2)} s · yPercent ${y.toFixed(0)}<br>` +
      `${DURATION} s per row · ${STAGGER} s apart · play reset play reset`;
    this.plot(p);
  }

  plot(p) {
    const { ctx } = this;
    const ink = this.ink;
    const pad = 6;
    const w = PLOT_W - pad * 2;
    const h = PLOT_H - pad * 2;
    const at = (x, v) => [pad + x * w, pad + (1 - v) * h];

    ctx.clearRect(0, 0, PLOT_W, PLOT_H);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;

    // Linear, for comparison.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(...at(0, 0));
    ctx.lineTo(...at(1, 1));
    ctx.stroke();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      ctx[i ? 'lineTo' : 'moveTo'](...at(x, TEXT_EASE(x)));
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(...at(p, TEXT_EASE(p)), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

if (!customElements.get('ndc-roll')) customElements.define('ndc-roll', NdcRoll);
