# Screens and columns to build

Proposal for after Milestone 1, in ElkTracker's own terms. Source: the
official manual (elktracker.io/manual, read 2026-09-30). Nothing here is
built past Milestone 1 until you've approved it.

**Status key:** ✅ built (placeholder layout) · 🔲 to build

## Two corrections to the brief

The manual differs from the brief in two places, and the build follows the
manual:

| Brief said | ElkTracker has | Built as |
| --- | --- | --- |
| Phrase view: 16 steps, **8 channels** | A **phrase is one channel's part**: 16 steps of NOT, IN, FX1, P1, FX2, P2. The 8 channels live on the **Song** screen. | Phrase screen with those six columns |
| Song/**pattern** view showing phrases in sequence | No patterns. **Chains** hold phrases in sequence (16 slots); the **Song** holds chains per channel. | Milestone 1 steps back from Phrase to **Chain** |

## The hierarchy

```
SONG        128 rows x 8 channels, each cell a CHAIN number (or END)
CHAIN       16 slots, each a PHRASE number + transpose
PHRASE      up to 16 steps, each NOTE + INSTRUMENT + 2 FX
INSTRUMENT  one of 64 slots; one of 9 engines
```

R dives one level down, L backs out. SELECT+LEFT/RIGHT cycles the eight main
screens in this order: Song, Chain, Phrase, Instrument, Track, Mixer, Project,
Settings.

## Main screens

### 1 · SONG ✅ measured from a photo
- **Grid:** rows `00`-`7F` (gutter), channel headings `C1`-`C8`; cells:
  chain `00`-`7F`, `EN` (END), empty `--`. Beat stripe every 4th row.
- **Play position:** a dot left of each channel's current cell (they scatter:
  channels advance independently). Not seen yet: guessed.
- **Header:** project name top-left, yellow; accent dot when unsaved and the
  label of the chain under the cursor top-right (not seen yet: guessed).
- **Right panel:** a divider, the `CH IN NOTE` table (8 rows), a separator,
  and a 3x3 grid of scope boxes `1`-`8` and `M`, each split by a line.
  Exact positions: `docs/reference.md`.

### 2 · CHAIN ✅ guessed layout, in the Song screen's style
- **Slots** `0`-`F`: phrase `00`-`FE`, transpose -48..+48 (A+LEFT/RIGHT 1,
  A+UP/DOWN 12). Plays until its first empty slot.
- **Name row** above slot 0 (8 chars), shown next to the title; label of the
  phrase under the cursor top-right. Beat stripes.

### 3 · PHRASE ✅ guessed layout, in the Song screen's style
- **Steps** `00`-`0F`: `NOT` (note / `OFF` / `---`), `IN` (instrument or
  empty), `FX1` `P1`, `FX2` `P2`.
- **LEN** header above step 00 (1-16; steps past LEN keep their content but the
  gutter dims); **name row** above LEN.
- Instrument name top-right when on `IN`; full FX name in the status-bar hint
  when on an FX column. Beat stripes.

### 4 · INSTRUMENT 🔲 (next, if you agree)
- **Page 1 / 2** shown as `1/2` top-right. Name row above TYPE;
  `(EMPTY - EDIT TO CREATE)` when unused.
- **Page 1:** TYPE, then the engine's fields (left column) and the shared ones
  (right column): VOLUME, PAN, CUTOFF, RES, SEND A, SEND B, SEMI, SCALE, ROOT,
  CHOKE (+ FINE on Sampler and Wavetable).
- **Page 2:** LFO 1, LFO 2 (ASSIGN, SYNC, RATE, DEPTH, RETRIG) and MOD 1-4
  (target). A `~` marks any field an LFO or MOD slot targets.
- **Engine fields**, per the manual:

| TYPE | Left column |
| --- | --- |
| SAMPLER | SAMPLE, EDIT, LOOP, START, LOOPST, END, SLCMOD, SLCRT, FINE |
| SUB | 3 oscillators x (WAVE, SEMI, FINE, LEVEL); ADSR |
| WAVETABLE | WTABLE, WT POS, FINE; ADSR |
| MACRO | SHAPE, TIMBRE, COLOR; ADSR |
| MULTI | MODEL, TIMBRE, HARM, MORPH; ADSR (ENV D) |
| RESO | MODEL, STRUCT, BRIGHT, DAMP, POS |
| CHIP | channels A-D: wave (SQR P25 P12 TRI NES SIN NSE OFF); B-D: SEMI, V; PW; ADSR |
| DRUM | 8 pad rows `C-4`-`G-4`: sample + choke group (right column has no CUTOFF/RES/SEMI) |
| MIDI | CHAN, BANK, PROG, SCALE, ROOT |

### 5 · TRACK 🔲
- 8 channel rows: insert FX (`DRIV` `CRSH` `CHOR` `DELY` `FLNG` `PHAS` `LPF`
  `HPF` `SAT`, or `----`), `P1`, `P2`.
- Bus A (reverb): TIME, DAMP. Bus B (delay): TIME (FREE `00`-`FF`, or SYNC
  N/D), FDBK, FREE/SYNC.

### 6 · MIXER 🔲
- 8 VU meters with faders; `M` (mute) and `S` (solo) rows.

### 7 · PROJECT 🔲
- NAME, BPM, SPEED, SWING, ROOT, SCALE; then SAVE, SAVE NEW, LOAD, NEW,
  EXPORT WAV, STEMS, COLLECT, QUIT; `[UNLICENSED]` markers.

### 8 · SETTINGS 🔲
- THEME, DATA ROOT, PANIC, HELP, ACTIVATE, MAP BUTTONS, MIDI OUT, DIAGNOSTICS;
  DSP load meter (green/amber/red).

## Reached by diving, not the screen switcher 🔲
- **SAMPLE** (waveform editor, from a Sampler's EDIT): waveform with `S` `E`
  (`L`) markers and slice lines `0`-`F`. Left: START, LOOPST, END, SLICES,
  TRIM, REVERSE, NORMALZ. Right: FIT xBAR, STRETCH %, PAUL Xn, AUTOSLICE >.
- **AUTOSLICE** modal: MODE (TRANSIENT / GRID), THRESH or 4/8/16, APPLY.
- **File browsers**: samples (R previews, A loads), wavetables, projects, data root.
- **HELP**, **ACTIVATE** (licence status, device code, CHECK FOR LICENSE FILE).
- Dialogs: `OVERWRITE?`, the duplicate picker (SELECT+R2), the button-mapping wizard.

## On every screen
- **Status bar** ✅ measured: a band at the bottom with the screen name,
  `BPM:120`, the transport square (▶ / ■, with `C` / `P` / ↺ for isolation:
  guessed), the context hint (position guessed) and the battery icon.
- **Toasts** ✅: `SAVED`, `UNDO`, `SLICE ADDED`... in a box near the bottom
  right, for about 3 s.

## Proposed chapters (one scene each)

1. **Phrase basics** ✅ (Milestone 1)
2. **Your first beat**: the manual's quick start: Song > Chain > Phrase >
   Instrument, a DRUM kit, four on the floor, a SUB bass line.
3. **Chains and the song**: slots, transpose, END blocks, independent channel
   advancement (polyrhythm from phrase lengths).
4. **Phrase FX tour**: VOL, PIT, KIL, RTG, ARP, GLI, CHD, PRB, HOP, TPO, one
   short demo each, slowed down where it helps.
5. **Instruments**: the nine engines, pages 1 and 2, LFOs and MOD slots.
6. **Track and Mixer**: insert FX, the two send buses, mute/solo.
7. **Sampler and slices**: the SAMPLE editor, autoslice, `SLC` and `OFS`.
8. **Project and files**: saving, export, stems, collect.

## Questions only the device can answer

Answered by the Song screen photo: the grid, the font, the cursor, the
colours of one theme, the status bar, and the Song screen itself.

Still open (a photo answers most of them):

1. **Phrase screen**: where are the title, name and LEN? Column headings?
   What fills the right side? A photo would settle all of it.
2. **Chain screen**: the same, plus: is transpose shown as hex (`05`, `F4`)
   or signed (`+05`, `-12`)?
3. **While playing**: how the playhead looks on Phrase and Chain, whether a
   note flashes, the Song screen's play dots, what the scopes and the table
   show. A photo mid-playback would do.
4. **Which theme** is on in the photo? (NEON is the default; the photo is
   dark blue with yellow.)
5. **Status bar with a long screen name**: does `BPM:` move for
   `INSTRUMENT`, or is the name shortened?
6. **FX columns**: the order A+LEFT/RIGHT cycles commands in; what A+UP/DOWN
   does there; what parameter a newly inserted command gets.
7. **Hint text**: the exact words for FX names (built: `ARPEGGIO` ...), and
   where the hint sits.
