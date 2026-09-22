import { DEFAULT_PROMPT } from "./music";

// A constrained palette, not word-level randomization. All combinations retain
// the approved nocturne, 9/8, gentle touch, long arc and transformed return.
export const VARIATION_AXES = {
  key: ["D-flat", "G-flat", "A-flat"],
  pulse: [48, 54, 60],
  opening: [
    {
      id: "melody",
      text: "Begin very softly with a spacious middle-register singing melody over sustained harmony and long breaths between gestures.",
    },
    {
      id: "ripples",
      text: "Begin very softly with a singing upper-register melody above a few slow broken chords, leaving air between the gestures.",
    },
    {
      id: "layers",
      text: "Begin very softly with spaced bass anchors, a slow singing melody, and a delicate repeating inner figure.",
    },
    {
      id: "dialogue",
      text: "Begin very softly with a short melodic question and a quieter answering inner voice, separated by a breath.",
    },
  ],
  contour: [
    "Let the motif climb gently, then fall back in a small arch.",
    "Let the motif descend gently before a small upward answer.",
    "Let the motif rise by small steps toward one expressive upper note.",
    "Let the motif linger around one note with a tender neighboring-note turn.",
  ],
  phrasing: [
    {
      id: "sustained",
      text: "Use a long opening note followed by shorter, connected melodic gestures.",
    },
    {
      id: "sighing",
      text: "Use paired sighing gestures, with small silences between their releases.",
    },
    {
      id: "lilting",
      text: "Use a lightly lilting short-long melodic rhythm with a held final note.",
    },
  ],
  span: [6, 8, 10],
} as const;
const counts = Object.values(VARIATION_AXES).map((axis) => axis.length);
export const VARIATION_COUNT = counts.reduce((a, b) => a * b, 1);
export type PromptVariation = {
  id: number;
  prompt: string;
  key: string;
  pulse: number;
  opening: string;
  contour: number;
  phrasing: string;
  sectionBars: number;
};
export function variationFromId(id: number): PromptVariation {
  if (!Number.isInteger(id) || id < 0 || id >= VARIATION_COUNT)
    throw new Error("Invalid prompt variation");
  let rest = id;
  const [
    keyIndex,
    pulseIndex,
    openingIndex,
    contourIndex,
    phrasingIndex,
    spanIndex,
  ] = counts.map((count) => {
    const index = rest % count;
    rest = Math.floor(rest / count);
    return index;
  });
  const key = VARIATION_AXES.key[keyIndex],
    pulse = VARIATION_AXES.pulse[pulseIndex],
    opening = VARIATION_AXES.opening[openingIndex],
    phrasing = VARIATION_AXES.phrasing[phrasingIndex],
    sectionBars = VARIATION_AXES.span[spanIndex];
  const prompt =
    DEFAULT_PROMPT.replace("D-flat major", `${key} major`)
      .replace("48 dotted-quarter", `${pulse} dotted-quarter`)
      .replace(
        "Begin very softly with a spacious, singing melody, tender harmonies, and long breaths between gestures.",
        `${opening.text} ${VARIATION_AXES.contour[contourIndex]} ${phrasing.text}`,
      ) +
    ` Let each main section develop across about ${sectionBars} measures.`;
  return {
    id,
    prompt,
    key,
    pulse,
    opening: opening.id,
    contour: contourIndex,
    phrasing: phrasing.id,
    sectionBars,
  };
}
export function createPromptVariation(
  previous?: PromptVariation,
): PromptVariation {
  // Re-shuffling guarantees a different opening, contour, or phrasing rather
  // than merely changing the key or an inaudible variation identifier.
  for (let attempt = 0; attempt < 8; attempt++) {
    const next = variationFromId(
      crypto.getRandomValues(new Uint32Array(1))[0] % VARIATION_COUNT,
    );
    if (
      !previous ||
      next.opening !== previous.opening ||
      next.contour !== previous.contour ||
      next.phrasing !== previous.phrasing
    )
      return next;
  }
  // Moving one opening index (3 keys × 3 tempi) changes a musical gesture.
  return variationFromId(((previous?.id ?? 0) + 9) % VARIATION_COUNT);
}
