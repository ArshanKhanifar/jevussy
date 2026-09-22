import { createPianoSynth } from "./synth";
import type { TimedMidi } from "./timeline";
type Message = {
  type: "init" | "reset" | "render";
  id: number;
  generation: number;
  sampleRate: number;
  events: TimedMidi[];
  duration: number;
};
const scope = globalThis as unknown as {
  importScripts: (s: string) => void;
  alphaTab: typeof import("@coderline/alphatab");
  onmessage: (e: MessageEvent<Message>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let piano: ReturnType<typeof createPianoSynth> | null = null;
let chain = Promise.resolve();
scope.onmessage = ({ data }) => {
  chain = chain.then(async () => {
    try {
      if (data.type === "init") {
        scope.importScripts("/alphatab/alphaTab.min.js");
        const response = await fetch("/soundfont/TimGM6mb.sf2");
        if (!response.ok)
          throw new Error("Could not load grand piano samples.");
        piano = createPianoSynth(
          scope.alphaTab,
          data.sampleRate,
          new Uint8Array(await response.arrayBuffer()),
        );
        scope.postMessage({
          id: data.id,
          generation: data.generation,
          type: "ready",
        });
      } else if (data.type === "reset") {
        piano?.reset();
        scope.postMessage({
          id: data.id,
          generation: data.generation,
          type: "reset",
        });
      } else {
        if (!piano) throw new Error("The piano is not ready.");
        const pcm = piano.render(data.events, data.duration);
        scope.postMessage(
          {
            id: data.id,
            generation: data.generation,
            type: "audio",
            pcm: pcm.buffer,
          },
          [pcm.buffer],
        );
      }
    } catch (error) {
      scope.postMessage({
        id: data.id,
        generation: data.generation,
        type: "error",
        error:
          error instanceof Error ? error.message : "Piano rendering failed.",
      });
    }
  });
};
