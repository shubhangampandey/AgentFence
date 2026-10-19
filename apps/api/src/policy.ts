import { z } from "zod";
import { config } from "./config.js";
import type { Decision, Rule } from "../../../packages/shared/src/index.js";
const response = z.object({
  result: z
    .object({
      effect: z.enum(["PERMIT", "DENY", "APPROVAL"]),
      matchedRules: z.array(z.string()),
      explanations: z.array(z.string()),
      codes: z.array(z.string()),
    })
    .strict(),
});
export type PolicyContext = {
  tool: string;
  operation: string;
  agentId: string;
  environment: string;
  classification: string;
  amount: number;
  hour: number;
};
export async function evaluate(
  rules: Rule[],
  context: PolicyContext,
): Promise<Decision> {
  try {
    const r = await fetch(`${config.OPA_URL}/v1/data/agentfence/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { ...context, rules } }),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error("OPA failed");
    return response.parse(await r.json()).result;
  } catch {
    return {
      effect: "DENY",
      codes: ["POLICY_ENGINE_UNAVAILABLE"],
      matchedRules: [],
      explanations: [
        "Authorization dependency unavailable or invalid. Execution is blocked.",
      ],
    };
  }
}
export function conflicts(rules: Rule[]) {
  const overlap = (a: string, b: string) => a === "*" || b === "*" || a === b;
  return rules.flatMap((a, i) =>
    rules
      .slice(i + 1)
      .filter(
        (b) =>
          a.effect !== b.effect &&
          overlap(a.tool, b.tool) &&
          overlap(a.operation, b.operation) &&
          overlap(a.agentId, b.agentId) &&
          overlap(a.environment, b.environment) &&
          overlap(a.classification, b.classification) &&
          Math.max(a.startHour, b.startHour) < Math.min(a.endHour, b.endHour) &&
          Math.max(a.minAmount, b.minAmount) <=
            Math.min(a.maxAmount, b.maxAmount),
      )
      .map((b) => ({
        rules: [a.id, b.id],
        resolution:
          "DENY overrides APPROVAL overrides PERMIT. Priority orders presentation only.",
      })),
  );
}
