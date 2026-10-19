import { z } from "zod";
import {
  invokeSchema,
  policySchema,
} from "../../../packages/shared/src/index.js";
const body = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});
const result = {
  description:
    "Structured JSON response. Errors use {error:{code,requestId,issues?}}.",
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: true },
    },
  },
};
const route = (
  method: string,
  summary: string,
  schema?: unknown,
  machine = false,
) => ({
  [method]: {
    summary,
    security: [machine ? { machineCredential: [] } : { sessionCookie: [] }],
    ...(schema ? { requestBody: body(schema) } : {}),
    responses: {
      "200": result,
      "201": result,
      "202": result,
      "400": result,
      "401": result,
      "403": result,
      "409": result,
    },
  },
});
const empty = { type: "object", additionalProperties: false };
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "AgentFence API",
    version: "1.0.0",
    description:
      "Synthetic tools only. Machine API v1; workspace endpoints are UI contracts. Session mutations require X-CSRF-Token and the configured Origin. Decisions come from OPA.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      machineCredential: { type: "http", scheme: "bearer" },
      sessionCookie: { type: "apiKey", in: "cookie", name: "af_session" },
    },
    schemas: {
      InvocationInput: z.toJSONSchema(invokeSchema),
      PolicyDraft: z.toJSONSchema(policySchema),
    },
  },
  paths: {
    "/health": {
      get: { summary: "Liveness", security: [], responses: { "200": result } },
    },
    "/ready": {
      get: {
        summary: "Database and OPA readiness",
        security: [],
        responses: { "200": result, "503": result },
      },
    },
    "/v1/invoke": route(
      "post",
      "Protected machine invocation",
      z.toJSONSchema(invokeSchema),
      true,
    ),
    "/auth/login": {
      post: {
        summary: "Human login; configured Origin required",
        security: [],
        requestBody: body({
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
          required: ["email", "password"],
          additionalProperties: false,
        }),
        responses: { "200": result, "401": result },
      },
    },
    "/auth/register": {
      post: {
        summary:
          "Create an account and isolated sandbox workspace; configured Origin required",
        security: [],
        requestBody: body({
          type: "object",
          properties: {
            name: { type: "string", minLength: 2, maxLength: 100 },
            email: { type: "string", format: "email", maxLength: 200 },
            password: { type: "string", minLength: 14, maxLength: 200 },
          },
          required: ["name", "email", "password"],
          additionalProperties: false,
        }),
        responses: {
          "201": result,
          "400": result,
          "403": result,
          "409": result,
          "429": result,
        },
      },
    },
    "/auth/session": {
      get: {
        summary: "Current session, or null when signed out",
        security: [],
        responses: {
          "200": {
            description: "Session and CSRF token, or null",
            content: {
              "application/json": { schema: { type: ["object", "null"] } },
            },
          },
        },
      },
    },
    "/session": route("get", "Current human session and CSRF token"),
    "/auth/logout": route("post", "Expire current session", empty),
    "/agents": {
      ...route(
        "get",
        "List workspace agents and non-secret credential metadata",
      ),
      ...route("post", "Register zero-permission identity"),
    },
    "/agents/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("patch", "Suspend or reactivate agent"),
    },
    "/agents/{id}/credentials": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("post", "Issue or rotate short-lived credential"),
    },
    "/agents/{id}/capabilities": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("post", "Grant scoped capability"),
    },
    "/playground/invoke": route(
      "post",
      "Human simulation using the authoritative gateway",
      {
        ...z.toJSONSchema(invokeSchema),
        properties: {
          ...z.toJSONSchema(invokeSchema).properties,
          agentId: { type: "string" },
        },
        required: [...z.toJSONSchema(invokeSchema).required!, "agentId"],
      },
    ),
    "/playground/preview": route("post", "Read-only pre-execution evaluation"),
    "/invocations": route(
      "get",
      "Paginated workspace invocations; search, status, tool, agentId, from, to",
    ),
    "/invocations/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("get", "Redacted invocation and audit trail"),
    },
    "/approvals": route("get", "Approval queue; expires stale requests"),
    "/approvals/{id}/review": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("post", "Independent human review", {
        type: "object",
        properties: {
          action: { enum: ["approve", "reject"] },
          payloadHash: { type: "string", minLength: 64, maxLength: 64 },
        },
        required: ["action", "payloadHash"],
        additionalProperties: false,
      }),
    },
    "/policies": {
      ...route("get", "Version history"),
      ...route("post", "Create immutable draft", z.toJSONSchema(policySchema)),
    },
    "/policies/{id}/simulate": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("post", "Compare active and candidate OPA decisions", empty),
    },
    "/policies/{id}/publish": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      ...route("post", "Publish validated policy version", empty),
    },
    "/audit": route(
      "get",
      "Paginated redacted signed events; type and actor filters",
    ),
    "/audit/verify": route("get", "Verify entire workspace hash chain"),
    "/audit/export": route(
      "get",
      "Export first 10000 events with verification metadata",
    ),
    "/connectors": route(
      "get",
      "Registered connector contracts and stored record counts",
    ),
    "/scenarios": route("get", "Deterministic demonstration scenarios"),
    "/lab": {
      ...route("get", "Evaluation history"),
      ...route("post", "Run isolated adversarial evaluation", empty),
    },
    "/analytics": route("get", "Metrics computed from stored invocations"),
    "/settings": {
      ...route("get", "Workspace and role configuration"),
      ...route("patch", "Update workspace name"),
    },
    "/explain": route(
      "post",
      "Explain an existing decision; consent required for optional Gemini",
    ),
    "/events": {
      get: {
        summary:
          "Session-bound SSE refresh notifications; no invented gateway events",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "text/event-stream" } },
      },
    },
  },
};
