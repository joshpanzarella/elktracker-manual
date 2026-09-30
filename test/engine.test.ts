import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimeRemap } from '../src/engine/timeRemap';
import { parseSong, parseStep, stepToText } from '../src/engine/song';
import { SceneData, loadScene } from '../src/engine/scene';
import { rowAt } from '../src/engine/sequencer';
import { noteName, parseNote } from '../src/engine/hex';

const CTX = { songVisibleRows: 16 };
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} to be within ${eps} of ${b}`);

let sceneCount = 0;
function scene(song: SceneData['song'], events: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): ReturnType<typeof loadScene> {
  return loadScene({
    id: `t${sceneCount++}`,
    song,
    timeline: { fps: 30, durationInFrames: 600, start: { view: 'PHRASE', phrase: '00', chain: '00' }, events, ...extra },
  }, CTX);
}

// ---------------------------------------------------------------- notes

test('note names follow C-4 = MIDI 60', () => {
  assert.equal(parseNote('C-4', 't'), 60);
  assert.equal(parseNote('A#3', 't'), 58);
  assert.equal(parseNote('G-9', 't'), 127);
  assert.equal(noteName(60), 'C-4');
  assert.equal(noteName(63), 'D#4');
});

// ---------------------------------------------------------------- time-remap

test('time-remap without keys is the identity at 1x', () => {
  const r = buildTimeRemap([], 30);
  near(r.musicAt(30), 1);
  near(r.frameAt(2), 60);
});

test('quarter speed then an eased return to full tempo', () => {
  const r = buildTimeRemap([
    { frame: 30, rate: 0.25, ramp: 0 },
    { frame: 60, rate: 1, ramp: 30 },
  ], 30);
  near(r.musicAt(30), 1);
  near(r.musicAt(60), 1.25); // 30 frames at 0.25
  near(r.musicAt(90), 1.25 + 0.625); // linear ramp 0.25 -> 1 over 30 frames
  near(r.musicAt(120), 1.875 + 1);
  near(r.rateAt(75), 0.625);
  for (let f = 0; f < 200; f += 0.37) near(r.frameAt(r.musicAt(f)), f, 1e-6);
});

test('a key interrupts a ramp in progress', () => {
  const r = buildTimeRemap([
    { frame: 0, rate: 0, ramp: 60 }, // 1 -> 0 over 2 s
    { frame: 30, rate: 1, ramp: 0 }, // cut halfway, at rate 0.5
  ], 30);
  near(r.rateAt(29.999), 0.5, 1e-3);
  near(r.musicAt(30), 0.75); // area of 1 -> 0.5 over 1 s
  near(r.rateAt(31), 1);
});

test('rate 0 freezes music time; the inverse returns the earliest frame', () => {
  const r = buildTimeRemap([{ frame: 30, rate: 0, ramp: 0 }, { frame: 60, rate: 1, ramp: 0 }], 30);
  near(r.musicAt(45), 1);
  near(r.frameAt(1), 30);
  near(r.frameAt(1.5), 75);
});

// ---------------------------------------------------------------- song

test('steps round-trip through their screen text', () => {
  for (const t of ['C-4 00 ARP 37 --- --', '--- -- --- -- --- --', 'OFF -- VOL 80 PRB A0', 'A#3 1F --- -- CHD 01']) {
    assert.equal(stepToText(parseStep(t, 't')), t);
  }
  assert.equal(stepToText(parseStep('C-4 00', 't')), 'C-4 00 --- -- --- --');
  assert.throws(() => parseStep('H-4', 't'), /note/);
  assert.throws(() => parseStep('C-4 00 ZZZ 00', 't'), /unknown FX/);
});

test('song.json rows, chains and phrases parse', () => {
  const s = parseSong({
    song: { '00': '00 01 -- EN' },
    chains: { '00': { slots: ['00', '01 +5', '--'] } },
    phrases: { '00': { len: 8, steps: ['C-4 00'] } },
  });
  assert.deepEqual(s.rows[0].slice(0, 4), [0, 1, null, 'END']);
  assert.deepEqual(s.chains[0].slots[1], { phrase: 1, transpose: 5 });
  assert.equal(s.phrases[0].len, 8);
  assert.equal(s.phrases[0].steps[0].note, 60);
});

// ---------------------------------------------------------------- editor

test('A taps a C-4 with instrument 00, A+RIGHT nudges it, B inserts OFF', () => {
  const sc = scene({}, [
    { frame: 10, press: 'A' },
    { frame: 20, press: 'A+RIGHT', repeat: 3, every: 2 },
    { frame: 40, press: 'DOWN' },
    { frame: 41, press: 'B' },
    { frame: 50, press: 'B' },
  ]);
  const step = (f: number, r: number) => stepToText(sc.stateAt(f).song.phrases[0]?.steps[r] ?? parseStep('', 't'));
  assert.equal(step(9, 0), '--- -- --- -- --- --');
  assert.equal(step(10, 0), 'C-4 00 --- -- --- --');
  assert.equal(step(30, 0), 'D#4 00 --- -- --- --');
  assert.equal(sc.stateAt(30).last.note, 63);
  assert.equal(step(41, 1), 'OFF -- --- -- --- --');
  assert.equal(step(50, 1), '--- -- --- -- --- --');
});

test('A on an FX column inserts a command and A+RIGHT cycles it', () => {
  const sc = scene({}, [
    { frame: 1, cursor: { row: 2, col: 'FX1' } },
    { frame: 2, press: 'A' },
    { frame: 3, press: 'A+LEFT' }, // VOL -> CHD (wraps)
    { frame: 4, press: 'RIGHT' },
    { frame: 5, press: 'A+UP' },
    { frame: 6, press: 'A+RIGHT' },
  ]);
  assert.equal(stepToText(sc.stateAt(2).song.phrases[0].steps[2]), '--- -- VOL 00 --- --');
  assert.equal(stepToText(sc.stateAt(6).song.phrases[0].steps[2]), '--- -- CHD 11 --- --');
});

test('LEN and name rows sit above step 00', () => {
  const sc = scene({}, [
    { frame: 1, press: 'UP' },
    { frame: 2, press: 'A+DOWN', repeat: 4, every: 1 },
    { frame: 10, press: 'UP' },
    { frame: 11, press: 'A+UP' },
  ]);
  assert.equal(sc.stateAt(5).song.phrases[0].len, 12);
  assert.equal(sc.stateAt(11).song.phrases[0].name, 'A');
});

test('R dives and L backs out along SONG > CHAIN > PHRASE', () => {
  const sc = scene(
    { song: { '00': '00' }, chains: { '00': { slots: ['03'] } } },
    [
      { frame: 1, press: 'L' },
      { frame: 2, press: 'L' },
      { frame: 3, press: 'R' },
      { frame: 4, press: 'R' },
    ],
  );
  assert.equal(sc.stateAt(1).view, 'CHAIN');
  assert.equal(sc.stateAt(2).view, 'SONG');
  assert.equal(sc.stateAt(3).view, 'CHAIN');
  assert.equal(sc.stateAt(4).view, 'PHRASE');
  assert.equal(sc.stateAt(4).phrase, 3);
});

test('stateAt is the same whatever order frames are asked in', () => {
  const events = [
    { frame: 5, press: 'A' },
    { frame: 9, press: 'DOWN', repeat: 5, every: 3 },
    { frame: 12, press: 'A' },
    { frame: 30, press: 'A+UP' },
  ];
  const a = scene({}, events);
  const b = scene({}, events);
  const frames = Array.from({ length: 60 }, (_, i) => i);
  const forward = frames.map((f) => JSON.stringify(a.stateAt(f)));
  const shuffled = frames.slice().sort(() => Math.random() - 0.5);
  for (const f of shuffled) assert.equal(JSON.stringify(b.stateAt(f)), forward[f]);
});

// ---------------------------------------------------------------- playback

const PHRASE_SONG = {
  project: { bpm: 120, speed: 4 },
  song: { '00': '00' },
  chains: { '00': { slots: ['00'] } },
  phrases: { '00': { steps: ['C-4 00', '', '', '', 'E-4 00 ARP 37'] } },
  instruments: { '00': { type: 'SUB' } },
};

test('phrase isolation plays 4 rows per beat on the remapped clock', () => {
  const sc = scene(PHRASE_SONG, [
    { frame: 30, press: 'SELECT+START' },
    { frame: 60, rate: 0.25 },
    { frame: 300, press: 'START' },
  ]);
  const rows = sc.schedule.rows[0];
  // 120 BPM = 0.125 s per row = 3.75 frames at 30 fps.
  near(rows[0].f0, 30);
  near(rows[1].f0, 33.75);
  // After frame 60 the rate is 0.25: a row takes 15 frames.
  const late = rows.filter((r) => r.f0 >= 60);
  near(late[1].f0 - late[0].f0, 15);
  assert.equal(rowAt(rows, 31)?.step, 0);
  assert.equal(rowAt(rows, 34)?.step, 1);
  assert.equal(rowAt(rows, 301), null);
});

test('ARP steps once per tick, and ticks stretch with the rate', () => {
  const fast = scene(PHRASE_SONG, [{ frame: 0, press: 'SELECT+START' }, { frame: 100, press: 'START' }]);
  const slow = scene(PHRASE_SONG, [{ frame: 0, press: 'SELECT+START' }, { frame: 0, rate: 0.25 }, { frame: 400, press: 'START' }]);
  const arp = (sc: ReturnType<typeof scene>) =>
    sc.schedule.voice.filter((v) => v.kind === 'pitch' && v.f < sc.schedule.rows[0][5].f0 && v.f >= sc.schedule.rows[0][4].f0);
  // SPEED 4: ticks 0..3 -> root, +3, +7, root; tick 0 is the note itself.
  const f = arp(fast);
  const s = arp(slow);
  assert.deepEqual(f.map((v) => (v as { note: number }).note), [67, 71, 64]);
  near(f[1].f - f[0].f, 3.75 / 4);
  near(s[1].f - s[0].f, 15 / 4);
});

test('chains play their slots in order, and song channels advance on their own', () => {
  const sc = scene(
    {
      project: { bpm: 120, speed: 4 },
      song: { '00': '00 01', '01': '02 --' },
      chains: { '00': { slots: ['00', '01'] }, '01': { slots: ['02'] }, '02': { slots: ['01'] } },
      phrases: { '00': { len: 2, steps: ['C-4 00'] }, '01': { len: 2, steps: ['D-4 00'] }, '02': { len: 3, steps: ['E-4 00'] } },
      instruments: { '00': { type: 'SUB' } },
    },
    [{ frame: 0, press: 'START' }],
  );
  const ch1 = sc.schedule.rows[0].slice(0, 7).map((r) => `${r.chain}:${r.phrase}:${r.step}`);
  assert.deepEqual(ch1, ['0:0:0', '0:0:1', '0:1:0', '0:1:1', '2:1:0', '2:1:1', '0:0:0']);
  const ch2 = sc.schedule.rows[1].slice(0, 4).map((r) => `${r.chain}:${r.phrase}:${r.step}`);
  assert.deepEqual(ch2, ['1:2:0', '1:2:1', '1:2:2', '1:2:0']);
});

test('an END block stops its channel for good', () => {
  const sc = scene(
    {
      song: { '00': '00', '01': 'EN', '02': '00' },
      chains: { '00': { slots: ['00'] } },
      phrases: { '00': { len: 2, steps: ['C-4 00'] } },
      instruments: { '00': { type: 'SUB' } },
    },
    [{ frame: 0, press: 'START' }],
  );
  assert.equal(sc.schedule.rows[0].length, 2);
});

test('HOP jumps inside the phrase; PRB rolls are repeatable', () => {
  const song = {
    project: { speed: 4 },
    phrases: { '00': { steps: ['C-4 00 PRB 80', 'C-4 00', 'C-4 00 HOP 00'] } },
    instruments: { '00': { type: 'SUB' } },
  };
  const a = scene(song, [{ frame: 0, press: 'SELECT+START' }]);
  const b = scene(song, [{ frame: 0, press: 'SELECT+START' }]);
  assert.deepEqual(a.schedule.rows[0].slice(0, 6).map((r) => r.step), [0, 1, 2, 0, 1, 2]);
  const fired = (sc: typeof a) => sc.schedule.rows[0].filter((r) => r.step === 0).map((r) => r.fired);
  assert.deepEqual(fired(a), fired(b));
  const share = fired(a).filter(Boolean).length / fired(a).length;
  assert.ok(share > 0.3 && share < 0.7, `PRB 80 should pass about half the time, got ${share}`);
});
