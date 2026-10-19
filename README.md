# AgentFence

**Every action. Verified.**

A security control plane that puts a deterministic authorization gateway between AI agents and their tools. AgentFence validates identity, capability scope, published policies, and human approval before executing an operation, then records signed audit evidence.

The React workspace lets operators manage agents, inspect decisions, review requests, and investigate activity. The backend enforces every execution boundary. The Northstar Labs environment uses fictional customers, invoices, payments, and documents.

> **Status:** Functional portfolio implementation with locally verified PostgreSQL/OPA execution, a TypeScript SDK, security tests, and optional Gemini explanations. Connectors operate on synthetic data. Container and cloud deployment need separate runtime acceptance checks.

![AgentFence operator workspace](docs/screenshots/overview-production.png)

## Contents

- [Capabilities](#capabilities)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [How a request works](#how-a-request-works)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Workspace walkthrough](#workspace-walkthrough)
- [Frontend routes](#frontend-routes)
- [API reference](#api-reference)
- [TypeScript SDK](#typescript-sdk)
- [Gemini explanations](#gemini-explanations)
- [Security and permissions](#security-and-permissions)
- [Development and verification](#development-and-verification)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Current boundaries](#current-boundaries)
- [Documentation](#documentation)

## Capabilities

An agent's proposed action can be valid JSON and still exceed its authority. AgentFence separates stated intent from the permissions needed to read a customer, change a record, or create a payment.

| Capability              | Implementation                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Machine identity        | Expiring, revocable credentials with stored hashes; server-derived agent/workspace identity.                 |
| Capability grants       | Limits on tools, operations, resources, classifications, environment, expiry, and per-request amounts.       |
| Policy enforcement      | Validated structured rules evaluated through fixed OPA Rego; denies override approvals and permits.          |
| Human approval          | Exact payload hashes, versioned previews, independent reviewers, expiry, and current-policy rechecks.        |
| Transactional execution | Workspace locks, payload-bound idempotency, synthetic effects and evidence committed together.               |
| Investigations          | Redacted request/result details, recorded stage durations, decision graphs, audit verification, and exports. |
| Policy lifecycle        | Immutable versions, actual active/candidate simulation, and validation before publication.                   |
| Security lab            | Bounded scenarios run through the real gateway with persisted results.                                       |
| Optional AI             | Consent-gated Gemini explanations with a deterministic fallback.                                             |

### Synthetic connectors

Registration defines the accepted argument schema. Every operation still needs matching capability scope and a permitting policy.

| Connector                     | Registered operations                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Northstar CRM (`crm`)         | `customer.read`, `customer.search`, `customer.update`, `note.create`, `customer.export`, `customer.delete` |
| Synthetic Finance (`finance`) | `invoice.list`, `invoice.read`, `payment.create`, `transaction.list`                                       |
| Document Vault (`vault`)      | `document.list`, `document.read`, `document.metadata`, `document.export`, `document.delete`                |

Seed policies deny bulk extraction, destructive operations, and confidential access. Payments can require independent review. Payment execution changes a synthetic database record; it does not transfer real money.

## Technology stack

| Layer                | Technologies                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| Language / workspace | TypeScript, Node.js, ESM, pnpm workspaces                                |
| Frontend             | React 19, Vite 8, React Router 7, TanStack Query 5                       |
| UI / forms           | Tailwind CSS 4, custom CSS, Motion, Lucide, React Hook Form, Zod         |
| Decision graph       | React Flow (`@xyflow/react`)                                             |
| API                  | Express 5, Zod, Helmet, CORS, express-rate-limit                         |
| Authentication       | Argon2id passwords, opaque sessions, CSRF tokens, server-side RBAC       |
| Persistence          | PostgreSQL, Prisma 7, node-postgres adapter; PGlite development fallback |
| Authorization        | Open Policy Agent 1.21.2, fixed Rego policies                            |
| Audit / logs         | Node crypto SHA-256/HMAC, Pino, Pino HTTP                                |
| Optional AI          | Google GenAI JavaScript SDK, backend-only Gemini requests                |
| Quality / packaging  | Vitest, Supertest, Playwright, ESLint, Prettier, TypeScript, tsup        |
| Infrastructure       | Docker Compose, API Dockerfile, nginx configuration, GitHub Actions      |

Exact versions are recorded in [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml).

## Architecture

```mermaid
flowchart TD
    A["External agent / TypeScript SDK"] -->|"Scoped bearer credential"| G["Express gateway"]
    H["React workspace"] -->|"Session + CSRF + RBAC"| G
    G --> I["Identity, capability and resource checks"]
    I --> O["OPA: fixed Rego + published rules"]
    O -->|"DENY"| D["Record denied invocation"]
    O -->|"APPROVAL"| Q["Persist exact payload and preview"]
    Q --> R["Independent human review"]
    R --> V["Recheck authority and resource version"]
    O -->|"PERMIT"| V
    V --> C["Internal synthetic connectors"]
    C --> P[("PostgreSQL transaction")]
    D --> P
    P --> E["Signed audit chain and recorded trace"]
    E --> U["Investigation UI / JSON export"]
    E -.->|"Explicit consent"| AI["Gemini explanation"]
```

### Component responsibilities

| Component                            | Responsibility                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `apps/api/src/app.ts`                | HTTP transport, input validation, permission guards, redaction, SSE.         |
| `gateway.ts`                         | Identity, authorization, idempotency, invocation states, approval execution. |
| `policy.ts` / `policy-management.ts` | OPA evaluation and draft/simulate/publish lifecycle.                         |
| `connectors.ts`                      | Argument schemas, previews, internal synthetic effects.                      |
| `audit.ts` / `crypto.ts`             | Canonical hashes, signatures, chain verification, redaction.                 |
| `db.ts` / Prisma                     | Typed persistence and workspace row locks around transactions.               |
| `apps/web`                           | Human workflows, cached reads, persisted-event refreshes.                    |
| `packages/sdk`                       | Typed machine client, timeouts, bounded transport retries.                   |

### Persistence model

`Workspace` scopes memberships, agents, policies, resources, invocations, audit events, and lab runs. Users authenticate through `Session`; agents authenticate through `Credential` and receive authority through `Capability`.

`Invocation` stores its payload hash, idempotency key, policy version, decision, preview/result, trace, and approval metadata. `Resource` holds versioned synthetic domain objects. `AuditEvent` links to the preceding event hash and the current workspace audit head.

See the [Prisma schema](prisma/schema.prisma), [SQL migrations](prisma/migrations), and [architecture reference](docs/architecture/README.md) for relationships and state transitions.

## How a request works

1. **Authenticate:** resolve a machine credential or authorized playground session. Derive workspace identity on the server.
2. **Validate:** reject unknown fields and tool operations; check connector arguments and capability scope.
3. **Lock and resolve:** begin a PostgreSQL transaction, lock the workspace, and resolve current identity, resource classification/version, and published policy.
4. **Evaluate:** send trusted structured attributes to OPA. Missing policy, malformed output, timeout, or authorization failure denies execution.
5. **Select an outcome:** record a denial, create a payload-bound approval request, or prepare permitted execution. Preview does not execute effects.
6. **Recheck:** validate current authority before effects. Reviews also check independence, expiry, exact payload, and resource version.
7. **Commit:** persist synthetic changes, invocation state, and audit evidence together, then return the recorded outcome.

The same idempotency key and canonical operation return the existing invocation. A different payload with the same key conflicts. Natural-language `intent` cannot grant privileges.

```mermaid
sequenceDiagram
    participant Agent
    participant API as Gateway
    participant DB as PostgreSQL
    participant OPA
    participant Reviewer
    Agent->>API: Credential + operation + idempotency key
    API->>DB: Resolve identity; begin; lock workspace
    API->>OPA: Evaluate trusted policy input
    OPA-->>API: DENY / APPROVAL / PERMIT
    alt Approval required
        API->>DB: Persist payload hash and versioned preview
        API-->>Agent: 202 APPROVAL_REQUIRED
        Reviewer->>API: Approve exact payload hash
        API->>DB: Validate current reviewer and resource
        API->>OPA: Re-evaluate current authority
        API->>DB: Commit effect + invocation + audit
    else Permitted
        API->>OPA: Final authorization recheck
        API->>DB: Commit effect + invocation + audit
        API-->>Agent: 200 EXECUTED
    else Denied
        API->>DB: Persist denial + audit
        API-->>Agent: 403 DENIED
    end
```

## Project structure

```text
AgentFence-cvProject/
├── apps/
│   ├── api/src/                 # Express API and execution services
│   │   ├── app.ts              # Routes and transport middleware
│   │   ├── server.ts           # Server lifecycle
│   │   ├── auth.ts             # Sessions, CSRF and role guards
│   │   ├── gateway.ts          # Identity, invocation and review workflow
│   │   ├── policy*.ts          # OPA evaluation and policy versions
│   │   ├── connectors.ts       # Synthetic tools and previews
│   │   ├── audit.ts            # Signed event chain
│   │   ├── crypto.ts           # Hashing, signing and redaction
│   │   ├── lab.ts              # Security evaluation
│   │   └── generated/          # Generated Prisma client; ignored
│   └── web/src/                # React pages, API client, styles and graph
├── packages/
│   ├── shared/src/             # Zod contracts, types and role matrix
│   └── sdk/src/                # TypeScript machine client
├── prisma/                     # Schema, migrations and synthetic seed
├── infrastructure/             # OPA Rego/tests, Dockerfiles, nginx
├── scripts/                    # Setup, local infra, reset, benchmark, smoke checks
├── tests/
│   ├── security/               # PostgreSQL/OPA + Supertest regression suite
│   └── e2e/                    # Playwright desktop/mobile and production checks
├── docs/                       # API, architecture, threat model, evaluations
├── .github/workflows/          # Continuous integration
├── .env.example                # Public configuration template
├── docker-compose.yml          # PostgreSQL + OPA infrastructure
└── pnpm-workspace.yaml          # Workspace package boundaries
```

`.env`, `.local`, generated clients, dependencies, and build output are ignored artifacts. Short synthetic transactions do not require Redis or a separate job worker.

## Getting started

### Prerequisites

- **Node.js 22.12+**; local verification used Node 24.21.
- **pnpm 10.28.2**, declared in `packageManager`.
- PostgreSQL and OPA through either option below.

Run commands from the repository root. Gemini credentials are optional.

### Option A: local development without Docker

```powershell
pnpm install --frozen-lockfile
pnpm run setup
```

Setup creates an ignored `.env` with random local session/audit secrets and a random demo password, downloads checksum-verified OPA, and preserves existing configuration.

Start infrastructure in one terminal and keep it running:

```powershell
pnpm infra:local
```

In a second terminal:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The fallback runs persistent PGlite on **5433** and OPA on **8181**. Set `DATABASE_POOL_SIZE=1` for PGlite. Development database files live in `.local/postgres`.

### Option B: Docker infrastructure

After dependency installation and setup, configure `.env`:

```dotenv
DATABASE_URL=postgresql://agentfence:YOUR_LOCAL_PASSWORD@localhost:5432/agentfence
POSTGRES_PASSWORD=YOUR_LOCAL_PASSWORD
DATABASE_POOL_SIZE=10
```

```powershell
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Compose starts **PostgreSQL and OPA**; `pnpm dev` starts the application. Use one infrastructure option at a time. Native PostgreSQL also works with its connection URL and an OPA process loading `infrastructure/opa`.

### Addresses and demo access

| Service                  | Address                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| Web application          | [http://localhost:5173](http://localhost:5173)                                   |
| API liveness             | [http://localhost:4000/api/health](http://localhost:4000/api/health)             |
| PostgreSQL/OPA readiness | [http://localhost:4000/api/ready](http://localhost:4000/api/ready)               |
| OpenAPI JSON             | [http://localhost:4000/api/openapi.json](http://localhost:4000/api/openapi.json) |

Open the browser with `localhost` to match `WEB_ORIGIN`. Liveness alone does not prove database/OPA readiness.

With `DEMO_ENABLED=true` outside production, the login screen offers Security Operator, Approver, and Auditor access. Seeded accounts are `operator@northstar.example`, `approver@northstar.example`, `auditor@northstar.example`, and `owner@northstar.example`. Their initial password is the generated `DEMO_PASSWORD` in `.env`.

## Configuration

Keep credentials in the ignored `.env` or a deployment secret store. [`.env.example`](.env.example) is the public template.

| Variable                                  | Purpose / default                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                | `development`, `test`, or `production`; default `development`.                             |
| `DATABASE_URL`                            | Required PostgreSQL connection URL.                                                        |
| `DATABASE_POOL_SIZE`                      | Pool size 1–50; default `10`; use `1` with PGlite.                                         |
| `OPA_URL`                                 | Trusted policy engine; default `http://127.0.0.1:8181`.                                    |
| `SESSION_SECRET`                          | Required secret, at least 32 characters, for session-bound CSRF.                           |
| `AUDIT_SIGNING_KEY`                       | Separate required secret, at least 32 characters, for audit signatures.                    |
| `WEB_ORIGIN`                              | Exact browser origin; default `http://localhost:5173`.                                     |
| `API_PORT`                                | API port; default `4000`.                                                                  |
| `DEMO_ENABLED`                            | Non-production demo login; default `false`.                                                |
| `DEMO_PASSWORD`                           | Seed password, minimum 12 characters; generated by setup.                                  |
| `POSTGRES_PASSWORD`                       | Container password consumed by Compose.                                                    |
| `GEMINI_ENABLED`                          | Optional backend explanations; default `false`.                                            |
| `GEMINI_API_KEY`                          | Backend Google credential; required when Gemini is enabled.                                |
| `GEMINI_MODEL`                            | Explicit model ID; template uses `gemini-3.5-flash-lite`.                                  |
| `LOCAL_DB_PORT` / `LOCAL_OPA_PORT`        | Local helper ports; default `5433` / `8181`. Update the corresponding connection URLs too. |
| `AGENTFENCE_URL` / `AGENTFENCE_AGENT_KEY` | API URL and scoped machine key for the example agent.                                      |
| `PLAYWRIGHT_CHANNEL`                      | Optional installed browser channel, such as `chrome`.                                      |
| `BENCH_SAMPLES`                           | Benchmark samples per ordinary case; default `50`, bounded to 10–1000.                     |
| `OPA_VERSION`                             | Optional version label for benchmark environment metadata.                                 |

Production requires an HTTPS browser origin and `DEMO_ENABLED=false`. Keep session and audit secrets distinct. Signing-key rotation and external audit checkpoints need additional operational work.

## Workspace walkthrough

1. **Allowed request:** open **Gateway playground**, select authorized customer lookup, preview, and execute. Inspect recorded stages and the policy result.
2. **Denied request:** select bulk export or untrusted intent. Confirm a denial without connector execution.
3. **Independent review:** submit the payment scenario as an operator. Sign in as an approver, inspect the exact preview, and approve or reject.
4. **Policy change:** draft a deny rule for `crm / customer.read`, simulate it, inspect impact, and publish. Future calls use the new version.
5. **Investigation:** inspect an invocation's graph, export redacted evidence, and verify the audit chain under **Investigations**.
6. **Security lab:** run the bounded evaluation and inspect persisted outcomes.
7. **Optional AI:** explicitly request a Gemini explanation from invocation evidence after server configuration.

To repeat a settled-payment demo, `pnpm demo:reset` resets the fixed synthetic Northstar workspace **including its invocation and audit evidence**. Export needed evidence first. Other workspaces are preserved; production rejects this command. Run `pnpm db:seed` afterward to restore the sample pending payment.

## Frontend routes

| Route                 | Screen / purpose                                               |
| --------------------- | -------------------------------------------------------------- |
| `/`                   | Public landing page.                                           |
| `/architecture`       | Public architecture overview.                                  |
| `/docs`               | Public developer documentation.                                |
| `/login`              | Email/password and optional demo login.                        |
| `/app`                | Authenticated layout; redirects to `/app/overview`.            |
| `/app/overview`       | Workspace activity, decisions, pending approvals.              |
| `/app/agents`         | Registration, suspension, credentials, capability grants.      |
| `/app/policies`       | Versions, drafts, simulation, publication.                     |
| `/app/playground`     | Human-operated gateway preview and execution.                  |
| `/app/approvals`      | Pending and historical reviews.                                |
| `/app/lab`            | Bounded synthetic security evaluation.                         |
| `/app/investigations` | Invocation evidence and audit verification.                    |
| `/app/connectors`     | Tool catalog and synthetic resource counts.                    |
| `/app/analytics`      | Recorded outcomes, tool activity, latency.                     |
| `/app/developer`      | Machine API and SDK information.                               |
| `/app/settings`       | Workspace profile, existing member roles, password, AI status. |

Unmatched frontend routes redirect to `/`. UI visibility does not replace API authorization.

## API reference

AgentFence exposes a **machine contract** at `/api/v1/invoke` and **human workspace endpoints** under `/api`. Tables below use complete paths.

### Authentication and conventions

- Machines send `Authorization: Bearer <scoped-agent-key>`. Human cookies cannot substitute for a machine credential.
- Human login sets an HttpOnly `af_session` cookie and returns `csrfToken`. Authenticated mutations require `X-CSRF-Token` and the exact configured `Origin`.
- Workspace identity is server-derived. Every defined workspace role has read permission.
- Validated request schemas reject unsupported fields. Errors use `{ "error": { "code": "...", "requestId": "...", "issues": [] } }`, with validation issues where applicable.
- OpenAPI 3.1 is available at `/api/openapi.json`; gateway/policy request schemas derive from shared Zod contracts. Administrative response schemas are not fully generated.

### Public endpoints and sessions

| Method | Route                | Access / behavior                                                  |
| ------ | -------------------- | ------------------------------------------------------------------ |
| GET    | `/api/health`        | Public liveness.                                                   |
| GET    | `/api/ready`         | Public PostgreSQL/OPA readiness.                                   |
| GET    | `/api/config`        | Public non-secret demo/Gemini flags.                               |
| GET    | `/api/openapi.json`  | Public OpenAPI document.                                           |
| POST   | `/api/auth/login`    | Email/password login; matching Origin required.                    |
| POST   | `/api/auth/demo`     | Non-production login; role selects operator, approver, or auditor. |
| GET    | `/api/session`       | Current session, workspace, CSRF token.                            |
| POST   | `/api/auth/logout`   | Delete current session.                                            |
| POST   | `/api/auth/password` | Change password and revoke all user sessions.                      |

### Agents, credentials, and execution

| Method | Route                          | Permission / behavior                                                     |
| ------ | ------------------------------ | ------------------------------------------------------------------------- |
| POST   | `/api/v1/invoke`               | Machine bearer identity; authorize and execute or queue review.           |
| GET    | `/api/agents`                  | Read agents, non-secret credential metadata, and grants.                  |
| POST   | `/api/agents`                  | `manage`; register with no implicit capabilities.                         |
| PATCH  | `/api/agents/:id`              | `manage`; suspend/reactivate.                                             |
| POST   | `/api/agents/:id/credentials`  | `manage`; issue expiring key; optional rotation; plaintext returned once. |
| DELETE | `/api/credentials/:id`         | `manage`; revoke credential.                                              |
| POST   | `/api/agents/:id/capabilities` | `manage`; grant bounded tool/resource/classification authority.           |
| DELETE | `/api/capabilities/:id`        | `manage`; revoke grant.                                                   |
| GET    | `/api/connectors`              | Registered tools and scoped resource counts.                              |
| GET    | `/api/scenarios`               | Synthetic playground scenario definitions.                                |
| POST   | `/api/playground/preview`      | `invoke`; gateway evaluation without connector effects.                   |
| POST   | `/api/playground/invoke`       | `invoke`; execution through the same gateway.                             |

### Invocations, reviews, and policies

| Method | Route                        | Permission / behavior                                      |
| ------ | ---------------------------- | ---------------------------------------------------------- |
| GET    | `/api/invocations`           | Filtered history; 25 items/page.                           |
| GET    | `/api/invocations/:id`       | Redacted invocation, result, trace, related audit records. |
| GET    | `/api/approvals`             | Review history; expires stale pending requests.            |
| POST   | `/api/approvals/:id/review`  | `approve`; approve/reject exact payload hash.              |
| GET    | `/api/policies`              | Policy versions.                                           |
| POST   | `/api/policies`              | `policy`; structured immutable draft.                      |
| POST   | `/api/policies/:id/simulate` | `policy`; actual active/candidate OPA comparison.          |
| POST   | `/api/policies/:id/publish`  | `policy`; publish successfully simulated version.          |

Invocation filters: `page`, `search`, `status`, `tool`, `agentId`, ISO `from` / `to`. Review body: `{ "action": "approve", "payloadHash": "<recorded-64-character-hash>" }`; use `reject` for rejection.

### Investigations, administration, and assistance

| Method | Route               | Permission / behavior                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/overview`     | Workspace counts, recent invocations, audit activity.                                 |
| GET    | `/api/audit`        | History; `page`, `type`, `actor`; 50 items/page.                                      |
| GET    | `/api/audit/verify` | Complete signed-chain verification against current head.                              |
| GET    | `/api/audit/export` | JSON export, bounded to 10,000 events.                                                |
| GET    | `/api/lab`          | Recent persisted security evaluations.                                                |
| POST   | `/api/lab`          | `lab`; isolated evaluation; maximum three runs/minute/process.                        |
| GET    | `/api/analytics`    | Outcomes, tool distributions, recorded latency data.                                  |
| GET    | `/api/settings`     | Workspace, existing members, permissions, non-secret AI status.                       |
| PATCH  | `/api/settings`     | `members`; rename workspace.                                                          |
| PATCH  | `/api/members/:id`  | `members`; existing member role; owner/self changes prohibited.                       |
| POST   | `/api/explain`      | Read permission; existing invocation explanation; explicit `consent:true` for Gemini. |
| GET    | `/api/events`       | Session-authenticated SSE refresh notifications on audit-head changes.                |

### Machine request example

```http
POST /api/v1/invoke
Authorization: Bearer <scoped-agent-key>
Content-Type: application/json
```

```json
{
  "tool": "crm",
  "operation": "customer.read",
  "arguments": { "customerId": "customer_001" },
  "idempotencyKey": "customer-lookup-001"
}
```

| Status | Meaning                                                               |
| ------ | --------------------------------------------------------------------- |
| `200`  | Successful machine result, including execution or idempotent replay.  |
| `202`  | Machine request requires approval.                                    |
| `400`  | Invalid schema or unsupported operation.                              |
| `401`  | Invalid, expired, revoked, or missing authentication.                 |
| `403`  | Machine denial, missing permission, or origin/CSRF failure.           |
| `404`  | Unknown or inaccessible resource.                                     |
| `409`  | Payload/idempotency conflict, stale review, illegal state transition. |
| `500`  | Unexpected failure; private details stay server-side.                 |

Expected machine denials (`403`) and approval requirements (`202`) include structured invocation data. The SDK retains these as typed results. Human playground routes return the gateway result through the workspace transport. See [API contract details](docs/API.md).

## TypeScript SDK

`@agentfence/sdk` builds to ESM and TypeScript declarations. It is a local workspace package; no npm publication is claimed.

```typescript
import { AgentFenceClient } from "@agentfence/sdk";

const client = new AgentFenceClient({
  baseUrl: process.env.AGENTFENCE_URL!,
  apiKey: process.env.AGENTFENCE_AGENT_KEY!,
});

const result = await client.invoke({
  tool: "crm",
  operation: "customer.read",
  arguments: { customerId: "customer_001" },
  idempotencyKey: "customer-lookup-001",
});

console.log(result.status);
```

Register/select an agent, issue a credential, grant its capability, and ensure policy permits the request. Set `AGENTFENCE_AGENT_KEY` and optionally `AGENTFENCE_URL` locally, then run:

```powershell
pnpm build:sdk
pnpm exec tsx scripts/example-agent.ts
```

The client handles typed expected outcomes, timeouts, and bounded transport retries using the same payload/key.

## Gemini explanations

Gemini explains a recorded decision; authorization remains in the deterministic gateway.

```dotenv
GEMINI_ENABLED=true
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart the API after configuration changes. In invocation evidence, choose **I consent — explain with Gemini**. The backend sends redacted decision/status/tool/operation evidence, requests a JSON `text` field, validates output, and applies a 20-second request timeout.

- Successful output is labeled `source: "gemini"`.
- Without consent, the recorded deterministic explanation is returned.
- Provider/validation failure returns the deterministic explanation with `aiUnavailable:true`; the UI shows a fallback notice.

A live authenticated explanation returned `source: "gemini"` on **19 October 2026**. Model access depends on the Google project. Keep the key exclusively in backend configuration.

## Security and permissions

| Role              | Read | Manage agents/grants | Invoke | Approve | Policies | Lab | Members |
| ----------------- | ---- | -------------------- | ------ | ------- | -------- | --- | ------- |
| Owner             | Yes  | Yes                  | Yes    | Yes     | Yes      | Yes | Yes     |
| Admin             | Yes  | Yes                  | Yes    | Yes     | Yes      | Yes | Yes     |
| Security Operator | Yes  | Yes                  | Yes    | No      | Yes      | Yes | No      |
| Approver          | Yes  | No                   | No     | Yes     | No       | No  | No      |
| Auditor           | Yes  | No                   | No     | No      | No       | No  | No      |
| Viewer            | Yes  | No                   | No     | No      | No       | No  | No      |

Approval additionally requires independent review and current membership. A role alone cannot approve its own initiated action.

Passwords use Argon2id. Opaque session tokens are stored as digests, expire after eight hours, and use HttpOnly/SameSite Strict cookies; production cookies are Secure. Workspace queries and database relationships enforce tenant scope. Credential plaintext is returned only at issuance.

Audit signatures detect altered events and missing tails relative to a trusted current head/key. A privileged rollback of the entire database and head needs external checkpoints to detect. See the [threat model](docs/security/THREAT_MODEL.md).

## Development and verification

Keep PostgreSQL and OPA running. Disable Gemini for deterministic security tests so provider availability cannot affect the suite:

```powershell
$env:GEMINI_ENABLED = 'false'
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:compiled
Remove-Item Env:GEMINI_ENABLED
```

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
.local\opa.exe test infrastructure/opa -v
```

On Linux/macOS, run `.local/opa test infrastructure/opa -v`. Browser tests require the production build and seeded database; Playwright starts source web/API and the compiled frontend preview. Use `$env:PLAYWRIGHT_CHANNEL = 'chrome'` if installed Chrome is needed on Windows.

**19 October 2026 verification:** 31 existing tests, type checking, lint, and production build passed. Live Gemini success and the no-consent deterministic path were verified separately. Historical browser/OPA/SDK checks are documented in the [verification report](docs/evaluation/VERIFICATION.md).

### Commands

| Command                                                 | Purpose                                                 |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                                              | API watcher and Vite frontend.                          |
| `pnpm start:source`                                     | Run API TypeScript directly.                            |
| `pnpm setup` / `pnpm infra:local`                       | Prepare config/OPA; start local PostgreSQL/OPA.         |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` | Generate client, apply migrations, seed synthetic data. |
| `pnpm typecheck` / `pnpm lint` / `pnpm test`            | Static checks and security regression suite.            |
| `pnpm build`                                            | Frontend, compiled API, SDK.                            |
| `pnpm build:sdk`                                        | SDK ESM and declarations.                               |
| `pnpm check`                                            | Type checking, lint, tests, build.                      |
| `pnpm smoke:compiled`                                   | Compiled API + packaged SDK smoke check.                |
| `pnpm test:e2e`                                         | Desktop/mobile and production browser checks.           |
| `pnpm benchmark`                                        | Local gateway measurements.                             |
| `pnpm demo:reset`                                       | Reset Northstar synthetic workspace and evidence.       |
| `pnpm start`                                            | Start compiled API.                                     |
| `pnpm format`                                           | Format source and documentation.                        |

Tests/benchmarks create `test_*` / `bench_*` workspaces. Browser tests reset the synthetic `invoice_002` fixture and record that reset. Use a development database. [Benchmark results](docs/evaluation/benchmark-results.json) include sample sizes, hardware, measured percentiles, and errors; they describe that recorded workload.

## Deployment

`pnpm build` produces `dist/web`, `dist/server`, and `packages/sdk/dist`. Provision PostgreSQL/private OPA, apply migrations, supply secrets, and start the compiled backend with `pnpm start`. Serve `dist/web` with SPA fallback and a same-origin `/api` reverse proxy.

Set `NODE_ENV=production`, `DEMO_ENABLED=false`, and an exact HTTPS `WEB_ORIGIN`. The Compose file provisions infrastructure; separate Docker/nginx files prepare application packaging. Seed accounts are a controlled demo fixture. Follow [deployment preparation](docs/deployment/README.md) before public exposure.

## Troubleshooting

| Symptom                          | Action                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Liveness works but requests fail | Check `/api/ready`; start PostgreSQL/OPA and apply migrations.                             |
| CSRF/Origin rejection            | Match browser URL and `WEB_ORIGIN`; send both required headers on mutations.               |
| PGlite timeouts                  | Set `DATABASE_POOL_SIZE=1`; keep infrastructure running.                                   |
| Port conflict                    | Check 5173, 4000, 8181 and selected DB port; use one infrastructure option.                |
| New agent is denied              | Check credentials, capability, classification, expiry, suspension and policy.              |
| Stale/rejected approval          | Check exact hash, resource version, expiry, independent reviewer and current policy.       |
| Payment cannot repeat            | Invoice may be settled; use demo reset only when its evidence can be discarded.            |
| Gemini falls back                | Check enabled flag, key, accessible model, consent and provider availability; restart API. |
| Chromium cannot start            | Install Playwright browsers or select the installed Chrome channel.                        |

## Current boundaries

- Synthetic database connectors only; external effects and reconciliation are outside the implementation.
- SSO/MFA, invitations, recovery, external identity provisioning and session administration are unfinished.
- Immutable offsite audit checkpoints and signing-key rotation are unfinished.
- Rate limits are process-local; distributed quotas and operational retention/cleanup need more work.
- Policy versions cover structured workspace bundles; advanced multi-bundle administration is future scope.
- Invocation stages are persisted timings; SSE sends refresh notifications rather than live per-stage streaming.
- Gemini supports decision explanations; policy generation and automated remediation are unfinished.
- Container, TLS, backup/restore and cloud deployment need environment-specific acceptance and hardening.

## Documentation

| Document                                                | Coverage                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| [Architecture](docs/architecture/README.md)             | Authorization sequence, relational model, invocation states. |
| [Policy model](docs/architecture/POLICY_MODEL.md)       | Rule matching and policy semantics.                          |
| [API contract](docs/API.md)                             | Authentication, transport, versioning, behavior.             |
| [Threat model](docs/security/THREAT_MODEL.md)           | Trust boundaries, mitigations, operational limits.           |
| [Engineering decisions](ENGINEERING_DECISIONS.md)       | OPA, persistence, transactions, gateway boundary.            |
| [Verification](docs/evaluation/VERIFICATION.md)         | Executed checks and limits.                                  |
| [Benchmark methodology](docs/evaluation/METHODOLOGY.md) | Measurement setup and interpretation.                        |
| [Deployment guide](docs/deployment/README.md)           | Build, proxy, persistence, production preparation.           |
