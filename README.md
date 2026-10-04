# Scalar — beta

Beta distribution for Scalar, a Figma plugin that exports Variables + paint/text/effect
styles to DTCG 2025.10 design-token JSON. This repo holds the plugin build and test
fixtures only. Nothing sensitive lives here.

**This repo is public.** Read section 3 before sharing any results.

## 1. Install the plugin

In the Figma desktop app: `Plugins → Development → Import plugin from manifest…`, then
select [`plugin/manifest.json`](plugin/manifest.json).

Run it on your real file. Export, and see what happens — a clean report, a messy one,
anything that breaks or confuses you is useful.

## 2. Extended Collections fixture (if you have Enterprise access)

Separate, smaller test, now **v2** — see [`fixtures/extended-collections/README.md`](fixtures/extended-collections/README.md)
for exact steps (~5 min, synthetic data only, run in a new empty Figma file). If you
installed the earlier version, remove it first (step 1 of that README).

## 3. Send back results

**Fixture results are synthetic**, so they're safe to share publicly: put them in your
results repo and send the link. That covers `extcoll-fixture-partA.json`,
`extcoll-fixture-partB.json` if you ran Part B, and Scalar's report and export from the
fixture file.

**Results from your real file are not safe to share publicly.** Scalar's report and export
contain your design system's token and style names. Share them privately (direct message
or email), never in a public repo. The same goes for any notes that quote those names.
