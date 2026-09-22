import type { PianoBar } from "../music";
import { compileBars, type Performance } from "./timeline";
type Reply = {
  id: number;
  generation: number;
  type: string;
  pcm?: ArrayBuffer;
  error?: string;
};
export class PianoPlayer {
  private context: AudioContext;
  private worker: Worker;
  private gain: GainNode;
  private pending = new Map<
    number,
    {
      resolve: (r: Reply) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private id = 0;
  private generation = 0;
  private endTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private timeline: { start: number; performance: Performance }[] = [];
  readonly ready: Promise<void>;
  constructor() {
    this.context = new AudioContext();
    // Called synchronously from the user's click, before any network await.
    void this.context.resume();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.9;
    this.gain.connect(this.context.destination);
    this.worker = new Worker("/piano-worker.js?v=2");
    this.worker.onmessage = ({ data }: { data: Reply }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.id);
      if (data.type === "error") pending.reject(new Error(data.error));
      else pending.resolve(data);
    };
    this.worker.onerror = () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Piano worker failed to load."));
      }
      this.pending.clear();
    };
    this.ready = this.request({
      type: "init",
      sampleRate: this.context.sampleRate,
    }).then(() => undefined);
  }
  private request(data: Record<string, unknown>): Promise<Reply> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Piano rendering timed out."));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...data, id, generation: this.generation });
    });
  }
  get bufferedSeconds() {
    return Math.max(0, this.endTime - this.context.currentTime);
  }
  get paused() {
    return this.context.state === "suspended";
  }
  async append(bars: PianoBar[]) {
    const generation = this.generation;
    await this.ready;
    if (generation !== this.generation) return;
    const performance = compileBars(bars);
    const result = await this.request({
      type: "render",
      events: performance.events,
      duration: performance.duration,
    });
    if (generation !== this.generation) return;
    const samples = new Float32Array(result.pcm!);
    const buffer = this.context.createBuffer(
      2,
      samples.length / 2,
      this.context.sampleRate,
    );
    for (let c = 0; c < 2; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i++) channel[i] = samples[i * 2 + c];
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    const start = Math.max(this.endTime, this.context.currentTime + 0.08);
    source.start(start);
    this.endTime = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    this.timeline.push({ start, performance });
  }
  position() {
    const now = this.context.currentTime;
    this.timeline = this.timeline.filter(
      (t) => t.start + t.performance.duration + 2 > now,
    );
    const current = this.timeline.find(
      (t) => t.start <= now && t.start + t.performance.duration > now,
    );
    const notes = this.timeline.flatMap((t) =>
      t.performance.notes
        .filter((n) => t.start + n.start <= now && t.start + n.end > now)
        .map((n) => n.midi),
    );
    const bar = current?.performance.bars.find(
      (b) => current.start + b.start <= now && current.start + b.end > now,
    )?.bar;
    return { notes: [...new Set(notes)], bar, buffered: this.bufferedSeconds };
  }
  async pause() {
    await this.context.suspend();
  }
  async resume() {
    await this.context.resume();
  }
  async stop() {
    this.generation++;
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.timeline = [];
    this.endTime = 0;
    await this.ready;
    await this.request({ type: "reset" });
  }
  async preview(midi: number) {
    // Isolated preview voice through the same piano worker, only when recital is idle.
    const generation = this.generation;
    await this.ready;
    if (generation !== this.generation) return;
    const result = await this.request({
      type: "render",
      events: [
        { time: 0, kind: "on", channel: 3, key: midi, value: 85 },
        { time: 0.7, kind: "off", channel: 3, key: midi, value: 0 },
      ],
      duration: 1.5,
    });
    if (generation !== this.generation) return;
    const pcm = new Float32Array(result.pcm!);
    const buffer = this.context.createBuffer(
      2,
      pcm.length / 2,
      this.context.sampleRate,
    );
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < buffer.length; i++)
        buffer.getChannelData(c)[i] = pcm[i * 2 + c];
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start();
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
  }
  destroy() {
    this.generation++;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Piano closed."));
    }
    this.pending.clear();
    this.worker.terminate();
    void this.context.close();
  }
}
