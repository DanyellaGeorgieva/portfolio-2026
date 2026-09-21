# Widget kit — the artifact's interactive pieces, for your own page

The artifact is one page. This is the same code, split so you can drop each
interactive piece between your own paragraphs. Generated from `template.html`
by `make-widgets.py` — the logic is not rewritten, so what you get is exactly
what the artifact does.

## Two files, plus your assets

```html
<link rel="stylesheet" href="/assets/vitosha-widgets.css">

<p>Your paragraph…</p>
<div data-vitosha="hero"></div>

<p>Your paragraph…</p>
<div data-vitosha="scan"></div>

<script src="/assets/vitosha-widgets.js"
        data-top="/assets/vitosha-top_D.svg"
        data-bottom="/assets/vitosha-bottom_D.svg"
        data-textile1="/assets/textile-1.webp"
        data-textile2="/assets/textile-2.webp"
        data-textile3="/assets/textile-3.webp"></script>
```

Put the `<script>` anywhere after the widgets — the end of `<body>` is fine.
three.js is fetched from a CDN when it starts; override with `data-three`.

## The widgets

| `data-vitosha` | What it is | Interactive |
| --- | --- | --- |
| `hero` | The cloth, shaped by both contours, with the place-name markers riding the ridge. | Drag to pan · textile swatches · mountain height · panorama position |
| `line` | The contour as drawn, with its file stats. | — |
| `scan` | The rasterised line with the ridge found per column, plus the pixel loupe. | Hover any column · alpha-threshold slider · replay the scan |
| `seam` | The two ends of the list, before and after the easing. | Blend-width slider |
| `blur` | The whole profile and a 48-column zoom, measured against the smoothed line. | Drag the zoom window · radius · passes |
| `texture` | The finished list as a strip of grey. | Hover any texel |
| `settings` | The contour toggle (top / bottom) and "reset to production values". | Both controls |

**The hero is optional and costs nothing when you leave it out:** with no
`data-vitosha="hero"` on the page, three.js is never fetched, no WebGL context
is created and the textiles are never loaded. Then you can drop `data-textile*`
from the script tag too.

**If a graph looks like noise** — spikes instead of a skyline — the script is
being pointed at the wrong file. It checks the measurements on load and says so
in the console, naming the URL, and puts a line above each widget. `data-top`
and `data-bottom` want the two contour drawings in `assets/` here, not the
generated diagram SVGs in `../assets/`.

Every widget is optional and they share one pipeline: move the threshold slider
in `scan` and the seam, blur, texture and hero all update, exactly as in the
artifact. Use each kind at most once per page.

## Assets to host

| File | Where it is in this repo | Needed by |
| --- | --- | --- |
| `vitosha-top_D.svg` | `src/images/content/` (also copied into `assets/` here) | everything |
| `vitosha-bottom_D.svg` | same | everything |
| `textile-1/2/3.webp` | `src/images/content/` | `hero` only |

They must be same-origin: the script reads their pixels, which a cross-origin
image would forbid. Give one textile instead of three and the swatches hide
themselves; give none and the cloth renders as its background colour.

## Styling

Every rule is scoped under `.vtw`, which the script adds to each widget, so
nothing reaches the rest of your site. The palette comes from the project — the
active textile sets `--bg` and `--text` on each widget — so a widget stays
dark-on-its-own-ground whatever your page looks like. To pin your own colours,
override the two variables:

```css
[data-vitosha] { --bg: #101418; --text: #E7EDF1; }
```

The widgets inherit your fonts except for readouts and numbers, which use a
monospace stack (`--mono`).

## Regenerating

```sh
python3 docs/heightmap-visualisation/make-widgets.py
```

Edit `template.html` (the artifact) and re-run; the kit follows. The script
makes six changes to the artifact's code, each commented at the point it
happens: asset URLs read from the `<script>` tag, a fixed opening textile
instead of a random one, no page-wide heading rewrite, theme variables scoped
to the widgets, the resize watcher pointed at a widget instead of `<main>`, and
three.js loaded before the artifact code runs.
