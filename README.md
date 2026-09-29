# Scalar — beta

Private beta distribution for Scalar, a Figma plugin that exports Variables + paint/text/
effect styles to DTCG 2025.10 design-token JSON. This repo is beta-testing infrastructure
only — build + fixtures + a place to send results back. Nothing sensitive lives here.

## 1. Install the plugin

In the Figma desktop app: `Plugins → Development → Import plugin from manifest…`, then
select [`plugin/manifest.json`](plugin/manifest.json).

Run it on your real file. Export, and see what happens — a clean report, a messy one,
anything that breaks or confuses you is useful.

## 2. Extended Collections fixture (if you have Enterprise access)

Separate, smaller test — see [`fixtures/extended-collections/README.md`](fixtures/extended-collections/README.md)
for exact steps (~10 min, synthetic data only, run in a throwaway Figma file).

## 3. Send back results — via PR, not email/Slack

Open a PR adding your results under `results/<your-name>/`:

```
results/<your-name>/
  report.txt         # copy of Scalar's report output
  export/             # the exported token files (or paste relevant ones)
  notes.md            # anything that felt off, broke, or was confusing
```

For the Extended Collections fixture, also include the console dump
(`results/<your-name>/extended-collections-dump.txt`).

A PR keeps everything in one reviewable, private place instead of scattered email
attachments — comment threads on the PR work fine for back-and-forth too.
