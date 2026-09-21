import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import handlebars from 'vite-plugin-handlebars';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));

// Multi-page app: every index.html in the tree is its own real page (clean
// folder URLs like /work/melba/). Discover them all so the build knows
// each entry point — adding a page = adding a folder with an index.html.
function htmlEntries(dir, out = {}) {
  for (const name of readdirSync(dir)) {
    // Skip build dirs and src/ (pages live at the root; src holds partials/assets).
    if (['node_modules', 'dist', '.git', 'src'].includes(name)) continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) htmlEntries(full, out);
    else if (name.endsWith('.html')) {
      const rel = full.slice(root.length + 1).replace(/\\/g, '/');
      const key = rel === 'index.html' ? 'main' : rel.replace(/\/index\.html$/, '');
      out[key] = full;
    }
  }
  return out;
}

// Inlines an SVG into the page that asks for it:
//
//   <figure class="diagram" data-svg="./assets/1-contour.svg"></figure>
//
// The diagrams are drawn in currentColor so they take the palette's ink, and
// that only works when the SVG is part of the document — an <img> renders it in
// isolation, where currentColor falls back to black. Inlining by hand would
// work too and would bury the case study's copy under 60kB of path data, so the
// page keeps the reference and this puts the drawing in at transform time.
//
// The file is read on every transform, so editing a diagram and reloading shows
// it; only the page itself is watched, so a diagram change alone does not push
// an update to the browser.
function inlineDiagrams() {
  return {
    name: 'inline-diagrams',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace(
          /<figure([^>]*)\sdata-svg="([^"]+)"([^>]*)>\s*<\/figure>/g,
          (match, before, src, after) => {
            const file = resolve(dirname(ctx.filename), src);
            let svg;
            try {
              svg = readFileSync(file, 'utf8');
            } catch {
              // A missing diagram leaves the figure empty rather than failing
              // the build: the page is still readable without its pictures.
              console.warn(`[inline-diagrams] not found: ${src}`);
              return match;
            }
            return `<figure${before}${after}>${svg.replace(/<\?xml[^>]*\?>\s*/, '').trim()}</figure>`;
          },
        );
      },
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [
    // Lets you `import` .glsl/.vert/.frag files as strings, with #include support.
    glsl(),
    // Shared HTML partials (the persistent shell) via {{> frame }}.
    handlebars({ partialDirectory: resolve(root, 'src/partials') }),
    // <figure data-svg="…"> becomes that SVG, inlined.
    inlineDiagrams(),
  ],
  server: {
    host: true,
    open: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: htmlEntries(root),
    },
  },
});
