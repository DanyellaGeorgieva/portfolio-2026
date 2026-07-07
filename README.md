# Portfolio

Front-end portfolio built with Vite, Three.js (WebGL), GLSL shaders, and SASS.

## Stack

- **Vite 6** — dev server & bundler
- **Three.js** — WebGL rendering
- **vite-plugin-glsl** — import `.glsl/.vert/.frag` files as strings (with `#include`)
- **SASS** — styling

## Scripts

```bash
npm install     # install dependencies
npm run dev     # start dev server
npm run build   # production build → dist/
npm run preview # preview the production build
```

## Structure

```
index.html
vite.config.js
src/
  main.js                 # entry: mounts the WebGL scene + styles
  styles/
    main.scss             # entry stylesheet
    _variables.scss       # design tokens
    _reset.scss
  webgl/
    Scene.js              # Three.js renderer + full-screen shader quad
    shaders/
      plane.vert
      plane.frag
```

Shaders are imported directly into JS thanks to `vite-plugin-glsl`:

```js
import vertexShader from './shaders/plane.vert';
```
