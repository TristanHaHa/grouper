# Grouper

A browser-based 3D ride-station simulator. Manage queues, group guests, check restraints, and dispatch trains across two tracks.

**[Play Grouper in your browser](https://tristanhaha.github.io/grouper/)**

## Run locally

Use Node 24.20.0 (pinned in `.nvmrc`):

```sh
npm ci
npm run dev
```

Open `http://localhost:3000/grouper/`. No API key or backend is required. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

## Validate and build

```sh
npm run lint
npm test
npm run build
npm run preview
```

The app requires a browser with WebGL support. Keyboard/mouse and supported gamepads control the simulation.

## GitHub Pages

Pushes to `main` run type checking, the simulation tests, and a production build before publishing `dist/` through `.github/workflows/pages.yml`. Pull requests run the build checks without deploying. You can also deploy manually from GitHub Actions.

Vite uses `/grouper/` as the base path so the built assets load on the project site. The app runs entirely in the browser; deployment does not include local environment files or require repository secrets.
