// Shared wire format. Musical time is always quarter-note beats, never array slots.
export const ENGINE_VERSION = 2;
export const DEFAULT_PROMPT =
  "Play an original piano nocturne close to the lyrical character of Debussy’s Clair de lune, without quoting its melody. Use D-flat major and a gently swaying 9/8 at about 48 dotted-quarter pulses per minute. Begin very softly with a spacious, singing melody, tender harmonies, and long breaths between gestures. Keep the bass restrained and the accompaniment quieter than the melody. Gradually introduce flowing broken chords beneath a rising melodic line, build toward one warm, expressive climax, then return to the opening motif with quieter, altered harmonies. Favor diatonic warmth, added sixths and ninths, smooth inner voices, and occasional minor shading. Use whole-tone colors sparingly. Let phrases settle naturally, then unfold into new episodes with delicate variations and unhurried pacing.";
export const COLLECTIONS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minor_pentatonic: [0, 3, 5, 7, 10],
  whole_tone: [0, 2, 4, 6, 8, 10],
  octatonic: [0, 2, 3, 5, 6, 8, 9, 11],
} as const;
export type Collection = keyof typeof COLLECTIONS;
export const KEYS = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
export const SECTIONS = [
  "statement",
  "unfolding",
  "departure",
  "crest",
  "return",
  "episode",
] as const;
export type Section = (typeof SECTIONS)[number];
export type Texture =
  "melody" | "ripples" | "layers" | "dialogue" | "bells" | "chordal";
export type Transformation =
  | "original"
  | "sequence"
  | "inversion"
  | "augmentation"
  | "fragment"
  | "ornament";
export type Motif = { id: string; degrees: number[]; rhythm: number[] };
export const PHRASING_RHYTHMS = {
  sustained: [3, 1, 2, 2, 1],
  sighing: [2, 1, 2, 1, 3],
  lilting: [1, 2, 1, 2, 3],
} as const;
export type Profile = {
  version: 2;
  seed: number;
  tonic: number;
  key: string;
  collection: Collection;
  meter: [number, number];
  tempo: number;
  pulseBeats: number;
  character: string;
  register: number;
  density: "sparse" | "balanced" | "flowing";
  articulation: "legato" | "natural" | "detached";
  style: "impressionist" | "tonal" | "modal";
  sectionBars: number;
  motif: Motif;
  opening?: Texture;
  phrasing?: keyof typeof PHRASING_RHYTHMS;
};
export type CompositionState = {
  version: 2;
  nextBar: number;
  section: Section;
  sectionStart: number;
  episode: number;
  motif: Motif;
  collection: Collection;
  root: number;
  bass: number;
  lastMelody: number;
  lastTempo: number;
  lastVoicing: number[];
  lastTexture: Texture | null;
  recent: {
    texture: Texture;
    harmony: string;
    transformation: Transformation;
  }[];
};
export type NoteEvent = {
  beat: number;
  duration: number;
  midi: number;
  velocity: number;
  part: "bass" | "accompaniment" | "melody";
};
export type PianoBar = {
  index: number;
  beats: number;
  meter: [number, number];
  harmony: string;
  texture: Texture;
  section: Section;
  collection: Collection;
  transformation: Transformation;
  motifId: string;
  notes: NoteEvent[];
  pedal: { beat: number; down: boolean }[];
  tempo: { beat: number; bpm: number }[];
};
export type Candidate = {
  id: string;
  description: string;
  bars: PianoBar[];
  state: CompositionState;
};
export type JevTrace = {
  model: string;
  answers: Record<
    string,
    {
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  >;
  latencyMs: number;
};
export type Decision = {
  selected: string;
  description: string;
  confidence?: number;
  section: Section;
  motif: string;
  transformation: Transformation;
  collection: Collection;
  texture: Texture;
};
export type Phrase = {
  bars: PianoBar[];
  state: CompositionState;
  decision: Decision;
  trace: JevTrace;
};
export const mod = (n: number, d: number) => ((n % d) + d) % d;
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
export function noteName(n: number) {
  return `${KEYS[mod(n, 12)]}${Math.floor(n / 12) - 1}`;
}
export function initialState(p: Profile): CompositionState {
  return {
    version: 2,
    nextBar: 0,
    section: "statement",
    sectionStart: 0,
    episode: 0,
    motif: p.motif,
    collection: p.collection,
    root: p.tonic,
    bass: 36 + p.tonic,
    lastMelody: p.register + p.tonic,
    lastTempo: p.tempo,
    lastVoicing: [],
    lastTexture: null,
    recent: [],
  };
}
export function motifOptions(seed: number): Motif[] {
  // Original small cells. Rotated variants give JEV different material each recital.
  const cells = [
    [0, 2, 1, 4, 2],
    [2, 1, 0, 2, 4],
    [4, 2, 3, 1, 0],
    [0, 1, 3, 2, 1],
    [2, 4, 3, 1, 2],
    [0, 3, 2, 1, 4],
    [0, 1, 2, 3, 4],
    [2, 3, 2, 1, 2],
    [4, 3, 2, 1, 2],
  ];
  return cells.map((cell, i) => ({
    id: `motif_${i}`,
    degrees: cell.map(
      (d, j) =>
        d +
        mod(seed + i, 2) +
        (j > 2 ? mod(Math.floor(seed / 7 ** (j + (i % 3))), 3) - 1 : 0),
    ),
    rhythm:
      mod(seed + i, 3) === 0
        ? [2, 1, 3, 1, 2]
        : i % 2
          ? [2, 1, 2, 1, 3]
          : [3, 1, 2, 2, 1],
  }));
}
function nearestPc(pc: number, target: number, low: number, high: number) {
  const candidates = Array.from(
    { length: high - low + 1 },
    (_, i) => low + i,
  ).filter((n) => mod(n, 12) === mod(pc, 12));
  return candidates.reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
}
function scaleNote(
  p: Profile,
  collection: Collection,
  degree: number,
  octave: number,
) {
  const scale = COLLECTIONS[collection];
  return (
    octave +
    p.tonic +
    scale[mod(degree, scale.length)] +
    12 * Math.floor(degree / scale.length)
  );
}
function nextSection(section: Section): Section {
  return SECTIONS[(SECTIONS.indexOf(section) + 1) % SECTIONS.length];
}
const sectionEnergy: Record<Section, number> = {
  statement: 0.18,
  unfolding: 0.4,
  departure: 0.53,
  crest: 0.85,
  return: 0.28,
  episode: 0.36,
};

function renderBars(
  p: Profile,
  s: CompositionState,
  section: Section,
  texture: Texture,
  transform: Transformation,
  color: Collection,
  motion: string,
  variant: number,
): { bars: PianoBar[]; state: CompositionState } {
  const sectionChanged = section !== s.section;
  const sectionStart = sectionChanged ? s.nextBar : s.sectionStart;
  const episode = s.episode + (sectionChanged && section === "episode" ? 1 : 0);
  const motif =
    section === "return" || section === "statement"
      ? p.motif
      : sectionChanged && section === "episode"
        ? {
            id: `episode_${episode}`,
            degrees: p.motif.degrees.map((d, i) =>
              i < 3 ? d : d + (variant % 3) - 1,
            ),
            rhythm: [...p.motif.rhythm],
          }
        : s.motif;
  let lastMelody = s.lastMelody;
  let lastVoicing = [...s.lastVoicing];
  let lastTempo = s.lastTempo;
  let bass = s.bass;
  let root = s.root;
  const bars: PianoBar[] = [];
  const beats = (p.meter[0] * 4) / p.meter[1];
  const scale = COLLECTIONS[color];
  const homePcs = COLLECTIONS[p.collection].map((n) => mod(n + p.tonic, 12));
  const harmonicRoot = (offset: number) => {
    if (motion === "home") return p.tonic;
    if (motion === "pedal") return s.root;
    if (motion === "relative")
      return homePcs[mod(homePcs.length - 2 + offset, homePcs.length)];
    if (motion === "subdominant") return mod(p.tonic + 5, 12);
    if (motion === "planing") return mod(s.root + (offset + 1) * 2, 12);
    const current = homePcs.indexOf(mod(s.root, 12));
    return homePcs[
      mod(
        (current < 0 ? 0 : current) + (variant % 2 ? -1 : 1) * (offset + 1),
        homePcs.length,
      )
    ];
  };
  for (let b = 0; b < 2; b++) {
    const index = s.nextBar + b;
    const progress = clamp((index - sectionStart) / p.sectionBars, 0, 1);
    const energy =
      sectionEnergy[section] +
      (section === "unfolding"
        ? progress * 0.22
        : section === "return"
          ? -progress * 0.12
          : 0);
    root = harmonicRoot(b);
    const colorPcs = scale.map((n) => mod(n + p.tonic, 12));
    if (!colorPcs.includes(root))
      root = colorPcs.reduce((a, c) =>
        Math.min(mod(c - root, 12), mod(root - c, 12)) <
        Math.min(mod(a - root, 12), mod(root - a, 12))
          ? c
          : a,
      );
    const rootDegree = colorPcs.indexOf(root);
    const interval = (steps: number) =>
      colorPcs[mod(rootDegree + steps, scale.length)];
    const harmonicShape =
      texture === "bells"
        ? [0, 3, 6]
        : variant % 4 === 0
          ? [0, 2, 4, 5]
          : variant % 4 === 1
            ? [0, 2, 6, 1]
            : variant % 4 === 2
              ? [0, 2, 4]
              : [0, 2, 4, 6];
    const pcs =
      color === "whole_tone"
        ? [root, interval(2), interval(4)]
        : scale.length === 5
          ? [root, interval(2), interval(3)]
          : harmonicShape.map(interval);
    const targetFloor = Math.max(49, Math.min(60, p.register - 10));
    const voices = [
      ...new Set(
        pcs.map((pc, i) =>
          nearestPc(pc, lastVoicing[i] ?? targetFloor + i * 4, 48, 76),
        ),
      ),
    ].sort((a, b) => a - b);
    lastVoicing = voices;
    bass = nearestPc(motion === "pedal" ? s.bass : root, bass, 33, 52);
    const notes: NoteEvent[] = [];
    const add = (
      part: NoteEvent["part"],
      beat: number,
      duration: number,
      midi: number,
      velocity: number,
    ) => {
      notes.push({
        part,
        beat: +beat.toFixed(6),
        duration: +Math.max(0.08, duration).toFixed(6),
        midi: clamp(Math.round(midi), 21, 108),
        velocity: clamp(Math.round(velocity), 28, 110),
      });
    };
    const baseVelocity = 50 + energy * 35;
    add("bass", 0, beats * 0.92, bass, baseVelocity - 16);
    if (texture === "bells" || texture === "chordal")
      add("bass", 0, beats * 0.84, bass + 12, baseVelocity - 24);
    else if (texture === "layers" || texture === "ripples")
      add(
        "bass",
        (beats * 2) / 3,
        beats / 3,
        nearestPc(mod(bass + 7, 12), bass + 7, 38, 57),
        baseVelocity - 21,
      );

    let degrees = [...motif.degrees];
    // The second measure answers the first while retaining its opening cell.
    if (b === 1)
      degrees = degrees.map((d, i) =>
        i < 3 ? d : i === degrees.length - 1 ? 0 : d - 1,
      );
    if (transform === "inversion")
      degrees = degrees.map((d) => 2 * degrees[0] - d);
    if (transform === "sequence")
      degrees = degrees.map((d) => d + (b ? 1 : -1) + (episode % 3));
    if (transform === "fragment") degrees = degrees.slice(0, 3);
    const stretch = transform === "augmentation" ? 2 : 1;
    const rhythm = motif.rhythm.slice(0, degrees.length);
    const weight = rhythm.reduce((a, b) => a + b, 0);
    let cursor = texture === "dialogue" && b === 1 ? beats / 6 : 0;
    const melodicEvents: NoteEvent[] = [];
    degrees.forEach((degree, i) => {
      if (cursor >= beats - 0.08) return;
      const target =
        scaleNote(p, color, degree, p.register) +
        (section === "crest" ? 12 : 0);
      const pc = mod(target, 12);
      let midi = nearestPc(
        pc,
        target * 0.65 + lastMelody * 0.35,
        p.register - 3,
        Math.min(96, p.register + 25),
      );
      if (i === degrees.length - 1 && section === "return")
        midi = nearestPc(p.tonic, lastMelody, p.register, p.register + 18);
      const span = ((beats * rhythm[i]) / weight) * stretch;
      const gate =
        p.articulation === "detached"
          ? 0.55
          : p.articulation === "legato"
            ? 1.02
            : 0.88;
      const breath = p.phrasing === "sighing" ? 0.78 : 1;
      const duration = Math.min(span, beats - cursor + 0.1) * gate * breath;
      const velocity =
        baseVelocity +
        8 +
        Math.sin((i / degrees.length) * Math.PI) * 5 -
        (b && i === degrees.length - 1 ? 5 : 0);
      add("melody", cursor, duration, midi, velocity);
      melodicEvents.push(notes.at(-1)!);
      if (transform === "ornament" && i === 1 && span > 0.5) {
        const ornament = nearestPc(
          colorPcs[mod(colorPcs.indexOf(pc) + 1, colorPcs.length)],
          midi + 2,
          p.register,
          96,
        );
        // Replace the end of this note with a quiet neighboring tone.
        notes.at(-1)!.duration = Math.max(0.1, duration - 0.22);
        add(
          "melody",
          cursor + Math.max(0.1, span - 0.22),
          0.18,
          ornament,
          velocity - 8,
        );
      }
      lastMelody = midi;
      cursor += span;
    });
    const melodyAt = (t: number) =>
      melodicEvents.filter((e) => e.beat <= t).at(-1)?.midi ?? lastMelody;
    const accompanimentPitch = (v: number, time: number) => {
      while (v >= melodyAt(time) - 2 && v > 48) v -= 12;
      return v;
    };
    if (texture === "ripples" || texture === "layers") {
      const step =
        p.density === "sparse" ? beats / 6 : p.meter[1] === 8 ? 0.5 : 1 / 3;
      const count = Math.ceil(beats / step);
      for (let i = 0; i < count; i++) {
        const t = i * step;
        if (t >= beats) break;
        const arpeggio =
          texture === "layers" ? [0, 2, 1, 2] : [0, 1, 2, 1, 3, 2];
        const v = accompanimentPitch(
          voices[
            arpeggio[mod(i + b + variant, arpeggio.length)] % voices.length
          ],
          t,
        );
        add(
          "accompaniment",
          t,
          step * 1.25,
          v,
          baseVelocity - 20 + (i % 3 === 0 ? 3 : 0),
        );
      }
    } else if (texture === "dialogue") {
      [beats / 3, (beats * 2) / 3].forEach((t, i) =>
        add(
          "accompaniment",
          t,
          (beats / 3) * 0.85,
          accompanimentPitch(voices[(i + variant) % voices.length], t),
          baseVelocity - 14,
        ),
      );
    } else {
      const attacks = texture === "chordal" ? [0, (beats * 2) / 3] : [0];
      attacks.forEach((t) =>
        voices
          .slice(0, texture === "melody" ? 2 : 4)
          .forEach((v) =>
            add(
              "accompaniment",
              t,
              (beats / attacks.length) * 0.8,
              accompanimentPitch(v, t),
              baseVelocity - 19,
            ),
          ),
      );
    }
    // No duplicate unisons within a part at an onset; independent layers remain distinct MIDI channels.
    const unique = notes
      .filter(
        (n, i) =>
          notes.findIndex(
            (e) => e.part === n.part && e.beat === n.beat && e.midi === n.midi,
          ) === i,
      )
      .sort((a, b) => a.beat - b.beat);
    const tempoTarget =
      p.tempo * (section === "crest" ? 1.05 : section === "return" ? 0.94 : 1);
    const endBpm =
      tempoTarget *
      (b === 1 && ["return", "statement"].includes(section) ? 0.94 : 1);
    const tempo = [
      { beat: 0, bpm: lastTempo },
      { beat: beats / 3, bpm: tempoTarget },
      { beat: (beats * 2) / 3, bpm: endBpm },
    ];
    lastTempo = endBpm;
    const harmony = `${KEYS[root]} · ${color.replaceAll("_", " ")} · ${pcs.map((pc) => KEYS[pc]).join("–")}${motion === "pedal" ? " / held bass" : ""}`;
    // Repedal after the new bass attack. Never flush notes or resonance at network boundaries.
    const pedal =
      p.articulation === "detached"
        ? [{ beat: 0, down: false }]
        : [
            { beat: 0, down: false },
            { beat: 0.06, down: true },
          ];
    bars.push({
      index,
      beats,
      meter: p.meter,
      harmony,
      texture,
      section,
      collection: color,
      transformation: transform,
      motifId: motif.id,
      notes: unique,
      pedal,
      tempo,
    });
  }
  return {
    bars,
    state: {
      version: 2,
      nextBar: s.nextBar + 2,
      section,
      sectionStart,
      episode,
      motif,
      collection: color,
      root,
      bass,
      lastMelody,
      lastTempo,
      lastVoicing,
      lastTexture: texture,
      recent: [
        ...s.recent,
        ...bars.map((b) => ({
          texture: b.texture,
          harmony: b.harmony,
          transformation: b.transformation,
        })),
      ].slice(-8),
    },
  };
}

export function buildCandidates(p: Profile, s: CompositionState): Candidate[] {
  const age = s.nextBar - s.sectionStart;
  const minimum = s.section === "crest" ? 4 : p.sectionBars;
  const sections: Section[] =
    age >= minimum + 4
      ? [nextSection(s.section)]
      : age >= minimum
        ? [s.section, nextSection(s.section)]
        : [s.section];
  const designs: {
    texture: Texture;
    transform: Transformation;
    motion: string;
    color?: Collection;
  }[] = [
    { texture: "melody", transform: "original", motion: "pedal" },
    { texture: "ripples", transform: "sequence", motion: "neighbor" },
    {
      texture: "layers",
      transform: "original",
      motion: "pedal",
      color: p.collection === "minor" ? "minor_pentatonic" : "pentatonic",
    },
    { texture: "dialogue", transform: "inversion", motion: "relative" },
    { texture: "ripples", transform: "ornament", motion: "subdominant" },
    { texture: "bells", transform: "augmentation", motion: "planing" },
    { texture: "chordal", transform: "original", motion: "home" },
    { texture: "melody", transform: "fragment", motion: "neighbor" },
  ];
  if (
    p.style === "impressionist" &&
    s.nextBar >= p.sectionBars &&
    s.collection !== "whole_tone"
  )
    designs.push({
      texture: "ripples",
      transform: "augmentation",
      motion: "planing",
      color: "whole_tone",
    });
  const candidates: Candidate[] = [];
  for (const section of sections)
    for (let i = 0; i < designs.length; i++) {
      const d = designs[i];
      if (
        s.nextBar === 0 &&
        !(p.opening ? [p.opening] : ["melody", "layers", "ripples"]).includes(
          d.texture,
        )
      )
        continue;
      if (
        s.recent.slice(-4).filter((r) => r.texture === d.texture).length === 4
      )
        continue;
      const returning = section === "return";
      const color = returning ? p.collection : (d.color ?? p.collection);
      const transform = s.nextBar === 0 || returning ? "original" : d.transform;
      const motion = s.nextBar === 0 || returning ? "home" : d.motion;
      const rendered = renderBars(
        p,
        s,
        section,
        d.texture,
        transform,
        color,
        motion,
        i + s.episode,
      );
      const bar = rendered.bars[0];
      const id = `${section}_${d.texture}_${i}`;
      candidates.push({
        id,
        ...rendered,
        description: `${section}: ${d.texture}; ${transform} of ${bar.motifId}; ${color}; ${motion} harmony. ${rendered.bars.map((b) => b.harmony).join(" then ")}. Melody ${bar.notes
          .filter((n) => n.part === "melody")
          .map((n) => `${noteName(n.midi)}@${n.beat}`)
          .join(
            ", ",
          )}. ${section === "crest" ? "Fuller expressive arrival" : returning ? "Recognizable motif returns with reduced intensity" : "Keep melody above quieter supporting layers"}.`,
      });
    }
  return candidates;
}

export function validProfile(v: unknown): v is Profile {
  if (!v || typeof v !== "object") return false;
  const p = v as Profile;
  return (
    p.version === 2 &&
    Number.isInteger(p.seed) &&
    Number.isInteger(p.tonic) &&
    p.tonic >= 0 &&
    p.tonic < 12 &&
    p.key === KEYS[p.tonic] &&
    Object.hasOwn(COLLECTIONS, p.collection) &&
    Array.isArray(p.meter) &&
    p.meter.length === 2 &&
    ["9/8", "6/8", "3/4", "4/4"].includes(p.meter.join("/")) &&
    Number.isFinite(p.tempo) &&
    p.tempo >= 40 &&
    p.tempo <= 180 &&
    [1, 1.5].includes(p.pulseBeats) &&
    p.pulseBeats === (p.meter[1] === 8 ? 1.5 : 1) &&
    [60, 65, 72].includes(p.register) &&
    ["sparse", "balanced", "flowing"].includes(p.density) &&
    ["legato", "natural", "detached"].includes(p.articulation) &&
    ["impressionist", "tonal", "modal"].includes(p.style) &&
    [6, 8, 10].includes(p.sectionBars) &&
    (p.opening === undefined ||
      ["melody", "ripples", "layers", "dialogue"].includes(p.opening)) &&
    (p.phrasing === undefined || Object.hasOwn(PHRASING_RHYTHMS, p.phrasing)) &&
    typeof p.character === "string" &&
    p.character.length < 80 &&
    validMotif(p.motif)
  );
}
function validMotif(m: Motif) {
  return (
    !!m &&
    typeof m.id === "string" &&
    m.id.length < 40 &&
    Array.isArray(m.degrees) &&
    m.degrees.length >= 3 &&
    m.degrees.length <= 6 &&
    m.degrees.every((d) => Number.isInteger(d) && Math.abs(d) < 12) &&
    Array.isArray(m.rhythm) &&
    m.rhythm.length === m.degrees.length &&
    m.rhythm.every((d) => Number.isFinite(d) && d >= 1 && d <= 4)
  );
}
export function validState(v: unknown): v is CompositionState {
  if (!v || typeof v !== "object") return false;
  const s = v as CompositionState;
  return (
    s.version === 2 &&
    Number.isInteger(s.nextBar) &&
    s.nextBar >= 0 &&
    s.nextBar < 1e7 &&
    s.nextBar % 2 === 0 &&
    SECTIONS.includes(s.section) &&
    Number.isInteger(s.sectionStart) &&
    s.sectionStart >= 0 &&
    s.sectionStart <= s.nextBar &&
    Number.isInteger(s.episode) &&
    s.episode >= 0 &&
    validMotif(s.motif) &&
    Object.hasOwn(COLLECTIONS, s.collection) &&
    Number.isInteger(s.root) &&
    s.root >= 0 &&
    s.root < 12 &&
    Number.isInteger(s.bass) &&
    s.bass >= 21 &&
    s.bass <= 60 &&
    Number.isInteger(s.lastMelody) &&
    s.lastMelody >= 48 &&
    s.lastMelody <= 108 &&
    Number.isFinite(s.lastTempo) &&
    s.lastTempo >= 30 &&
    s.lastTempo <= 200 &&
    Array.isArray(s.lastVoicing) &&
    s.lastVoicing.length <= 5 &&
    s.lastVoicing.every((n) => Number.isInteger(n) && n >= 21 && n <= 108) &&
    Array.isArray(s.recent) &&
    s.recent.length <= 8 &&
    s.recent.every(
      (r) =>
        r &&
        typeof r.harmony === "string" &&
        r.harmony.length < 200 &&
        typeof r.texture === "string" &&
        typeof r.transformation === "string",
    )
  );
}
