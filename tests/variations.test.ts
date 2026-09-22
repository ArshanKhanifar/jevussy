import { describe, expect, test } from "bun:test";
import {
  createPromptVariation,
  variationFromId,
  VARIATION_COUNT,
} from "../lib/prompt-variations";
import {
  buildCandidates,
  initialState,
  motifOptions,
  PHRASING_RHYTHMS,
  validProfile,
  type Profile,
} from "../lib/music";

describe("nocturne prompt variations", () => {
  test("every combination is distinct, within the input limit, and retains the approved musical character", () => {
    const prompts = new Set<string>();
    for (let id = 0; id < VARIATION_COUNT; id++) {
      const v = variationFromId(id);
      prompts.add(v.prompt);
      expect(v.prompt.length).toBeLessThanOrEqual(1200);
      expect(v.prompt).toContain("Clair de lune, without quoting its melody");
      expect(v.prompt).toContain("gently swaying 9/8");
      expect(v.prompt).toContain(`${v.key} major`);
      expect(v.prompt).toContain(`${v.pulse} dotted-quarter`);
      expect(v.prompt).toContain("Use whole-tone colors sparingly.");
      expect(v.prompt).toContain("quieter, altered harmonies");
      expect(v.prompt).toContain(`about ${v.sectionBars} measures`);
    }
    expect(prompts.size).toBe(VARIATION_COUNT);
  });
  test("a new variation changes an opening, contour, or rhythm and never changes the old prompt", () => {
    for (let i = 0; i < 100; i++) {
      const previous = variationFromId(i);
      const old = previous.prompt;
      const next = createPromptVariation(previous);
      expect(
        next.opening !== previous.opening ||
          next.contour !== previous.contour ||
          next.phrasing !== previous.phrasing,
      ).toBe(true);
      expect(previous.prompt).toBe(old);
    }
    expect(() => variationFromId(-1)).toThrow();
    expect(() => variationFromId(VARIATION_COUNT)).toThrow();
  });
  test("JEV opening and phrasing choices produce different actual events, and the opening constraint releases afterward", () => {
    const p: Profile = {
      version: 2,
      seed: 91,
      tonic: 1,
      key: "D♭",
      collection: "major",
      meter: [9, 8],
      tempo: 72,
      pulseBeats: 1.5,
      character: "tender",
      register: 65,
      density: "sparse",
      articulation: "legato",
      style: "impressionist",
      sectionBars: 8,
      motif: motifOptions(91)[0],
    };
    const signatures = new Set<string>();
    for (const opening of ["melody", "ripples", "layers", "dialogue"] as const)
      for (const phrasing of ["sustained", "sighing", "lilting"] as const) {
        const profile = {
          ...p,
          opening,
          phrasing,
          motif: { ...p.motif, rhythm: [...PHRASING_RHYTHMS[phrasing]] },
        };
        expect(validProfile(profile)).toBe(true);
        const options = buildCandidates(profile, initialState(profile));
        expect(options.length).toBeGreaterThan(0);
        expect(
          options.every((c) => c.bars.every((b) => b.texture === opening)),
        ).toBe(true);
        signatures.add(JSON.stringify(options[0].bars.map((b) => b.notes)));
        expect(
          new Set(
            buildCandidates(profile, options[0].state).map(
              (c) => c.bars[0].texture,
            ),
          ).size,
        ).toBeGreaterThan(1);
      }
    expect(signatures.size).toBe(12);
    expect(validProfile({ ...p, opening: "noise" })).toBe(false);
    expect(validProfile({ ...p, phrasing: "__proto__" })).toBe(false);
  });
});
