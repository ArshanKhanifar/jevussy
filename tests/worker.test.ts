import { test, expect } from "bun:test";
import { createContext, runInContext } from "node:vm";
test("built worker boots the shipped alphaTab UMD and renders piano PCM", async () => {
  const worker = await Bun.file("public/piano-worker.js").text();
  const alpha = await Bun.file("public/alphatab/alphaTab.min.js").text();
  const font = await Bun.file("public/soundfont/TimGM6mb.sf2").arrayBuffer();
  let complete: (v: Record<string, unknown>) => void = () => {};
  const scope: Record<string, unknown> = {
    WorkerGlobalScope: class {},
    console,
    Float32Array,
    Uint8Array,
    ArrayBuffer,
    TextDecoder,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
    location: { href: "http://localhost/piano-worker.js" },
    navigator: { userAgent: "worker-test" },
    addEventListener() {},
    postMessage(message: Record<string, unknown>) {
      complete(message);
    },
    fetch: async () => ({ ok: true, arrayBuffer: async () => font }),
    importScripts: () => runInContext(alpha, context),
  };
  scope.self = scope;
  const context = createContext(scope);
  runInContext(worker, context);
  const send = (data: unknown) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Worker timed out")),
        3000,
      );
      complete = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      (scope.onmessage as (e: { data: unknown }) => void)({ data });
    });
  const ready = await send({
    type: "init",
    id: 1,
    generation: 1,
    sampleRate: 24000,
  });
  expect(ready.error).toBeUndefined();
  expect(ready.type).toBe("ready");
  const audio = await send({
    type: "render",
    id: 2,
    generation: 1,
    duration: 0.5,
    events: [{ time: 0, kind: "on", channel: 2, key: 73, value: 85 }],
  });
  expect(audio.type).toBe("audio");
  expect(audio.generation).toBe(1);
  const pcm = new Float32Array(audio.pcm as ArrayBuffer);
  expect(pcm.length).toBe(24000);
  expect(pcm.some((v) => Math.abs(v) > 0.01)).toBe(true);
  const reset = await send({ type: "reset", id: 3, generation: 2 });
  expect(reset.type).toBe("reset");
  const silence = await send({
    type: "render",
    id: 4,
    generation: 2,
    duration: 0.1,
    events: [],
  });
  expect(
    new Float32Array(silence.pcm as ArrayBuffer).every((v) => v === 0),
  ).toBe(true);
});
