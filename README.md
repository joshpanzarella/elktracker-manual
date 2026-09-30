# ElkTracker visual manual

An animated manual for [ElkTracker](https://elktracker.io/manual), the tracker
for Linux handhelds. The device's screen is rebuilt in code and driven by
data, so every moment can be paused, zoomed, slowed down and annotated.

Built with [Remotion](https://www.remotion.dev) (React + TypeScript).

## Run it

```sh
npm install
npm run dev              # Remotion Studio + audio that re-renders when data changes
npx remotion render      # MP4 of the first composition -> out/PhraseBasics.mp4
npm test                 # engine + scene tests
npm run check-sync       # listens to the WAV and checks it against the picture
```

- **Audio renders itself.** `remotion.config.ts` renders every scene's WAV
  before `remotion studio` or `remotion render` starts (up-to-date scenes are
  skipped). `npm run audio` does it by hand; `npm run audio:watch` keeps doing it.
- **No Chrome download?** (containers, CI) Point Remotion at a local one:
  `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome npx remotion render`.
- Studio shows two folders: **Chapters** (the manual) and **Tools**
  (`ScreenGallery`: every built screen, for tweaking the theme by eye).

## How it works

**The screen at frame f is a pure function of the data.** Nothing is kept
between frames, so scrubbing to any frame in Studio shows the right screen
immediately.

```
song.json ──┐
            ├─► stateAt(f)  = song.json + every device event with frame <= f
timeline.json                (cursor, notes, FX, view, transport)
            ├─► remap       = video frame <-> music time, through the playback rate
            └─► schedule    = every row, tick, note, ARP step, retrigger ... at a
                              fractional video frame, read from stateAt at that moment
                   │
      picture ◄────┴────► sound
  playhead, flashes         scripts/render-audio: the same schedule, placed
  (src/screen)              sample-accurately in a WAV per scene
```

**One clock.** Rows and ticks are laid out in *music time* at the song's own
tempo. A `rate` event in the timeline (0.25 = quarter speed) changes how fast
music time runs against video time; ramps are linear and exactly invertible.
The picture and the WAV both place every row through that one map, so they
cannot drift. The sequencer slows down; the sound does not (envelopes run in
real time), so at ¼ speed you hear every ARP step at its true pitch.

**Stale audio can't ship.** Each WAV is named by a hash of everything that
affects the sound (song, device events, rate changes, fps, length). If the
picture's data changes and the WAV isn't re-rendered, the file it asks for
doesn't exist: Studio shows a red banner and a render stops with an error.

`npm run check-sync` measures the rendered audio itself (attacks, drum
transients, and the pitch just before and after every legato note and ARP
step) against the schedule, by playback rate. It passes on the WAV and on the
audio pulled back out of the MP4, and fails on a copy shifted by 10 ms.

## Layout

```
src/
  theme.ts            every visual number: grid, font, colours, screen layouts, stage
  engine/             pure TypeScript, no React: shared by the picture and the audio script
    song.ts           SONG > CHAIN > PHRASE > INSTRUMENT, song.json parser
    timeline.ts       timeline.json parser
    editor.ts         the button reducer: what A, B, R, L, START... do on each screen
    timeRemap.ts      frames <-> music time
    sequencer.ts      playback schedule
    playback.ts       what is playing at a frame (playhead, flashes)
    scene.ts          song + timeline -> cached lookups, audio key
  screen/             pure: views build a character grid; paint draws it on a canvas
    views.ts          Phrase, Chain, Song, status bar
    anchors.ts        named regions (phrase.col.NOT ...) for callouts and the camera
  components/         React: TrackerScreen (canvas), captions, callouts, camera, HUD
  scenes/             one file per manual chapter
  data/<scene>/       song.json + timeline.json per scene; scenes.ts lists them
scripts/
  render-audio.ts     WAV per scene (placeholder synth in scripts/audio/)
  check-sync.ts       audio-vs-picture measurement
docs/screens.md       screens and columns to build, in ElkTracker's terms
```

## song.json

The project, written the way the screen shows it.

```jsonc
{
  "project": { "name": "BASICS", "bpm": 120, "speed": 6, "swing": 0 },
  "song":   { "00": "00 01 -- -- -- -- -- --" },          // row: 8 channels; -- empty, EN end
  "chains": { "00": { "name": "LEAD", "slots": ["00", "01", "00 +5"] } },  // phrase + transpose
  "phrases": {
    "01": { "name": "ANSWER", "len": 16, "steps": [
      "G-3 00 --- -- --- --",                               // NOT IN FX1 P1 FX2 P2
      "", "", "",
      "A#3 00 ARP 37"                                       // missing columns are empty
    ] }
  },
  "instruments": {
    "00": { "name": "LEAD", "type": "SUB", "volume": "B0", "cutoff": "A8", "res": "50",
            "env": { "a": "00", "d": "48", "s": "90", "r": "30" },
            "osc": [{ "wave": "SAW", "semi": 0, "level": "FF" }, { "wave": "SQR", "semi": -12, "level": "70" }] },
    "01": { "name": "KIT", "type": "DRUM",
            "pads": [{ "sample": "synth:kick" }, { "sample": "" }, { "sample": "synth:snare" }] }
  }
}
```

Hex where the device shows hex (`00`-`FF`); notes as `C-4` (MIDI 60), `A#3`,
`OFF`; transpose in signed semitones. Parse errors name the exact step.

## timeline.json

Events at frames. One key says what the event is:

| Event | Example | What it does |
| --- | --- | --- |
| `press` | `{ "frame": 90, "press": "A" }` | a button, as on the device: `A`, `B`, `UP`, `A+RIGHT`, `SELECT+START`, `L`, `R` ... |
| (repeat) | `{ "frame": 105, "press": "DOWN", "repeat": 4, "every": 3 }` | four presses, 3 frames apart |
| `cursor` | `{ "frame": 0, "cursor": { "row": "0C", "col": "FX1" } }` | put the cursor somewhere directly |
| `set` | `{ "frame": 0, "set": { "phrase": "00", "step": "04" }, "value": "D#4 00" }` | write a value directly (step, `chain`+`slot`, `songRow`+`channel`, `project`) |
| `view` | `{ "frame": 60, "view": "CHAIN", "chain": "00" }` | switch screens directly |
| `caption` | `{ "frame": 0, "title": "Enter notes", "caption": "Tap [A] ... **bold**", "until": 90 }` | margin text; `[A+RIGHT]` draws keycaps, `**x**` the accent colour |
| `callout` | `{ "frame": 282, "callout": "phrase.col.NOT", "label": "NOT", "text": "...", "until": 324 }` | bracket + leader + label |
| `camera` | `{ "frame": 255, "camera": "phrase.grid", "zoom": 2, "ease": 24 }` | eased zoom/pan; `"screen"` zooms back out; zoom optional (fits) |
| `rate` | `{ "frame": 600, "rate": 0.25, "ramp": 0 }` | playback speed: the time-remap |

Plus `fps`, `durationInFrames`, `fadeIn`, `fadeOut`, and `start` (view,
chain, phrase, cursor). Targets for `callout` and `camera` are anchor names
(see `src/screen/anchors.ts`: `phrase.col.NOT`, `phrase.row.03`,
`phrase.cell.00.FX1`, `chain.col.TRANSPOSE`, `song.grid`, `status.bar` ...),
cells `{ "col", "row", "w", "h" }`, or device pixels `{ "x", "y", "w", "h" }`.
Anchors come from the same layout the screens draw with, so moving a column
in `theme.ts` moves every callout and zoom that points at it.

Buttons follow the manual: A-tap inserts the last value (a note also gets
the last instrument), A+LEFT/RIGHT ±1 (a semitone), A+UP/DOWN ±16 (an octave
on notes, 12 on transpose), B clears (on an empty note: OFF), R dives, L backs
out, START plays the song, SELECT+START loops the current phrase or chain.

## Tweaking the look

Everything is in `src/theme.ts`; components hardcode nothing.

- `grid`: columns, rows, cell size in device px.
- `font`: family and file, size, horizontal stretch, offsets, and `binarize`
  (snaps anti-aliased edges to hard pixels).
- `colors`: one palette, roles named by use (`cursorBg`, `beatStripe`, `flash` ...).
- `sprites`: pixel icons as `#` strings (play, stop, loop, marker, battery).
- `cursor.style`, `playhead`, `flash`: how those behave.
- `views.phrase / chain / song`: where every field sits, in cells.
- `statusBar`: what sits where on the bottom row.
- `stage`: the 1920 x 1080 frame around the screen: margins, captions,
  callouts, HUD, camera padding, fonts.

Open `Tools/ScreenGallery` in Studio to see every screen at once.

## Placeholders and guesses

These are marked in the code and listed in `docs/screens.md`, with the
questions that would settle them:

- **Layouts**: every screen position is a guess from the manual's text.
- **Font**: VT323. The manual's credits name a public-domain bitmap font by
  Daniel Hepper, most likely `font8x8`, which at 2x fills this 16 x 16 cell.
- **Colours**: sampled from the device mockup on elktracker.io.
- **Sound**: simple synth voices; drum pads are synthesized (`synth:kick` ...).
- **Unconfirmed behaviour**: FX command cycle order, what a fresh FX gets as
  its parameter, the double-tap window, hint wording, how a chain with an
  empty slot 0 plays.

Remotion is free for individuals and small teams; larger companies need a
[company licence](https://www.remotion.dev/license).
