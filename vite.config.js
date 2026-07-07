import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  root: '.',
  plugins: [
    // Lets you `import` .glsl/.vert/.frag/.vs/.fs files as strings,
    // with #include support for shared chunks.
    glsl(),
  ],
  server: {
    host: true,
    open: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
});
