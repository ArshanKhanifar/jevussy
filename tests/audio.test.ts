import { test, expect } from "bun:test";
import * as at from "@coderline/alphatab";
import { createPianoSynth } from "../lib/audio/synth";
import type { TimedMidi } from "../lib/audio/timeline";
const font = new Uint8Array(
  await Bun.file("public/soundfont/TimGM6mb.sf2").arrayBuffer(),
);
const events: TimedMidi[] = [
  { time: 0, kind: "on", channel: 0, key: 49, value: 64 },
  { time: 0.2, kind: "pedal", channel: 0, key: 64, value: 127 },
  { time: 0.3, kind: "off", channel: 0, key: 49, value: 0 },
  { time: 0.4, kind: "on", channel: 2, key: 73, value: 84 },
  { time: 1.4, kind: "off", channel: 2, key: 73, value: 0 },
];
test("same sampled piano renders audible finite PCM and preserves voices across chunks", () => {
  const split = createPianoSynth(at, 24000, font),
    full = createPianoSynth(at, 24000, font);
  const first = split.render(events, 1),
    second = split.render(
      [{ time: 0.5, kind: "pedal", channel: 0, key: 64, value: 0 }],
      1,
    );
  const combined = new Float32Array(first.length + second.length);
  combined.set(first);
  combined.set(second, first.length);
  const whole = full.render(
    [...events, { time: 1.5, kind: "pedal", channel: 0, key: 64, value: 0 }],
    2,
  );
  expect(combined.length).toBe(96000);
  let peak = 0,
    difference = 0,
    tail = 0;
  for (let i = 0; i < whole.length; i++) {
    expect(Number.isFinite(whole[i])).toBe(true);
    peak = Math.max(peak, Math.abs(whole[i]));
    difference = Math.max(difference, Math.abs(whole[i] - combined[i]));
    if (i > 48000) tail += whole[i] * whole[i];
  }
  expect(peak).toBeGreaterThan(0.01);
  expect(peak).toBeLessThan(1);
  expect(tail).toBeGreaterThan(0.01);
  // Sub-block sizes may differ at the boundary, but continuity should remain sample-identical.
  expect(difference).toBeLessThan(0.00001);
  split.reset();
  const silent = split.render([], 1);
  expect(silent.every((n) => n === 0)).toBe(true);
  split.destroy();
  full.destroy();
});
test("sustain pedal audibly holds a released note", () => {
  const dry = createPianoSynth(at, 24000, font),
    wet = createPianoSynth(at, 24000, font);
  const notes: TimedMidi[] = [
    { time: 0, kind: "on", channel: 0, key: 60, value: 80 },
    { time: 0.2, kind: "off", channel: 0, key: 60, value: 0 },
  ];
  const a = dry.render(notes, 1.2),
    b = wet.render(
      [{ time: 0, kind: "pedal", channel: 0, key: 64, value: 127 }, ...notes],
      1.2,
    );
  const energy = (x: Float32Array) =>
    x.slice(24000).reduce((sum, n) => sum + n * n, 0);
  expect(energy(b)).toBeGreaterThan(energy(a) * 2);
  dry.destroy();
  wet.destroy();
});
