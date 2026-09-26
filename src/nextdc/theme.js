// <ndc-theme> — the dark mode. The top of the homepage in Next-DC's own
// colours: click the sun in the corner and html.dark goes on, Tailwind's
// class-based dark mode takes over, and every section fades its background
// over 0.3 s. The light hero goes dark while the dark work section goes light,
// the red headline turns green and "guide" turns brown. The copy is the
// homepage's current one.
//
// The header over the work is the case the site needed an extra rule for:
// it takes the section's colour, so under html.dark it has to invert too.

import { Demo, reducedMotion, frameLoop } from './demo.js';

// The sun from the hero's corner: eight rays round a filled disc.
const SUN = `
  <svg class="thm__sun" viewBox="-14 -14 28 28" aria-hidden="true">
    <circle r="6.2" fill="currentColor"/>
    ${Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return `<line x1="${(c * 8.5).toFixed(2)}" y1="${(s * 8.5).toFixed(2)}" x2="${(c * 13).toFixed(2)}" y2="${(s * 13).toFixed(2)}" stroke="currentColor" stroke-width="2.4"/>`;
    }).join('')}
  </svg>`;

class NdcTheme extends Demo {
  stage() {
    return `
      <div class="thm" role="img" aria-label="The Next-DC homepage in light mode. Clicking the sun in the corner flips it to dark: the hero goes dark, the work section goes light, and the headline turns from red to green.">
        <div class="thm__hero">
          <span class="thm__title">in a world of<br>constant change</span>
          <span class="thm__line">
            <button type="button" class="thm__switch" aria-label="Switch dark mode">${SUN}</button>
            <span class="thm__sub">we <em>guide</em> businesses<br>through cultural currents.</span>
          </span>
        </div>
        <div class="thm__work">
          <div class="thm__bar"><span>work · dna · services · team</span></div>
          <div class="thm__tiles"><i></i><i></i><i></i></div>
        </div>
      </div>`;
  }

  build() {
    this.frame = this.querySelector('.thm');
    // A click on the sun flips it, and flips it back. The first click also
    // stops the autoplay, so the page stays the way it was left.
    this.querySelector('.thm__switch').addEventListener('click', () => this.set(!this.dark, true));

    this.t = 0;
    this.loop = frameLoop((now, ms) => {
      if (this.handOn) return;
      this.t += ms / 1000;
      const dark = Math.floor(this.t / 2.4) % 2 === 1;
      if (dark !== this.dark) this.set(dark, false);
    });
    this.set(false, false);
  }

  onVisible(visible) {
    if (visible && !reducedMotion()) this.loop.start();
    else this.loop.stop();
  }

  set(dark, byHand) {
    if (byHand) this.handOn = true;
    this.dark = dark;
    this.frame.classList.toggle('is-dark', dark);
    this.readout.innerHTML = dark
      ? '&lt;html class="dark"&gt; · hero #161616 · work #EBEBEB<br>html.dark #header.dark → light'
      : '&lt;html&gt; · hero #EBEBEB · work #161616<br>#header.dark';
  }
}

if (!customElements.get('ndc-theme')) customElements.define('ndc-theme', NdcTheme);
