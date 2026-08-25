# Melba — Sofia Design Festival

**2021** · Awwwards Honorable Mention · BG-Web Awards 2021, Best Event Website

**Role** — Front-end engineering and interaction. Physics system, canvas rendering,
and the full site build in vanilla JavaScript.
Concept and visual identity: Studio Komplekt with Next DC.
Collision geometry for some bodies: [FILL: colleague's name].

---

Every August, households across Bulgaria boil fruit into compote and pack vegetables
into jars to keep the season through winter. The fourth edition of Melba took that
tradition as its identity: the year's best design, preserved and sealed.

My job was to make the jars real — a website you could pick up and shake.

## What it had to do

The identity arrived as a set of SVG produce. Peaches, tomatoes, carrots, broccoli,
plums, popcorn. The section names were drawn as objects too, broken into chunks that
behaved like separate pieces: RE / VIEW, SYMPO / SIUM, CALEN / DAR.

None of it was decoration. The navigation *was* the produce. To reach the symposium
page you had to find SYMPO and SIUM floating among the vegetables and click one. So
the physics couldn't be an ambient background effect that looked good and did nothing —
it had to stay usable while remaining unpredictable.

Built in vanilla JavaScript, no framework. Matter.js for the simulation, rendered on
its own canvas layer separate from the document.

## The problem with produce

Matter.js only simulates **convex** bodies. Anything with a dent in it — the notch in
a peach, the fronds on a carrot top, the entire silhouette of broccoli — is concave,
and the engine has to break it into convex pieces before it can be simulated.

That decomposition is where it fell apart. On the real artwork paths the results were
unstable: [FILL: what you actually saw — bodies passing through each other, jittering
instead of settling, refusing to come to rest, vertex counts exploding. Check the code
and the site for which one]. The behaviour is documented in the Matter.js community;
it's a known limit of the approach, not something I could fix by tuning parameters.

## Colliders and artwork are two different things

So I stopped trying to simulate the artwork.

Every piece of produce got a second, simplified shape — invisible, convex, built to
behave correctly — and the art director's real SVG was drawn on top of it each frame,
following its position and rotation. The visitor sees a broccoli. The engine sees
something much simpler.

This is standard practice in games, where a character has a capsule collider rather
than a mesh of their eyelashes, but I got there by reading forum threads and working
out that the thing I was fighting didn't need to be fought — it needed to be separated.
Collision geometry and render geometry solve different problems and there was no reason
to make one shape do both.

The cost is that it doesn't scale for free. Every object needed its own hand-made proxy
hull, tuned until it settled and stacked convincingly. [FILL: roughly how many —
"tens of shapes" is what you remember; count them in the source]. Late in the project,
with the festival close and my due date closer, [FILL: colleague] took over part of
that geometry work.

## Numbers

[FILL — all recoverable from the live site and DevTools:]

- Bodies simulated at once, peak: [ ]
- Frame rate on desktop, and whether it held: [ ]
- Total page weight: [ ]
- What ran on mobile: the full simulation, a reduced body count, or a separate
  static layout — the markup suggests dedicated mobile navigation buttons
- Pinch-zoom is disabled site-wide. Worth stating why: [FILL — presumably to stop
  touch gestures fighting the canvas]

## What I'd do differently

[FILL — one honest paragraph. Candidates, pick whichever is true:]

- Disabling pinch-zoom solved a gesture conflict and created an accessibility problem.
  There was a better answer and I didn't have time to find it.
- The proxy-hull pipeline was entirely manual. A build step generating hulls from the
  source SVGs would have made the last month survivable.
- [Whatever you find in the code that makes you wince.]

## Outcome

The festival ran 11–21 November 2021 across four Sofia venues, with Sofia Municipality,
seven cultural institutes, and eleven media partners behind it.

The site took an Awwwards Honorable Mention in February 2022 and Best Event Website at
the BG-Web Awards. Jury scores ran highest on creativity — nines and tens — and lowest
on usability, which is a fair reading of a site that asks you to find your navigation
in a jar.

[FILL: any traffic or ticket numbers the festival shared.]

**Live site:** melba.bg/festival2021
**Agency case study:** next-dc.com/case-study/melba-design-festival
**Awwwards:** awwwards.com/sites/melba-sofia-design-festival

---

*Built with Matter.js, the Canvas API, and vanilla JavaScript.*
