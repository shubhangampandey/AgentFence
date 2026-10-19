import "dotenv/config";
import argon2 from "argon2";
import { db, locked, json } from "../apps/api/src/db.js";
import { defaultRules } from "../apps/api/src/fixtures.js";
import { appendAudit } from "../apps/api/src/audit.js";
import { invoke } from "../apps/api/src/gateway.js";
export async function seedWorkspace(
  workspaceId = "northstar",
  prefix = "",
  password = process.env.DEMO_PASSWORD,
) {
  if (!password || password.length < 12)
    throw new Error(
      "Set DEMO_PASSWORD to at least 12 characters, or run pnpm setup",
    );
  const existing = await db.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (existing) return existing;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await db.$transaction(async (tx) => {
    await tx.workspace.create({
      data: {
        id: workspaceId,
        name:
          workspaceId === "northstar"
            ? "Northstar Labs"
            : "Isolated Security Lab",
      },
    });
    for (const [slug, name, role] of [
      ["owner", "Alex Morgan", "OWNER"],
      ["operator", "Jordan Lee", "SECURITY_OPERATOR"],
      ["approver", "Sam Rivera", "APPROVER"],
      ["auditor", "Casey Chen", "AUDITOR"],
    ] as const) {
      const user = await tx.user.upsert({
        where: { email: `${prefix}${slug}@northstar.example` },
        create: {
          email: `${prefix}${slug}@northstar.example`,
          name,
          passwordHash,
        },
        update: {},
      });
      await tx.membership.create({
        data: { workspaceId, userId: user.id, role },
      });
    }
    for (const [slug, name, description, purpose] of [
      [
        "support",
        "Customer Support",
        "Scoped CRM access for customer care",
        "Resolve customer support requests",
      ],
      [
        "finance",
        "Finance Operations",
        "Synthetic invoices and governed payments",
        "Process synthetic accounts payable",
      ],
      [
        "operations",
        "Operations Agent",
        "Internal document and status access",
        "Retrieve approved operating procedures",
      ],
    ]) {
      const agentId = prefix + slug;
      await tx.agent.create({
        data: { id: agentId, workspaceId, name, description, purpose },
      });
      const tool =
        slug === "support" ? "crm" : slug === "finance" ? "finance" : "vault";
      const operations =
        tool === "crm"
          ? [
              "customer.read",
              "customer.search",
              "customer.update",
              "note.create",
              "customer.export",
              "customer.delete",
            ]
          : tool === "finance"
            ? [
                "invoice.list",
                "invoice.read",
                "payment.create",
                "transaction.list",
              ]
            : [
                "document.list",
                "document.read",
                "document.metadata",
                "document.export",
                "document.delete",
              ];
      await tx.capability.create({
        data: {
          agentId,
          tool,
          operations,
          classifications: ["public", "internal"],
          maxAmount: 100000,
          expiresAt: new Date("2030-01-01"),
        },
      });
    }
    await tx.policyVersion.create({
      data: {
        workspaceId,
        version: 1,
        name: "Northstar baseline",
        description:
          "Default-deny enterprise controls. Deny overrides approval overrides permit.",
        rules: json(defaultRules),
        active: true,
        validated: true,
        createdBy: "seed",
        publishedAt: new Date(),
      },
    });
    for (const [id, company, contact, classification] of [
      ["customer_001", "Aperture Design", "Morgan Ellis", "internal"],
      ["customer_002", "Meridian Supply", "Avery Patel", "public"],
      ["customer_003", "Cobalt Research", "Taylor Brooks", "confidential"],
    ])
      await tx.resource.create({
        data: {
          id: prefix + id,
          workspaceId,
          tool: "crm",
          kind: "customer",
          classification,
          data: {
            company,
            contact,
            email: `${contact.toLowerCase().replace(" ", ".")}@fictional.example`,
            plan: "Enterprise",
            region: "North America",
          },
        },
      });
    for (const [id, vendor, amount] of [
      ["invoice_001", "Orbit Office", 125],
      ["invoice_002", "Meridian Cloud", 2400],
      ["invoice_003", "Cobalt Research", 25000],
    ] as const)
      await tx.resource.create({
        data: {
          id: prefix + id,
          workspaceId,
          tool: "finance",
          kind: "invoice",
          data: {
            vendor,
            amount,
            currency: "USD",
            status: "OPEN",
            synthetic: true,
          },
        },
      });
    for (const [id, title, classification, content] of [
      [
        "document_001",
        "Incident response playbook",
        "internal",
        "Synthetic operating instructions for incident triage.",
      ],
      [
        "document_002",
        "Public platform overview",
        "public",
        "Fictional Northstar Labs public product information.",
      ],
      [
        "document_003",
        "Acquisition strategy",
        "confidential",
        "Confidential fictional strategy; not available to ordinary agents.",
      ],
    ])
      await tx.resource.create({
        data: {
          id: prefix + id,
          workspaceId,
          tool: "vault",
          kind: "document",
          classification,
          data: { title, content, synthetic: true },
        },
      });
    await appendAudit(
      tx,
      workspaceId,
      "WORKSPACE_SEEDED",
      "seed",
      { source: "deterministic synthetic fixture", revision: 1 },
      undefined,
      true,
    );
  });
  return db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
}
async function main() {
  await seedWorkspace();
  await locked("northstar", (tx) =>
    appendAudit(
      tx,
      "northstar",
      "DEMO_READY",
      "seed",
      { note: "New events are generated by real gateway requests." },
      undefined,
      true,
    ),
  );
  const owner = await db.user.findUniqueOrThrow({
    where: { email: "operator@northstar.example" },
  });
  await invoke(
    {
      workspaceId: "northstar",
      agentId: "finance",
      humanId: owner.id,
      seeded: true,
    },
    {
      tool: "finance",
      operation: "payment.create",
      arguments: { invoiceId: "invoice_002", amount: 2400, currency: "USD" },
      idempotencyKey: "seed-approval-001",
    },
  );
  console.log(
    "Northstar Labs seeded. Demo access is available only with DEMO_ENABLED=true. Local account password is in ignored .env.",
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prisma/seed.ts"))
  main().finally(() => db.$disconnect());
