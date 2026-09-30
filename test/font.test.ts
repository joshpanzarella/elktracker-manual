import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ELK_5X7 } from '../src/font/elk5x7';

test('the 5x7 font covers printable ASCII', () => {
  for (let c = 0x20; c <= 0x7e; c++) {
    assert.ok(ELK_5X7[String.fromCharCode(c)], `missing glyph for "${String.fromCharCode(c)}"`);
  }
});

test('every glyph is 5 wide and 7 tall (8 with a descender)', () => {
  for (const [ch, g] of Object.entries(ELK_5X7)) {
    assert.ok(g.rows.length === 7 || g.rows.length === 8, `"${ch}" has ${g.rows.length} rows`);
    for (const row of g.rows) assert.match(row, /^[#.]{5}$/, `"${ch}" row "${row}"`);
  }
});

test('the glyphs read from the device keep their own shapes', () => {
  // Pinned so a "tidy-up" cannot quietly replace them with textbook shapes.
  assert.deepEqual(ELK_5X7['0'].rows, ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.']);
  assert.deepEqual(ELK_5X7['4'].rows, ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#']);
  assert.deepEqual(ELK_5X7['6'].rows, ['.####', '#....', '#....', '.###.', '#...#', '#...#', '.###.']);
  assert.equal(ELK_5X7['-'].dy, 1);
});
