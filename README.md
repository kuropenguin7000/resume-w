# Rafi Saeful Rahman — Portfolio

Personal portfolio website of **Rafi Saeful Rahman**, Software Engineer (Senior Java Backend), built from my résumé.

An interactive 3D playground runs behind the content: drive a low-poly Nissan GT-R around a glowing race track, smash through cones, barrels and crates, bounce off rocks and tire stacks, and follow yourself on the minimap — all beneath a floating "service network" (nodes and connections, a nod to backend & distributed systems work). While you drive, the page content fades out so you can see the world; stop and it fades back in.

## Controls

- **Desktop:** `W A S D` or arrow keys
- **Mobile / touch:** virtual joystick (bottom-left), MMORPG style — push up to accelerate, sideways to steer

## Tech stack

- [Vite](https://vitejs.dev/) — build tool & dev server
- [Three.js](https://threejs.org/) — interactive 3D background
- Vanilla JavaScript + CSS — no framework, fast static output
- [Firebase Hosting](https://firebase.google.com/docs/hosting) — deployment

## Development

```bash
npm install
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

## Deploy to Firebase

One-time setup:

```bash
npm install -g firebase-tools
firebase login
firebase use --add    # select (or create) your Firebase project
```

Then, every deploy:

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` is already configured to serve the `dist/` folder.

## Structure

```
index.html          # all content sections (hero, about, experience, skills, contact)
src/main.js         # Three.js scene + page behaviour
src/style.css       # styles
public/resume-rafi.pdf  # downloadable résumé
firebase.json       # Firebase Hosting config
```
