# PAN Animation Player

A browser-based viewer for the `.PAN` animation files used by Sid Meier's Covert Action (1990).
Open a file and it plays the animation exactly as the game's engine would, with full visibility
into the virtual machine that drives it.

Everything runs client-side in plain HTML, CSS and JavaScript. No file is uploaded anywhere.

## Features

* Play, pause, step, rewind and scrub through frames
* Set VM register values before playback or at any frame, as the game does to pick sprites
* Disassembled instruction and step listings with live instruction pointer and per-sprite highlights
* Sprite slot table, VM stack and registers, triggered audio indices and warnings
* Every embedded image shown through the file's colour block
* Export any frame range as a WebM video at the file's frame rate
* Built-in help describing the PAN format and the viewer

## Building

```bash
npm install
npm run build
```

Then open `index.html` in a browser. `npm run watch` rebuilds on change and `npm run check`
type-checks the sources.

Pushes to `main` build and publish the page to GitHub Pages through the workflow in
`.github/workflows/pages.yml`; enable Pages with the "GitHub Actions" source in the repository
settings for it to deploy.

## Format

The PAN format, its instruction set and sprite step semantics are documented in the
[CovertActionTools](https://github.com/RedMike/CovertActionTools) repository, which this viewer
is a focused port of.
