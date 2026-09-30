// 16-bit PCM stereo WAV writer.

export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Buffer {
  const n = left.length;
  const dataBytes = n * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); // byte rate
  buf.writeUInt16LE(4, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  const clip = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(clip(left[i]), 44 + i * 4);
    buf.writeInt16LE(clip(right[i]), 46 + i * 4);
  }
  return buf;
}

export function decodeWav(buf: Buffer): { sampleRate: number; left: Float32Array; right: Float32Array } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let pos = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(pos + 10);
      sampleRate = buf.readUInt32LE(pos + 12);
      bits = buf.readUInt16LE(pos + 22);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error(`only 16-bit WAV is supported, got ${bits}`);
      const frames = size / (2 * channels);
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        left[i] = buf.readInt16LE(pos + 8 + i * 2 * channels) / 32768;
        right[i] = channels > 1 ? buf.readInt16LE(pos + 8 + i * 2 * channels + 2) / 32768 : left[i];
      }
      return { sampleRate, left, right };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
