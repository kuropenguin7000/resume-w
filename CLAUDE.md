# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal portfolio site for Rafi Saeful Rahman (Senior Java Backend Engineer), built from his resume. A Bruno-Simon-inspired driving mini-game (low-poly Nissan GT-R on a circular track) runs behind the scrollable resume content. Deployed to Firebase Hosting; pushed to https://github.com/kuropenguin7000/resume-w.

## Commands

```bash
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # serve the production build locally

npm run build && firebase deploy --only hosting   # deploy (requires firebase login + project selected)
```

There are no tests and no linter. Verification is manual, in the browser (see Debugging below).

## Architecture

Static single-page site, no framework: Vite + Three.js + vanilla JS/CSS. Three files do all the work:

- `index.html` — all resume content, in numbered sections (01 About … 05 Contact). Content edits happen here, not in JS.
- `src/main.js` — one module containing the entire 3D scene and all page behaviour.
- `src/style.css` — all styles; theming via CSS variables on `:root` (`--accent` teal, `--accent-2` amber, dark `--bg`).

Two visual layers: a fixed full-screen WebGL canvas (`#webgl`, z-index 0) and the scrollable DOM content (`.page`, z-index 1) on top. Fixed HUD elements — joystick, minimap, drive-hint — deliberately live **outside** `.page` so they stay visible when driving fades the content (see below).

### Systems inside src/main.js

- **World layout**: ground plane at `GROUND_Y = -3.6`; circular track centered on the origin (centerline radius 22, band 18.5–25.5) with a start gate at angle 0; the floating "service network" hovers over the infield; car movement is clamped to `WORLD_RADIUS = 65`.
- **Car physics**: simple kinematic model, not a physics engine. `speed` and `heading` are module-local variables; the mesh's `car.rotation.y` is derived from `heading` each frame — setting the mesh rotation externally does nothing.
- **Obstacles, two kinds**:
  - `solidObstacles` — rocks, gate posts, tire stacks. Circle collision that pushes the car out and reverses speed. Positions are **cached in the array at creation**; moving a solid's mesh later will not move its collision.
  - `knockables` — cones, barrels, crates. State machine `upright → flying → down` with per-type `kick`/`spin` factors; collision checks only hit `upright` items.
- **Camera**: fixed-offset follow (`CAMERA_OFFSET`) with frame-rate-independent damping (`1 - Math.exp(-k*dt)`), plus mouse parallax. It never rotates with the car.
- **Drive-fade**: any drive input (or |speed| > 2) toggles the `driving` class on `<body>`; CSS fades `.page` to 5% opacity and disables its pointer events. This is the mechanism that keeps content from blocking the view — preserve it when adding features.
- **Input**: keyboard map (WASD + arrows; arrows call `preventDefault` so they don't scroll) and a virtual joystick that is only *displayed* on touch devices via `@media (hover: none) and (pointer: coarse)` — its JS handlers are always attached.
- **Minimap**: 2D `<canvas>` redrawn every frame from world state; obstacle dots are color-coded by type.
- **Reduced motion**: `prefers-reduced-motion` renders one static frame and never starts the animation loop (car is intentionally undrivable); reveal animations are skipped too.

### Debugging

`window.__debug` (guarded by `import.meta.env.DEV`, stripped from production builds) exposes `car`, `keys`, `joystick`, `knockables`, `speed`, `frames`, and `step(dt)`. Headless/hidden browser tabs freeze `requestAnimationFrame`, so automated checks should drive the sim manually: dispatch `KeyboardEvent`s (use `code`, e.g. `KeyW`), then call `__debug.step(1/60)` in a loop and read positions/state.

## Content rules

- The resume PDF served by the site is `public/resume-rafi.pdf` (the canonical copy); the identical root-level `resume-rafi.pdf` is gitignored as the original source.
- The owner's phone number was deliberately removed from the site — don't reintroduce it from the PDF when editing contact info.
