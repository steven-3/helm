/* ══════════════════════════════════════════════════════════════════════════
   wav.ts — 16 kHz mono PCM16 WAV encoding for the voice pipeline (§3.4).

   The AudioWorklet capture in store/voice.ts hands us Float32 sample chunks at
   the AudioContext's native rate (typically 44.1/48 kHz). This module:
     1. concatenates chunks,
     2. downsamples to 16 kHz mono (linear interpolation — whisper's input),
     3. encodes a canonical RIFF/WAVE PCM16 file,
     4. base64-encodes for the string-based IPC hop (helm_store_write_b64).
   Pure functions, no DOM beyond btoa. No state.
   ══════════════════════════════════════════════════════════════════════════ */

export const WHISPER_SAMPLE_RATE = 16_000;

/** Concatenate capture chunks into one contiguous buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Linear-interpolation resample. Identity when rates already match. */
export function downsample(
  samples: Float32Array,
  fromRate: number,
  toRate: number = WHISPER_SAMPLE_RATE,
): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = samples[index] ?? 0;
    const b = samples[index + 1] ?? a;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** Clamp + quantize float samples ([-1,1]) to signed 16-bit PCM. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

/** Encode mono PCM16 samples as a complete RIFF/WAVE file. */
export function encodeWavPcm16(
  samples: Int16Array,
  sampleRate: number = WHISPER_SAMPLE_RATE,
): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM fmt chunk size
  view.setUint16(20, 1, true);           // audio format = PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono * 2 bytes)
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return new Uint8Array(buffer);
}

/** Full capture → WAV pipeline: chunks at `captureRate` → 16 kHz PCM16 WAV. */
export function encodeCaptureToWav(
  chunks: Float32Array[],
  captureRate: number,
): Uint8Array {
  const joined = concatFloat32(chunks);
  const resampled = downsample(joined, captureRate, WHISPER_SAMPLE_RATE);
  return encodeWavPcm16(floatToPcm16(resampled), WHISPER_SAMPLE_RATE);
}

/** Chunked btoa — safe for multi-MB buffers (no arg-spread stack limits). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    let piece = "";
    for (let j = 0; j < slice.length; j++) piece += String.fromCharCode(slice[j]);
    binary += piece;
  }
  return btoa(binary);
}
