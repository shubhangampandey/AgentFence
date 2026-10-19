import { cpus, totalmem, platform, release } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, locked } from "../apps/api/src/db.js";
import { seedWorkspace } from "../prisma/seed.js";
import { defaultRules } from "../apps/api/src/fixtures.js";
import { evaluate } from "../apps/api/src/policy.js";
import { invoke } from "../apps/api/src/gateway.js";
import { appendAudit, verifyAudit } from "../apps/api/src/audit.js";
const prefix = "bench_" + randomUUID().slice(0, 8) + "_";
const workspaceId = prefix + "ws";
await seedWorkspace(workspaceId, prefix, randomUUID());
const sampleSize = Math.min(
  1000,
  Math.max(10, Number(process.env.BENCH_SAMPLES ?? 50)),
);
const results: any[] = [];
async function measure(
  name: string,
  fn: (i: number) => Promise<unknown>,
  n = sampleSize,
) {
  const expectedStatus: Record<string, string> = {
    "Gateway permitted read": "EXECUTED",
    "Gateway denied export": "DENIED",
    "Gateway approval required": "APPROVAL_REQUIRED",
  };
  const times: number[] = [];
  let errors = 0;
  await fn(-1).catch(() => {});
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    const before = performance.now();
    try {
      const value = await fn(i);
      if (
        expectedStatus[name] &&
        (value as any)?.status !== expectedStatus[name]
      )
        throw new Error("Unexpected decision");
    } catch {
      errors++;
    }
    times.push(performance.now() - before);
  }
  times.sort((a, b) => a - b);
  const percentile = (p: number) =>
    Number(
      times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(
        3,
      ),
    );
  results.push({
    name,
    samples: n,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    errors,
    throughputPerSecond: Number(
      ((n / (performance.now() - start)) * 1000).toFixed(2),
    ),
  });
}
const context = {
  tool: "crm",
  operation: "customer.read",
  agentId: prefix + "support",
  environment: "sandbox",
  classification: "internal",
  amount: 0,
  hour: 12,
};
await measure("OPA HTTP policy evaluation", async () => {
  const decision = await evaluate(defaultRules, context);
  if (decision.effect !== "PERMIT") throw new Error("Expected permit");
});
await measure("Gateway permitted read", () =>
  invoke(
    { workspaceId, agentId: prefix + "support" },
    {
      tool: "crm",
      operation: "customer.read",
      arguments: { customerId: prefix + "customer_001" },
      idempotencyKey: randomUUID(),
    },
  ),
);
await measure("Gateway denied export", () =>
  invoke(
    { workspaceId, agentId: prefix + "support" },
    {
      tool: "crm",
      operation: "customer.export",
      arguments: {},
      idempotencyKey: randomUUID(),
    },
  ),
);
await measure("Gateway approval required", () =>
  invoke(
    { workspaceId, agentId: prefix + "finance" },
    {
      tool: "finance",
      operation: "payment.create",
      arguments: {
        invoiceId: prefix + "invoice_002",
        amount: 2400,
        currency: "USD",
      },
      idempotencyKey: randomUUID(),
    },
  ),
);
await measure("Invalid request rejection", async () => {
  try {
    await invoke(
      { workspaceId, agentId: prefix + "support" },
      {
        tool: "crm",
        operation: "shell.exec",
        arguments: {},
        idempotencyKey: randomUUID(),
      },
    );
    throw new Error("Invalid accepted");
  } catch (e) {
    if ((e as any).code !== "UNKNOWN_TOOL_OPERATION") throw e;
  }
});
await measure("Atomic audit append", () =>
  locked(workspaceId, (tx) =>
    appendAudit(tx, workspaceId, "BENCHMARK", "benchmark", { synthetic: true }),
  ),
);
await measure(
  "Full audit verification",
  async () => {
    if (!(await verifyAudit(workspaceId)).valid)
      throw new Error("Invalid chain");
  },
  10,
);
await measure(
  "Five concurrent reads (serialized workspace)",
  () =>
    Promise.all(
      Array.from({ length: 5 }, () =>
        invoke(
          { workspaceId, agentId: prefix + "support" },
          {
            tool: "crm",
            operation: "customer.read",
            arguments: { customerId: prefix + "customer_001" },
            idempotencyKey: randomUUID(),
          },
        ),
      ),
    ),
  10,
);
const database = await db.$queryRaw`SELECT version()`;
const output = {
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    os: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(2)),
    database,
    opaVersion:
      process.env.OPA_VERSION ??
      "Not supplied; private service version must be verified by operator",
  },
  methodology:
    "One warm-up call per case. Wall-clock performance.now. Sequential samples except the explicitly concurrent batch of five. Includes HTTP OPA and DB round trips. Audit verification samples grow with the chain. Synthetic fixtures only. No network load generator. Throughput is case iterations/sec, not maximum capacity.",
  workspaceId,
  results,
};
await mkdir("docs/evaluation", { recursive: true });
await writeFile(
  "docs/evaluation/benchmark-results.json",
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify(output, null, 2));
await db.$disconnect();
