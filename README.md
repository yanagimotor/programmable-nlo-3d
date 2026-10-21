# Programmable on-chip nonlinear photonics: interactive 3D

An interactive 3D model of the experiments in R. Yanagimoto et al., "Programmable on-chip nonlinear
photonics", Nature 649, 330-337 (2026), https://doi.org/10.1038/s41586-025-09620-9 .

**Open the page: https://yanagimotor.github.io/programmable-nlo-3d/**

Made by Ryotatsu Yanagimoto, https://yanagimotor.github.io

A pattern of green light projected onto the chip writes a chi(2) grating into a silicon-nitride slab
waveguide: where light falls on the photoconductor on top, the bias field reaches the light-guiding core.
Changing the pattern changes what the same chip does to infrared light. The page shows the set-up in 3D
next to the paper's measured data, figure by figure.

## Views

Every view names its figure panel; content computed from a model says "model" or "simulation" on screen.

- **The setup** (Fig. 1) and **How it works** (Fig. 1b): the layers of the chip, photoconduction, the
  bias field in the core, the chi(2) grating, and quasi-phase matching (steps 5-7: exact sums over the
  grating, model).
- **Real-time tuning** (Fig. 2): tuning curves for 14 stripe spacings; feedback that follows a drifting
  pump laser, with and without feedback (measured); "Try it", an interactive model.
- **Spectral engineering** (Fig. 3a, 3c; Supplementary Fig. S30): one colour, a period scan, four
  colours, a broad band, and "CORNELL" and "NTT" written in the spectrum (measured).
- **Training** (Fig. 3b, S27): the pattern optimised step by step towards a target spectrum (measured).
- **Spatial engineering** (Fig. 4, S34-S37): plain beam, focus, nine spots, Airy beam, steering (measured
  output profiles; the light inside the chip is the paper's model).
- **Spatio-spectral engineering** (Fig. 5, S40): different spots at different colours (measured).
- **Quantum light** (Supplementary S2D): photon pairs whose colours are set by the pattern (proposed,
  not demonstrated; simulated).

The 3D set-up is simplified and not to scale; the instruments are drawn after the ones used, without
markings.

## Data

Measured curves and images come from the paper's public data set, exported to `docs/data-<version>/`.
"Show the figure in the paper" opens the published data panels (CC BY 4.0).

## Run it locally

Browsers do not run JavaScript modules from `file://`, so the page needs a small local web server:

- Windows: double-click `View-locally.bat` (opens Edge at http://127.0.0.1:8137/).
- Anywhere with Python 3: `python serve.py docs 8137`, then open http://127.0.0.1:8137/ .

URL options: `?lang=ja`, `?mode=colors&preset=four`, `?mode=spatial&preset=nine`, `?motion=full` or
`?motion=reduce`, `?quality=low` (slower computers).

## Publish with GitHub Pages

The site is the `docs/` folder, published by GitHub Pages (Settings -> Pages -> "Deploy from a branch", branch
`main`, folder `/docs`) at https://yanagimotor.github.io/programmable-nlo-3d/ . Every link in it is relative.

## Contents

- `docs/index.html`, `docs/css/`, `docs/js-<version>/` - the page: plain JavaScript modules, no build
  step. The script and data folder names change with each update, so browsers never mix versions.
- `docs/data-<version>/` - the measured data and the published panels (`paper/`)
- `docs/vendor/three-0.186.1/` - three.js r186 (MIT licence), so the page also works offline
- `serve.py`, `View-locally.bat` - local viewing only
