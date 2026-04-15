# Mechabellum Prototype

A browser-based fantasy autobattler prototype inspired by the positional strategy loop of Mechabellum. The project focuses on fast iteration around prep, placement, unit upgrades, buildings, AI-driven enemy waves, and short deployment-to-battle feedback loops.

Live demo: https://mechabellum-prototype.web.app

## Overview

The prototype is built as a lightweight TypeScript + Vite app and deployed on Firebase Hosting. It is designed to stay easy to iterate on while still supporting a playable loop with unit unlocks, placement persistence, AI showcase flows, battle simulation, audio, and version snapshots.

Current tracked gameplay version: `0.0.41`

## Features

- Grid-based autobattler combat with a prep-to-battle round loop
- Persistent player deployment between rounds
- Unit unlocks, XP gain, and upgrade progression
- Buildings such as income and spawn structures
- AI-controlled enemy deployments and a mobile AI showcase mode
- Audio controls with music and battle SFX
- Versioned snapshots and changelog tracking for prototype evolution
- Firebase-ready hosting pipeline for static deployment

## Tech Stack

- TypeScript
- Vite
- Firebase Hosting

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Regression Tests

Run the production build plus the deterministic gameplay regression suite:

```bash
npm test
```

This covers the enemy mirror-avoidance flow, AI loan opening behavior, building slot rules, and diagonal in-range cooldown holds.

## Simulation Scripts

The repository also includes headless simulation helpers for balancing and AI checks:

```bash
npm run sim
npm run sim:ai
```

## Deployment

Firebase deploy output is generated into `hosting/`.

```bash
npm run build:hosting
npx firebase login
npx firebase deploy --only hosting --project mechabellum-prototype
```

Primary hosted URL:

- https://mechabellum-prototype.web.app

Secondary Firebase domain:

- https://mechabellum-prototype.firebaseapp.com

## Project Structure

- `src/` application source
- `public/` static assets copied into builds
- `scripts/` build and simulation utilities
- `study/` reference material and research notes
- `hosting/` generated Firebase deploy output

## Notes

- `study/` is reference material only and is not part of the runtime app.
- `hosting/` is generated output and should be rebuilt rather than edited manually.
- Prototype change history is tracked in [`CHANGELOG.md`](./CHANGELOG.md).
