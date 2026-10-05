# Scalar Fixture v3 — Extended Collections

**Requires a Figma Enterprise plan.** On any other plan the plugin stops with a message —
send that message back, it is a useful result.

Synthetic data only. Use new, empty Figma files — never a production file. Run each part
**once per new file**; to re-run, start a new file.

The results include your Figma app version (from the plugin panel's browser info), so we
know which Figma produced them. Nothing about you or your files is recorded.

## Part A — required (~5 min)

1. **Remove older fixtures** (if you ran an earlier version): `Plugins → Development →
   Manage plugins in development` → remove any **Scalar Fixture** entry that doesn't say
   **v3** (`…` → **Remove**). If none is listed, skip this step.
2. **Import:** `Plugins → Development → Import plugin from manifest…` → select
   `manifest.json` in this folder.
3. **Open a new, empty file** (call it File 1).
4. **Run:** `Plugins → Development → Scalar Fixture v3 — Extended Collections →
   1. Run main test`. Make sure the name says **v3**. It builds two collections and four
   extensions, then tests them. This takes a few seconds.
5. **A panel opens** with the results. Click **Download extcoll-fixture-partA.json**
   (or **Copy results** and paste into a text file).
   - **If the panel says to follow "If the panel sends you here",** do that section now,
     before step 6.
6. **Run the real Scalar plugin** on File 1 and export. Keep its report and output files
   (or the ZIP).
7. **Send back:** the file from step 5, any file from "If the panel sends you here", and
   Scalar's report and files from step 6.

A ✗ in the panel's list is fine. Send the results as they are.

## If the panel sends you here

Only if step 5's panel tells you to. It means the plugin couldn't create the extension or
set its overrides by itself, so you make them by hand. Stay in File 1.

1. **Extend the collection:** in the `Local variables` panel, right-click
   `ExtColl Parent` and choose the option to extend it into a new collection (wording varies
   by Figma version, e.g. "Extend collection"). Name it **Acme**. If `Acme` already exists,
   skip to step 2.
2. **In `Acme`, set exactly these overrides.** Leave everything else as it is.

   | Variable | Mode | Set to |
   |---|---|---|
   | `color/semantic/accent` | Light | any color, e.g. `#FF6B00` |
   | `color/primitive/blue-900` | Light and Dark | any two colors |
   | `color/semantic/border` | Light | the variable `color/primitive/blue-500` |
   | `space/medium` | Light | `12` |
   | `brand/name` | Light | `Acme` |

3. **Run:** `Plugins → Development → Scalar Fixture v3 — Extended Collections →
   2. Probe existing extensions (only if the panel asks)`.
4. **Download** `extcoll-fixture-existing.json`, then continue with Part A step 6.

## Part B — optional (~10 min; needs permission to publish a library)

Do Part A first, in File 1.

1. **In File 1,** publish it as a library (`Assets` panel → `Libraries` icon →
   `Publish`). The `ExtColl Parent` and `ExtColl Primitives` variable collections must be
   included.
2. **Open a second new, empty file** (File 2).
3. **In File 2,** turn on the library from File 1 (`Assets` panel → `Libraries` icon).
4. **In File 2, run:** `Plugins → Development → Scalar Fixture v3 — Extended Collections →
   B. Remote parent (optional, in a second file)`.
5. **Download** `extcoll-fixture-partB.json` and send it back.

If your Figma's menu labels differ, any route that publishes File 1 as a team library and
turns it on in File 2 works.
