// The visualizers the colophon can play, in the order they are offered. One
// place, so the triggers on the page and the player read the same list.
//
// `id` is the video's on YouTube — the band's own uploads, from the Return of
// the Dream Canteen playlist the colophon's copy links to. `palette` is the
// field's palette while that track plays: a name from webgl/palettes.js (the
// picker's 06, 02 and 01, in that order).
export const tracks = [
  { id: 'jtOrOECJxHY', title: 'Peace and Love', palette: 'limeViolet' },
  { id: 'dsHTzbmZfL8', title: 'La La La La La La La La', palette: 'lavenderPeach' },
  { id: 'ePdKx8ed8SY', title: 'Shoot Me a Smile', palette: 'skyOrchid' },
];

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
