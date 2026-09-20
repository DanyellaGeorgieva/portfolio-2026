# Case Study: In the Skirts of Vitosha
### **Interactive landscape experience for the European Design Festival, Sofia 2026.**

* **Role:** Creative Development
* **Collaborators:** Art Director, Designer
* **Tech:** Three.js (GLSL), Vanilla JS, GSAP, Lenis, Webpack 5

---

## 🏔️ Concept & Design
The project brings a literal twist to a famous Bulgarian geographical idiom. The neighborhoods nestled at the base of the mountain overlooking Sofia are called **"Полите на Витоша"**—literally, **"The Skirts of Vitosha."** 

We turned this linguistic metaphor into a tactile, interaction mechanic. Built **strictly mobile-only and landscape-only**, users manipulate a continuous woven digital textile. As they scroll, the fabric warps and pulls upward, molding itself into the rugged ridge line of the mountain.

```
     THE TEXTILE (Flat)              THE MOUNTAIN (Warped)
===========================       ===========================
       [ PROGRAMME ]              ▲       [ DESIGN ]        ▲
___________________________      / \_______________________/ \
~~~~ Idle Breeze Ripple ~~~~    /   \  Kopitoto + Knyazhevo  \
===========================    /     \========================\
```

### 🎨 Visual Identity
* **Generative Themes:** Each session randomly spins up one of three editorial textile colorways (Plum/Pink, Deep Teal/Ice Blue, or Olive-Black/Acid Yellow) with unique distortion filters.
* **Dynamic Typography:** Italic treatments are driven procedurally by character casing (e.g., `dEsiGn` triggers distinct slants on lowercase/uppercase mixes) to reference avant-garde print layouts.

---

## 🛠️ Technical Deep-Dives

> **🤖 The "Prompt Engineer" Tax:** This was my first project using an AI dev agent. Instead of lazily spamming the **"make it better"** button until the codebase melted into unmaintainable mush, I treated the agent like a precision calculator—feeding it explicit matrix transformations and math formulas to bypass boilerplate generation so I could manually orchestrate the shaders and physics.

### 1. SVG Line Art → GPU Heightmap
To avoid heavy 3D asset overhead, we rasterize the designer's raw SVG contour onto an offscreen canvas at runtime. The canvas is scanned column-by-column into a 1D float array, box-blurred for smoothness, and uploaded to the GPU as a **1×N data texture**. A boundary `smoothstep()` ensures the terrain loops seamlessly.

### 2. Input-Driven Vertex Deformation
Deformation lives inside a custom `ShaderMaterial`. The vertex shader offsets coordinates dynamically by pulling data from the heightmap texture multiplied by the user's scroll speed, injecting a subtle sin-wave breeze ripple. The fragment shader handles color channel splitting, causing interactive **chromatic aberration** that scales with scroll acceleration.

### 3. Synced GPU-to-DOM Label Projection
To avoid fuzzy WebGL text maps, all typography stays in the native DOM for razor-sharp rendering. The exact shader displacement equations are mirrored on the CPU. Every frame, JavaScript computes the heightmap offset, projects the 3D surface points into 2D screen coordinates using the camera projection matrix, and updates the text via hardware-accelerated `transform: translate3d()`.

### 4. Bounded Inertia Scroll Layer
Unchecked mobile gestures break tightly timed scroll interactions. Combining **Lenis** with a custom physical damping system, we decoupling raw touch inputs from camera velocity. We enforced a strict speed cap and bounded drag constraints to stop flick gestures from skipping past critical mountain peaks and paired neighborhood markers.

---

## 📸 Production Assets to Add
To match the iconic visual layout of a **Codrops case study**, embed these asset components directly into your portfolio layout:
1. **The Gateway QR Code:** Place a prominent QR code block directly next to the desktop "Made for Mobile" mockup screen so agencies can scan and immediately experience the site on their devices.
2. **Textile Swatch Loop GIFs:** Short 3-second looping captures showcasing the subtle idle breeze animation across the three distinct colorways.
3. **Before/After Edge Fix Images:** A side-by-side technical wireframe showing how the transparent torn texture edges look with alpha filling versus without.
4. **Synchronized Video Capture:** A split-screen screen recording displaying a hand scrolling on a physical mobile device side-by-side with the real-time Chrome DevTools WebGL profiler.
