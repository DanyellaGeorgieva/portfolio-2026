// The visualizers The Spark can play, in the order they are offered: the
// album's own running order. One place, so the triggers on the page and the
// player read the same list.
//
// `id` is the video's on YouTube — the band's own uploads, from the Return of
// the Dream Canteen playlist The Spark's copy is about. `palette` is the
// field's palette while that track plays: a name from webgl/palettes.js (the
// sixth, first and second there, in that order).
export const tracks = [
  { id: 'jtOrOECJxHY', title: 'Peace and Love', palette: 'limeViolet' },
  { id: 'ePdKx8ed8SY', title: 'Shoot Me a Smile', palette: 'skyOrchid' },
  { id: 'dsHTzbmZfL8', title: 'La La La La La La La La', palette: 'lavenderPeach' },
];

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
