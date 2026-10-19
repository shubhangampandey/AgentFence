import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Tx, json } from "./db.js";
import { check } from "./errors.js";
const id = z.string().min(1).max(100);
const empty = z.object({}).strict();
export const operationSchemas = {
  crm: {
    "customer.read": z.object({ customerId: id }).strict(),
    "customer.search": z.object({ query: z.string().max(80) }).strict(),
    "customer.update": z
      .object({ customerId: id, company: z.string().min(1).max(100) })
      .strict(),
    "note.create": z
      .object({ customerId: id, note: z.string().min(1).max(1000) })
      .strict(),
    "customer.export": empty,
    "customer.delete": z.object({ customerId: id }).strict(),
  },
  finance: {
    "invoice.list": empty,
    "invoice.read": z.object({ invoiceId: id }).strict(),
    "payment.create": z
      .object({
        invoiceId: id,
        amount: z.number().int().positive().max(100000000),
        currency: z.literal("USD"),
      })
      .strict(),
    "transaction.list": empty,
  },
  vault: {
    "document.list": empty,
    "document.read": z.object({ documentId: id }).strict(),
    "document.metadata": z.object({ documentId: id }).strict(),
    "document.export": empty,
    "document.delete": z.object({ documentId: id }).strict(),
  },
};
export const catalog = Object.entries(operationSchemas).map(([tool, ops]) => ({
  tool,
  name:
    tool === "crm"
      ? "Northstar CRM"
      : tool === "finance"
        ? "Synthetic Finance"
        : "Document Vault",
  synthetic: true,
  operations: Object.keys(ops),
  classification: "Server-resolved",
  timeoutMs: 20000,
}));
export function validateOperation(
  tool: string,
  operation: string,
  args: unknown,
): Record<string, any> {
  const schema = (
    operationSchemas as Record<string, Record<string, z.ZodType>>
  )[tool]?.[operation];
  check(schema, 400, "UNKNOWN_TOOL_OPERATION");
  return schema.parse(args) as Record<string, any>;
}
export async function preview(
  tx: Tx,
  workspaceId: string,
  tool: string,
  operation: string,
  args: Record<string, any>,
) {
  const resourceId = args.customerId ?? args.invoiceId ?? args.documentId;
  const resource = resourceId
    ? await tx.resource.findFirst({
        where: { id: resourceId, workspaceId, tool },
      })
    : null;
  if (resourceId) check(resource, 404, "RESOURCE_NOT_FOUND");
  const data = resource?.data as Record<string, any> | undefined;
  if (operation === "payment.create") {
    check(data?.status === "OPEN", 409, "INVOICE_NOT_OPEN");
    check(args.amount <= data.amount, 400, "AMOUNT_EXCEEDS_INVOICE");
    check(args.currency === data.currency, 400, "CURRENCY_MISMATCH");
  }
  return {
    resourceId: resource?.id ?? null,
    resourceVersion: resource?.version ?? null,
    classification: resource?.classification ?? "internal",
    synthetic: true,
    changes:
      operation === "payment.create"
        ? {
            before: { invoiceStatus: data?.status, paidAmount: 0 },
            after: {
              invoiceStatus:
                args.amount === data?.amount ? "PAID" : "PARTIALLY_PAID",
              paidAmount: args.amount,
              currency: "USD",
            },
          }
        : operation === "customer.update"
          ? {
              before: { company: data?.company },
              after: { company: args.company },
            }
          : { operation, resourceId: resource?.id ?? "scoped collection" },
  };
}
export type Preview = Awaited<ReturnType<typeof preview>>;
export async function executeConnector(
  tx: Tx,
  workspaceId: string,
  tool: string,
  operation: string,
  args: Record<string, any>,
  expected: Preview,
  scope: { classifications: string[]; resources: string[] },
) {
  const current = await preview(tx, workspaceId, tool, operation, args);
  check(
    current.resourceVersion === expected.resourceVersion,
    409,
    "STALE_PREVIEW",
  );
  const resource = expected.resourceId
    ? await tx.resource.findFirstOrThrow({
        where: { id: expected.resourceId, workspaceId, tool },
      })
    : null;
  const data = resource?.data as Record<string, any> | undefined;
  const allowed = {
    workspaceId,
    tool,
    classification: { in: scope.classifications },
    ...(scope.resources.length ? { id: { in: scope.resources } } : {}),
  };
  let result: unknown;
  switch (operation) {
    case "customer.read":
    case "invoice.read":
    case "document.read":
      result = { id: resource!.id, ...data };
      break;
    case "document.metadata":
      result = {
        id: resource!.id,
        title: data?.title,
        classification: resource!.classification,
        version: resource!.version,
      };
      break;
    case "customer.search":
      result = await tx.resource.findMany({
        where: {
          ...allowed,
          kind: "customer",
          data: { path: ["company"], string_contains: args.query },
        },
        take: 25,
      });
      break;
    case "customer.update":
      await tx.resource.update({
        where: { id: resource!.id },
        data: {
          data: json({ ...data, company: args.company }),
          version: { increment: 1 },
        },
      });
      result = {
        updated: true,
        customerId: resource!.id,
        company: args.company,
      };
      break;
    case "note.create": {
      const note = await tx.resource.create({
        data: {
          id: randomUUID(),
          workspaceId,
          tool,
          kind: "note",
          classification: resource!.classification,
          data: json({ customerId: resource!.id, note: args.note }),
        },
      });
      await tx.resource.update({
        where: { id: resource!.id },
        data: { version: { increment: 1 } },
      });
      result = { created: true, noteId: note.id };
      break;
    }
    case "payment.create": {
      const payment = await tx.resource.create({
        data: {
          id: randomUUID(),
          workspaceId,
          tool,
          kind: "payment",
          data: json({
            invoiceId: resource!.id,
            amount: args.amount,
            currency: "USD",
            synthetic: true,
            status: "SETTLED",
          }),
        },
      });
      await tx.resource.update({
        where: { id: resource!.id },
        data: {
          version: { increment: 1 },
          data: json({
            ...data,
            status: args.amount === data?.amount ? "PAID" : "PARTIALLY_PAID",
            paidAmount: args.amount,
          }),
        },
      });
      result = {
        paymentId: payment.id,
        synthetic: true,
        status: "SETTLED",
        amount: args.amount,
        currency: "USD",
      };
      break;
    }
    case "invoice.list":
    case "transaction.list":
    case "document.list":
      result = await tx.resource.findMany({
        where: {
          ...allowed,
          kind:
            operation === "invoice.list"
              ? "invoice"
              : operation === "transaction.list"
                ? "payment"
                : "document",
        },
        select: {
          id: true,
          classification: true,
          version: true,
          data: operation !== "document.list",
        },
        take: 50,
      });
      break;
    case "customer.export":
    case "document.export":
      result = await tx.resource.findMany({
        where: { ...allowed, kind: tool === "crm" ? "customer" : "document" },
        take: 50,
      });
      break;
    case "customer.delete":
    case "document.delete":
      await tx.resource.delete({ where: { id: resource!.id } });
      result = { deleted: true, id: resource!.id };
      break;
    default:
      throw new Error("Unregistered connector operation");
  }
  return z.json().parse(JSON.parse(JSON.stringify(result)));
}
