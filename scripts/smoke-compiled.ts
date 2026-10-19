import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { db, locked } from "../apps/api/src/db.js";
import { issueCredential } from "../apps/api/src/gateway.js";
import { appendAudit } from "../apps/api/src/audit.js";
import type { AddressInfo } from "node:net";
const apiEntry = "../dist/server/apps/api/src/app.js";
const dbEntry = "../dist/server/apps/api/src/db.js";
const sdkEntry = "../packages/sdk/dist/index.js";
const { app } = await import(apiEntry);
const { AgentFenceClient } = await import(sdkEntry);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const issued = await locked("northstar", async (tx) => {
  const result = await issueCredential(tx, "support");
  await appendAudit(
    tx,
    "northstar",
    "SDK_SMOKE_CREDENTIAL_ISSUED",
    "verification",
    { credentialId: result.credential.id },
  );
  return result;
});
try {
  const readiness = await fetch(origin + "/api/ready");
  assert.equal(readiness.status, 200);
  const client = new AgentFenceClient({ baseUrl: origin, apiKey: issued.key });
  const input = {
    tool: "crm",
    operation: "customer.read",
    arguments: { customerId: "customer_001" },
    idempotencyKey: "compiled-smoke-" + randomUUID(),
  };
  const first = await client.invoke(input);
  const replay = await client.invoke(input);
  assert.equal(first.status, "EXECUTED");
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  const deny = await client.invoke({
    ...input,
    operation: "customer.export",
    arguments: {},
    idempotencyKey: "compiled-smoke-" + randomUUID(),
  });
  assert.equal(deny.status, "DENIED");
  console.log(
    "Compiled API + packaged SDK: readiness, authorized read, idempotent replay, and denied export passed.",
  );
} finally {
  await locked("northstar", async (tx) => {
    await tx.credential.update({
      where: { id: issued.credential.id },
      data: { revokedAt: new Date() },
    });
    await appendAudit(
      tx,
      "northstar",
      "SDK_SMOKE_CREDENTIAL_REVOKED",
      "verification",
      { credentialId: issued.credential.id },
    );
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await (await import(dbEntry)).db.$disconnect();
  await db.$disconnect();
}
