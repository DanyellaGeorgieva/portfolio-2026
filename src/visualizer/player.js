// The YouTube player, as a store: one player, what it is doing, and a clock
// smooth enough to drive a shader.
//
// It has no interface of its own. playerWindow.js is the window you see, and
// reads everything it shows from here; the shader will read getVideoTime()
// from here too. Neither knows about the other.
//
// ============================================================================
// One player
// ============================================================================
// The IFrame API script is loaded once, and one YT.Player is made and kept:
// changing track is loadVideoById on that player, never a second one. A second
// player is a second iframe, a second handshake, and the first one's audio
// still running somewhere behind it.
//
// ============================================================================
// Why the clock is not just getCurrentTime()
// ============================================================================
// getCurrentTime() is not the video's clock. It is the last value the iframe
// posted across to this page, and the iframe posts a few times a second: read
// every frame, it holds still for a dozen frames and then jumps. A shader
// driven by that would stutter in exactly that rhythm.
//
// So the clock runs here. A reading is taken — a time, and the moment it was
// true — and between readings the time is carried forward by performance.now()
// at the playback rate. Each fresh value from the iframe then corrects it: a
// small disagreement is eased in, so the clock never steps, and a large one
// (a seek, a stall) is simply taken.
//
// ============================================================================
// Sound
// ============================================================================
// It starts with the sound on. That is allowed because nothing here plays
// until someone has clicked to play it — but not allowed everywhere: between
// the click and the video there is a script to load and a player to build,
// and by then a strict browser (Safari, on a phone above all) may no longer
// count the play as the click's. It does not say so. The video just never
// starts.
//
// So a load is watched. If, a moment after it was asked for, the video has
// neither started nor is visibly on its way, it is muted and started again —
// which every browser allows — and the window offers the sound instead.

import { tracks } from './tracks.js';

const API_SRC = 'https://www.youtube.com/iframe_api';

const POLL = 100; // ms between looks at getCurrentTime() for a fresh value
const SNAP = 0.25; // s of disagreement past which the clock jumps, not eases
const NUDGE = 0.15; // the share of a small disagreement taken per fresh value
const START_WAIT = 1500; // ms a load gets to start with sound before it is muted

let player = null;
let ready = null; // resolves once the player can take commands
let state = 'idle'; // idle | loading | playing | paused | ended | error
let muted = false; // sound on, unless the browser will not have it — see Sound
let track = -1;
let error = 0; // YouTube's code, while state is 'error'
let duration = 0;

let reading = { time: 0, at: 0, rate: 1 };
let lastRaw = -1;
let lastPoll = 0;

let raw = -1; // YouTube's own state number, as last reported
let started = false; // whether this load has played at all yet
let watch = null; // the timer on a load that has not

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(snapshot()));

function snapshot() {
  return { state, muted, track, error, current: currentTrack() };
}

// --- The API script ---------------------------------------------------------

let api = null;
function loadApi() {
  if (api) return api;
  api = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    // The API calls this one global when it is ready. Anything already
    // waiting on it is kept, not replaced.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = API_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
  return api;
}

// --- The clock --------------------------------------------------------------

const predict = (now) =>
  state === 'playing' ? reading.time + ((now - reading.at) / 1000) * reading.rate : reading.time;

// Take the iframe's word for it outright: on any change of state or rate,
// where the old reading no longer describes what is happening.
function resync() {
  if (!player?.getCurrentTime) return;
  const now = performance.now();
  lastRaw = player.getCurrentTime() || 0;
  lastPoll = now;
  reading = { time: lastRaw, at: now, rate: player.getPlaybackRate?.() || 1 };
  duration = player.getDuration?.() || duration;
}

// While playing: has the iframe posted a new value? If so, correct toward it.
function correct(now) {
  lastPoll = now;
  const raw = player.getCurrentTime() || 0;
  if (raw === lastRaw) return;
  lastRaw = raw;
  duration = player.getDuration?.() || duration;
  const predicted = predict(now);
  const off = raw - predicted;
  const time = Math.abs(off) > SNAP ? raw : predicted + off * NUDGE;
  reading = { time, at: now, rate: reading.rate };
}

// No subtitles. There is no setting for this — YouTube turns them on from the
// viewer's own preference, or the uploader's default — so the captions module
// is put away each time the player loads it: when a video starts, and again
// whenever it says its modules have changed (onApiChange).
function hideCaptions() {
  player?.unloadModule?.('captions');
}

// --- Events from the iframe -------------------------------------------------

const STATES = { 0: 'ended', 1: 'playing', 2: 'paused', 3: 'loading' };
const BUFFERING = 3;

function onStateChange({ data }) {
  raw = data;
  if (data === 1) {
    hideCaptions();
    started = true;
    clearTimeout(watch);
  }
  // -1 (unstarted) and 5 (cued) say nothing new: a load is already 'loading'.
  // Nor does a pause before the video has ever played: that is the browser
  // refusing the sound, not anyone pausing, and the watch below answers it.
  const next = STATES[data];
  if (!next || (data === 2 && !started)) return;
  state = next;
  resync();
  emit();
}

function onError({ data }) {
  state = 'error';
  error = data;
  emit();
}

// Has the load started? If it is buffering it is on its way, and gets another
// wait. If it is just sitting there, the browser has refused to start it with
// sound: mute it and start it again.
function checkStart() {
  if (started || state !== 'loading' || !player) return;
  if (raw === BUFFERING) {
    watch = setTimeout(checkStart, START_WAIT);
    return;
  }
  muted = true;
  player.mute();
  player.playVideo();
  emit();
}

// --- What the window does ---------------------------------------------------

/**
 * Make the one player, in place of `el`. Safe to call again: the same player
 * comes back. Resolves when it can take commands.
 */
export function mount(el) {
  if (ready) return ready;
  ready = loadApi().then(
    (YT) =>
      new Promise((resolve) => {
        player = new YT.Player(el, {
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            color: 'white',
            fs: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              // Said either way: YouTube remembers the last mute it was left
              // in, from any site, and would otherwise start in that.
              if (muted) player.mute();
              else player.unMute();
              resolve(player);
            },
            onStateChange,
            onApiChange: hideCaptions,
            onPlaybackRateChange: resync,
            onError,
          },
        });
      }),
  );
  return ready;
}

/** Play track `index` from the top, with sound unless it has been muted. */
export async function load(index) {
  if (!tracks[index] || !ready) return;
  track = index;
  state = 'loading';
  error = 0;
  duration = 0;
  lastRaw = -1;
  reading = { time: 0, at: performance.now(), rate: 1 };
  emit();
  const mounted = ready;
  await mounted;
  // Gone, or asked for something else, while the player was getting ready.
  if (ready !== mounted || track !== index) return;
  started = false;
  raw = -1;
  player.loadVideoById(tracks[index].id);
  clearTimeout(watch);
  // Already muted, it will start whatever the browser thinks: nothing to watch.
  if (!muted) watch = setTimeout(checkStart, START_WAIT);
}

export function play() {
  player?.playVideo?.();
}

export function pause() {
  // Paused before it ever started: that was asked for, so not one to rescue.
  clearTimeout(watch);
  player?.pauseVideo?.();
}

export function toggle() {
  if (state === 'playing' || state === 'loading') pause();
  else play();
}

export function setMuted(on) {
  muted = on;
  if (on) player?.mute?.();
  else player?.unMute?.();
  emit();
}

/** Take the player down — the page it was on is going. Listeners stay. */
export function destroy() {
  clearTimeout(watch);
  // A mute the browser forced is not carried to the next visit: it gets to
  // try with sound again.
  muted = false;
  started = false;
  player?.destroy?.();
  player = null;
  ready = null;
  state = 'idle';
  track = -1;
  error = 0;
  duration = 0;
  reading = { time: 0, at: 0, rate: 1 };
  emit();
}

// --- The hooks --------------------------------------------------------------
// Nothing but the window reads these yet. The shader will: getVideoTime() is
// meant to be its time uniform.

/** Seconds into the video, smooth from frame to frame; held while not playing. */
export function getVideoTime() {
  const now = performance.now();
  if (state === 'playing' && player?.getCurrentTime && now - lastPoll > POLL) correct(now);
  return predict(now);
}

/** Seconds the video lasts, or 0 until the iframe has said. */
export const getDuration = () => duration;

/** 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' */
export const getState = () => state;
export const isMuted = () => muted;
/** The track from tracks.js that is loaded — { id, title } — or null. */
export const currentTrack = () => tracks[track] ?? null;

/**
 * Hear about every change of state, track or mute. Called with
 * { state, muted, track, error, current }. Returns the way to stop hearing.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
