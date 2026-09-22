import {
  DEFAULT_PROMPT,
  type Profile,
  type Phrase,
  type CompositionState,
} from "../lib/music";
const origin = process.env.JEV_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const count = Number(process.env.JEV_TEST_PHRASES ?? 22);
const prompt = process.env.JEV_TEST_PROMPT ?? DEFAULT_PROMPT;
const started = performance.now();
const response = await fetch(`${origin}/api/compose`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ operation: "stream", prompt }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const messages = (await response.text())
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const failure = messages.find((m) => m.type === "error");
if (failure) throw new Error(failure.error);
const profile = messages.find((m) => m.type === "profile").profile as Profile;
const opening = messages.find((m) => m.type === "phrase") as Phrase & {
  jev: Phrase["trace"];
};
let state: CompositionState = opening.state;
const phrases: Phrase[] = [{ ...opening, trace: opening.jev }];
console.log(
  JSON.stringify(
    { openingMs: Math.round(performance.now() - started), profile },
    null,
    2,
  ),
);
for (let i = 0; i < count; i++) {
  const r = await fetch(`${origin}/api/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "continuation", prompt, profile, state }),
  });
  const phrase = (await r.json()) as Phrase & { error?: string };
  if (!r.ok) throw new Error(phrase.error);
  if (phrase.state.nextBar !== state.nextBar + 2)
    throw new Error("State discontinuity");
  if (
    !phrase.bars.every((bar) =>
      bar.notes.every((n) => Number.isFinite(n.midi + n.beat + n.duration)),
    )
  )
    throw new Error("Invalid note");
  phrases.push(phrase);
  state = phrase.state;
  console.log(
    JSON.stringify({
      bars: state.nextBar,
      section: phrase.decision.section,
      texture: phrase.decision.texture,
      motif: phrase.decision.motif,
      transformation: phrase.decision.transformation,
      color: phrase.decision.collection,
      latencyMs: phrase.trace.latencyMs,
    }),
  );
}
const path = `/Users/arshan/repos/arshan-agent-sessions/mandem-sessions/2026-09-21-jev-prototype/${process.env.JEV_TEST_LABEL ?? "latest-musical-smoke"}.json`;
await Bun.write(
  path,
  JSON.stringify({ origin, prompt, profile, phrases }, null, 2),
);
console.log(
  JSON.stringify({
    measures: state.nextBar,
    sections: [...new Set(phrases.map((p) => p.decision.section))],
    textures: [...new Set(phrases.map((p) => p.decision.texture))],
    totalMs: Math.round(performance.now() - started),
    saved: path,
  }),
);
