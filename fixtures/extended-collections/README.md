# Scalar Fixture v2 — Extended Collections

**Requires a Figma Enterprise plan.** On any other plan the plugin stops with a message —
send that message back, it is a useful result.

Synthetic data only. Use new, empty Figma files — never a production file. Run each part
**once per new file**; to re-run, start a new file.

## Part A — required (~5 min)

1. **Remove the old fixture** (if you ran an earlier version): `Plugins → Development →
   Manage plugins in development` → find **Scalar Fixture — Extended Collections** (no
   "v2") → `…` → **Remove**. If it isn't listed, skip this step.
2. **Import:** `Plugins → Development → Import plugin from manifest…` → select
   `manifest.json` in this folder.
3. **Open a new, empty file** (call it File 1).
4. **Run:** `Plugins → Development → Scalar Fixture v2 — Extended Collections →
   1. Run main test`. Make sure the name says **v2**. It builds two collections and four
   extensions, then tests them. This takes a few seconds.
5. **A panel opens** with the results. Click **Download extcoll-fixture-partA.json**
   (or **Copy results** and paste into a text file).
6. **Run the real Scalar plugin** on File 1 and export. Keep its report and output files
   (or the ZIP).
7. **Send back:** the file from step 5, plus Scalar's report and files from step 6.

A ✗ in the panel's list is fine. Send the results as they are.

## Part B — optional (~10 min; needs permission to publish a library)

Do Part A first, in File 1.

1. **In File 1,** publish it as a library (`Assets` panel → `Libraries` icon →
   `Publish`). The `ExtColl Parent` variable collection must be included.
2. **Open a second new, empty file** (File 2).
3. **In File 2,** turn on the library from File 1 (`Assets` panel → `Libraries` icon).
4. **In File 2, run:** `Plugins → Development → Scalar Fixture v2 — Extended Collections →
   B. Remote parent (optional, in a second file)`.
5. **Download** `extcoll-fixture-partB.json` and send it back.

If your Figma's menu labels differ, any route that publishes File 1 as a team library and
turns it on in File 2 works.
