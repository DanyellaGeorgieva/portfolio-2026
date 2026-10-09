// The window the visualizer plays in, floating over the field: a small pill
// with the track's name and the mute and close buttons in it, and the video
// under that in a frame of its own — the screen's frame over again, with the
// same wavy edge. The pill is the handle the window is dragged by.
//
// Everything it shows it reads from player.js. This file is only the furniture
// — the box, the buttons, the words under them.
//
// It opens and closes at once: clicked, it is there; closed, it is gone.
//
// It opens in the empty space to the right of the copy where the screen has
// that space, and under the copy where it has not (main.scss decides which).
// Where it floats beside the copy, it does not stay there: it
// drifts slowly through the screen, side to side and up and down at two
// unrelated paces, so it never quite retraces its path. Under the pointer, or
// with one of its buttons focused, it holds still to be used. It can be
// dragged too, by the pill, and it drifts on from wherever it is let go.

import { tracks, watchUrl } from './tracks.js';
import * as player from './player.js';
import { roundedRect, swell, smoothPath } from '../waveFrame.js';

// What the window says of itself. Not on screen — the pill has the track's
// name and the mute button shows the sound — but said to a screen reader, as
// a live region. Playing with the sound on, paused and ended say nothing: the
// video shows those itself, and is clicked to play or pause.
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
  // Two rows of three dots: something to take hold of.
  grip: [7.5, 12.5]
    .flatMap((y) => [4.5, 10, 15.5].map((x) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor"/>`))
    .join(''),
};
// The drift: seconds for one crossing there and back, each way. Two numbers
// with no small ratio between them, so the path does not close on itself.
const DRIFT_X = 120;
const DRIFT_Y = 76;
// How far it keeps from the header above and the palette picker below, and
// from the frame at either side.
const DRIFT_CLEAR = 12;
const DRIFT_MARGIN = 20;

// The video's frame. Its inner edge is the video's own box, straight, because
// nothing may be drawn over the video; the wave is on the outer edge, which
// stands out from that box by up to FRAME_SWELL px. Kept under the 8px between
// the box and the pill above it, so the two never run together. FRAME_SLICE is
// which layer of the noise it is read from: not the screen frame's.
const FRAME_SWELL = 6;
const FRAME_SLICE = 4;

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
    // The drift: how far it may travel (null where it does not float), where
    // it is now as an offset from where the stylesheet puts it, where in each
    // swing that is, its own clock, and how fast that clock is running — 1, or
    // 0 while it is held.
    this.room = null;
    this.dx = 0;
    this.dy = 0;
    this.phaseX = 0;
    this.phaseY = 0;
    this.driftTime = 0;
    this.driftSpeed = 0;
    this.lastTick = 0;
    // The drag in progress: its pointer, and where on the window it has hold.
    this.drag = null;
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
      <div class="vplayer__bar">
        <span class="vplayer__grip">${icon('grip')}</span>
        <span class="vplayer__title"></span>
        <span class="vplayer__divider"></span>
        <button type="button" class="vplayer__button" data-act="mute"></button>
        <button type="button" class="vplayer__button" data-act="close" aria-label="Close player">${icon('close')}</button>
      </div>
      <div class="vplayer__video"><div class="vplayer__mount"></div></div>
      <div class="vplayer__fallback" hidden>
        <span>This one won't play here</span>
        <a target="_blank" rel="noopener">Watch on YouTube</a>
      </div>
      <div class="vplayer__status" aria-live="polite"></div>
      <svg class="vplayer__frame" aria-hidden="true" focusable="false"><path fill="currentColor" /></svg>`;

    const find = (selector) => el.querySelector(selector);
    this.el = el;
    this.title = find('.vplayer__title');
    this.video = find('.vplayer__video');
    this.fallback = find('.vplayer__fallback');
    this.fallbackLink = find('.vplayer__fallback a');
    this.muteButton = find('[data-act="mute"]');
    this.status = find('.vplayer__status');
    this.framePath = find('.vplayer__frame path');

    el.addEventListener('click', this.onAct);
    el.addEventListener('pointerdown', this.onGrab);
    el.addEventListener('pointermove', this.onDrag);
    el.addEventListener('pointerup', this.onDrop);
    el.addEventListener('pointercancel', this.onDrop);
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
      window.addEventListener('resize', this.measure);
      // From where it opens, and from a standstill.
      this.dx = 0;
      this.dy = 0;
      this.driftSpeed = 0;
      this.lastTick = 0;
      this.measure();
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
      window.removeEventListener('resize', this.measure);
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
    this.title.textContent = track?.title ?? '';

    this.muteButton.innerHTML = icon(muted ? 'muted' : 'sound');
    this.muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.muteButton.disabled = failed;

    this.status.textContent =
      state === 'playing' ? (muted ? PLAYING_MUTED : '') : STATUS[state];
  };

  // Every frame while the window is open: the drift.
  tick = (now) => {
    this.driftBy(now);
    this.frame = requestAnimationFrame(this.tick);
  };

  // --- The frame ------------------------------------------------------------

  // The wavy edge round the video: the box's own rounded rectangle, each point
  // of it pushed outward by the swell at that point, and a smooth line through
  // the result. Drawn behind the box, which covers all of it but the edge. In
  // the window's own coordinates, so it is one shape wherever the window is —
  // drawn when it opens and again when the screen changes size (measure).
  drawFrame() {
    const box = this.video.hidden ? this.fallback : this.video;
    const { offsetLeft: x, offsetTop: y, offsetWidth: w, offsetHeight: h } = box;
    const radius = parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0;
    const points = roundedRect(x, y, x + w, y + h, radius);
    const out = points.map((p) => ((swell(p.x, p.y, FRAME_SLICE) + 1) / 2) * FRAME_SWELL);
    this.framePath.setAttribute(
      'd',
      smoothPath(
        points.map((p, i) => p.x + p.nx * out[i]),
        points.map((p, i) => p.y + p.ny * out[i]),
      ),
    );
  }

  // --- The drift and the drag -----------------------------------------------

  // How far it may go from where the stylesheet puts it: across to the frame's
  // margin on either side, up to the header and down to the palette picker.
  // Nowhere, where it is in the flow.
  measure = () => {
    const el = this.el;
    const style = getComputedStyle(el);
    this.drawFrame();
    if (style.position !== 'fixed') {
      this.room = null;
      this.dx = 0;
      this.dy = 0;
      el.style.transform = '';
      return;
    }
    // The frame round the screen, and the same breathing room the header keeps
    // from it. offsetLeft and offsetTop: where it rests, whatever the drift
    // has done.
    const margin = (parseFloat(style.getPropertyValue('--frame')) || 0) + DRIFT_MARGIN;
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? margin;
    const picker = document.getElementById('picker');
    const floor = picker && !picker.hidden ? picker.getBoundingClientRect().top : innerHeight - margin;
    // The room is the screen's, not the resting place's: on a short screen the
    // place the stylesheet gives it already reaches past the bottom, and then
    // `down` is above it — it opens moved up, and never drifts or is dragged
    // out. Where the screen is too small to hold it at all, it is the top and
    // the left that are kept, so the pill can always be reached.
    const left = margin - el.offsetLeft;
    const up = header + DRIFT_CLEAR - el.offsetTop;
    this.room = {
      left,
      right: Math.max(innerWidth - margin - el.offsetWidth - el.offsetLeft, left),
      up,
      down: Math.max(floor - DRIFT_CLEAR - el.offsetHeight - el.offsetTop, up),
    };
    // Where it already is, or the nearest place inside.
    this.moveTo(this.dx, this.dy);
  };

  // Put it at an offset from its resting place, kept inside the room, and
  // start the drift again from there: each swing is wound to the point that
  // has it where it now is, heading right and down.
  moveTo(dx, dy) {
    const { left, right, up, down } = this.room;
    this.dx = Math.min(Math.max(dx, left), right);
    this.dy = Math.min(Math.max(dy, up), down);
    const phase = (at, span) => (span > 0 ? Math.acos(1 - (2 * at) / span) : 0);
    this.phaseX = phase(this.dx - left, right - left);
    this.phaseY = phase(this.dy - up, down - up);
    this.driftTime = 0;
    this.place();
  }

  place() {
    this.el.style.transform = `translate3d(${this.dx.toFixed(2)}px, ${this.dy.toFixed(2)}px, 0)`;
  }

  driftBy(now) {
    const dt = this.lastTick ? Math.min((now - this.lastTick) / 1000, 0.1) : 0;
    this.lastTick = now;
    if (!this.room || this.drag) return;
    // Held under the pointer or while a button in it has the keyboard's focus,
    // and eased into and out of the hold rather than stopped dead. Where
    // motion is not wanted it is always held: it moves only when dragged.
    const held =
      this.reduced ||
      this.el.matches(':hover') ||
      this.el.querySelector('.vplayer__button:focus-visible');
    this.driftSpeed += ((held ? 0 : 1) - this.driftSpeed) * Math.min(dt * 3, 1);
    this.driftTime += dt * this.driftSpeed;

    const { left, right, up, down } = this.room;
    const swing = (period, phase) =>
      (1 - Math.cos((this.driftTime / period) * 2 * Math.PI + phase)) / 2;
    this.dx = left + (right - left) * swing(DRIFT_X, this.phaseX);
    this.dy = up + (down - up) * swing(DRIFT_Y, this.phaseY);
    this.place();
  }

  // Picked up by the pill, anywhere on it but its buttons. The pointer is
  // captured, so the drag carries on over the video and off the window's edge.
  onGrab = (event) => {
    const onBar = event.target.closest('.vplayer__bar') && !event.target.closest('button');
    if (!this.room || event.button !== 0 || !onBar) return;
    this.drag = { id: event.pointerId, x: event.clientX - this.dx, y: event.clientY - this.dy };
    this.el.setPointerCapture(event.pointerId);
    this.el.classList.add('is-dragging');
    event.preventDefault();
  };

  onDrag = (event) => {
    if (event.pointerId !== this.drag?.id) return;
    this.moveTo(event.clientX - this.drag.x, event.clientY - this.drag.y);
  };

  // Let go: it stays where it was put, and drifts on from a standstill once
  // the pointer has left it.
  onDrop = (event) => {
    if (event.pointerId !== this.drag?.id) return;
    this.drag = null;
    this.driftSpeed = 0;
    this.el.classList.remove('is-dragging');
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
    window.removeEventListener('resize', this.measure);
    this.root.removeEventListener('click', this.onTrigger);
    this.unsubscribe();
    player.destroy();
    this.el.remove();
    this.isOpen = false;
  }
}
