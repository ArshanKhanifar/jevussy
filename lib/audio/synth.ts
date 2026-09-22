import type * as AlphaTab from "@coderline/alphatab";
import type { TimedMidi } from "./timeline";
type AlphaModule = Pick<typeof AlphaTab, "synth" | "midi">;
function emitter<T = void>() {
  const callbacks = new Set<(v: T) => void>();
  return {
    on(f: (v: T) => void) {
      callbacks.add(f);
      return () => {
        callbacks.delete(f);
      };
    },
    off(f: (v: T) => void) {
      callbacks.delete(f);
    },
    trigger(v: T) {
      callbacks.forEach((f) => f(v));
    },
  };
}
// Isolated adapter for pinned alphaTab 1.6.0. Keep its exact TimGM piano synthesis,
// but drive the protected sample synthesizer with an append-only event timeline.
// PCM regression tests protect this boundary when alphaTab is upgraded.
export function createPianoSynth(
  at: AlphaModule,
  sampleRate: number,
  font: Uint8Array,
) {
  const ready = emitter();
  const output = {
    sampleRate,
    ready,
    sampleRequest: emitter(),
    samplesPlayed: emitter<number>(),
    open() {
      ready.trigger();
    },
    play() {},
    pause() {},
    destroy() {},
    activate() {},
    addSamples() {},
    resetSamples() {},
    async enumerateOutputDevices() {
      return [];
    },
    async setOutputDevice() {},
    async getOutputDevice() {
      return null;
    },
  };
  class StreamingSynth extends at.synth.AlphaSynth {
    get engine() {
      return this.synthesizer;
    }
  }
  const synth = new StreamingSynth(output, 100);
  let failure: Error | null = null;
  synth.soundFontLoadFailed.on((e) => {
    failure = e;
  });
  synth.midiLoadFailed.on((e) => {
    failure = e;
  });
  synth.loadSoundFont(font, false);
  const midi = new at.midi.MidiFile();
  const handler = new at.midi.AlphaSynthMidiFileHandler(midi, true);
  for (let c = 0; c < 4; c++) {
    handler.addProgramChange(c, 0, c, 0);
    handler.addNote(c, 0, 1, 60, 1, c);
    handler.finishTrack(c, 2);
  }
  synth.loadMidiFile(midi);
  if (failure) throw failure;
  if (!synth.isReadyForPlayback)
    throw new Error("Piano samples could not be initialized.");
  const engine = synth.engine;
  engine.masterVolume = 0.82;
  let frame = 0;
  let endSeconds = 0;
  let pending: (TimedMidi & { frame: number })[] = [];
  const pedalDown = new Set<number>();
  const held = new Map<string, TimedMidi>();
  const active = new Map<string, string | undefined>();
  const rawDispatch = (event: TimedMidi) => {
    const midiEvent =
      event.kind === "on"
        ? new at.midi.NoteOnEvent(
            event.channel,
            0,
            event.channel,
            event.key,
            event.value,
          )
        : event.kind === "off"
          ? new at.midi.NoteOffEvent(
              event.channel,
              0,
              event.channel,
              event.key,
              0,
            )
          : new at.midi.ControlChangeEvent(
              event.channel,
              0,
              event.channel,
              64,
              event.value,
            );
    engine.dispatchEvent({
      eventIndex: 0,
      event: midiEvent,
      isMetronome: false,
      time: 0,
    });
  };
  // alphaTab 1.6.0 does not implement CC64 in TinySoundFont. Defer note-offs
  // explicitly while the damper is down, retaining the original sample envelopes.
  const dispatch = (event: TimedMidi) => {
    const key = `${event.channel}/${event.key}`;
    if (event.kind === "pedal") {
      if (event.value >= 64) pedalDown.add(event.channel);
      else {
        pedalDown.delete(event.channel);
        for (const [k, off] of held)
          if (off.channel === event.channel) {
            rawDispatch(off);
            held.delete(k);
          }
      }
      return;
    }
    if (event.kind === "on") {
      const previous = held.get(key);
      if (previous) {
        rawDispatch(previous);
        held.delete(key);
      }
      if (active.has(key)) rawDispatch({ ...event, kind: "off", value: 0 });
      active.set(key, event.noteId);
      rawDispatch(event);
    } else {
      if (event.noteId && active.get(key) !== event.noteId) return;
      active.delete(key);
      if (pedalDown.has(event.channel)) held.set(key, event);
      else rawDispatch(event);
    }
  };
  const reset = () => {
    engine.resetSoft();
    engine.synthesizeSilent(1);
    frame = 0;
    endSeconds = 0;
    pending = [];
    pedalDown.clear();
    held.clear();
    active.clear();
    for (let c = 0; c < 4; c++)
      engine.dispatchEvent({
        eventIndex: 0,
        event: new at.midi.ProgramChangeEvent(c, 0, c, 0),
        isMetronome: false,
        time: 0,
      });
  };
  reset();
  return {
    reset,
    render(events: TimedMidi[], duration: number) {
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60)
        throw new Error("Invalid audio segment duration.");
      const offset = endSeconds;
      endSeconds += duration;
      const endFrame = Math.round(endSeconds * sampleRate);
      pending.push(
        ...events.map((e) => ({
          ...e,
          frame: Math.round((offset + e.time) * sampleRate),
        })),
      );
      pending.sort(
        (a, b) =>
          a.frame - b.frame ||
          { off: 0, pedal: 1, on: 2 }[a.kind] -
            { off: 0, pedal: 1, on: 2 }[b.kind],
      );
      const pcm = new Float32Array((endFrame - frame) * 2);
      let position = 0,
        index = 0;
      while (frame < endFrame) {
        while (index < pending.length && pending[index].frame <= frame)
          dispatch(pending[index++]);
        const next = Math.min(
          endFrame,
          pending[index]?.frame ?? endFrame,
          frame + 64,
        );
        const count = next - frame;
        if (count > 0) {
          engine.synthesize(pcm, position * 2, count);
          frame = next;
          position += count;
        }
      }
      pending = pending.slice(index);
      return pcm;
    },
    destroy() {
      synth.destroy();
    },
  };
}
