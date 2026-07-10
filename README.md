# Rafi Saeful Rahman — Portfolio

Personal portfolio website of **Rafi Saeful Rahman**, Software Engineer (Senior Java Backend), built from my résumé.

An interactive 3D "service network" (nodes and connections — a nod to backend & distributed systems work) floats behind the content and reacts to mouse movement and scrolling.

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
