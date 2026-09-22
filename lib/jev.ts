import {
  buildCandidates,
  COLLECTIONS,
  ENGINE_VERSION,
  initialState,
  KEYS,
  motifOptions,
  PHRASING_RHYTHMS,
  type Collection,
  type CompositionState,
  type JevTrace,
  type Phrase,
  type Profile,
} from "./music";

export const MODEL = "jev-latest";
export const choice = (
  instructions: string,
  criteria: Record<string, string>,
) => ({ type: "choice", instructions, criteria });
type Question = ReturnType<typeof choice>;
export async function askJev(
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal,
): Promise<JevTrace> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("The server piano key is not configured.");
  const started = Date.now();
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(`JEV decision service returned HTTP ${response.status}.`);
  const data = (await response.json()) as {
    model?: string;
    answers?: JevTrace["answers"];
  };
  for (const [name, q] of Object.entries(questions)) {
    if (!Object.hasOwn(q.criteria, data.answers?.[name]?.choice ?? ""))
      throw new Error("JEV returned an incomplete or unsupported decision.");
  }
  return {
    model: typeof data.model === "string" ? data.model : MODEL,
    answers: data.answers!,
    latencyMs: Date.now() - started,
  };
}
const MUSICIAN_RULES = [
  "The listener original_user_prompt is the creative authority. Stylistic defaults apply only when compatible with it.",
  "Compose an original performance, never a quotation. Preserve melodic identity across requests; vary its rhythm, contour, register or harmonic context deliberately.",
  "Bass anchors, accompaniment and foreground melody have distinct rhythmic roles. Voice the melody clearly above quieter support. A melodic note does not require a new full chord.",
  "For Debussy-like requests, shape tonal fields, common tones, pentatonic color, added-note harmony, parallel voicings and occasional whole-tone departures into coherent passages. Simple tonal writing is also valuable.",
  "Develop longer waves: statement, unfolding, departure, crest, transformed return, new episode. Local arrivals are allowed. No compulsory four-bar cadence and no replayed loop.",
  "A network response is two measures of a longer phrase. Sustain and resonance continue across the boundary. Choose from concrete playable candidates, not imaginary notes outside them.",
];
export async function makeProfile(prompt: string, signal?: AbortSignal) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const motifs = motifOptions(seed);
  const questions = {
    key: choice(
      "Choose the tonal center requested by the listener. If unspecified, choose a fitting center; D-flat suits the default reverie.",
      Object.fromEntries(KEYS.map((k, i) => [`key_${i}`, `${k} tonal center`])),
    ),
    collection: choice(
      "Choose the HOME pitch collection, to which departures can return. Follow any explicit major/minor/mode request.",
      Object.fromEntries(
        Object.entries(COLLECTIONS).map(([k, v]) => [
          k,
          `${k.replaceAll("_", " ")}: semitone offsets ${v.join(",")}`,
        ]),
      ),
    ),
    meter: choice(
      "Choose the meter. Use 9/8 for the default Debussy reverie; honor other explicit requests.",
      {
        nine_eight:
          "9/8: three dotted-quarter pulses, each divided into three eighths",
        six_eight: "6/8: two dotted-quarter pulses",
        three_four: "3/4: three quarter-note pulses",
        four_four:
          "4/4: four quarter-note pulses, including triplet accompaniment when suitable",
      },
    ),
    pulse: choice(
      "Choose the main perceived pulse tempo. For compound meter these BPM count dotted quarters, not eighths; for simple meter they count quarters.",
      {
        spacious: "48 pulses/minute; spacious",
        unhurried: "54 pulses/minute; gently swaying",
        gentle: "60 pulses/minute; tender",
        flowing: "72 pulses/minute; moving gently",
        walking: "84 pulses/minute; moderate",
        animated: "96 pulses/minute; animated",
        urgent: "120 pulses/minute; energetic",
      },
    ),
    style: choice(
      "Select the harmonic approach that best honors the listener.",
      {
        impressionist:
          "Debussy-inspired color, pedal fields, modal mixture and occasional whole-tone departure",
        tonal: "Clear major/minor harmonic direction and lyrical voice leading",
        modal:
          "Modal or pentatonic focus, stable bass fields and independent layers",
      },
    ),
    character: choice("Choose the expressive character.", {
      tender: "Intimate and expressive",
      serene: "Calm and luminous",
      dark: "Shadowed and weighty",
      playful: "Light and nimble",
      driving: "Forward and energized",
    }),
    register: choice(
      "Choose a useful foreground register above the supporting parts.",
      {
        middle: "Singing around C4–C5",
        upper: "Singing around F4–F5",
        high: "Bright around C5–C6",
      },
    ),
    density: choice(
      "Choose overall activity while keeping the melody distinct.",
      {
        sparse: "Space and longer durations",
        balanced: "Clear foreground with gently active accompaniment",
        flowing: "Frequent broken-note motion under a slower foreground",
      },
    ),
    articulation: choice("Choose pianist touch and resonance.", {
      legato: "Connected lines and repedaling at harmonic changes",
      natural: "Natural releases with restrained sustain pedal",
      detached: "Short articulate notes, no sustain pedal",
    }),
    opening: choice(
      "Choose the requested opening texture literally. Different arrivals should have distinct first gestures; do not always default to sustained melody. This choice sets the texture for the first two measures only; subsequent textures may evolve.",
      {
        melody: "A spacious singing melody over quiet sustained harmony",
        ripples: "A singing melody over slow broken chords",
        layers:
          "Spaced bass anchors, a slow melody, and a repeating inner figure",
        dialogue:
          "A short melodic question and a quieter answering inner voice",
      },
    ),
    phrasing: choice(
      "Choose the melodic rhythm and breathing requested by the listener. This rhythm is applied to the chosen pitch cell and remembered for its returns.",
      {
        sustained:
          "Long opening note followed by shorter connected gestures; relative durations 3,1,2,2,1",
        sighing:
          "Paired sighing gestures with small release silences; relative durations 2,1,2,1,3",
        lilting:
          "Lilting short-long gestures with a held final note; relative durations 1,2,1,2,3",
      },
    ),
    span: choice(
      "Choose how many measures a section should develop before JEV considers the next stage; transport chunks are only two measures.",
      {
        six: "6 measures: concise development",
        eight: "8 measures: patient development",
        ten: "10 measures: expansive development",
      },
    ),
    motif: choice(
      "Choose an original recognizable pitch cell that follows the requested contour: arch, descending with an upward answer, rising steps, or a neighboring-note turn. These are scale-degree offsets; the separate phrasing choice sets their rhythm. It will return and transform throughout the performance.",
      Object.fromEntries(
        motifs.map((m) => [
          m.id,
          `Pitch contour in scale degrees: ${m.degrees.join(",")}`,
        ]),
      ),
    ),
  };
  const trace = await askJev(
    {
      role: "Pianist-composer and long-form musical director",
      original_user_prompt: prompt,
      musician_principles: MUSICIAN_RULES,
    },
    questions,
    signal,
  );
  const get = (k: string) => trace.answers[k].choice;
  const meter = (
    {
      nine_eight: [9, 8],
      six_eight: [6, 8],
      three_four: [3, 4],
      four_four: [4, 4],
    } as const
  )[get("meter") as "nine_eight"];
  const pulseBeats = meter[1] === 8 ? 1.5 : 1;
  const pulse = (
    {
      spacious: 48,
      unhurried: 54,
      gentle: 60,
      flowing: 72,
      walking: 84,
      animated: 96,
      urgent: 120,
    } as Record<string, number>
  )[get("pulse")];
  const tonic = Number(get("key").slice(4));
  const profile: Profile = {
    version: ENGINE_VERSION,
    seed,
    tonic,
    key: KEYS[tonic],
    collection: get("collection") as Collection,
    meter: [...meter],
    pulseBeats,
    tempo: pulse * pulseBeats,
    style: get("style") as Profile["style"],
    character: get("character"),
    register: ({ middle: 60, upper: 65, high: 72 } as Record<string, number>)[
      get("register")
    ],
    density: get("density") as Profile["density"],
    articulation: get("articulation") as Profile["articulation"],
    sectionBars: ({ six: 6, eight: 8, ten: 10 } as Record<string, number>)[
      get("span")
    ],
    opening: get("opening") as Profile["opening"],
    phrasing: get("phrasing") as Profile["phrasing"],
    motif: {
      ...motifs.find((m) => m.id === get("motif"))!,
      rhythm: [
        ...PHRASING_RHYTHMS[get("phrasing") as keyof typeof PHRASING_RHYTHMS],
      ],
    },
  };
  return { profile, state: initialState(profile), trace };
}
export async function makeContinuation(
  prompt: string,
  profile: Profile,
  state: CompositionState,
  signal?: AbortSignal,
): Promise<Phrase> {
  const candidates = buildCandidates(profile, state);
  const trace = await askJev(
    {
      role: "Continuing pianist-composer choosing the next two measures of a live performance",
      original_user_prompt: prompt,
      musician_principles: MUSICIAN_RULES,
      interpretation: profile,
      committed_musical_memory: state,
      timing_contract: {
        unit: "quarter-note beats",
        meter: profile.meter,
        beats_per_measure: (profile.meter[0] * 4) / profile.meter[1],
        quarter_bpm: profile.tempo,
        perceived_pulse_bpm: profile.tempo / profile.pulseBeats,
        explanation:
          "In 9/8 a measure is 4.5 quarter-note beats, with 3 dotted-quarter pulses. Notes at equal beat values sound together; durations are independent. In simple meter a 1/3 beat subdivision is a quarter-note triplet subdivision. Playback uses each measure tempo map and retains ringing voices between responses.",
      },
      priorities:
        state.nextBar === 0
          ? [
              "State the chosen motif clearly in the first two measures. Select an inviting opening matching the user.",
            ]
          : [
              "Preserve musical continuity with lastMelody, lastVoicing, bass and motif. Prefer an audible development rather than the same texture and transformation again.",
              "When a section transition is offered, decide whether its development has earned the next stage. Returns should be recognizable. Whole-tone material is a departure, not a permanent substitute for the home collection.",
              "Choose chordal writing when an arrival or chant-like passage warrants it; use linear and rippling textures elsewhere. No numerical chord quota.",
            ],
    },
    {
      continuation: choice(
        "Which concrete two-measure candidate best continues the requested music? Judge melodic identity, voice leading, contrast, harmonic direction and section development together. The selected option determines all rendered notes and expressive events for these measures.",
        Object.fromEntries(candidates.map((c) => [c.id, c.description])),
      ),
    },
    signal,
  );
  const selected = candidates.find(
    (c) => c.id === trace.answers.continuation.choice,
  )!;
  const first = selected.bars[0];
  return {
    bars: selected.bars,
    state: selected.state,
    decision: {
      selected: selected.id,
      description: selected.description,
      confidence: trace.answers.continuation.confidence,
      section: first.section,
      motif: first.motifId,
      transformation: first.transformation,
      collection: first.collection,
      texture: first.texture,
    },
    trace,
  };
}
