// <ndc-labels> — the cursor that carries the labels. One element, following
// the pointer with the site's lag (20% of the gap per frame, corrected for
// frame time), and saying whatever the thing under it declares: SCROLL over
// the hero, VIEW PROJECT over the video, the client and project over a
// selected project, the date and title over a blog post. The longer labels
// open with the site's clip-path, inset(100% 0 0 0) → inset(0), over 0.5 s.
//
// The labels are the ones in the templates as I shipped them.

import { Demo, reducedMotion, frameLoop } from './demo.js';

const SPEED = 0.2;

// Each target and what it declares. `label` is fixed cursor text; the rest
// come from data- attributes, the way the site read them.
const TARGETS = [
  { cls: 'is-video', label: 'VIEW PROJECT', x: 0.34, y: 0.3, w: 0.3, h: 0.34 },
  {
    cls: 'is-project',
    attrs: { client: 'Heineken', project: 'The focus' },
    x: 0.72, y: 0.18, w: 0.22, h: 0.46,
  },
  {
    cls: 'is-post',
    attrs: { 'blog-date': 'March 23, 2022', 'blog-title': 'The best football ads of all time.' },
    x: 0.08, y: 0.56, w: 0.24, h: 0.36,
  },
];

class NdcLabels extends Demo {
  stage() {
    const data = (t) =>
      Object.entries(t.attrs || {})
        .map(([k, v]) => `data-${k}="${v}"`)
        .join(' ');
    return `
      <div class="lbl" aria-label="A hero with a video, a project and a blog post. The cursor's label changes to whatever it is over.">
        ${TARGETS.map(
          (t, i) => `
          <div class="lbl__target ${t.cls}" data-i="${i}" ${data(t)}
            style="left:${t.x * 100}%;top:${t.y * 100}%;width:${t.w * 100}%;height:${t.h * 100}%"></div>`,
        ).join('')}
        <div class="lbl__cursor" aria-hidden="true">
          <span class="lbl__dot"></span>
          <span class="lbl__pill"></span>
          <span class="lbl__card"><b></b><span></span></span>
        </div>
      </div>`;
  }

  build() {
    this.box = this.querySelector('.lbl');
    this.cursor = this.querySelector('.lbl__cursor');
    this.pill = this.querySelector('.lbl__pill');
    this.card = this.querySelector('.lbl__card');
    this.targets = [...this.querySelectorAll('.lbl__target')];
    this.pointer = null;
    this.pos = null;
    this.over = undefined;
    this.t = 0;

    const local = (e) => {
      const r = this.box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.box.addEventListener('pointermove', (e) => (this.pointer = local(e)));
    this.box.addEventListener('pointerdown', (e) => (this.pointer = local(e)));
    this.box.addEventListener('pointerleave', () => (this.pointer = null));

    this.loop = frameLoop((now, ms) => this.step(ms));
    this.show(null);
  }

  onVisible(visible) {
    if (visible) this.loop.start();
    else this.loop.stop();
  }

  // With nobody here, a slow tour of the three targets and the open hero.
  autopilot() {
    const w = this.box.clientWidth;
    const h = this.box.clientHeight;
    const stops = [...TARGETS.map((t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 })), { x: 0.5, y: 0.82 }];
    const leg = 1.8; // s per stop
    const i = Math.floor(this.t / leg) % stops.length;
    const a = stops[i];
    const b = stops[(i + 1) % stops.length];
    const k = Math.min(1, Math.max(0, ((this.t % leg) - 1.1) / 0.7)); // dwell, then move
    return { x: (a.x + (b.x - a.x) * k) * w, y: (a.y + (b.y - a.y) * k) * h };
  }

  step(ms) {
    this.t += ms / 1000;
    const target =
      this.pointer ??
      (reducedMotion() ? { x: this.box.clientWidth / 2, y: this.box.clientHeight * 0.82 } : this.autopilot());

    // The site's lag: 20% of the gap per 60 Hz frame, whatever the display.
    this.pos ??= { ...target };
    const k = 1 - Math.pow(1 - SPEED, ms / (1000 / 60));
    this.pos.x += (target.x - this.pos.x) * k;
    this.pos.y += (target.y - this.pos.y) * k;
    this.cursor.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;

    // What's under the cursor — by its own position, as the site's was.
    const r = this.box.getBoundingClientRect();
    const under = document.elementFromPoint(r.left + this.pos.x, r.top + this.pos.y);
    const over = under?.closest?.('.lbl__target');
    const i = over && this.box.contains(over) ? +over.dataset.i : null;
    if (i !== this.over) this.show(i);
  }

  show(i) {
    this.over = i;
    const t = i === null ? null : TARGETS[i];
    const el = i === null ? null : this.targets[i];
    this.targets.forEach((x) => x.classList.toggle('is-over', x === el));

    let card = null;
    if (t?.attrs?.client) card = [el.dataset.client, el.dataset.project];
    else if (t?.attrs?.['blog-date']) card = [el.dataset.blogDate, el.dataset.blogTitle];

    this.pill.textContent = t?.label ?? (card ? '' : 'SCROLL');
    this.pill.hidden = !this.pill.textContent;
    // Every new label opens from closed, as the site restarted its mask.
    this.card.classList.remove('is-open');
    if (card) {
      this.card.querySelector('b').textContent = card[0];
      this.card.querySelector('span').textContent = card[1];
      void this.card.offsetWidth;
      this.card.classList.add('is-open');
    }

    this.readout.innerHTML = t?.attrs
      ? Object.entries(t.attrs)
          .map(([k, v]) => `data-${k}="${v}"`)
          .join('<br>')
      : `.cursor-${t ? 'view' : 'scroll'}<br>&nbsp;`;
  }
}

if (!customElements.get('ndc-labels')) customElements.define('ndc-labels', NdcLabels);
