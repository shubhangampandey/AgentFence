import { z } from "zod";
export const toolSchema = z.enum(["crm", "finance", "vault"]);
export const invokeSchema = z
  .object({
    tool: toolSchema,
    operation: z.string().min(3).max(80),
    arguments: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().min(8).max(128),
    intent: z.string().max(1000).optional(),
  })
  .strict();
export type InvokeInput = z.infer<typeof invokeSchema>;
export const ruleSchema = z
  .object({
    id: z.string().min(1).max(60),
    name: z.string().min(1).max(100),
    effect: z.enum(["PERMIT", "DENY", "APPROVAL"]),
    tool: z.enum(["crm", "finance", "vault", "*"]),
    operation: z.string().min(1).max(80),
    agentId: z.string().max(100).default("*"),
    environment: z.string().max(40).default("*"),
    classification: z
      .enum(["*", "public", "internal", "confidential"])
      .default("*"),
    minAmount: z.number().int().min(0).max(100000000).default(0),
    maxAmount: z.number().int().min(0).max(100000000).default(100000000),
    startHour: z.number().int().min(0).max(23).default(0),
    endHour: z.number().int().min(1).max(24).default(24),
    priority: z.number().int().min(0).max(1000).default(100),
    explanation: z.string().min(1).max(500),
  })
  .strict()
  .refine(
    (r) => r.minAmount <= r.maxAmount && r.startHour < r.endHour,
    "Invalid amount or UTC hour range",
  );
export type Rule = z.infer<typeof ruleSchema>;
export const policySchema = z
  .object({
    name: z.string().min(3).max(120),
    description: z.string().max(1000),
    rules: z.array(ruleSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (p) => new Set(p.rules.map((r) => r.id)).size === p.rules.length,
    "Rule IDs must be unique",
  );
export type Decision = {
  effect: "PERMIT" | "DENY" | "APPROVAL";
  codes: string[];
  matchedRules: string[];
  explanations: string[];
};
export type TraceStage = {
  stage: string;
  state: "passed" | "blocked" | "waiting" | "failed";
  durationMs: number;
  detail: string;
};
export type GatewayResult = {
  id: string;
  status: string;
  policyVersion: number;
  decision: Decision;
  trace: TraceStage[];
  preview: unknown;
  result: unknown;
  createdAt: string;
  [key: string]: unknown;
};
export const permissions = {
  OWNER: ["read", "manage", "approve", "invoke", "policy", "lab", "members"],
  ADMIN: ["read", "manage", "approve", "invoke", "policy", "lab", "members"],
  SECURITY_OPERATOR: ["read", "manage", "invoke", "policy", "lab"],
  APPROVER: ["read", "approve"],
  AUDITOR: ["read"],
  VIEWER: ["read"],
} as const;
export type Role = keyof typeof permissions;
export const can = (role: Role, permission: string) =>
  (permissions[role] as readonly string[]).includes(permission);
