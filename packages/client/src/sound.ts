/**
 * Tiny synthesised notes for the music puzzle (no sound files). Created lazily on the first player gesture, as
 * browsers require, and silent if audio is unavailable; nothing in the game depends on hearing them.
 */
let ctx: AudioContext | null | undefined;

function context(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

export const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Plays the notes one after another. Returns how long it will take, in milliseconds (0 if silent). */
export function playNotes(midis: readonly number[], noteMs = 380): number {
  const audio = context();
  if (!audio || midis.length === 0) return 0;
  try {
    void audio.resume();
    const start = audio.currentTime + 0.02;
    midis.forEach((m, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const t = start + (i * noteMs) / 1000;
      osc.type = "triangle";
      osc.frequency.value = frequency(m);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (noteMs * 0.9) / 1000);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + noteMs / 1000);
    });
    return midis.length * noteMs;
  } catch {
    return 0;
  }
}
