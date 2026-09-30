# Matching the real screen

The recreation is measured against photos of the device. This page says what
each photo gave us and how to add the next one.

## The Song screen (photo, 2026-09-30)

An RG40XXV photographed at an angle, straightened to 640 x 480 with
`scripts/reference/rectify.py`, saved as `public/reference/song-screen.jpg`.

**Measured** (all in device px; now in `src/theme.ts`):

| What | Value |
| --- | --- |
| Text grid | 52 x 20 cells of 12 x 24 px, starting at (8, 4) |
| Font | a 5 x 7 bitmap drawn at 2x (10 x 14 px), 4 px down in its cell |
| Title | project name, row 0, yellow |
| Channel headings | `C1`-`C8`, row 1, over the chain columns |
| Song rows | 16 visible (rows 2-17), row number at col 0, chains every 3 cols from col 3 |
| Beat stripe | rows 00, 04, 08, 0C: a lighter band from x 0 to 330 |
| Cursor | a 2 px yellow box, 4 px outside the text, 2 px inside the row |
| Divider | 2 px line at x 332, from y 28 to 457 |
| CH / IN / NOTE | px columns 520 / 552 / 584 (right-aligned to x 632), header on row 1 |
| Separator | 2 px line at y 251, x 332 to 640 |
| Scope grid | 3 x 3 boxes of 100 x 66 px from (336, 255), 2 px gaps and borders, a line 42 px down each box, labels `1`-`8`, `M` 4 px in from the corner |
| Status bar | a band from y 458; `SONG` at x 8, `BPM:120` at x 92, a 10 px square 8 px after it, battery at (602, 462) |

**Colours** are the photo's hues with the brightness corrected by eye (phone
cameras crush dark blues and clip yellows). Compare them with the device.

**Font.** Characters readable in the photo were sampled pixel by pixel, with
every copy on screen voting (28 zeros, for example): `0-9 A-I L-P S T U Z - :`.
They have their own shapes: a dotted slash in `0`, an open-top `4`, a `6`
whose middle bar leaves the left stroke. The rest of ASCII is drawn to match
and marked in `src/font/elk5x7.ts`. It is not the 8x8 font the manual's
credits name.

**Not visible in this photo**, so still guessed: what changes while playing
(play dots, table values, scope waveforms), the toast, the hint position, and
where BPM goes when the screen name is long.

## Checking by eye

Open **Tools / ReferenceSong** in Studio. Frames 0-119 fade the photo in over
the recreation and back out as you scrub; frames 120-179 show the difference,
where anything that matches goes black. Tune `src/theme.ts` until it fades.

## Adding the next photo

1. Photograph the screen straight on if you can; an angle is fine.
2. Straighten it:
   ```sh
   pip install numpy pillow
   python3 scripts/reference/rectify.py photo.jpg public/reference/phrase-screen.jpg
   ```
   Check that text starts at the same x on every row. If glare pulled an
   edge, pass the corner by hand (`--tl x,y` etc., photo px).
3. Reproduce what the photo shows in `src/data/reference-<screen>/` (song +
   timeline) and add a composition like `src/scenes/ReferenceSong.tsx`.
