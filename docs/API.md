# API contract

The running API exposes `/api/openapi.json` (OpenAPI 3.1). Gateway and policy request JSON schemas derive directly from shared Zod definitions. Workspace route descriptions are maintained alongside the transport module; the document intentionally does not pretend every administrative response has a fully generated object schema.

## Machine gateway v1

`POST /api/v1/invoke` accepts `Authorization: Bearer <agent-key>`. Human cookies do not substitute for the machine credential. Body: `tool`, `operation`, `arguments`, `idempotencyKey`, optional bounded `intent`. Unknown fields are rejected.

Agent and workspace identities come only from the credential. An invocation is bound to the exact canonical tool/operation/arguments. `intent` is not an authorization input and changing it cannot alter idempotent execution.

Responses include invocation ID/status, policy version, matching rules, explanation codes, backend stage durations, preview/result, timestamps, and correlation ID. Expected OPA denials return HTTP 403 with a structured invocation; approval requirements return 202. The SDK preserves both as typed results. Authentication errors return 401, malformed requests 400, unknown workspace resources 404, and conflicting idempotency/review state 409. Unexpected errors return 500 without private details. Errors have `{error:{code,requestId,issues?}}`.

## Human workspace API

Login (`POST /api/auth/login`) returns a CSRF token and sets an HttpOnly session cookie. `GET /api/session` restores user/workspace/CSRF context. Cookie-authenticated mutations require `X-CSRF-Token` and exact configured `Origin`. Logout expires the current session; password changes revoke all user sessions. Demo login is explicit non-production only.

| Routes                                                                | Permission   | Behavior                                                                                 |
| --------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| GET `/overview`, `/agents`, `/connectors`, `/scenarios`, `/analytics` | read         | Workspace-scoped stored/computed data                                                    |
| POST `/agents`, PATCH `/agents/:id`                                   | manage       | Zero-permission registration, suspension/reactivation                                    |
| POST `/agents/:id/credentials`                                        | manage       | `hours` 1–24; optional `rotate` revokes existing credentials; plaintext returned once    |
| DELETE `/credentials/:id`                                             | manage       | Revoke a workspace-owned credential                                                      |
| POST `/agents/:id/capabilities`                                       | manage       | Tool, operations, resource IDs, classifications, amount ceiling, expiry                  |
| DELETE `/capabilities/:id`                                            | manage       | Revoke a workspace-owned grant                                                           |
| POST `/playground/preview`, `/playground/invoke`                      | invoke       | Same gateway service with a server-trusted human initiator                               |
| GET `/invocations`                                                    | read         | Page size 25; `page`, `search`, `status`, `tool`, `agentId`, ISO `from`/`to`             |
| GET `/invocations/:id`                                                | read         | Redacted request/result, trace, associated signed audit records                          |
| GET `/approvals`                                                      | read         | Current and historical reviews; expires stale pending records                            |
| POST `/approvals/:id/review`                                          | approve      | `action` is `approve` or `reject`; exact `payloadHash`; current membership checked again |
| GET/POST `/policies`                                                  | read/policy  | Immutable version library / create structured draft                                      |
| POST `/policies/:id/simulate`                                         | policy       | Actual active/candidate OPA evaluation; marks version validated on success               |
| POST `/policies/:id/publish`                                          | policy       | Requires successful simulation, OPA availability; single active version                  |
| GET `/audit`                                                          | read         | Page size 50; `type`, `actor`, `page`                                                    |
| GET `/audit/verify`, `/audit/export`                                  | read         | Full chain verification / redacted export bounded to 10,000 events                       |
| GET/POST `/lab`                                                       | read/lab     | Run history / isolated bounded synthetic evaluation, maximum 3 runs/minute/process       |
| GET/PATCH `/settings`                                                 | read/members | Workspace profile and current member metadata / rename workspace                         |
| PATCH `/members/:id`                                                  | members      | Change existing member role; owner/self changes prohibited                               |
| POST `/explain`                                                       | read         | Existing decision explanation; explicit `consent:true` for configured Gemini             |
| GET `/events`                                                         | session      | SSE refresh notifications, five-second hints, reconnect after 30 seconds                 |

The read permission is implicit for all defined workspace roles. Machine credentials cannot call administration endpoints. No connector endpoint directly executes a tool. Transport schemas enforce operation allowlists before database mutation.

## Versioning

`/api/v1/invoke` is the stable machine contract. Future breaking changes require `/v2`. Workspace endpoints are versioned with the application and are not claimed as a stable third-party administration API. Response fields may be added compatibly. The SDK builds to distributable ESM and declarations; local packaging was verified. Publishing to npm is a separate, unperformed release step.
