import { db, locked, json, type Tx } from "./db.js";
import { check } from "./errors.js";
import { appendAudit } from "./audit.js";
import { evaluate, conflicts, type PolicyContext } from "./policy.js";
import { demoScenarios } from "./fixtures.js";
import {
  policySchema,
  can,
  type Rule,
} from "../../../packages/shared/src/index.js";

async function authorize(tx: Tx, workspaceId: string, actorId: string) {
  const membership = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorId } },
  });
  check(
    membership && can(membership.role, "policy"),
    403,
    "POLICY_PERMISSION_DENIED",
  );
}

export async function createPolicy(
  workspaceId: string,
  actorId: string,
  input: unknown,
) {
  const data = policySchema.parse(input);
  return locked(workspaceId, async (tx) => {
    await authorize(tx, workspaceId, actorId);
    const latest = await tx.policyVersion.findFirst({
      where: { workspaceId },
      orderBy: { version: "desc" },
    });
    const draft = await tx.policyVersion.create({
      data: {
        ...data,
        rules: json(data.rules),
        workspaceId,
        version: (latest?.version ?? 0) + 1,
        createdBy: actorId,
      },
    });
    await appendAudit(tx, workspaceId, "POLICY_DRAFT_CREATED", actorId, {
      version: draft.version,
    });
    return draft;
  });
}

export async function simulatePolicy(
  workspaceId: string,
  actorId: string,
  policyId: string,
) {
  const candidate = await db.policyVersion.findFirst({
    where: { id: policyId, workspaceId },
  });
  const active = await db.policyVersion.findFirst({
    where: { workspaceId, active: true },
  });
  check(candidate && active, 404, "POLICY_NOT_FOUND");
  const historical = await db.invocation.findMany({
    where: { workspaceId },
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { agent: true },
  });
  const cases = [
    ...demoScenarios.map((s) => ({
      ...s,
      environment: "sandbox",
      classification: s.id === "confidential" ? "confidential" : "internal",
    })),
    ...historical.map((h) => ({
      id: h.id,
      tool: h.tool,
      operation: h.operation,
      agentId: h.agentId,
      arguments: h.arguments as Record<string, unknown>,
      environment: h.agent.environment,
      classification: (h.preview as any)?.classification ?? "internal",
    })),
  ];
  const results: {
    id: string;
    operation: string;
    before: "PERMIT" | "DENY" | "APPROVAL";
    after: "PERMIT" | "DENY" | "APPROVAL";
    changed: boolean;
    riskyExpansion: boolean;
    matchedRules: string[];
  }[] = [];
  let healthy = true;
  for (const c of cases) {
    const context: PolicyContext = {
      tool: c.tool,
      operation: c.operation,
      agentId: c.agentId,
      environment: c.environment,
      classification: c.classification,
      amount: Number((c.arguments as any).amount ?? 0),
      hour: new Date().getUTCHours(),
    };
    const before = await evaluate(active.rules as Rule[], context);
    const after = await evaluate(candidate.rules as Rule[], context);
    if (
      before.codes.includes("POLICY_ENGINE_UNAVAILABLE") ||
      after.codes.includes("POLICY_ENGINE_UNAVAILABLE")
    )
      healthy = false;
    results.push({
      id: c.id,
      operation: c.operation,
      before: before.effect,
      after: after.effect,
      changed: before.effect !== after.effect,
      riskyExpansion: before.effect === "DENY" && after.effect !== "DENY",
      matchedRules: after.matchedRules,
    });
  }
  check(healthy, 503, "OPA_SIMULATION_UNAVAILABLE");
  await locked(workspaceId, async (tx) => {
    await authorize(tx, workspaceId, actorId);
    await tx.policyVersion.update({
      where: { id: candidate.id },
      data: { validated: true },
    });
    await appendAudit(tx, workspaceId, "POLICY_SIMULATED", actorId, {
      version: candidate.version,
      cases: results.length,
      changed: results.filter((r) => r.changed).length,
    });
  });
  return {
    activeVersion: active.version,
    candidateVersion: candidate.version,
    results,
    conflicts: conflicts(candidate.rules as Rule[]),
  };
}

export async function publishPolicy(
  workspaceId: string,
  actorId: string,
  policyId: string,
) {
  return locked(workspaceId, async (tx) => {
    await authorize(tx, workspaceId, actorId);
    const p = await tx.policyVersion.findFirst({
      where: { id: policyId, workspaceId },
    });
    check(p, 404, "POLICY_NOT_FOUND");
    check(p.validated, 409, "SIMULATION_REQUIRED");
    const readiness = await evaluate(p.rules as Rule[], {
      tool: "crm",
      operation: "customer.read",
      agentId: "support",
      environment: "sandbox",
      classification: "internal",
      amount: 0,
      hour: 12,
    });
    check(
      !readiness.codes.includes("POLICY_ENGINE_UNAVAILABLE"),
      503,
      "OPA_UNAVAILABLE",
    );
    await tx.policyVersion.updateMany({
      where: { workspaceId, active: true },
      data: { active: false },
    });
    const updated = await tx.policyVersion.update({
      where: { id: p.id },
      data: { active: true, publishedAt: new Date() },
    });
    await appendAudit(tx, workspaceId, "POLICY_PUBLISHED", actorId, {
      version: p.version,
    });
    return updated;
  });
}
