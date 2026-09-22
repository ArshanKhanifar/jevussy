import { test, expect, describe } from "bun:test";
import {
  buildCandidates,
  initialState,
  motifOptions,
  validProfile,
  validState,
  COLLECTIONS,
  type Profile,
} from "../lib/music";
import { beatSeconds, compileBars } from "../lib/audio/timeline";
export const profile: Profile = {
  version: 2,
  seed: 91,
  tonic: 1,
  key: "D♭",
  collection: "major",
  meter: [9, 8],
  tempo: 90,
  pulseBeats: 1.5,
  character: "tender",
  register: 65,
  density: "balanced",
  articulation: "legato",
  style: "impressionist",
  sectionBars: 6,
  motif: motifOptions(91)[0],
};
describe("musical grammar", () => {
  test("valid profiles and bounded state reject malformed public requests", () => {
    expect(validProfile(profile)).toBe(true);
    expect(validState(initialState(profile))).toBe(true);
    expect(validProfile({ ...profile, collection: "__proto__" })).toBe(false);
    expect(validProfile({ ...profile, meter: [500000, 8] })).toBe(false);
    expect(validState({ ...initialState(profile), nextBar: 3 })).toBe(false);
    expect(validState({ ...initialState(profile), lastTempo: NaN })).toBe(
      false,
    );
  });
  test("9/8 timing has three dotted pulses with independent simultaneous parts", () => {
    const bar = buildCandidates(profile, initialState(profile))[0].bars[0];
    expect(bar.beats).toBe(4.5);
    expect(beatSeconds({ ...bar, tempo: [{ beat: 0, bpm: 90 }] }, 4.5)).toBe(3);
    expect(
      new Set(bar.notes.filter((n) => n.beat === 0).map((n) => n.part)).size,
    ).toBe(3);
    expect(new Set(bar.notes.map((n) => n.duration)).size).toBeGreaterThan(2);
    const pcm = compileBars([bar]);
    expect(pcm.events.some((e) => e.kind === "pedal" && e.value === 127)).toBe(
      true,
    );
    expect(pcm.duration).toBeGreaterThan(2.9);
  });
  test("all collections and meters produce bounded, finite, polyphonic events", () => {
    for (const collection of Object.keys(
      COLLECTIONS,
    ) as (keyof typeof COLLECTIONS)[])
      for (const meter of [
        [9, 8],
        [6, 8],
        [3, 4],
        [4, 4],
      ] as [number, number][]) {
        const p = {
          ...profile,
          collection,
          meter,
          pulseBeats: meter[1] === 8 ? 1.5 : 1,
        };
        for (const c of buildCandidates(p, initialState(p)))
          for (const bar of c.bars) {
            expect(validState(c.state)).toBe(true);
            for (const n of bar.notes) {
              expect(n.midi).toBeGreaterThanOrEqual(21);
              expect(n.midi).toBeLessThanOrEqual(108);
              expect(Number.isFinite(n.beat + n.duration)).toBe(true);
              expect(n.beat).toBeLessThan(bar.beats);
              expect(n.duration).toBeGreaterThan(0);
            }
            expect(new Set(bar.notes.map((n) => n.part)).size).toBe(3);
          }
      }
  });
  test("a long performance develops, returns to the motif, and does not force four-bar cadences", () => {
    let state = initialState(profile);
    const seen = new Set<string>();
    let transformed = false;
    let wholeTone = false;
    let returns = 0;
    for (let i = 0; i < 80; i++) {
      const candidates = buildCandidates(profile, state);
      const next =
        candidates.find((c) => c.state.section !== state.section) ??
        candidates.find((c) => c.bars[0].collection === "whole_tone") ??
        candidates[(i + 2) % candidates.length];
      seen.add(next.state.section);
      transformed ||= next.bars[0].transformation !== "original";
      wholeTone ||= next.bars[0].collection === "whole_tone";
      if (next.state.section === "return") {
        returns++;
        expect(next.state.motif).toEqual(profile.motif);
        expect(next.state.collection).toBe(profile.collection);
      }
      expect(next.state.nextBar).toBe(state.nextBar + 2);
      expect(validState(next.state)).toBe(true);
      expect(next.state.recent.length).toBeLessThanOrEqual(8);
      state = next.state;
    }
    expect(seen.size).toBe(6);
    expect(returns).toBeGreaterThan(0);
    expect(transformed).toBe(true);
    expect(wholeTone).toBe(true);
  });
  test("whole-tone departures have a return path and simple meter supports triplet subdivisions", () => {
    const state = {
      ...initialState(profile),
      nextBar: 8,
      section: "departure" as const,
      sectionStart: 8,
    };
    const whole = buildCandidates(profile, state).find(
      (c) => c.state.collection === "whole_tone",
    )!;
    expect(whole).toBeDefined();
    expect(
      buildCandidates(profile, whole.state).some(
        (c) => c.state.collection === "major",
      ),
    ).toBe(true);
    const p = { ...profile, meter: [4, 4] as [number, number], pulseBeats: 1 };
    const ripple = buildCandidates(p, initialState(p)).find(
      (c) => c.bars[0].texture === "ripples",
    )!;
    expect(
      ripple.bars[0].notes.some((n) => Math.abs(n.beat - 1 / 3) < 0.000001),
    ).toBe(true);
  });
});
