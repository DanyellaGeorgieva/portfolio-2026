import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import handlebars from 'vite-plugin-handlebars';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

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

export default defineConfig({
  root: '.',
  plugins: [
    // Lets you `import` .glsl/.vert/.frag files as strings, with #include support.
    glsl(),
    // Shared HTML partials (the persistent shell) via {{> frame }}.
    handlebars({ partialDirectory: resolve(root, 'src/partials') }),
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
