/* Vitosha heightmap — widget kit.
 * Generated from the artifact page by make-widgets.py.
 *
 *   <link rel="stylesheet" href="vitosha-widgets.css">
 *   <div data-vitosha="hero"></div>     <- drop these wherever you want them
 *   <div data-vitosha="scan"></div>
 *   <script src="vitosha-widgets.js"
 *           data-top="/assets/vitosha-top_D.svg"
 *           data-bottom="/assets/vitosha-bottom_D.svg"
 *           data-textile1="/assets/textile-1.webp"
 *           data-textile2="/assets/textile-2.webp"
 *           data-textile3="/assets/textile-3.webp"></script>
 *
 * Widgets: hero · line · scan · seam · blur · texture · settings.
 * They share one pipeline, so a slider in one updates all the others, exactly
 * as in the artifact. Every widget is optional; put in as many as you like,
 * in any order, one of each.
 */
(() => {
  const MARKUP = {
  "hero": "<div class=\"stage\" id=\"stage\" aria-label=\"Live WebGL render of the textile, displaced by the Vitosha heightmaps. Drag horizontally to pan.\">\n    <canvas id=\"gl\"></canvas>\n    <div class=\"markers\" id=\"markers\" aria-hidden=\"true\"></div>\n    <span class=\"stage__hint\">Drag to pan</span>\n  </div>\n<div class=\"controls\">\n    <div class=\"ctl\">\n      <span class=\"lbl\">Textile</span>\n      <div class=\"swatches\" id=\"swatches\" role=\"group\" aria-label=\"Textile theme\"></div>\n    </div>\n    <div class=\"ctl\">\n      <label for=\"intensity\">Mountain height <output id=\"intensityOut\">1.00</output></label>\n      <input type=\"range\" id=\"intensity\" min=\"0\" max=\"1\" step=\"0.01\" value=\"1\">\n    </div>\n    <div class=\"ctl\">\n      <label for=\"pos\">Panorama position <output id=\"posOut\">0.000</output></label>\n      <input type=\"range\" id=\"pos\" min=\"0\" max=\"1\" step=\"0.001\" value=\"0\">\n    </div>\n    <div class=\"ctl\">\n      <span class=\"lbl\">Heightmap</span>\n      <span class=\"badge\" id=\"heroBadge\">Production settings</span>\n    </div></div>",
  "line": "<div class=\"viz\">\n      <canvas id=\"srcCv\" aria-label=\"The designer's SVG contour line\"></canvas>\n      <ul class=\"stats\" id=\"srcStats\"></ul>\n    </div>",
  "scan": "<div class=\"viz scan\">\n      <canvas id=\"scanCv\" aria-label=\"Rasterised contour with detected ridge per column\"></canvas>\n      <div class=\"loupe-wrap\">\n        <canvas id=\"loupeCv\" aria-label=\"Magnified pixel grid around the inspected column\"></canvas>\n        <div style=\"display:grid; gap:14px;\">\n          <p class=\"readout\" id=\"scanOut\" aria-live=\"polite\"></p>\n          <ul class=\"stats\" id=\"scanStats\"></ul>\n          <div class=\"row\">\n            <div class=\"ctl\">\n              <label for=\"thr\">Alpha threshold <output id=\"thrOut\">20</output></label>\n              <input type=\"range\" id=\"thr\" min=\"1\" max=\"250\" step=\"1\" value=\"20\">\n            </div>\n            <button type=\"button\" class=\"btn\" id=\"replay\">Replay scan</button>\n          </div>\n          <p class=\"caption\">Loupe: each cell is one pixel, shaded by its alpha. A ringed cell is where the scan stopped in that column. The centre column is the one you\u2019re inspecting.</p>\n        </div>\n      </div>\n    </div>",
  "seam": "<div class=\"viz\">\n      <canvas id=\"seamCv\" aria-label=\"Heights either side of the loop seam, before and after blending\"></canvas>\n      <div class=\"row\">\n        <div class=\"ctl\">\n          <label for=\"blend\">Blend width <output id=\"blendOut\">8%</output></label>\n          <input type=\"range\" id=\"blend\" min=\"0\" max=\"0.2\" step=\"0.01\" value=\"0.08\">\n        </div>\n        <p class=\"readout\" id=\"seamOut\" aria-live=\"polite\"></p>\n      </div>\n      <p class=\"caption\">Dashed line: the raw scan. Solid line: after the easing. The shaded bands are the columns it reshapes; the vertical rule marks where column 1,023 wraps to column 0.</p>\n    </div>",
  "blur": "<div class=\"viz\">\n      <canvas id=\"blurOv\" aria-label=\"Whole profile; drag to move the zoom window\"></canvas>\n      <canvas id=\"blurCv\" aria-label=\"Zoomed profile, stair-stepped scan against blurred result\"></canvas>\n      <div class=\"row\">\n        <div class=\"ctl\">\n          <label for=\"radius\">Radius <output id=\"radiusOut\">1</output></label>\n          <input type=\"range\" id=\"radius\" min=\"0\" max=\"12\" step=\"1\" value=\"1\">\n        </div>\n        <div class=\"ctl\">\n          <label for=\"passes\">Passes <output id=\"passesOut\">1</output></label>\n          <input type=\"range\" id=\"passes\" min=\"0\" max=\"4\" step=\"1\" value=\"1\">\n        </div>\n        <p class=\"readout\" id=\"blurOut\" aria-live=\"polite\"></p>\n      </div>\n      <p class=\"caption\">Top: the whole profile. Drag across it to move the zoom window. Bottom: 48 columns zoomed in, with the stepped scan as dots and the blurred result as a line.</p>\n    </div>",
  "texture": "<div class=\"viz tex\">\n      <canvas id=\"texCv\" aria-label=\"The heightmap texture, one texel per column, stretched vertically\"></canvas>\n      <p class=\"readout\" id=\"texOut\" aria-live=\"polite\"></p>\n      <ul class=\"stats\" id=\"texStats\"></ul>\n    </div>",
  "settings": "<div class=\"controls\"><div class=\"seg\" role=\"group\" aria-label=\"Contour\">\n      <button type=\"button\" id=\"cTop\" aria-pressed=\"true\">Top \u00b7 peaks</button>\n      <button type=\"button\" id=\"cBottom\" aria-pressed=\"false\">Bottom \u00b7 hem</button>\n    </div>\n    <button type=\"button\" class=\"btn\" id=\"reset\">Reset to production values</button></div></div>"
};
  const SHADERS = {
  "vs": "__VERT__",
  "fs": "__FRAG__"
};

  for (const [id, src] of Object.entries(SHADERS)) {
    if (document.getElementById(id)) continue;
    const s = document.createElement("script");
    s.id = id;
    s.type = "x-shader";
    s.textContent = src;
    document.head.appendChild(s);
  }

  const mounted = new Set();
  document.querySelectorAll("[data-vitosha]").forEach((el) => {
    const kind = el.dataset.vitosha;
    if (!MARKUP[kind] || mounted.has(kind)) return;
    el.classList.add("vtw");
    el.innerHTML = MARKUP[kind];
    mounted.add(kind);
  });

  window.__vitoshaHero = mounted.has("hero");

  // HOST PATCH (portfolio): a widget the page leaves out is not built at all.
  // The generated kit mounted it off-screen instead, because its own start-up
  // asks for every control whether or not the page shows it — the stand-in in
  // $() below is what makes leaving them out safe. Nothing is now created,
  // sized or drawn for a widget nobody asked for.
})();

function startVitosha() {
  // ---------------------------------------------------------------- assets
  const CFG = (document.currentScript || document.querySelector("script[data-top]")).dataset;
  const ASSETS = { top: CFG.top, bottom: CFG.bottom };
  // One to three textiles, in the order the artifact ships them. Give fewer and
  // the swatches disappear; give none and the cloth stays its background colour.
  const THEMES = [
    { id: "t1", url: CFG.textile1, bg: "#241228", text: "#F29FC5", profile: "textile1" },
    { id: "t2", url: CFG.textile2, bg: "#071B24", text: "#AFDFF9", profile: "default" },
    { id: "t3", url: CFG.textile3, bg: "#1E1F16", text: "#E6E783", profile: "textile3", keepTopEdge: true },
  ].filter((t) => t.url);
  if (THEMES.length === 0) THEMES.push({ id: "t2", url: "", bg: "#071B24", text: "#AFDFF9", profile: "default" });
  if (THEMES.length === 1) document.querySelectorAll(".vtw").forEach((el) => el.classList.add("is-single-textile"));

  // ---- HOST PATCH (portfolio) ------------------------------------------
  // Hand-edited into the generated file; regenerating the kit removes it.
  //
  // The widgets draw their canvases with theme.text, a hex literal above —
  // nothing on the page can reach it, because it never passes through CSS. On
  // the artifact that is right: each textile brought its own colour. Here the
  // widgets sit in a case study whose ink is the palette's, and a pale blue
  // line on that field belongs to neither.
  //
  // So every theme's ink is replaced by the page's, read from the --ink custom
  // property. It has to stay a #rrggbb string: hexRgb() below parses it. The
  // backgrounds go transparent, since the widgets no longer carry a ground.
  const hostInk = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
  if (/^#[0-9a-f]{6}$/i.test(hostInk)) {
    THEMES.forEach((t) => { t.text = hostInk; t.bg = "transparent"; });
  }
  // ---- end host patch ---------------------------------------------------
  // DISTORT_PROFILES from scripts.js (gui-tuned per textile)
  const PROFILES = {
    default:  { topMax: 0.85, bottomMax: -0.25, pixelMax: 0.023, rgbMax: 0,    maskEnd: 0.79, maskFalloff: 0.2,  planeHeightFraction: 0.55, planeYOffset: -0.12 },
    textile1: { topMax: 0.85, bottomMax: -0.25, pixelMax: 0.15,  rgbMax: 0.02, maskEnd: 0.85, maskFalloff: 0.25, planeHeightFraction: 0.55, planeYOffset: -0.12 },
    textile3: { topMax: 0.85, bottomMax: -0.25, pixelMax: 0,     rgbMax: 0,    maskEnd: 0.9,  maskFalloff: 0.2,  planeHeightFraction: 0.59, planeYOffset: -0.12 },
  };
  const PROD = { threshold: 20, blend: 0.08, radius: 1, passes: 1 };
  const settings = { ...PROD };
  const WIDTH = 1024;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let theme = THEMES[Math.min(1, THEMES.length - 1)];
  let contourKey = "top";

  // HOST PATCH (portfolio): a stand-in for the controls of any widget the page
  // left out. The kit wires every control at start-up — $("#cTop"), $("#pos"),
  // $("#swatches") — so with nothing to hand back, one absent widget throws on
  // the first listener and takes the rest of the pipeline with it. A detached
  // <canvas> answers to everything these elements are asked for:
  // addEventListener, setAttribute, textContent, value, append, and getContext
  // for the drawing code. It is never in the document, so nothing it is given
  // is rendered or measured.
  const MISSING = document.createElement("canvas");
  const $ = (s) => document.querySelector(s) || MISSING;


  // Tiny highlighter for the source excerpts.
  const KW = /\b(const|let|for|if|return|new|float|vec2|vec3|uniform|varying)\b/g;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  document.querySelectorAll("code[data-hl]").forEach((code) => {
    code.innerHTML = code.textContent.split("\n").map((line) => {
      const ci = line.indexOf("//");
      const body = ci >= 0 ? line.slice(0, ci) : line;
      const com = ci >= 0 ? line.slice(ci) : "";
      let out = esc(body).replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>').replace(KW, '<span class="k">$1</span>');
      if (com) out += `<span class="c">${esc(com)}</span>`;
      return out;
    }).join("\n");
  });

  const loadImage = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

  // ------------------------------------------------ pipeline (from scripts.js)
  function rasterise(img, width = WIDTH) {
    const aspect = img.naturalHeight / img.naturalWidth;
    const height = Math.max(Math.round(width * aspect), 16);
    const cnv = document.createElement("canvas");
    cnv.width = width;
    cnv.height = height;
    const ctx = cnv.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    return { width, height, pixels };
  }
  function extract({ width, height, pixels }, ALPHA_THRESHOLD) {
    const heights = new Float32Array(width);
    const topYs = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      let topY = height;
      for (let y = 0; y < height; y++) {
        if (pixels[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
          topY = y;
          break;
        }
      }
      topYs[x] = topY;
      heights[x] = 1 - topY / height;
    }
    return { heights, topYs };
  }
  function loopBlend(input, frac) {
    const heights = Float32Array.from(input);
    const width = heights.length;
    if (frac <= 0) return { heights, blendCols: 0 };
    const blendCols = Math.max(1, Math.floor(width * frac));
    const target = (heights[0] + heights[width - 1]) / 2;
    for (let i = 0; i < blendCols; i++) {
      const t = i / blendCols;
      const ease = t * t * (3 - 2 * t); // smoothstep 0→1
      heights[i] = target * (1 - ease) + heights[i] * ease;
      const j = width - 1 - i;
      heights[j] = target * (1 - ease) + heights[j] * ease;
    }
    return { heights, blendCols };
  }
  function boxBlur(input, radius, passes) {
    const width = input.length;
    let src = Float32Array.from(input);
    let dst = new Float32Array(width);
    for (let p = 0; p < passes; p++) {
      let sum = 0;
      let count = 0;
      for (let k = 0; k <= radius && k < width; k++) { sum += src[k]; count++; }
      dst[0] = sum / count;
      for (let x = 1; x < width; x++) {
        const addIdx = x + radius;
        const removeIdx = x - radius - 1;
        if (addIdx < width) { sum += src[addIdx]; count++; }
        if (removeIdx >= 0) { sum -= src[removeIdx]; count--; }
        dst[x] = sum / count;
      }
      const swap = src; src = dst; dst = swap;
    }
    return src;
  }
  function pack(heights) {
    const width = heights.length;
    const data = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) {
      const v = Math.floor(heights[x] * 255);
      const i = x * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    return data;
  }
  // loadCleanTextile() from scripts.js — per-column upward fill of the torn top edge.
  async function loadCleanTextile(url, keepTopEdge = false) {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const cnv = document.createElement("canvas");
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const EDGE_SKIP = 3, KEEP_EDGE_FILL_DEPTH = 12;
    for (let x = 0; x < w; x++) {
      let boundary = -1;
      for (let y = 0; y < h; y++) {
        if (data[(y * w + x) * 4 + 3] >= 250) { boundary = y; break; }
      }
      if (boundary <= 0) continue;
      const sampleY = Math.min(boundary + (keepTopEdge ? KEEP_EDGE_FILL_DEPTH : EDGE_SKIP), h - 1);
      const srcI = (sampleY * w + x) * 4;
      const r = data[srcI], g = data[srcI + 1], b = data[srcI + 2];
      const paintUntil = keepTopEdge ? boundary : sampleY;
      for (let y = 0; y < paintUntil; y++) {
        const i = (y * w + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const C = { top: {}, bottom: {} };

  function recompute() {
    for (const key of ["top", "bottom"]) {
      const c = C[key];
      const ex = extract(c.raster, settings.threshold);
      c.raw = ex.heights;
      c.topYs = ex.topYs;
      const bl = loopBlend(c.raw, settings.blend);
      c.blended = bl.heights;
      c.blendCols = bl.blendCols;
      c.final = boxBlur(c.blended, settings.radius, settings.passes);
      c.bytes = pack(c.final);
      if (c.tex) { c.tex.image.data.set(c.bytes); c.tex.needsUpdate = true; }
    }
    const custom = Object.keys(PROD).some((k) => PROD[k] !== settings[k]);
    const badge = $("#heroBadge");
    badge.textContent = custom ? "Your settings from below" : "Production settings";
    badge.classList.toggle("custom", custom);
    drawAll();
  }

  // ------------------------------------------------------------ 2D helpers
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function prep(cv, cssH) {
    const w = Math.max(1, cv.clientWidth);
    cv.style.height = cssH + "px";
    cv.width = Math.round(w * DPR());
    cv.height = Math.round(cssH * DPR());
    const ctx = cv.getContext("2d");
    ctx.setTransform(DPR(), 0, 0, DPR(), 0, 0);
    ctx.clearRect(0, 0, w, cssH);
    return { ctx, w, h: cssH };
  }
  function tinted(img, w, h, color) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }
  const mono = '11px Satoshi, sans-serif';
  const vScaleFor = (natH, dispW, natW) => Math.max(1, Math.ceil(64 / (natH * dispW / natW)));
  function yRange(arrs, from, to) {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrs) for (let i = from; i < to; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    const pad = Math.max((hi - lo) * 0.12, 0.01);
    return [lo - pad, hi + pad];
  }
  function yAxis(ctx, lo, hi, top, bottom, x, w) {
    ctx.font = mono; ctx.textBaseline = "middle";
    const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
    ticks.forEach((v) => {
      const y = bottom - (v - lo) / (hi - lo) * (bottom - top);
      ctx.globalAlpha = 0.18; ctx.fillStyle = theme.text; ctx.fillRect(x, Math.round(y), w, 1);
      ctx.globalAlpha = 0.6; ctx.fillText(v.toFixed(2), 0, y);
    });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- 01 source
  function drawSource() {
    const c = C[contourKey];
    const cv = $("#srcCv");
    const w = cv.clientWidth;
    const natH = c.img.naturalHeight, natW = c.img.naturalWidth;
    const vs = vScaleFor(natH, w, natW);
    const dh = Math.round(natH * w / natW * vs);
    const { ctx } = prep(cv, dh + 28);
    const t = tinted(c.img, w * DPR(), dh * DPR(), theme.text);
    ctx.drawImage(t, 0, 0, w, dh);
    ctx.font = mono; ctx.fillStyle = theme.text; ctx.textBaseline = "top";
    ctx.globalAlpha = 0.6; ctx.textAlign = "center";
    ctx.fillText(vs > 1 ? `the full panorama · shown ×${vs} vertically` : "the full panorama", w / 2, dh + 10);
    ctx.textAlign = "left"; ctx.globalAlpha = 1;
    // HOST PATCH (portfolio): the filename is dropped. On the artifact it told
    // you which of the two contours you were looking at, next to the toggle that
    // switched them; this page has no toggle, so it was naming a file the reader
    // has no way to choose, see or care about.
    $("#srcStats").innerHTML =
      `<li>viewBox <b>${natW} × ${natH}</b></li>` +
      `<li>Paths <b>1</b>, <b>fill="none"</b></li>` +
      `<li>Measured in <b>1,024</b> columns</li>`;
  }

  // ---------------------------------------------------------- 02 scan
  let hoverCol = 777;          // Cherni Vrah (x 0.7592)
  let scanUpTo = WIDTH;        // animated reveal of detected ridge
  let scanAnim = 0;
  const rasterCache = {};
  function rasterCanvas(key) {
    const k = key + theme.id;
    if (rasterCache[k]) return rasterCache[k];
    const { width, height, pixels } = C[key].raster;
    const cv = document.createElement("canvas");
    cv.width = width; cv.height = height;
    const ctx = cv.getContext("2d");
    const id = ctx.createImageData(width, height);
    const rgb = hexRgb(theme.text);
    for (let i = 0; i < width * height; i++) {
      id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2];
      id.data[i * 4 + 3] = pixels[i * 4 + 3] * 0.45;
    }
    ctx.putImageData(id, 0, 0);
    return (rasterCache[k] = cv);
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  function drawScan() {
    const c = C[contourKey];
    const { width, height } = c.raster;
    const cv = $("#scanCv");
    const w = cv.clientWidth;
    const vs = vScaleFor(height, w, width);
    const dh = Math.round(height * w / width * vs);
    const { ctx } = prep(cv, dh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rasterCanvas(contourKey), 0, 0, w, dh);
    const sx = w / width, sy = dh / height;
    ctx.fillStyle = theme.text;
    for (let x = 0; x < Math.min(scanUpTo, width); x++) {
      const ty = c.topYs[x];
      if (ty >= height) continue;
      ctx.fillRect(x * sx, ty * sy, Math.max(1, sx), Math.max(1.5, sy));
    }
    const col = scanAnim ? Math.min(scanUpTo, width - 1) : hoverCol;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(Math.floor(col * sx), 0, 1, dh);
    ctx.globalAlpha = 1;
    drawLoupe(col);
    const ty = c.topYs[col];
    $("#scanOut").textContent = ty >= height
      ? `column ${col}: no pixel above alpha ${settings.threshold} → height 0`
      : `column ${col}: first alpha > ${settings.threshold} at row ${ty} of ${height} → 1 − ${ty}/${height} = ${c.raw[col].toFixed(3)}`;
    const levels = new Set(c.topYs).size;
    let misses = 0; for (let x = 0; x < width; x++) if (c.topYs[x] >= height) misses++;
    $("#scanStats").innerHTML =
      `<li>Raster <b>${width} × ${height}</b> px</li>` +
      `<li>Distinct heights <b>${levels}</b></li>` +
      `<li>Empty columns <b>${misses}</b></li>`;
  }

  function drawLoupe(col) {
    const c = C[contourKey];
    const { width, height, pixels } = c.raster;
    const cv = $("#loupeCv");
    const cols = 21;
    const rows = Math.min(11, height);
    const cw = cv.clientWidth;
    const cell = Math.max(8, Math.min(26, Math.floor(cw / cols)));
    const { ctx } = prep(cv, rows * cell + 2);
    const x0 = Math.max(0, Math.min(width - cols, col - (cols >> 1)));
    const anchorY = c.topYs[col] >= height ? height - 1 : c.topYs[col];
    const y0 = Math.max(0, Math.min(height - rows, anchorY - (rows >> 1)));
    const ox = Math.floor((cw - cols * cell) / 2);
    for (let i = 0; i < cols; i++) {
      const x = x0 + i;
      for (let j = 0; j < rows; j++) {
        const y = y0 + j;
        const a = pixels[(y * width + x) * 4 + 3];
        const px = ox + i * cell, py = 1 + j * cell;
        ctx.fillStyle = theme.text;
        ctx.globalAlpha = 0.06;
        ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        if (a > 0) { ctx.globalAlpha = 0.08 + (a / 255) * 0.8; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2); }
        ctx.globalAlpha = 1;
        if (c.topYs[x] === y && x < scanUpTo) {
          ctx.strokeStyle = theme.text; ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
        }
      }
    }
    // bracket the inspected column
    const bx = ox + (col - x0) * cell;
    ctx.strokeStyle = theme.text; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.strokeRect(bx + 0.5, 0.5, cell - 1, rows * cell + 1);
    ctx.setLineDash([]);
  }

  function replayScan() {
    if (reduceMotion) { scanUpTo = WIDTH; drawScan(); return; }
    cancelAnimationFrame(scanAnim);
    const start = performance.now(), dur = 2600;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
      scanUpTo = Math.floor(k * WIDTH);
      scanAnim = k < 1 ? requestAnimationFrame(step) : 0;
      if (!scanAnim) scanUpTo = WIDTH;
      drawScan();
    };
    scanAnim = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------- 03 seam
  function drawSeam() {
    const c = C[contourKey];
    const cv = $("#seamCv");
    const { ctx, w, h } = prep(cv, 210);
    const K = 190;
    const raw = [...c.raw.slice(WIDTH - K), ...c.raw.slice(0, K)];
    const bl = [...c.blended.slice(WIDTH - K), ...c.blended.slice(0, K)];
    const [lo, hi] = yRange([raw, bl], 0, 2 * K);
    const L = 40, top = 14, bottom = h - 26, pw = w - L;
    const X = (i) => L + (i + 0.5) / (2 * K) * pw;
    const Y = (v) => bottom - (v - lo) / (hi - lo) * (bottom - top);
    yAxis(ctx, lo, hi, top, bottom, L, pw);
    if (c.blendCols) {
      ctx.fillStyle = theme.text; ctx.globalAlpha = 0.07;
      const bc = Math.min(c.blendCols, K);
      ctx.fillRect(X(K - bc) - pw / (4 * K), top, X(K + bc - 1) - X(K - bc) + pw / (2 * K), bottom - top);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = theme.text; ctx.globalAlpha = 0.8;
    ctx.fillRect(L + pw / 2, top - 6, 1, bottom - top + 12);
    ctx.globalAlpha = 1;
    const line = (arr, dash, lw, a) => {
      ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.globalAlpha = a; ctx.strokeStyle = theme.text;
      ctx.beginPath();
      arr.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    line(raw, [3, 3], 1, 0.6);
    line(bl, [], 2, 1);
    ctx.font = mono; ctx.fillStyle = theme.text; ctx.textBaseline = "top";
    ctx.textAlign = "right"; ctx.fillText("… col 1023", L + pw / 2 - 6, bottom + 8);
    ctx.textAlign = "left"; ctx.fillText("col 0 …", L + pw / 2 + 6, bottom + 8);
    const jr = Math.abs(c.raw[WIDTH - 1] - c.raw[0]);
    const jb = Math.abs(c.blended[WIDTH - 1] - c.blended[0]);
    let moved = 0;
    for (let i = 0; i < c.blendCols; i++) {
      moved = Math.max(moved, Math.abs(c.blended[i] - c.raw[i]),
                       Math.abs(c.blended[WIDTH - 1 - i] - c.raw[WIDTH - 1 - i]));
    }
    $("#seamOut").textContent = jr < 0.0005
      ? `ends already level (${c.raw[0].toFixed(3)} and ${c.raw[WIDTH - 1].toFixed(3)}) · easing still reshapes ${c.blendCols} columns per end, by up to ${moved.toFixed(3)}`
      : `gap between the ends: ${jr.toFixed(3)} → ${jb.toFixed(3)} · eased over ${c.blendCols} columns per end`;
  }

  // ---------------------------------------------------------- 04 blur
  const WIN = 48;
  let blurStart = { top: 0, bottom: 0 };
  function initBlurWindow() {
    for (const key of ["top", "bottom"]) {
      const f = C[key].raw;
      // centre on the busiest stretch (largest local variation) so the stairs are visible
      let best = 0, bestI = 0;
      for (let i = 60; i < WIDTH - 60 - WIN; i++) {
        let v = 0; for (let k = 1; k < WIN; k++) v += Math.abs(f[i + k] - f[i + k - 1]);
        if (v > best) { best = v; bestI = i; }
      }
      blurStart[key] = bestI;
    }
  }
  function drawBlur() {
    const c = C[contourKey];
    // overview
    {
      const cv = $("#blurOv");
      const { ctx, w, h } = prep(cv, 54);
      const [lo, hi] = yRange([c.final], 0, WIDTH);
      ctx.strokeStyle = theme.text; ctx.lineWidth = 1.25; ctx.beginPath();
      for (let x = 0; x < WIDTH; x++) {
        const px = x / (WIDTH - 1) * w, py = h - 4 - (c.final[x] - lo) / (hi - lo) * (h - 8);
        x ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      const s = blurStart[contourKey];
      ctx.fillStyle = theme.text; ctx.globalAlpha = 0.14;
      ctx.fillRect(s / WIDTH * w, 0, WIN / WIDTH * w, h);
      ctx.globalAlpha = 1; ctx.strokeRect(s / WIDTH * w + 0.5, 0.5, WIN / WIDTH * w, h - 1);
    }
    // detail
    const cv = $("#blurCv");
    const { ctx, w, h } = prep(cv, 230);
    const s = blurStart[contourKey];
    const [lo, hi] = yRange([c.blended, c.final], s, s + WIN);
    const L = 40, top = 12, bottom = h - 24, pw = w - L;
    const X = (i) => L + (i - s + 0.5) / WIN * pw;
    const Y = (v) => bottom - (v - lo) / (hi - lo) * (bottom - top);
    yAxis(ctx, lo, hi, top, bottom, L, pw);
    ctx.fillStyle = theme.text; ctx.strokeStyle = theme.text;
    // stair-stepped scan
    ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = s; i < s + WIN; i++) {
      const y = Y(c.blended[i]);
      ctx.moveTo(X(i) - pw / WIN / 2, y); ctx.lineTo(X(i) + pw / WIN / 2, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    for (let i = s; i < s + WIN; i++) { ctx.beginPath(); ctx.arc(X(i), Y(c.blended[i]), 2.2, 0, Math.PI * 2); ctx.fill(); }
    // blurred result
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = s; i < s + WIN; i++) (i === s ? ctx.moveTo(X(i), Y(c.final[i])) : ctx.lineTo(X(i), Y(c.final[i])));
    ctx.stroke();
    ctx.font = mono; ctx.textBaseline = "top"; ctx.globalAlpha = 0.7;
    ctx.fillText(`col ${s}`, L, bottom + 8);
    ctx.textAlign = "right"; ctx.fillText(`col ${s + WIN - 1}`, w, bottom + 8); ctx.textAlign = "left";
    ctx.globalAlpha = 1;
    let pRaw = 0, pFin = 0, d = 0;
    for (let i = 0; i < WIDTH; i++) { pRaw = Math.max(pRaw, c.blended[i]); pFin = Math.max(pFin, c.final[i]); }
    for (let i = s; i < s + WIN; i++) d = Math.max(d, Math.abs(c.final[i] - c.blended[i]));
    $("#blurOut").textContent = `tallest peak ${pRaw.toFixed(3)} → ${pFin.toFixed(3)} (${((pFin / pRaw - 1) * 100).toFixed(1)}%) · largest shift in view ${d.toFixed(3)}`;
  }

  // ---------------------------------------------------------- 05 texture
  let texHover = 777;
  function drawTex() {
    const c = C[contourKey];
    const cv = $("#texCv");
    const { ctx, w, h } = prep(cv, 64);
    const cw = w / WIDTH;
    for (let x = 0; x < WIDTH; x++) {
      const b = c.bytes[x * 4];
      ctx.fillStyle = `rgb(${b},${b},${b})`;
      ctx.fillRect(x * cw, 0, cw + 0.6, h);
    }
    ctx.fillStyle = theme.text; ctx.fillRect(Math.floor(texHover * cw), 0, 1, h);
    const b = c.bytes[texHover * 4];
    $("#texOut").textContent = `texel ${texHover}: byte ${b} → texture2D().r = ${(b / 255).toFixed(3)} → − 0.5 = ${(b / 255 - 0.5 >= 0 ? "+" : "")}${(b / 255 - 0.5).toFixed(3)}`;
    $("#texStats").innerHTML =
      `<li>Size <b>1024 × 1</b> RGBA</li><li>Memory <b>4,096</b> bytes</li>` +
      `<li>Filter <b>Linear</b></li><li>Wrap S <b>Repeat</b></li>`;
  }

  function drawAll() {
    // HOST PATCH (portfolio): nothing is drawn into a widget that has no width.
    //
    // Every draw below sizes itself from cv.clientWidth, and a canvas that is
    // not laid out reports 0 — which divides through vScaleFor() into NaN, and
    // a canvas sized NaN is a canvas sized 0, which drawImage refuses:
    //   InvalidStateError: ... a canvas element with a width or height of 0
    //
    // It happens for two reasons on this site. A widget the page left out gets
    // the detached stand-in from $() further up, and the page itself is taken
    // out of the document on every swup navigation while this run's observers
    // are still live — both leave a real element with no layout.
    if (!$("#srcCv").clientWidth) return;

    drawSource(); drawScan(); drawSeam(); drawBlur(); drawTex();
  }

  // ------------------------------------------------------------- hero GL
  const IMAGE_ASPECT = 2049 / 319;
  const BASE_W = IMAGE_ASPECT, BASE_H = 1;
  const stage = $("#stage"), glCanvas = $("#gl");
  const cfg = { ...PROFILES.default, panoramaScale: 2, wobbleAmp: 0.04, wobbleSpeed: 1, revealAt: 0.7 };
  let intensity = 1, scrollOffset = 0.62, userMoved = false;
  let renderer, camera, scene, mesh, material, planeScaleX = 1, planeScaleY = 1;
  const texCache = {};
  let projVec = null;   // built in initGL(), once three.js is in
  const size = { w: 1, h: 1 };

  const topPeaks = [
    { name: "Kopitoto", x: 0.1586 }, { name: "Kamen Del", x: 0.2788 },
    { name: "Bistrishko Branishte", x: 0.3594 }, { name: "Zlatnite Mostove", x: 0.5233 },
    { name: "Aleko", x: 0.5778 }, { name: "Momina Skala", x: 0.6377 }, { name: "Cherni Vrah", x: 0.7592 },
  ];
  const bottomDots = [
    { name: "Knyazhevo", x: 0.1586 }, { name: "Simeonovo", x: 0.2788 }, { name: "Boyana", x: 0.3594 },
    { name: "Ovcha Kupel", x: 0.5233 }, { name: "Dragalevtsi", x: 0.5778 }, { name: "Borisova Gradina", x: 0.6377 },
    { name: "Toplocentrala", x: 0.793, star: true }, { name: "Cinema Lumière", x: 0.7592, star: true },
  ];
  const STAR = '<svg viewBox="0 0 23 22" fill="none" aria-hidden="true"><path d="M15.929 12.5401L20.4094 18.7037L15.929 22L11.3921 15.7832L7.01459 21.7073L2.64375 18.4176L7.17401 12.5401L0 10.0553L1.72708 4.92289L8.7948 7.46084V0H14.3148V7.46084L21.3792 5.13577L23 10.2715L15.929 12.5401Z" fill="currentColor"/></svg>';
  function buildMarkers() {
    const box = $("#markers");
    for (const p of [...topPeaks, ...bottomDots]) {
      const el = document.createElement("div");
      el.className = "mk" + (p.star ? " mk--chip" : "");
      el.innerHTML = (p.star ? `<span class="mk__star">${STAR}</span>` : '<span class="mk__dot"></span>') +
        `<span class="mk__label"></span>`;
      el.querySelector(".mk__label").textContent = p.name;
      box.appendChild(el);
      p.el = el;
    }
  }
  const computeMask = (planeU) => {
    const start = cfg.maskEnd - cfg.maskFalloff, end = cfg.maskEnd;
    if (planeU <= start) return 1;
    if (planeU >= end) return 0;
    const t = (planeU - start) / (end - start);
    return 1 - t * t * (3 - 2 * t);
  };
  const positionMarker = (p, heights, edgeY, amp) => {
    const tileCount = material.uniforms.uTileCount.value;
    let imageU = (p.x - scrollOffset) % 1;
    if (imageU < 0) imageU += 1;
    const planeU = imageU / tileCount;
    const N = heights.length - 1;
    const mask = computeMask(planeU);
    const worldX = (planeU - 0.5) * BASE_W * planeScaleX;
    const h = heights[Math.round(p.x * N)] - 0.5;
    const worldY = mesh.position.y + (edgeY + h * amp * mask) * planeScaleY;
    projVec.set(worldX, worldY, 0).project(camera);
    const sx = (projVec.x + 1) * size.w * 0.5;
    const sy = (1 - projVec.y) * size.h * 0.5;
    const on = sx > -60 && sx < size.w + 60;
    p.el.style.visibility = on ? "visible" : "hidden";
    p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
  };
  function fit() {
    const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;
    const planeHeight = visibleHeight * cfg.planeHeightFraction;
    const planeWidth = visibleWidth;
    planeScaleX = planeWidth / BASE_W;
    planeScaleY = planeHeight / BASE_H;
    mesh.scale.set(planeScaleX, planeScaleY, 1);
    mesh.position.y = visibleHeight * cfg.planeYOffset;
    const baseTileCount = planeWidth / (planeHeight * IMAGE_ASPECT);
    material.uniforms.uTextureTileCount.value = baseTileCount;
    material.uniforms.uTileCount.value = baseTileCount / cfg.panoramaScale;
  }
  function resizeGL() {
    size.w = stage.clientWidth; size.h = stage.clientHeight;
    renderer.setPixelRatio(DPR());
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    fit();
  }
  function makeHeightTex(bytes) {
    const tex = new THREE.DataTexture(new Uint8Array(bytes), WIDTH, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  function initGL() {
    projVec = new THREE.Vector3();
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, depth: false, stencil: false, powerPreference: "high-performance" });
    renderer.setClearColor(theme.bg);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.set(0, 0, 0.7);
    scene.add(camera);
    const placeholder = new THREE.DataTexture(new Uint8Array([22, 20, 20, 255]), 1, 1, THREE.RGBAFormat);
    placeholder.needsUpdate = true;
    C.top.tex = makeHeightTex(C.top.bytes);
    C.bottom.tex = makeHeightTex(C.bottom.bytes);
    material = new THREE.ShaderMaterial({
      vertexShader: $("#vs").textContent,
      fragmentShader: $("#fs").textContent,
      depthTest: false, depthWrite: false,
      uniforms: {
        uTexture: { value: placeholder },
        uHeightmap: { value: C.top.tex },
        uHeightmapBottom: { value: C.bottom.tex },
        uScrollOffset: { value: 0 }, uAmpTop: { value: 0 }, uAmpBottom: { value: 0 },
        uPixelDistort: { value: 0 }, uRgbShift: { value: 0 }, uPixelAnim: { value: 0 },
        uMaskEnd: { value: cfg.maskEnd }, uMaskFalloff: { value: cfg.maskFalloff },
        uTileCount: { value: 1 }, uTextureTileCount: { value: 1 },
        uTime: { value: 0 }, uIdleWobble: { value: 0 },
      },
    });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(BASE_W, BASE_H, 384, 96), material);
    scene.add(mesh);
    buildMarkers();
    resizeGL();
    new ResizeObserver(resizeGL).observe(stage);
  }
  async function applyTheme(t) {
    theme = t;
    document.querySelectorAll(".vtw").forEach((el) => { el.dataset.textile = t.id; });
    Object.assign(cfg, PROFILES[t.profile]);
    document.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === t.id)));
    if (renderer) {
      renderer.setClearColor(t.bg);
      material.uniforms.uMaskEnd.value = cfg.maskEnd;
      material.uniforms.uMaskFalloff.value = cfg.maskFalloff;
      fit();
    }
    if (C.top.raster) drawAll();
    if (!texCache[t.id]) texCache[t.id] = loadCleanTextile(t.url, t.keepTopEdge);
    const tex = await texCache[t.id];
    if (theme === t && material) material.uniforms.uTexture.value = tex;
  }

  let heroVisible = true, last = performance.now(), clock = 0;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    if (heroVisible) {
      if (!reduceMotion) {
        clock += dt;
        if (!userMoved && !dragging) { scrollOffset += 0.000012 * dt; syncPos(); }
      }
      const u = material.uniforms;
      u.uTime.value = (clock / 1000) * cfg.wobbleSpeed;
      u.uIdleWobble.value = reduceMotion ? 0 : cfg.wobbleAmp * (1 - intensity);
      u.uScrollOffset.value = scrollOffset;
      u.uAmpTop.value = cfg.topMax * intensity;
      u.uAmpBottom.value = cfg.bottomMax * intensity;
      u.uPixelDistort.value = intensity * cfg.pixelMax;
      u.uRgbShift.value = intensity * cfg.rgbMax;
      for (const p of topPeaks) positionMarker(p, C.top.final, BASE_H * 0.5, u.uAmpTop.value);
      for (const p of bottomDots) positionMarker(p, C.bottom.final, -BASE_H * 0.5, u.uAmpBottom.value);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  function syncPos() {
    const v = ((scrollOffset % 1) + 1) % 1;
    $("#pos").value = v.toFixed(3);
    $("#posOut").textContent = v.toFixed(3);
  }

  // ------------------------------------------------------------ controls
  let dragging = false, dragX = 0;
  stage.addEventListener("pointerdown", (e) => {
    dragging = true; dragX = e.clientX; userMoved = true;
    stage.classList.add("dragging"); stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX; dragX = e.clientX;
    scrollOffset -= (dx / size.w) * material.uniforms.uTileCount.value;
    syncPos();
  });
  const endDrag = () => { dragging = false; stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  $("#intensity").addEventListener("input", (e) => {
    intensity = +e.target.value; $("#intensityOut").textContent = intensity.toFixed(2);
  });
  $("#pos").addEventListener("input", (e) => {
    userMoved = true; scrollOffset = +e.target.value; $("#posOut").textContent = scrollOffset.toFixed(3);
  });

  const swatches = $("#swatches");
  THEMES.forEach((t, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.dataset.id = t.id;
    b.setAttribute("aria-label", `Textile ${i + 1}`);
    b.setAttribute("aria-pressed", String(t === theme));
    b.style.background = t.bg;
    b.innerHTML = `<span style="background:${t.text}"></span>`;
    b.addEventListener("click", () => applyTheme(t));
    swatches.appendChild(b);
  });

  const setContour = (k) => {
    contourKey = k;
    $("#cTop").setAttribute("aria-pressed", String(k === "top"));
    $("#cBottom").setAttribute("aria-pressed", String(k === "bottom"));
    drawAll();
  };
  $("#cTop").addEventListener("click", () => setContour("top"));
  $("#cBottom").addEventListener("click", () => setContour("bottom"));

  const bindRange = (id, key, fmt) => {
    const el = $("#" + id), out = $("#" + id + "Out");
    el.addEventListener("input", () => { settings[key] = +el.value; out.textContent = fmt(+el.value); recompute(); });
    return () => { el.value = PROD[key]; out.textContent = fmt(PROD[key]); };
  };
  const resets = [
    bindRange("thr", "threshold", (v) => v),
    bindRange("blend", "blend", (v) => Math.round(v * 100) + "%"),
    bindRange("radius", "radius", (v) => v),
    bindRange("passes", "passes", (v) => v),
  ];
  $("#reset").addEventListener("click", () => { Object.assign(settings, PROD); resets.forEach((r) => r()); recompute(); });
  $("#replay").addEventListener("click", replayScan);

  const colFromEvent = (e, cv) => {
    const r = cv.getBoundingClientRect();
    return Math.max(0, Math.min(WIDTH - 1, Math.floor((e.clientX - r.left) / r.width * WIDTH)));
  };
  const scanCv = $("#scanCv");
  const onScan = (e) => { if (scanAnim) return; hoverCol = colFromEvent(e, scanCv); drawScan(); };
  scanCv.addEventListener("pointermove", onScan);
  scanCv.addEventListener("pointerdown", onScan);
  const texCv = $("#texCv");
  const onTex = (e) => { texHover = colFromEvent(e, texCv); drawTex(); };
  texCv.addEventListener("pointermove", onTex);
  texCv.addEventListener("pointerdown", onTex);
  const ov = $("#blurOv");
  let ovDrag = false;
  const onOv = (e) => {
    const c = colFromEvent(e, ov);
    blurStart[contourKey] = Math.max(0, Math.min(WIDTH - WIN, c - (WIN >> 1)));
    drawBlur();
  };
  ov.addEventListener("pointerdown", (e) => { ovDrag = true; ov.setPointerCapture(e.pointerId); onOv(e); });
  ov.addEventListener("pointermove", (e) => ovDrag && onOv(e));
  ov.addEventListener("pointerup", () => (ovDrag = false));

  let rz = 0;
  new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => C.top.raster && drawAll()); }).observe(document.querySelector("[data-vitosha]") || document.body);

  // Guard against being pointed at something that is not a contour drawing.
  function checkContours() {
    const suspect = (c, url) => {
      let jumps = 0, empty = 0;
      for (let x = 1; x < WIDTH; x++) if (Math.abs(c.raw[x] - c.raw[x - 1]) > 0.2) jumps++;
      for (let x = 0; x < WIDTH; x++) if (c.topYs[x] >= c.raster.height) empty++;
      return (jumps > 20 || empty > WIDTH * 0.15) ? { url, jumps, empty } : null;
    };
    const bad = [suspect(C.top, ASSETS.top), suspect(C.bottom, ASSETS.bottom)].filter(Boolean);
    if (!bad.length) return;
    bad.forEach((b) => console.error(
      `[vitosha] "${b.url}" does not look like a contour drawing: ${b.jumps} jumps ` +
      `between neighbouring columns, ${b.empty} columns with no line at all. ` +
      `data-top and data-bottom want vitosha-top_D.svg and vitosha-bottom_D.svg — ` +
      `not one of the generated diagram SVGs.`));
    document.querySelectorAll("[data-vitosha]").forEach((el) => {
      const note = document.createElement("p");
      note.className = "caption";
      note.textContent = "Contour file not recognised — check data-top and data-bottom on the script tag (details in the console).";
      el.prepend(note);
    });
  }

  // ---------------------------------------------------------------- boot
  (async () => {
    const [imgTop, imgBottom] = await Promise.all([loadImage(ASSETS.top), loadImage(ASSETS.bottom)]);
    C.top.img = imgTop; C.bottom.img = imgBottom;
    C.top.raster = rasterise(imgTop);
    C.bottom.raster = rasterise(imgBottom);
    recompute();
    initBlurWindow();
    checkContours();
    hoverCol = Math.round(0.7592 * (WIDTH - 1));
    texHover = hoverCol;
    if (window.__vitoshaHero) {
      initGL();
      await applyTheme(theme);
      syncPos();
      new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; }).observe(stage);
      requestAnimationFrame(frame);
    }
    if (document.fonts) document.fonts.ready.then(drawAll);
  })();
}

(() => {
  const tag = document.querySelector("script[data-top]");
  const src = (tag && tag.dataset.three) ||
    "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  // Without a hero widget there is nothing to render in 3D, so the library is
  // never fetched and no WebGL context is created.
  if (!window.__vitoshaHero || window.THREE) return startVitosha();
  const s = document.createElement("script");
  s.src = src;
  s.onload = startVitosha;
  s.onerror = () => {
    // No three.js: the flat diagrams still work, so only the cloth is dropped.
    document.querySelectorAll('[data-vitosha="hero"]').forEach((el) => { el.hidden = true; });
    window.THREE = { WebGLRenderer: function () { throw new Error("three.js unavailable"); } };
  };
  document.head.appendChild(s);
})();
