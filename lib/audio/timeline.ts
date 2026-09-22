import type { PianoBar } from "../music";
export type TimedMidi = {
  time: number;
  kind: "on" | "off" | "pedal";
  channel: number;
  key: number;
  value: number;
  noteId?: string;
};
export type Performance = {
  duration: number;
  events: TimedMidi[];
  notes: { start: number; end: number; midi: number }[];
  bars: { start: number; end: number; bar: PianoBar }[];
};
export function beatSeconds(bar: PianoBar, beat: number): number {
  let seconds = 0;
  for (let i = 0; i < bar.tempo.length; i++) {
    const from = bar.tempo[i].beat;
    const to = Math.min(beat, bar.tempo[i + 1]?.beat ?? beat);
    if (to > from) seconds += ((to - from) * 60) / bar.tempo[i].bpm;
  }
  return seconds;
}
export function compileBars(bars: PianoBar[]): Performance {
  let cursor = 0;
  const performance: Performance = {
    duration: 0,
    events: [],
    notes: [],
    bars: [],
  };
  for (const bar of bars) {
    const duration = beatSeconds(bar, bar.beats);
    performance.bars.push({ start: cursor, end: cursor + duration, bar });
    for (const note of bar.notes) {
      const channel = { bass: 0, accompaniment: 1, melody: 2 }[note.part];
      const start = cursor + beatSeconds(bar, note.beat),
        end = cursor + beatSeconds(bar, note.beat + note.duration);
      const noteId = `${bar.index}/${note.part}/${note.beat}/${note.midi}`;
      performance.events.push(
        {
          time: start,
          kind: "on",
          channel,
          key: note.midi,
          value: note.velocity,
          noteId,
        },
        { time: end, kind: "off", channel, key: note.midi, value: 0, noteId },
      );
      performance.notes.push({ start, end, midi: note.midi });
    }
    for (const pedal of bar.pedal)
      for (let channel = 0; channel < 3; channel++)
        performance.events.push({
          time: cursor + beatSeconds(bar, pedal.beat),
          kind: "pedal",
          channel,
          key: 64,
          value: pedal.down ? 127 : 0,
        });
    cursor += duration;
  }
  // Release keys/pedal before new attacks at the same sample.
  performance.events.sort(
    (a, b) =>
      a.time - b.time ||
      { off: 0, pedal: 1, on: 2 }[a.kind] - { off: 0, pedal: 1, on: 2 }[b.kind],
  );
  performance.duration = cursor;
  return performance;
}
