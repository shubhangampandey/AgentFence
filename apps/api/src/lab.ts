import { randomUUID } from "node:crypto";
import { db, locked, json } from "./db.js";
import { seedWorkspace } from "../../../prisma/seed.js";
import { invoke, issueCredential, machineIdentity, review } from "./gateway.js";
import { demoScenarios } from "./fixtures.js";
import { verifyAudit, appendAudit } from "./audit.js";
import { invokeSchema, can } from "../../../packages/shared/src/index.js";
export async function runLab(ownerWorkspaceId: string) {
  const prefix = "lab_" + randomUUID().slice(0, 8) + "_";
  const workspaceId = prefix + "workspace";
  await seedWorkspace(workspaceId, prefix, randomUUID());
  const results: any[] = [];
  const identity = (agent: string) => ({
    workspaceId,
    agentId: prefix + agent,
  });
  const add = (
    id: string,
    category: string,
    expected: string,
    actual: string,
    evidence?: unknown,
  ) =>
    results.push({
      id,
      category,
      expected,
      actual,
      passed: expected === actual,
      evidence,
    });
  for (const scenario of demoScenarios) {
    const args = Object.fromEntries(
      Object.entries(scenario.arguments).map(([k, v]) => [
        k,
        typeof v === "string" && /^(customer|invoice|document)_/.test(v)
          ? prefix + v
          : v,
      ]),
    );
    const call = await invoke(
      identity(scenario.agentId),
      invokeSchema.parse({
        tool: scenario.tool,
        operation: scenario.operation,
        arguments: args,
        ...("intent" in scenario ? { intent: scenario.intent } : {}),
        idempotencyKey: prefix + scenario.id,
      }),
    );
    add(scenario.id, scenario.category, scenario.expected, call.status, {
      invocationId: call.id,
      trace: call.trace,
    });
  }
  const credentials = await locked(workspaceId, (tx) =>
    issueCredential(tx, prefix + "support"),
  );
  await db.credential.update({
    where: { id: credentials.credential.id },
    data: { expiresAt: new Date(0) },
  });
  try {
    await machineIdentity(credentials.key);
    add("expired", "Expired credentials", "REJECTED", "ACCEPTED");
  } catch {
    add("expired", "Expired credentials", "REJECTED", "REJECTED");
  }
  await db.credential.update({
    where: { id: credentials.credential.id },
    data: { expiresAt: new Date(Date.now() + 60000), revokedAt: new Date() },
  });
  try {
    await machineIdentity(credentials.key);
    add("revoked", "Revoked credentials", "REJECTED", "ACCEPTED");
  } catch {
    add("revoked", "Revoked credentials", "REJECTED", "REJECTED");
  }
  try {
    await invoke(identity("support"), {
      tool: "crm",
      operation: "customer.read",
      arguments: { customerId: "customer_001" },
      idempotencyKey: prefix + "cross-tenant",
    });
    add("tenant", "Cross-workspace resource", "REJECTED", "ACCEPTED");
  } catch {
    add("tenant", "Cross-workspace resource", "REJECTED", "REJECTED");
  }
  const pending = await db.invocation.findFirstOrThrow({
    where: { workspaceId, status: "APPROVAL_REQUIRED" },
  });
  const approver = await db.user.findUniqueOrThrow({
    where: { email: prefix + "approver@northstar.example" },
  });
  try {
    await review(workspaceId, pending.id, approver.id, "approve", "tampered");
    add("tamper", "Approval payload binding", "REJECTED", "ACCEPTED");
  } catch {
    add("tamper", "Approval payload binding", "REJECTED", "REJECTED");
  }
  await review(
    workspaceId,
    pending.id,
    approver.id,
    "approve",
    pending.payloadHash,
  );
  const before = await db.resource.count({
    where: { workspaceId, kind: "payment" },
  });
  const replay = await invoke(identity("finance"), {
    tool: "finance",
    operation: pending.operation,
    arguments: pending.arguments as Record<string, unknown>,
    idempotencyKey: pending.idempotencyKey,
  });
  const after = await db.resource.count({
    where: { workspaceId, kind: "payment" },
  });
  add(
    "replay",
    "Duplicate execution",
    "NO_SIDE_EFFECT",
    before === after && replay.id === pending.id
      ? "NO_SIDE_EFFECT"
      : "DUPLICATE",
  );
  await db.capability.updateMany({
    where: { agentId: prefix + "support" },
    data: { revokedAt: new Date() },
  });
  const revoked = await invoke(identity("support"), {
    tool: "crm",
    operation: "customer.read",
    arguments: { customerId: prefix + "customer_001" },
    idempotencyKey: prefix + "revoked-cap",
  });
  add("revoked-capability", "Capability revocation", "DENIED", revoked.status);
  add(
    "admin-role",
    "Administrative permission matrix",
    "DENIED",
    can("APPROVER", "policy") ? "PERMITTED" : "DENIED",
  );
  const integrity = await verifyAudit(workspaceId);
  add(
    "integrity",
    "Evidence chain",
    "VALID",
    integrity.valid ? "VALID" : "INVALID",
  );
  const run = await db.labRun.create({
    data: {
      workspaceId: ownerWorkspaceId,
      results: json({
        isolatedWorkspaceId: workspaceId,
        seedRevision: 1,
        results,
      }),
    },
  });
  await locked(ownerWorkspaceId, (tx) =>
    appendAudit(tx, ownerWorkspaceId, "SECURITY_LAB_COMPLETED", "lab", {
      runId: run.id,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
    }),
  );
  return run;
}
