import { test, expect } from "bun:test";
import { PianoPlayer } from "../lib/audio/player";
import {
  buildCandidates,
  initialState,
  motifOptions,
  type Profile,
} from "../lib/music";
const profile: Profile = {
  version: 2,
  seed: 3,
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
  motif: motifOptions(3)[0],
};
test("audio buffers meet exactly, pause freezes playback, and restarted generations discard stale audio", async () => {
  const oldContext = globalThis.AudioContext,
    oldWorker = globalThis.Worker;
  const starts: { start: number; duration: number; stopped: boolean }[] = [];
  class Context {
    currentTime = 0;
    sampleRate = 1000;
    state = "running";
    destination = {};
    createGain() {
      return { gain: { value: 1 }, connect() {} };
    }
    createBuffer(_channels: number, length: number, rate: number) {
      const channels = [new Float32Array(length), new Float32Array(length)];
      return {
        length,
        duration: length / rate,
        getChannelData(c: number) {
          return channels[c];
        },
      };
    }
    createBufferSource() {
      const record = { start: 0, duration: 0, stopped: false };
      return {
        buffer: null as { duration: number } | null,
        onended: () => {},
        connect() {},
        disconnect() {},
        start(time: number) {
          record.start = time;
          record.duration = this.buffer!.duration;
          starts.push(record);
        },
        stop() {
          record.stopped = true;
        },
      };
    }
    async resume() {
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    async close() {
      this.state = "closed";
    }
  }
  class WorkerMock {
    onmessage: ((event: unknown) => void) | null = null;
    onerror: unknown;
    postMessage(data: {
      id: number;
      generation: number;
      type: string;
      duration: number;
    }) {
      setTimeout(
        () =>
          this.onmessage?.({
            data: {
              ...data,
              type: data.type === "render" ? "audio" : data.type,
              pcm:
                data.type === "render"
                  ? new Float32Array(Math.round(data.duration * 1000) * 2)
                      .buffer
                  : undefined,
            },
          }),
        5,
      );
    }
    terminate() {}
  }
  Object.assign(globalThis, { AudioContext: Context, Worker: WorkerMock });
  const player = new PianoPlayer();
  try {
    const first = buildCandidates(profile, initialState(profile))[0];
    const second = buildCandidates(profile, first.state)[1];
    await player.append(first.bars);
    await player.append(second.bars);
    expect(starts.length).toBe(2);
    expect(starts[1].start).toBe(starts[0].start + starts[0].duration);
    const buffered = player.bufferedSeconds;
    await player.pause();
    expect(player.paused).toBe(true);
    expect(player.bufferedSeconds).toBe(buffered);
    await player.resume();
    expect(player.paused).toBe(false);
    const stale = player.append(first.bars);
    const reset = player.stop();
    await Promise.all([stale, reset]);
    expect(starts.length).toBe(2);
    expect(starts.every((s) => s.stopped)).toBe(true);
    expect(player.bufferedSeconds).toBe(0);
    await player.append(first.bars);
    expect(starts.length).toBe(3);
    expect(starts[2].start).toBe(0.08);
  } finally {
    player.destroy();
    Object.assign(globalThis, { AudioContext: oldContext, Worker: oldWorker });
  }
});
