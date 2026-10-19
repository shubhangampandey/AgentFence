import { config } from "./config.js";
import { digest, sign, redact } from "./crypto.js";
import { db, json, type Tx } from "./db.js";
export async function appendAudit(
  tx: Tx,
  workspaceId: string,
  type: string,
  actor: string,
  evidence: unknown,
  invocationId?: string,
  seeded = false,
) {
  const ws = await tx.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const body = {
    workspaceId,
    sequence: ws.auditSequence + 1,
    type,
    actor,
    invocationId: invocationId ?? null,
    evidence: redact(evidence),
    previousHash: ws.auditHead,
    seeded,
    createdAt: new Date(),
  };
  const hash = digest({ ...body, createdAt: body.createdAt.toISOString() });
  const event = await tx.auditEvent.create({
    data: {
      ...body,
      evidence: json(body.evidence),
      hash,
      signature: sign(hash, config.AUDIT_SIGNING_KEY),
    },
  });
  await tx.workspace.update({
    where: { id: workspaceId },
    data: { auditSequence: body.sequence, auditHead: hash },
  });
  return event;
}
export async function verifyAudit(workspaceId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
    const events = await tx.auditEvent.findMany({
      where: { workspaceId },
      orderBy: { sequence: "asc" },
    });
    let previousHash = "GENESIS";
    let sequence = 0;
    for (const e of events) {
      sequence++;
      const { id: _id, hash, signature, ...body } = e;
      const expected = digest({
        ...body,
        createdAt: e.createdAt.toISOString(),
      });
      if (
        e.sequence !== sequence ||
        e.previousHash !== previousHash ||
        hash !== expected ||
        sign(hash, config.AUDIT_SIGNING_KEY) !== signature
      )
        return {
          valid: false,
          checked: sequence,
          brokenAt: e.sequence,
          reason: "Sequence, hash, or signature mismatch",
        };
      previousHash = hash;
    }
    const head = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    return {
      valid: head.auditSequence === sequence && head.auditHead === previousHash,
      checked: sequence,
      head: previousHash,
      verifiedAt: new Date().toISOString(),
    };
  });
}
