# Diagram assets

Seven standalone SVGs for the case study — one per idea, ready to drop beside
your own paragraphs.

Every coordinate is generated from the **real measured data**, not drawn by
hand: `asset-gen.js` runs the project's own pipeline (alpha threshold 20, the
8% end easing, the radius-1 average) over `vitosha-top_D.svg` and
`vitosha-bottom_D.svg`, then writes the SVG source out.

| File | What it shows | Size |
| --- | --- | --- |
| `1-contour.svg` | The measured skyline as a single line. The "before". | 1200 × 240 |
| `2-measuring.svg` | A column read from the top down until it meets the line, at a summit and at a low point, with the height each produces. | 1200 × 320 |
| `3-loop.svg` | The join where the last number meets the first: as measured (dashed) against after the easing (solid), with the reshaped columns shaded. | 1200 × 300 |
| `4-smoothing.svg` | Forty columns: the measured values as dots on their whole-pixel steps, against the averaged line. | 1200 × 300 |
| `5-heightmap-strip.svg` | The finished list as shades of grey — white a summit, black a valley. | 1200 × 120 |
| `6-cloth.svg` | The cloth shaped by both lists, with the shaping easing off toward the right exactly as the site does. | 1200 × 420 |
| `7-cloth-full-width.svg` | The same, shaped evenly across the full width. Use this one if the flat right-hand side reads as a mistake out of context. | 1200 × 420 |

## Using them

They are plain files — `<img src="…">`, a CSS background, or pasted inline.

**Colour:** every stroke, fill and label is `currentColor`, so the diagram takes
the text colour of whatever it sits in. That only works when the SVG is
**inlined** or used via `<use>`; an `<img>` tag renders it in isolation, where
`currentColor` falls back to black. Inline them if you want them to follow your
palette, or open the file and replace `currentColor` with a fixed hex.

`5-heightmap-strip.svg` is the exception: its greys *are* the data, so they are
literal values, not `currentColor`.

**Size:** each has a `viewBox` and no width/height, so `svg { width: 100%;
height: auto }` scales them to any column width.

**Labels:** the text is `system-ui`, at 13px in the drawing's own units. Swap
`font-family` if you want your own face, or delete the `<text>` elements and
caption them in HTML instead.

## Regenerating

```sh
python3 - <<'EOF'     # rebuild the generator page with the SVGs inlined
# see the snippet at the bottom of ../README.md
EOF
```

The generator needs a browser (it rasterises the SVGs), so it runs as a page:
`build/asset-gen.html` computes everything into `window.ASSETS`, and
`build/save-server.py` accepts a POST of that object and writes the files here.
Edit `../asset-gen.js` to change what is drawn.

## Accuracy notes

- `5-heightmap-strip.svg` is drawn with 300 bars, downsampled from the real
  1,024 values, so the file stays small. The shape is exact; the resolution is
  not. The real texture is 1,024 × 1.
- `3-loop.svg` shows what the files really contain: these two contours already
  end level, so the easing's visible effect is to flatten the outer columns
  toward that shared height rather than to close a gap.
- `6-cloth.svg` uses the site's shipped amplitudes (ridge 0.85, hem −0.25) and
  its mask (full shaping to 59% of the width, gone by 79%).
