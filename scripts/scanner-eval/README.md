# Scanner eval

Two small scripts to measure scanner accuracy on your own held-out photos. The method and the latest results are in [docs/scanner.md](../../docs/scanner.md#how-well-it-works-evaluation).

- `embed.mjs` makes fingerprints with the shipped browser pipeline (`src/lib/clip/browser.ts`) in headless Chromium.
- `score.py` scores query fingerprints against DB fingerprints with the same matching as `/api/scan`. It needs only numpy.

Keep test photos and vector files out of the repo. Held-out photos are usually third-party.
