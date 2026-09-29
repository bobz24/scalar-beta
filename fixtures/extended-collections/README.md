# Scalar fixture — Extended Collections

10-minute favor. Synthetic data only — no real design-system content. **Run in a new,
empty Figma file**, not a production one.

## Steps

1. **Import:** `Plugins → Development → Import plugin from manifest…` → select
   `manifest.json` in this folder.
2. **Open the console first:** `Plugins → Development → Open Console`.
3. **Run:** `Plugins → Development → Scalar Fixture — Extended Collections →
   1. Build parent fixture`.
   Creates collection `ExtColl Parent`, modes `Light`/`Dark`, 9 variables.
4. **Extend it, by hand, in Figma's UI** (not scripted — on purpose, see "Why" below):
   right-click `ExtColl Parent` in the Local variables panel → the menu option to extend
   it into a new collection (label differs by Figma version — look for wording like
   "Extend collection" or "New extension"). Name the new collection `Acme`.
   - **If you don't see that option at all**, stop and tell me — that itself is a
     useful result (means this Figma plan/version can't create one via UI either).
5. **In `Acme`, set exactly these overrides** (leave everything else untouched/inherited):

   | Variable | Override |
   |---|---|
   | `color/semantic/accent` | Light mode only → any raw color (e.g. `#FF6B00`); leave Dark inherited |
   | `space/medium` | `12` |
   | `radius/button` | `6` |
   | `brand/name` | `"Acme"` |

6. **Run:** `Plugins → Development → Scalar Fixture — Extended Collections →
   2. Dump collections + variables`.
7. **Copy from the console:** everything between the lines
   `FIXTURE_DUMP_START:EXTENDED_COLLECTIONS` and `FIXTURE_DUMP_END:EXTENDED_COLLECTIONS`.
   Paste into a text file.
8. **Run the real Scalar plugin** on the same file. Export. Keep its report + output
   files (or the ZIP).
9. **Send back two files:** the step-7 dump, and the step-8 Scalar output/report.

## Why step 4 is manual, not scripted

Whether the Figma Plugin API can create an extension at all is unconfirmed — this
fixture exists partly to find out. Scripting a guess at a nonexistent method would just
fail. Doing it by hand in Figma's own UI is the reliable path, and the step 6 dump will
show whatever extension data Figma exposes on a collection made that way.
