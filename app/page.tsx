import Recital from "./recital";
import { cookies } from "next/headers";
import {
  createPromptVariation,
  variationFromId,
  VARIATION_COUNT,
} from "@/lib/prompt-variations";

// Each document request receives its own initial direction. Passing the exact
// value into the client avoids hydration randomness or a changing text field.
export const dynamic = "force-dynamic";
export default async function Home() {
  const value = (await cookies()).get("jevussy-variation")?.value;
  const id = value !== undefined && /^\d+$/.test(value) ? Number(value) : -1;
  const previous =
    Number.isInteger(id) && id >= 0 && id < VARIATION_COUNT
      ? variationFromId(id)
      : undefined;
  return <Recital initialVariation={createPromptVariation(previous)} />;
}
