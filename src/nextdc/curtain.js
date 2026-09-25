// <ndc-curtain> — the homepage's two curtains, side by side with the page they
// happen on.
//
// Left, what you see: the hero is pinned (pinSpacing: false, z −20), so the
// work slides up over it. At the bottom, the content lifts away and uncovers a
// footer that was underneath it all along.
//
// Right, what the page actually is. The footer is position: relative with
// bottom set to its own height and z-index −30: it paints one footer-height
// higher, tucked behind the end of the content, while its own slot stays in
// the layout — and that empty slot is exactly the scroll room the reveal
// needs. A ScrollTrigger pins it for that distance, and the content scrolls
// off it.

import { Demo, reducedMotion, frameLoop } from './demo.js';

// The page, in units of one viewport = 100. The footer is 60, standing in for
// the site's 600 px, so one unit reads as ten pixels.
const V = 100;
const HERO = 100;
const CONTENT = 260;
const F = 60;
const DOC = HERO + CONTENT + F;
const MAX = DOC - V; // how far the page scrolls
const PX = 10; // site pixels per unit

// Where each layer is on screen, for a scroll of s.
const layers = (s) => ({
  // Pinned from the top of the page for its own height, then released —
  // by then the work has covered it.
  hero: s <= HERO ? 0 : HERO - s,
  content: HERO - s,
  // Painted one footer-height up, then held at the bottom of the screen
  // once the content's end reaches it.
  footer: s < HERO + CONTENT - V ? HERO + CONTENT - F - s : V - F,
});

// The two panels, in SVG units.
const VIEW = { x: 10, y: 22, w: 150, h: 200 }; // 1.5 × 2 per unit
const MAP = { x: 214, y: 22, w: 84, h: 200 };
const my = (u) => MAP.y + (u / DOC) * MAP.h;

class NdcCurtain extends Demo {
  stage() {
    return `
      <svg class="curtain" viewBox="0 0 330 240" role="img"
        aria-label="The homepage scrolling: the work slides over a pinned hero, and at the end lifts off a footer pinned underneath it. Beside it, a map of the page showing the footer painted one footer-height above its own slot.">
        <defs>
          <clipPath id="${this.uid}-clip"><rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" rx="6"/></clipPath>
        </defs>

        <text class="curtain__title" x="${VIEW.x}" y="12">what you see</text>
        <g clip-path="url(#${this.uid}-clip)">
          <g data-layer="footer">
            <rect class="is-footer" x="${VIEW.x}" y="0" width="${VIEW.w}" height="${F * 2}"/>
            <text class="curtain__on-accent" x="${VIEW.x + 10}" y="${F * 2 - 14}">LET’S TALK</text>
          </g>
          <g data-layer="hero">
            <rect class="is-hero" x="${VIEW.x}" y="0" width="${VIEW.w}" height="${HERO * 2}"/>
            <text class="curtain__label" x="${VIEW.x + 10}" y="${HERO * 2 - 30}">hero</text>
            <text class="curtain__small" x="${VIEW.x + 10}" y="${HERO * 2 - 18}">pinned · z −20</text>
          </g>
          <g data-layer="content">
            <rect class="is-content" x="${VIEW.x}" y="0" width="${VIEW.w}" height="${CONTENT * 2}"/>
            ${[0, 1, 2, 3, 4, 5]
              .map(
                (i) =>
                  `<rect class="is-tile" x="${VIEW.x + 12 + (i % 2) * 66}" y="${24 + Math.floor(i / 2) * 150 + (i % 2) * 40}" width="60" height="80" rx="2"/>`,
              )
              .join('')}
            <text class="curtain__on-ink" x="${VIEW.x + 10}" y="16">the work</text>
          </g>
        </g>
        <rect class="curtain__frame" x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" rx="6"/>

        <text class="curtain__title" x="${MAP.x}" y="12">what the page is</text>
        <rect class="is-hero" x="${MAP.x}" y="${my(0)}" width="${MAP.w}" height="${my(HERO) - my(0)}"/>
        <rect class="is-content" x="${MAP.x}" y="${my(HERO)}" width="${MAP.w}" height="${my(HERO + CONTENT) - my(HERO)}"/>
        <!-- The footer where it paints: behind the end of the content. -->
        <rect class="curtain__painted" x="${MAP.x}" y="${my(HERO + CONTENT - F)}" width="${MAP.w}" height="${my(F) - my(0)}"/>
        <!-- …and the slot it leaves in the layout. -->
        <rect class="curtain__slot" x="${MAP.x}" y="${my(HERO + CONTENT)}" width="${MAP.w}" height="${my(F) - my(0)}"/>
        <text class="curtain__small" x="${MAP.x + 4}" y="${my(HERO + CONTENT) + 12}">its slot:</text>
        <text class="curtain__small" x="${MAP.x + 4}" y="${my(HERO + CONTENT) + 22}">600 px of scroll</text>
        <path class="curtain__arrow" d="M ${MAP.x + MAP.w + 6} ${my(HERO + CONTENT + F / 2)} C ${MAP.x + MAP.w + 18} ${my(HERO + CONTENT + F / 2)} ${MAP.x + MAP.w + 18} ${my(HERO + CONTENT - F / 2)} ${MAP.x + MAP.w + 6} ${my(HERO + CONTENT - F / 2)}"/>
        <text class="curtain__small" x="${MAP.x + MAP.w + 8}" y="${my(HERO + CONTENT) + 3}" transform="rotate(90 ${MAP.x + MAP.w + 22} ${my(HERO + CONTENT)})">bottom: 600px</text>
        <rect class="curtain__window" data-window x="${MAP.x - 3}" y="${my(0)}" width="${MAP.w + 6}" height="${my(V) - my(0)}" rx="3"/>
        <text class="curtain__small" x="${MAP.x - 7}" y="${my(V / 2)}" text-anchor="end" data-window-label>viewport</text>
      </svg>`;
  }

  controls() {
    return `
      <div class="row">
        <div class="ctl">
          <label for="${this.uid}-scroll">Scroll <output data-out></output></label>
          <input type="range" id="${this.uid}-scroll" min="0" max="${MAX}" step="1" value="0" />
        </div>
        <button type="button" class="btn" data-play aria-pressed="true">Play</button>
      </div>`;
  }

  build() {
    this.layerEls = Object.fromEntries(
      [...this.querySelectorAll('[data-layer]')].map((g) => [g.dataset.layer, g]),
    );
    this.windowEl = this.querySelector('[data-window]');
    this.windowLabel = this.querySelector('[data-window-label]');
    this.input = this.querySelector('input');
    this.output = this.querySelector('[data-out]');
    this.playBtn = this.querySelector('[data-play]');

    this.t = 0;

    this.input.addEventListener('input', () => {
      this.setPlaying(false);
      this.draw(+this.input.value);
    });
    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));

    // Down the page, a pause at each curtain, and back up again.
    this.loop = frameLoop((now, ms) => {
      if (!this.playing) return;
      this.t = (this.t + ms / 1000) % 9;
      this.draw(scrollAt(this.t));
    });

    // Asked for less motion, it waits partway down for a hand on the slider.
    this.draw(reducedMotion() ? 130 : 0);
    this.setPlaying(!reducedMotion());
  }

  setPlaying(on) {
    this.playing = on;
    this.playBtn.setAttribute('aria-pressed', String(on));
    this.playBtn.textContent = on ? 'Pause' : 'Play';
    if (on) this.t = timeAt(+this.input.value);
  }

  onVisible(visible) {
    if (visible) this.loop.start();
    else this.loop.stop();
  }

  draw(s) {
    const at = layers(s);
    const k = VIEW.h / V;
    for (const [name, g] of Object.entries(this.layerEls)) {
      g.setAttribute('transform', `translate(0 ${VIEW.y + at[name] * k})`);
    }
    this.windowEl.setAttribute('y', my(s));
    // Beside the window rather than under it, where the slot's own text is.
    this.windowLabel.setAttribute('y', my(s + V / 2) + 3);
    this.input.value = Math.round(s);
    this.output.textContent = `${Math.round(s * PX)} px`;

    const phase =
      s < HERO
        ? 'hero pinned: the work slides up over it'
        : s < HERO + CONTENT - V
          ? 'the page scrolls'
          : 'footer pinned: the page lifts off it';
    this.readout.textContent = phase;
  }
}

// The autoplay's scroll at time t (0–9 s): hold, down, hold, up.
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
function scrollAt(t) {
  if (t < 0.8) return 0;
  if (t < 5.8) return ease((t - 0.8) / 5) * MAX;
  if (t < 6.8) return MAX;
  return (1 - ease((t - 6.8) / 2.2)) * MAX;
}
// Where the autoplay picks up from a scrubbed position: on the way down.
function timeAt(s) {
  const target = s / MAX;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < target) lo = mid;
    else hi = mid;
  }
  return 0.8 + lo * 5;
}

if (!customElements.get('ndc-curtain')) customElements.define('ndc-curtain', NdcCurtain);
