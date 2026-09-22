import { NextRequest, NextResponse } from "next/server";
import { makeContinuation, makeProfile, MODEL } from "@/lib/jev";
import { validProfile, validState } from "@/lib/music";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function safeError(error: unknown) {
  return error instanceof Error && !error.message.includes("Bearer")
    ? error.message.slice(0, 180)
    : "JEV could not complete this decision.";
}
export async function POST(request: NextRequest) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON composition request." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body.prompt !== "string" ||
    !body.prompt.trim() ||
    body.prompt.length > 1200
  )
    return NextResponse.json(
      { error: "Direction must contain 1–1200 characters." },
      { status: 400 },
    );
  const prompt = body.prompt.trim();
  if (body.operation === "stream") {
    const started = Date.now();
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: unknown) => {
          if (!closed && !signal.aborted)
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ elapsedMs: Date.now() - started, ...(event as object) })}\n`,
              ),
            );
        };
        try {
          emit({ type: "connected", model: MODEL });
          const plan = await makeProfile(prompt, signal);
          emit({
            type: "profile",
            profile: plan.profile,
            state: plan.state,
            jev: plan.trace,
          });
          const phrase = await makeContinuation(
            prompt,
            plan.profile,
            plan.state,
            signal,
          );
          emit({ type: "phrase", ...phrase, jev: phrase.trace });
          emit({ type: "complete", totalMs: Date.now() - started });
        } catch (error) {
          if (!signal.aborted) emit({ type: "error", error: safeError(error) });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (
    body.operation !== "continuation" ||
    !validProfile(body.profile) ||
    !validState(body.state)
  )
    return NextResponse.json(
      { error: "Invalid or outdated composition state. Begin a new recital." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await makeContinuation(prompt, body.profile, body.state, request.signal),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
