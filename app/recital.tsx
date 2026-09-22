"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  SECTIONS,
  type Profile,
  type CompositionState,
  type PianoBar,
  type Phrase,
  type JevTrace,
} from "@/lib/music";
import { PianoPlayer } from "@/lib/audio/player";
import {
  createPromptVariation,
  type PromptVariation,
} from "@/lib/prompt-variations";
type Status =
  "idle" | "profiling" | "buffering" | "playing" | "paused" | "error";
type TraceEvent = {
  type: string;
  elapsedMs: number;
  json: Record<string, unknown>;
};
type StreamEvent = {
  type: string;
  elapsedMs: number;
  profile?: Profile;
  state?: CompositionState;
  bars?: PianoBar[];
  decision?: Phrase["decision"];
  trace?: JevTrace;
  jev?: JevTrace;
  error?: string;
};
const nowMs = () => performance.now();
const BLACK = new Set([1, 3, 6, 8, 10]);
const PCS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const keyboard = (() => {
  let whiteBefore = 0;
  return Array.from({ length: 88 }, (_, i) => {
    const midi = i + 21,
      black = BLACK.has(midi % 12);
    const key = {
      midi,
      note: `${PCS[midi % 12]}${Math.floor(midi / 12) - 1}`,
      black,
      whiteBefore,
    };
    if (!black) whiteBefore++;
    return key;
  });
})();
export default function Recital({
  initialVariation,
}: {
  initialVariation: PromptVariation;
}) {
  const [variation, setVariation] = useState(initialVariation);
  const [prompt, setPrompt] = useState(initialVariation.prompt);
  useEffect(() => {
    // A musical preset only; the server uses it to avoid the same opening on
    // the next visit. The editable prompt is never stored or replaced here.
    document.cookie = `jevussy-variation=${variation.id}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [variation.id]);
  const [status, setStatus] = useState<Status>("idle");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeMidis, setActiveMidis] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [pianoLoaded, setPianoLoaded] = useState(false);
  const [jevTrace, setJevTrace] = useState<TraceEvent[]>([]);
  const [generatedBars, setGeneratedBars] = useState(0);
  const [isDeciding, setIsDeciding] = useState(false);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [audibleBar, setAudibleBar] = useState<PianoBar | null>(null);
  const [ahead, setAhead] = useState<Phrase["decision"] | null>(null);
  const streamBodyRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<PianoPlayer | null>(null);
  const generationRef = useRef(0);
  const statusRef = useRef<Status>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<CompositionState | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const promptRef = useRef(initialVariation.prompt);
  const fetchingRef = useRef<number | null>(null);
  const streamStartedRef = useRef(0);
  const latencyRef = useRef(0.8);
  const retryAtRef = useRef(0);
  const failuresRef = useRef(0);
  const tickRef = useRef<() => void>(() => {});
  const setPlaybackStatus = (value: Status) => {
    statusRef.current = value;
    setStatus(value);
  };
  const trace = (type: string, json: Record<string, unknown>) =>
    setJevTrace((current) => [
      ...current.slice(-47),
      { type, elapsedMs: Math.round(nowMs() - streamStartedRef.current), json },
    ]);
  const preparePiano = () => {
    if (!playerRef.current) playerRef.current = new PianoPlayer();
    return playerRef.current;
  };
  const recordPhrase = (phrase: Phrase) => {
    stateRef.current = phrase.state;
    setGeneratedBars(phrase.state.nextBar);
    setAhead(phrase.decision);
    setLatency(phrase.trace.latencyMs);
    latencyRef.current = Math.max(
      phrase.trace.latencyMs / 1000,
      latencyRef.current * 0.8,
    );
    trace(`measures ${phrase.bars[0].index + 1}–${phrase.state.nextBar}`, {
      model: phrase.trace.model,
      answers: phrase.trace.answers,
      selected: phrase.decision,
      latency_ms: phrase.trace.latencyMs,
      timing: {
        meter: phrase.bars[0].meter,
        unit: "quarter-note beats",
        notes: phrase.bars.reduce((n, b) => n + b.notes.length, 0),
      },
    });
  };
  const requestContinuations = async (generation: number) => {
    const player = playerRef.current;
    if (
      !player ||
      !profileRef.current ||
      !stateRef.current ||
      fetchingRef.current === generation ||
      generation !== generationRef.current ||
      statusRef.current === "paused" ||
      nowMs() < retryAtRef.current
    )
      return;
    fetchingRef.current = generation;
    setIsDeciding(true);
    try {
      // Buffer depends on observed latency, not a fixed number of cached loops.
      const target = Math.min(24, Math.max(8, latencyRef.current * 4 + 4));
      while (
        player.bufferedSeconds < target &&
        generation === generationRef.current &&
        !player.paused
      ) {
        const before = stateRef.current!;
        const response = await fetch("/api/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controllerRef.current?.signal,
          body: JSON.stringify({
            operation: "continuation",
            prompt: promptRef.current,
            profile: profileRef.current,
            state: before,
          }),
        });
        const data = (await response.json()) as Phrase & { error?: string };
        if (!response.ok)
          throw new Error(data.error ?? "JEV could not continue.");
        if (generation !== generationRef.current) return;
        if (
          data.state.nextBar !== before.nextBar + 2 ||
          data.bars.length !== 2 ||
          data.bars[0].index !== before.nextBar
        )
          throw new Error("JEV returned an out-of-order continuation.");
        await player.append(data.bars);
        if (generation !== generationRef.current) return;
        recordPhrase(data);
        setError("");
        failuresRef.current = 0;
        retryAtRef.current = 0;
        if (statusRef.current === "buffering") setPlaybackStatus("playing");
      }
    } catch (caught) {
      if (
        generation !== generationRef.current ||
        controllerRef.current?.signal.aborted
      )
        return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Waiting for the next JEV decision.",
      );
      failuresRef.current++;
      retryAtRef.current =
        nowMs() + Math.min(15000, 1000 * 2 ** failuresRef.current);
    } finally {
      if (generation === generationRef.current) {
        fetchingRef.current = null;
        setIsDeciding(false);
      }
    }
  };
  const compose = async (event?: FormEvent) => {
    event?.preventDefault();
    const direction = prompt.trim();
    if (!direction) return;
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const generation = ++generationRef.current;
    promptRef.current = direction;
    stateRef.current = null;
    profileRef.current = null;
    fetchingRef.current = null;
    failuresRef.current = 0;
    retryAtRef.current = 0;
    latencyRef.current = 0.8;
    streamStartedRef.current = nowMs();
    setError("");
    setJevTrace([]);
    setGeneratedBars(0);
    setAhead(null);
    setAudibleBar(null);
    setProfile(null);
    setActiveMidis([]);
    setBufferedSeconds(0);
    setIsDeciding(true);
    setPlaybackStatus("profiling");
    try {
      const player = preparePiano();
      void player.resume();
      // Sample loading and the model's opening decisions proceed together.
      const pianoReady = player.stop();
      void pianoReady.catch(() => {}); // Its error is handled by the awaited opening path.
      const response = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controllerRef.current.signal,
        body: JSON.stringify({ operation: "stream", prompt: direction }),
      });
      if (!response.ok || !response.body)
        throw new Error(`JEV stream returned ${response.status}.`);
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "";
      let opening: Phrase | null = null;
      const accept = (message: StreamEvent) => {
        if (generation !== generationRef.current) return;
        if (message.type === "error")
          throw new Error(message.error ?? "JEV could not start.");
        if (message.type === "profile" && message.profile) {
          profileRef.current = message.profile;
          setProfile(message.profile);
          setPlaybackStatus("buffering");
          trace("musical plan", {
            profile: message.profile,
            model: message.jev?.model,
            answers: message.jev?.answers,
            latency_ms: message.jev?.latencyMs,
          });
        }
        if (
          message.type === "phrase" &&
          message.bars &&
          message.state &&
          message.decision &&
          message.jev
        )
          opening = {
            bars: message.bars,
            state: message.state,
            decision: message.decision,
            trace: message.jev,
          };
        if (message.type === "connected")
          trace("connected", { status: "JEV decision stream open" });
      };
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) accept(JSON.parse(line));
        if (done) break;
      }
      if (pending.trim()) accept(JSON.parse(pending));
      await pianoReady;
      if (generation !== generationRef.current) return;
      setPianoLoaded(true);
      const phrase = opening as Phrase | null;
      if (!phrase || !profileRef.current)
        throw new Error("JEV did not provide a complete opening.");
      await player.append(phrase.bars);
      if (generation !== generationRef.current) return;
      recordPhrase(phrase);
      // A listener can pause while the opening is still arriving.
      if (statusRef.current !== "paused") setPlaybackStatus("playing");
      setIsDeciding(false);
      void requestContinuations(generation);
    } catch (caught) {
      if (generation !== generationRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "The recital could not start.",
      );
      setPlaybackStatus("error");
      setIsDeciding(false);
    }
  };
  const togglePlayback = async () => {
    if (statusRef.current === "idle" || statusRef.current === "error")
      return compose();
    const player = playerRef.current;
    if (!player) return;
    if (statusRef.current === "paused") {
      await player.resume();
      setPlaybackStatus(player.bufferedSeconds > 0 ? "playing" : "buffering");
      void requestContinuations(generationRef.current);
    } else if (
      statusRef.current === "playing" ||
      statusRef.current === "buffering"
    ) {
      setPlaybackStatus("paused");
      await player.pause();
    }
  };
  const playPreview = async (midi: number) => {
    if (!["idle", "error"].includes(statusRef.current)) return;
    try {
      const player = preparePiano();
      await player.resume();
      await player.preview(midi);
      setPianoLoaded(true);
      setActiveMidis([midi]);
      setTimeout(() => setActiveMidis([]), 700);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Piano could not load.",
      );
    }
  };
  useEffect(() => {
    tickRef.current = () => {
      const player = playerRef.current;
      if (!player) return;
      if (
        ["playing", "buffering"].includes(statusRef.current) &&
        stateRef.current
      ) {
        const position = player.position();
        setActiveMidis(position.notes);
        setBufferedSeconds(position.buffered);
        if (position.bar) setAudibleBar(position.bar);
        if (position.buffered <= 0 && statusRef.current === "playing")
          setPlaybackStatus("buffering");
        if (
          position.buffered <
          Math.min(24, Math.max(8, latencyRef.current * 4 + 4))
        )
          void requestContinuations(generationRef.current);
      }
    };
  });
  useEffect(() => {
    const generation = generationRef;
    const timer = setInterval(() => tickRef.current(), 80);
    return () => {
      clearInterval(timer);
      generation.current++;
      controllerRef.current?.abort();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);
  useEffect(() => {
    const panel = streamBodyRef.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, [jevTrace]);
  const statusCopy = {
    idle: "Ready to compose",
    profiling: "Imagining the opening",
    buffering: generatedBars
      ? "Waiting for JEV · no repeated loop"
      : "Preparing the first phrase",
    playing: "Live · an unfolding recital",
    paused: "Paused",
    error: "Connection needs attention",
  }[status];
  const profileChips = useMemo(
    () =>
      profile
        ? [
            `${profile.key} ${profile.collection.replaceAll("_", " ")}`,
            profile.meter.join("/"),
            profile.character,
            `${profile.sectionBars}-measure sections`,
          ]
        : [],
    [profile],
  );
  const harmony = audibleBar?.harmony ?? "Waiting for harmony";
  const newVariation = () => {
    const next = createPromptVariation(variation);
    setVariation(next);
    setPrompt(next.prompt);
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Jevussy home">
          <span className="brand-mark">J</span>
          <span>Jevussy</span>
          <em>JEV × Debussy</em>
        </a>
        <div className={`connection ${status === "error" ? "bad" : ""}`}>
          <span /> {statusCopy}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">An endless étude, composed in the present</p>
          <h1>
            What if Debussy
            <br />
            <span>could keep dreaming?</span>
          </h1>
          <p className="lede">
            <em>Jevussy</em> gives an 88-key grand piano to JEV. Describe a
            mood; it chooses each new passage while remembered melodies return
            in a different light.
          </p>
          <form className="prompt-card" onSubmit={compose}>
            <div className="prompt-heading">
              <label htmlFor="direction">A direction for the pianist</label>
              <button
                type="button"
                className="variation-button"
                onClick={newVariation}
                disabled={status === "profiling" || status === "buffering"}
              >
                ↻ New variation
              </button>
            </div>
            <p className="variation-note">
              {prompt === variation.prompt
                ? `A fresh nocturne · ${variation.key} major · ${variation.pulse} dotted-quarter BPM`
                : "Your own direction"}
            </p>
            <div className="prompt-row">
              <textarea
                id="direction"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={1200}
                rows={5}
                disabled={status === "profiling"}
              />
              <button
                type="submit"
                disabled={status === "profiling" || status === "buffering"}
              >
                <span className="play-icon">
                  {status === "profiling" || status === "buffering" ? "●" : "▶"}
                </span>
                {generatedBars
                  ? "Begin anew"
                  : status === "profiling"
                    ? "Listening…"
                    : "Begin recital"}
              </button>
            </div>
            <div className="prompt-footer">
              <span>
                {profile
                  ? Math.round(profile.tempo / profile.pulseBeats)
                  : variation.pulse}{" "}
                {!profile || profile.pulseBeats === 1.5
                  ? "dotted-quarter"
                  : "pulse"}{" "}
                BPM
              </span>
              <i />
              <span>Deux mains</span>
              <i />
              <span>JEV, en direct</span>
              {latency !== null && (
                <>
                  <i />
                  <span>{latency} ms</span>
                </>
              )}
            </div>
          </form>
        </div>
        <figure className="portrait-wrap">
          <div
            className="portrait"
            role="img"
            aria-label="A Belle Époque portrait of a Debussy-like composer dissolving into musical decision branches"
          />
          <figcaption>
            <span>Étude no. ∞</span>
            <em>Claude, imagined through JEV</em>
          </figcaption>
        </figure>
        <div className="proof-strip" aria-label="Performance capabilities">
          <span>
            <b>88</b> keys
          </span>
          <i />
          <span>
            <b>2</b> hands
          </span>
          <i />
          <span>
            <b>∞</b> composition
          </span>
          <i />
          <span>
            <b>1</b> unfolding story
          </span>
        </div>
        {profileChips.length > 0 && (
          <div
            className="profile-chips"
            aria-label="Interpreted musical profile"
          >
            {profileChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        )}
        {error && (
          <p className="error-note" role="status">
            {error}
          </p>
        )}
      </section>

      <section
        className="musical-journey"
        aria-label="The evolving composition"
      >
        <div className="journey-title">
          <span>Now sounding</span>
          <strong>
            {audibleBar ? audibleBar.section : "A motif, a departure, a return"}
          </strong>
          <em>
            {audibleBar
              ? `Measure ${audibleBar.index + 1} · ${audibleBar.texture}`
              : "Each phrase remembers the last"}
          </em>
        </div>
        <ol>
          {SECTIONS.map((section) => (
            <li
              key={section}
              className={audibleBar?.section === section ? "current" : ""}
              aria-current={
                audibleBar?.section === section ? "step" : undefined
              }
            >
              {section}
            </li>
          ))}
        </ol>
        <div className="journey-detail">
          <span>
            {audibleBar
              ? `Motif · ${audibleBar.transformation} · ${audibleBar.collection.replaceAll("_", " ")}`
              : "Independent melody, accompaniment, and bass"}
          </span>
          <span>
            {ahead
              ? `JEV preparing · ${ahead.section} / ${ahead.transformation}`
              : "New decisions arrive while the piano plays"}
          </span>
        </div>
      </section>

      <section
        className={`jev-stream ${status === "profiling" || status === "buffering" || isDeciding ? "receiving" : ""}`}
        aria-label="Live JEV output stream"
      >
        <div className="stream-head">
          <div>
            <span className="stream-light" />
            <strong>The score in thought</strong>
            <span>JEV’s decisions · live</span>
          </div>
          <div className="stream-clock">
            {jevTrace.length ? `+${jevTrace.at(-1)?.elapsedMs} ms` : "waiting"}
          </div>
        </div>
        <div
          className="stream-body"
          ref={streamBodyRef}
          role="log"
          aria-live="polite"
        >
          {jevTrace.length === 0 ? (
            <div className="stream-empty">
              <span>⁕</span> Begin the recital to watch each musical thought
              arrive <i>│</i>
            </div>
          ) : (
            jevTrace.map((entry, index) => (
              <article className="stream-event" key={`${entry.type}-${index}`}>
                <div className="event-rail">
                  <b>+{entry.elapsedMs}ms</b>
                  <span>{entry.type}</span>
                </div>
                <pre>{JSON.stringify(entry.json, null, 2)}</pre>
              </article>
            ))
          )}
          {(status === "profiling" || status === "buffering" || isDeciding) && (
            <span className="stream-cursor">▌</span>
          )}
        </div>
      </section>

      <section className="instrument" aria-label="88-key piano">
        <div className="instrument-head">
          <div>
            <span className="now-label">At the clavier</span>
            <strong>
              {status === "playing"
                ? harmony
                : pianoLoaded
                  ? "The grand piano awaits"
                  : "Preparing the grand piano"}
            </strong>
          </div>
          <div className="transport">
            <button
              type="button"
              aria-label="Begin a new interpretation"
              onClick={() => compose()}
            >
              ↺
            </button>
            <button
              type="button"
              className="main-transport"
              aria-label={status === "playing" ? "Pause" : "Play"}
              onClick={togglePlayback}
            >
              {status === "playing" ? "Ⅱ" : "▶"}
            </button>
          </div>
          <div className="meter">
            <span>Mouvement</span>
            <strong>{generatedBars} measures imagined</strong>
          </div>
        </div>
        <div className="piano-scroll">
          <div className="piano">
            <div className="white-keys">
              {keyboard
                .filter((key) => !key.black)
                .map((key) => (
                  <button
                    type="button"
                    key={key.midi}
                    className={`key white ${activeMidis.includes(key.midi) ? "active" : ""}`}
                    aria-label={key.note}
                    onClick={() => void playPreview(key.midi)}
                  >
                    <span>{key.note === "C4" ? "C4" : ""}</span>
                  </button>
                ))}
            </div>
            {keyboard
              .filter((key) => key.black)
              .map((key) => (
                <button
                  type="button"
                  key={key.midi}
                  className={`key black ${activeMidis.includes(key.midi) ? "active" : ""}`}
                  style={{
                    left: `calc(${key.whiteBefore} * (100% / 52) - 0.58 * (100% / 52))`,
                  }}
                  aria-label={key.note}
                  onClick={() => void playPreview(key.midi)}
                />
              ))}
          </div>
        </div>
        <div className="instrument-foot">
          <span>{bufferedSeconds.toFixed(1)}s ahead</span>
          <div className="buffer-track">
            <b
              style={{
                width: `${Math.min(100, (bufferedSeconds / 16) * 100)}%`,
              }}
            />
          </div>
          <span>{generatedBars} measures composed</span>
          <span className="pipeline-note">
            Mélodie · arabesques · contrepoint · accords
          </span>
        </div>
      </section>
      <footer>
        <span>TimGM grand piano · alphaTab</span>
        <span>Continuously imagined by JEV</span>
        <span>Jevussy · étude no. ∞</span>
      </footer>
    </main>
  );
}
