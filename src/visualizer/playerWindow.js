// The window the visualizer plays in: a droplet of the ink, floating over the
// field, with the video in it and a mute button and a progress line under that.
//
// Everything it shows it reads from player.js. This file is only the furniture
// — the box, the buttons, the words under them.
//
// It opens and closes at once: clicked, it is there; closed, it is gone.

import { tracks, watchUrl } from './tracks.js';
import * as player from './player.js';

// What the line under the controls says. Playing with the sound on, paused and
// ended say nothing — the video shows those itself, and is clicked to play or
// pause. The line is only for what you could not tell by looking.
const STATUS = {
  idle: '',
  loading: 'Loading…',
  paused: '',
  ended: '',
  error: '',
};
const PLAYING_MUTED = 'Playing muted · sound on to feel the beat';

const ICONS = {
  sound:
    '<path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/><path d="M13 7.2a4 4 0 0 1 0 5.6M15 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  muted:
    '<path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/><path d="M13.5 7.5l4 5M17.5 7.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  close:
    '<path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export default class PlayerWindow {
  /**
   * @param {HTMLElement} root the section it belongs to. Anything inside it
   *   with data-visualizer-track="<index>" opens that track when clicked, and
   *   the window is put at the end of it.
   */
  constructor(root) {
    this.root = root;
    this.isOpen = false;
    this.origin = null;
    this.frame = null;
    // One thing at a time: an open and a close asked for together play in the
    // order they were asked, each from where the last one finished.
    this.queue = Promise.resolve();

    this.build();

    root.addEventListener('click', this.onTrigger);
    this.unsubscribe = player.subscribe(this.render);
  }

  build() {
    const el = document.createElement('section');
    el.className = 'vplayer';
    el.setAttribute('aria-label', 'Visualizer player');
    // Focusable by script, so focus can be moved here on open — but not a stop
    // of its own on the way through the page.
    el.tabIndex = -1;
    el.hidden = true;
    // No headings and no paragraphs in here: gooeyText.js reveals every one of
    // those it finds in a section, and this is not copy.
    el.innerHTML = `
      <div class="vplayer__content">
        <div class="vplayer__head">
          <button type="button" class="vplayer__button" data-act="close" aria-label="Close player">${icon('close')}</button>
        </div>
        <div class="vplayer__video"><div class="vplayer__mount"></div></div>
        <div class="vplayer__fallback" hidden>
          <span>This one won't play here</span>
          <a target="_blank" rel="noopener">Watch on YouTube</a>
        </div>
        <div class="vplayer__controls">
          <button type="button" class="vplayer__button" data-act="mute"></button>
          <div class="vplayer__progress"><div class="vplayer__progress-fill"></div></div>
        </div>
        <div class="vplayer__status" aria-live="polite"></div>
      </div>`;

    const find = (selector) => el.querySelector(selector);
    this.el = el;
    this.content = find('.vplayer__content');
    this.video = find('.vplayer__video');
    this.fallback = find('.vplayer__fallback');
    this.fallbackLink = find('.vplayer__fallback a');
    this.muteButton = find('[data-act="mute"]');
    this.fill = find('.vplayer__progress-fill');
    this.status = find('.vplayer__status');

    el.addEventListener('click', this.onAct);
    this.root.append(el);
    this.render();
  }

  // --- Opening and closing --------------------------------------------------

  /**
   * Play track `index`, showing the window if it is not open yet. Already
   * open, the video is simply swapped: same window, same player. `origin` is
   * what it goes back into when it closes.
   */
  open(index, origin = null) {
    if (!tracks[index]) return this.queue;
    // Whatever opened it last is where it goes back to, and where focus does.
    if (origin) this.origin = origin;
    return this.enqueue(async () => {
      if (this.isOpen) {
        player.load(index);
        return;
      }
      this.isOpen = true;
      this.el.hidden = false;
      player.mount(this.el.querySelector('.vplayer__mount'));
      player.load(index);
      document.addEventListener('keydown', this.onKey);
      this.frame = requestAnimationFrame(this.tick);
      // Under the intro on a narrow screen, so it may open below the fold.
      if (getComputedStyle(this.el).position !== 'fixed') {
        this.el.scrollIntoView({ block: 'nearest', behavior: this.reduced ? 'auto' : 'smooth' });
      }
      this.el.focus({ preventScroll: true });
    });
  }

  /** Back into whatever opened it, and the video paused. */
  close() {
    return this.enqueue(async () => {
      if (!this.isOpen) return;
      this.isOpen = false;
      player.pause();
      document.removeEventListener('keydown', this.onKey);
      cancelAnimationFrame(this.frame);
      if (this.origin?.isConnected) this.origin.focus({ preventScroll: true });
      else this.el.blur();
      this.el.hidden = true;
    });
  }

  enqueue(step) {
    this.queue = this.queue.then(step).catch((err) => console.error('[visualizer]', err));
    return this.queue;
  }

  get reduced() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // --- What it shows --------------------------------------------------------

  // An arrow function, like the handlers below: it is handed to subscribe().
  render = () => {
    const state = player.getState();
    const muted = player.isMuted();
    const track = player.currentTrack();
    const failed = state === 'error';

    // The fallback stands where the video was, never over it.
    this.video.hidden = failed;
    this.fallback.hidden = !failed;
    if (track) this.fallbackLink.href = watchUrl(track.id);

    this.muteButton.innerHTML = icon(muted ? 'muted' : 'sound');
    this.muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.muteButton.disabled = failed;

    this.status.textContent =
      state === 'playing' ? (muted ? PLAYING_MUTED : '') : STATUS[state];
  };

  // The progress bar, every frame while the window is open. It reads the
  // smooth clock, so it glides rather than stepping with the iframe's reports.
  tick = () => {
    const duration = player.getDuration();
    const done = duration > 0 ? Math.min(player.getVideoTime() / duration, 1) : 0;
    this.fill.style.transform = `scaleX(${done.toFixed(4)})`;
    this.frame = requestAnimationFrame(this.tick);
  };

  // --- Events ---------------------------------------------------------------

  onTrigger = (event) => {
    const trigger = event.target.closest('[data-visualizer-track]');
    if (!trigger || !this.root.contains(trigger)) return;
    this.open(Number(trigger.dataset.visualizerTrack), trigger);
  };

  onAct = (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') this.close();
    else if (act === 'mute') player.setMuted(!player.isMuted());
  };

  onKey = (event) => {
    if (event.key === 'Escape') this.close();
  };

  destroy() {
    cancelAnimationFrame(this.frame);
    document.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('click', this.onTrigger);
    this.unsubscribe();
    player.destroy();
    this.el.remove();
    this.isOpen = false;
  }
}
