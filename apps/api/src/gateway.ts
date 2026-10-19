import { randomUUID } from "node:crypto";
import {
  type InvokeInput,
  type Decision,
  type Rule,
  type TraceStage,
  can,
} from "../../../packages/shared/src/index.js";
import { db, locked, json, type Tx } from "./db.js";
import { hash, digest, token } from "./crypto.js";
import { AppError, check } from "./errors.js";
import { appendAudit } from "./audit.js";
import {
  preview,
  validateOperation,
  executeConnector,
  type Preview,
} from "./connectors.js";
import { evaluate } from "./policy.js";
import type {
  Agent,
  Invocation,
  Capability,
} from "./generated/prisma/client.js";
export type Identity = {
  workspaceId: string;
  agentId: string;
  credentialId?: string;
  humanId?: string;
  seeded?: boolean;
};
const transitions: Record<string, string[]> = {
  PERMITTED: ["EXECUTED", "FAILED", "DENIED"],
  APPROVAL_REQUIRED: ["EXECUTED", "DENIED", "EXPIRED", "REJECTED", "FAILED"],
  DENIED: [],
  EXECUTED: [],
  FAILED: [],
  EXPIRED: [],
  REJECTED: [],
};
export function transition(from: string, to: string) {
  check(transitions[from]?.includes(to), 409, "ILLEGAL_STATE_TRANSITION");
}
export async function machineIdentity(key: string): Promise<Identity> {
  const credential = await db.credential.findUnique({
    where: { hash: hash(key) },
    include: { agent: true },
  });
  if (!credential) throw new AppError(401, "INVALID_AGENT_CREDENTIAL");
  if (
    credential.revokedAt ||
    credential.expiresAt <= new Date() ||
    credential.agent.suspended
  ) {
    await locked(credential.agent.workspaceId, (tx) =>
      appendAudit(
        tx,
        credential.agent.workspaceId,
        "AUTHENTICATION_DENIED",
        credential.agentId,
        { reason: "Expired, revoked, or suspended machine identity" },
      ),
    );
    throw new AppError(401, "INVALID_AGENT_CREDENTIAL");
  }
  return {
    workspaceId: credential.agent.workspaceId,
    agentId: credential.agentId,
    credentialId: credential.id,
  };
}
export async function issueCredential(tx: Tx, agentId: string, hours = 24) {
  const key = "af_" + token();
  const credential = await tx.credential.create({
    data: {
      agentId,
      hash: hash(key),
      prefix: key.slice(0, 10),
      expiresAt: new Date(Date.now() + hours * 3600000),
    },
  });
  return {
    key,
    credential: {
      id: credential.id,
      prefix: credential.prefix,
      expiresAt: credential.expiresAt,
    },
  };
}
async function verifyIdentity(tx: Tx, identity: Identity) {
  const agent = await tx.agent.findFirst({
    where: { id: identity.agentId, workspaceId: identity.workspaceId },
  });
  check(agent && !agent.suspended, 403, "AGENT_UNAVAILABLE");
  if (identity.credentialId) {
    const cred = await tx.credential.findFirst({
      where: {
        id: identity.credentialId,
        agentId: agent.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    check(cred, 401, "INVALID_AGENT_CREDENTIAL");
  }
  if (identity.humanId) {
    const member = await tx.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: identity.workspaceId,
          userId: identity.humanId,
        },
      },
    });
    check(
      member && can(member.role, "invoke"),
      403,
      "INVOCATION_PERMISSION_REVOKED",
    );
  }
  return agent;
}
async function capability(
  tx: Tx,
  agent: Agent,
  input: InvokeInput,
  p?: Preview,
) {
  const caps = await tx.capability.findMany({
    where: {
      agentId: agent.id,
      tool: input.tool,
      environment: agent.environment,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  return caps.find(
    (c) =>
      c.operations.includes(input.operation) &&
      (!p ||
        (c.classifications.includes(p.classification) &&
          (!c.resources.length ||
            !p.resourceId ||
            c.resources.includes(p.resourceId)))) &&
      (typeof input.arguments.amount !== "number" ||
        input.arguments.amount <= c.maxAmount),
  );
}
const denied = (code: string): Decision => ({
  effect: "DENY",
  codes: [code],
  matchedRules: [],
  explanations: [code.replaceAll("_", " ").toLowerCase()],
});
export async function invoke(
  identity: Identity,
  input: InvokeInput,
  dryRun = false,
  correlationId: string = randomUUID(),
) {
  return locked(identity.workspaceId, async (tx) => {
    const start = performance.now();
    let last = start;
    const trace: TraceStage[] = [];
    function stage(stage: string, state: TraceStage["state"], detail: string) {
      const now = performance.now();
      trace.push({
        stage,
        state,
        detail,
        durationMs: Math.round((now - last) * 100) / 100,
      });
      last = now;
    }
    const agent = await verifyIdentity(tx, identity);
    stage("Identity", "passed", "Active identity bound to workspace");
    const payloadHash = digest({
      tool: input.tool,
      operation: input.operation,
      arguments: input.arguments,
    });
    if (!dryRun) {
      const existing = await tx.invocation.findUnique({
        where: {
          workspaceId_agentId_idempotencyKey: {
            workspaceId: identity.workspaceId,
            agentId: agent.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        check(
          existing.payloadHash === payloadHash,
          409,
          "IDEMPOTENCY_PAYLOAD_MISMATCH",
        );
        return { ...existing, replayed: true };
      }
    }
    const args = validateOperation(
      input.tool,
      input.operation,
      input.arguments,
    );
    let decision: Decision | undefined;
    let proposed: Preview | undefined;
    let cap: Capability | undefined;
    cap = await capability(tx, agent, input);
    if (!cap) {
      decision = denied("CAPABILITY_DENIED");
      stage(
        "Capability",
        "blocked",
        "No active scoped grant matches this operation",
      );
    } else {
      stage(
        "Capability",
        "passed",
        "Operation and quantitative limits match an active grant",
      );
      proposed = await preview(
        tx,
        identity.workspaceId,
        input.tool,
        input.operation,
        args,
      );
      cap = await capability(tx, agent, input, proposed);
      if (!cap) {
        decision = denied("RESOURCE_SCOPE_DENIED");
        stage(
          "Resource scope",
          "blocked",
          "Resource classification or identifier is outside scope",
        );
      } else
        stage("Resource scope", "passed", "Trusted resource scope resolved");
    }
    const policy = await tx.policyVersion.findFirst({
      where: { workspaceId: identity.workspaceId, active: true },
    });
    if (!decision) {
      decision = policy
        ? await evaluate(policy.rules as Rule[], {
            tool: input.tool,
            operation: input.operation,
            agentId: agent.id,
            environment: agent.environment,
            classification: proposed!.classification,
            amount: Number(args.amount ?? 0),
            hour: new Date().getUTCHours(),
          })
        : denied("NO_ACTIVE_POLICY");
      stage(
        "Policy",
        decision.effect === "DENY" ? "blocked" : "passed",
        decision.codes.join(", "),
      );
    }
    let status: Invocation["status"] =
      decision.effect === "DENY"
        ? "DENIED"
        : decision.effect === "APPROVAL"
          ? "APPROVAL_REQUIRED"
          : "PERMITTED";
    let result: unknown = null;
    if (status === "APPROVAL_REQUIRED")
      stage(
        "Approval",
        "waiting",
        "A separate authorized human must review the exact stored payload",
      );
    if (!dryRun && status === "PERMITTED") {
      const agentNow = await verifyIdentity(tx, identity);
      const capNow = await capability(tx, agentNow, input, proposed);
      check(capNow, 403, "CAPABILITY_REVOKED");
      const authorizationHour = new Date().getUTCHours();
      const final = await evaluate(policy!.rules as Rule[], {
        tool: input.tool,
        operation: input.operation,
        agentId: agent.id,
        environment: agent.environment,
        classification: proposed!.classification,
        amount: Number(args.amount ?? 0),
        hour: authorizationHour,
      });
      if (final.effect !== "PERMIT") {
        decision = final;
        status = "DENIED";
        stage(
          "Final authorization",
          "blocked",
          "Permission changed before execution",
        );
      } else {
        const freshAgent = await verifyIdentity(tx, identity);
        const freshCap = await capability(tx, freshAgent, input, proposed);
        check(freshCap, 403, "CAPABILITY_EXPIRED_BEFORE_EXECUTION");
        check(
          authorizationHour === new Date().getUTCHours(),
          403,
          "AUTHORIZATION_TIME_CHANGED",
        );
        stage(
          "Final authorization",
          "passed",
          "Identity, capability, and OPA policy revalidated",
        );
        result = await executeConnector(
          tx,
          identity.workspaceId,
          input.tool,
          input.operation,
          args,
          proposed!,
          freshCap,
        );
        transition("PERMITTED", "EXECUTED");
        status = "EXECUTED";
        stage(
          "Execution",
          "passed",
          "Synthetic connector transaction completed",
        );
      }
    }
    if (dryRun)
      return {
        id: "preview",
        status,
        policyVersion: policy?.version ?? 0,
        decision,
        preview: proposed ?? null,
        result: null,
        trace,
        dryRun: true,
      };
    const invocation = await tx.invocation.create({
      data: {
        workspaceId: identity.workspaceId,
        agentId: agent.id,
        credentialId: identity.credentialId,
        initiatedBy: identity.humanId,
        correlationId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        tool: input.tool,
        operation: input.operation,
        arguments: json(args),
        status,
        policyVersion: policy?.version ?? 0,
        decision: json(decision),
        preview: json(proposed ?? null),
        result: json(result),
        trace: json(trace),
        approvalExpiresAt:
          status === "APPROVAL_REQUIRED"
            ? new Date(Date.now() + 15 * 60000)
            : null,
      },
    });
    await appendAudit(
      tx,
      identity.workspaceId,
      status === "EXECUTED" ? "TOOL_EXECUTED" : status,
      identity.humanId ?? agent.id,
      {
        agentId: agent.id,
        tool: input.tool,
        operation: input.operation,
        payloadHash,
        status,
        policyVersion: policy?.version ?? 0,
        decision,
        durationMs: performance.now() - start,
      },
      invocation.id,
      identity.seeded ?? false,
    );
    stage(
      "Evidence",
      "passed",
      "Hash-linked signed audit event committed atomically",
    );
    return tx.invocation.update({
      where: { id: invocation.id },
      data: { trace: json(trace) },
    });
  });
}
export async function review(
  workspaceId: string,
  invocationId: string,
  userId: string,
  action: "approve" | "reject",
  expectedPayloadHash: string,
) {
  return locked(workspaceId, async (tx) => {
    const reviewer = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    check(
      reviewer && can(reviewer.role, "approve"),
      403,
      "APPROVAL_PERMISSION_DENIED",
    );
    const call = await tx.invocation.findFirst({
      where: { id: invocationId, workspaceId },
    });
    check(call, 404, "INVOCATION_NOT_FOUND");
    check(
      call.status === "APPROVAL_REQUIRED",
      409,
      "APPROVAL_ALREADY_RESOLVED",
    );
    check(call.initiatedBy !== userId, 403, "SELF_APPROVAL_PROHIBITED");
    check(
      call.payloadHash === expectedPayloadHash,
      409,
      "APPROVAL_PAYLOAD_MISMATCH",
    );
    let status: Invocation["status"] = "REJECTED";
    let result: unknown = null;
    let decision = call.decision as Decision;
    const trace = call.trace as TraceStage[];
    const start = performance.now();
    if (call.approvalExpiresAt! <= new Date()) status = "EXPIRED";
    else if (action === "approve") {
      try {
        const identity: Identity = {
          workspaceId,
          agentId: call.agentId,
          ...(call.credentialId ? { credentialId: call.credentialId } : {}),
        };
        const agent = await verifyIdentity(tx, identity);
        const input = {
          tool: call.tool,
          operation: call.operation,
          arguments: call.arguments,
          idempotencyKey: call.idempotencyKey,
        } as InvokeInput;
        check(
          digest({
            tool: call.tool,
            operation: call.operation,
            arguments: call.arguments,
          }) === call.payloadHash,
          409,
          "STORED_PAYLOAD_TAMPERED",
        );
        const proposed = call.preview as Preview;
        const cap = await capability(tx, agent, input, proposed);
        check(cap, 403, "CAPABILITY_REVOKED");
        const current = await preview(
          tx,
          workspaceId,
          call.tool,
          call.operation,
          call.arguments as Record<string, any>,
        );
        check(
          current.resourceVersion === proposed.resourceVersion,
          409,
          "STALE_PREVIEW",
        );
        const policy = await tx.policyVersion.findFirst({
          where: { workspaceId, active: true },
        });
        check(policy, 403, "NO_ACTIVE_POLICY");
        const authorizationHour = new Date().getUTCHours();
        decision = await evaluate(policy.rules as Rule[], {
          tool: call.tool,
          operation: call.operation,
          agentId: agent.id,
          environment: agent.environment,
          classification: current.classification,
          amount: Number((call.arguments as Record<string, any>).amount ?? 0),
          hour: authorizationHour,
        });
        check(decision.effect !== "DENY", 403, decision.codes[0]);
        // Any policy publication requires a fresh preview and a new approval request.
        check(
          policy.version === call.policyVersion &&
            (!policy.publishedAt || policy.publishedAt <= call.createdAt),
          409,
          "POLICY_CHANGED_REQUIRES_NEW_PREVIEW",
        );
        check(call.approvalExpiresAt! > new Date(), 403, "APPROVAL_EXPIRED");
        const freshAgent = await verifyIdentity(tx, identity);
        const freshCap = await capability(tx, freshAgent, input, proposed);
        check(freshCap, 403, "CAPABILITY_EXPIRED_BEFORE_EXECUTION");
        check(
          authorizationHour === new Date().getUTCHours(),
          403,
          "AUTHORIZATION_TIME_CHANGED",
        );
        trace.push({
          stage: "Final authorization",
          state: "passed",
          durationMs: Math.round((performance.now() - start) * 100) / 100,
          detail:
            "Current identity, capability, OPA policy, and resource version verified",
        });
        const executionStart = performance.now();
        result = await executeConnector(
          tx,
          workspaceId,
          call.tool,
          call.operation,
          call.arguments as Record<string, any>,
          proposed,
          freshCap,
        );
        status = "EXECUTED";
        trace.push({
          stage: "Execution",
          state: "passed",
          durationMs:
            Math.round((performance.now() - executionStart) * 100) / 100,
          detail: "Synthetic connector mutation recorded with the review",
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        status = error.code === "APPROVAL_EXPIRED" ? "EXPIRED" : "DENIED";
        decision = denied(error.code);
      }
    }
    transition(call.status, status);
    trace.push({
      stage: "Approval",
      state: status === "EXECUTED" ? "passed" : "blocked",
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      detail:
        status === "EXECUTED"
          ? "Independent human approval; identity, scope, resource version, and OPA revalidated"
          : decision.codes.join(", "),
    });
    await tx.invocation.update({
      where: { id: call.id },
      data: {
        status,
        result: json(result),
        decision: json(decision),
        reviewedBy: userId,
        reviewedAt: new Date(),
        trace: json(trace),
      },
    });
    const evidenceStart = performance.now();
    await appendAudit(
      tx,
      workspaceId,
      `APPROVAL_${status}`,
      userId,
      { action, status, payloadHash: call.payloadHash, decision },
      call.id,
    );
    trace.push({
      stage: "Evidence",
      state: "passed",
      durationMs: Math.round((performance.now() - evidenceStart) * 100) / 100,
      detail: "Review and execution recorded in signed audit chain",
    });
    return tx.invocation.update({
      where: { id: call.id },
      data: { trace: json(trace) },
    });
  });
}
