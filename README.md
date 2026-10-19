# AgentFence

**Every action. Verified.** A security control plane for enterprise AI agents, with a real deterministic execution gateway and a synthetic Northstar Labs workspace.

AgentFence puts Express, PostgreSQL transactions, scoped machine identities, and Open Policy Agent between an agent and its tools. React is an operator interface; neither the browser nor an AI model authorizes execution. All money, customer records, and documents in this repository are fictional.

![AgentFence operator workspace](docs/screenshots/overview-production.png)

## Run locally

Requires Node 22.12+ (validated with Node 24.21), pnpm, and either Docker or the included development fallback. Dependencies are pinned in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm run setup
```

`setup` generates an ignored `.env` with random local secrets and a random demo password, and downloads the official pinned OPA binary. It preserves an existing `.env`. Read the generated configuration locally; never commit it.

**Without Docker:**

```sh
# Terminal 1: persistent PGlite PostgreSQL + official OPA process
pnpm infra:local

# Terminal 2
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [AgentFence locally](http://localhost:5173). The API listens on port 4000. Use `localhost` in the browser because CSRF checks require the configured `WEB_ORIGIN` exactly. The fallback database listens on loopback port 5433 and is **development only**, without production access controls.

**With Docker:** after `pnpm run setup`, set `DATABASE_URL=postgresql://agentfence:<your-password>@localhost:5432/agentfence` and `POSTGRES_PASSWORD=<your-password>`, `DATABASE_POOL_SIZE=10` in `.env`, then:

```sh
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Do not run both infrastructure options on the same OPA port. A native PostgreSQL instance also works: provide its URL and start OPA with `.local/opa run --server --addr=127.0.0.1:8181 infrastructure/opa` (`.local\opa.exe` on Windows).

## First visit

For optional Gemini explanations, set `GEMINI_ENABLED=true`, `GEMINI_API_KEY`,
and `GEMINI_MODEL=gemini-3.5-flash-lite` in the ignored backend `.env`, then
restart the API. Open an invocation's evidence and choose **I consent — explain
with Gemini**. A successful response shows **Source: gemini**; if Google is
unavailable, the recorded explanation remains available with an explicit notice.
The key stays on the backend. Model access depends on the Google project.

The non-production demo login offers Security Operator, Approver, and Auditor roles. Each is a real session with server-enforced permissions. Demo access requires `DEMO_ENABLED=true`; production startup rejects this setting. Local accounts are `operator@northstar.example`, `approver@northstar.example`, `auditor@northstar.example`, and `owner@northstar.example`. Their initial password is the random `DEMO_PASSWORD` in `.env`; there is no committed default password.

An operator can register agents and author policies. An approver can review requests, but cannot author policy or manage agents. An owner or administrator can manage workspace profile and existing members' roles. A new agent has no credentials and no capabilities until explicitly granted.

## Five demonstrations

1. **Authorized lookup:** Gateway playground → Authorized customer lookup → Evaluate preview → Execute request. Inspect backend stage durations, matched OPA rules, connector output, and signed evidence.
2. **Prompt injection / denied export:** choose Bulk extraction blocked or Untrusted intent cannot grant access. The same gateway denies the operation without executing a connector.
3. **Human review:** choose Independent human approval. Submit the USD 2,400 synthetic payment. Sign in through Approver access, open Approval center, review the before/after diff, then approve. The record and authorization are checked again. Repeating execution with the same key returns the original result.
4. **Policy impact:** Policies → Create policy draft. Add a deny rule for `crm / customer.read`. Save, simulate real active/candidate OPA evaluations, inspect changes, and publish. Future lookup requests are denied. Copy a previous version to a new draft to prepare a rollback; simulate before publication.
5. **Reproducible adversarial evaluation:** Security Lab → Run security evaluation. Inspect isolated gateway experiments and export their evidence. Investigations → Verify audit chain checks every event. The automated security suite performs controlled audit tampering outside normal demo data.

Payments settle a synthetic invoice. To repeat after settlement, use the explicitly local reset command `pnpm demo:reset`. It resets only the fixed Northstar workspace, including its invocations and evidence, and preserves other workspaces. Never use it on evidence you need to retain. It is rejected in production. Re-run `pnpm db:seed` after reset if you want the sample pending payment request.

## Workspace structure

```text
apps/api/src/       Express transport, sessions, gateway, connectors, policy, audit, lab
apps/web/src/       React workspace, public pages, responsive monochrome UI
packages/shared/   Zod contracts and role matrix
packages/sdk/      TypeScript machine client
prisma/            PostgreSQL model, versioned SQL migration, deterministic fixture
infrastructure/    OPA Rego, Dockerfiles, nginx config
scripts/           local setup, development infrastructure, benchmark, reset, SDK example
tests/security/    real PostgreSQL/OPA and Supertest regression suite
tests/e2e/         Playwright desktop/mobile acceptance tests
docs/              architecture, threat model, deployment, evaluation results
```

There is no unnecessary worker, Redis service, or placeholder package. Synthetic operations are short database transactions and need no external job queue. Rate limiting is process-local; distributed deployments need a shared store.

## Configuration

| Variable                         | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                   | PostgreSQL URL; use a least-privilege application role in production |
| `DATABASE_POOL_SIZE`             | 1 for the PGlite fallback; 10 is the default for native PostgreSQL   |
| `OPA_URL`                        | Private OPA origin, never agent-controlled                           |
| `SESSION_SECRET`                 | At least 32 random characters; binds session CSRF tokens             |
| `AUDIT_SIGNING_KEY`              | Separate random HMAC key, at least 32 characters                     |
| `WEB_ORIGIN`                     | Exact browser origin; HTTPS required in production                   |
| `API_PORT`                       | API bind port, default 4000                                          |
| `NODE_ENV`                       | development, test, or production                                     |
| `DEMO_ENABLED`                   | Explicit non-production demo access; defaults false                  |
| `DEMO_PASSWORD`                  | Local seed password, minimum 12 characters; generated by setup       |
| `POSTGRES_PASSWORD`              | Docker-only local PostgreSQL password                                |
| `GEMINI_ENABLED`                 | Optional backend explanations; defaults false                        |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Required only when Gemini is enabled; no guessed default model       |

There is no encryption key setting because this implementation stores only credential hashes and does not implement a reversible credential vault. Do not add unused secrets. `SESSION_SECRET` and the audit key must be distinct; retain the audit key securely for verification. Key rotation and external checkpoints require further work.

## Developer API

Machine clients call `POST /api/v1/invoke` using a scoped bearer credential. Cookies are for humans. Public [OpenAPI JSON](http://localhost:4000/api/openapi.json) derives gateway and policy schemas from the actual Zod contracts; `docs/API.md` explains workspace routes and error behavior.

```ts
import { AgentFenceClient } from "@agentfence/sdk";

const fence = new AgentFenceClient({
  baseUrl: process.env.AGENTFENCE_URL!,
  apiKey: process.env.AGENTFENCE_AGENT_KEY!,
});
const result = await fence.invoke({
  tool: "crm",
  operation: "customer.read",
  arguments: { customerId: "customer_001" },
  idempotencyKey: "customer-lookup-001",
});
```

`pnpm exec tsx scripts/example-agent.ts` runs against the actual API after you issue and scope a credential. The workspace package builds to distributable ESM and TypeScript declarations in `packages/sdk/dist`; it has not been published to npm. The client handles expected denials/approval requirements as typed results, bounded transport retries with the same payload/key, timeouts, and typed API errors.

## Verification

Keep PostgreSQL and OPA running:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:compiled
pnpm exec playwright install chromium
pnpm test:e2e
pnpm benchmark
```

Run Rego tests with `.local/opa test infrastructure/opa -v` (Windows: `.local\opa.exe test infrastructure/opa -v`). Browser tests require the seeded demo and reset the **synthetic invoice_002** fixture between desktop/mobile runs. They preserve the reset event in the audit chain. Do not point tests at a production database. Tests create isolated `test_*` workspaces; benchmarks create `bench_*` workspaces.

Benchmark results are actual measurements in `docs/evaluation/benchmark-results.json`, with sample sizes, hardware, database version, methodology, p50/p95/p99, errors, and throughput. They are not advertised as production capacity. The verification report distinguishes executed checks from prepared-only deployment configuration.

## Build and deploy

`pnpm build` produces `dist/web` and the compiled backend under `dist/server`. After migration and provisioning, `pnpm start` runs the compiled API. `pnpm dev` uses source watchers. Deploy the frontend with its same-origin `/api` reverse proxy and set `WEB_ORIGIN` to the exact HTTPS origin. See `docs/deployment/README.md` for Docker and separate-host deployment details. No external deployment is claimed.

## Security boundaries and limits

The gateway is authoritative; default deny, deny overrides permit, bounded schemas, classification/resource grants, credential expiry, payload-bound approval, tenant scoping, transactional idempotency, and signed audit links are implemented and tested. See `docs/security/THREAT_MODEL.md` and `ENGINEERING_DECISIONS.md` for explicit assumptions.

This is a production-oriented portfolio implementation, **not a certified or production-hardened enterprise service**. It supports only synthetic connectors. Missing enterprise features include SSO/MFA, account invitations/recovery, external identity provisioning, immutable offsite audit checkpoints, signing-key rotation, distributed rate limits, advanced policy groups, arbitrary external connector reliability, and comprehensive retention automation. Existing versions can be republished or copied to a new draft; this is not a full multi-policy bundle system. Gemini explains stored decisions only; policy suggestion and automated remediation are not implemented. The UI currently requests deterministic explanations; explicit consent is required at the API before a configured Gemini request. Connector configuration is server-side; the UI inspects the allowlist. The investigation UI offers invocation search/status/tool/agent views; complete user/policy/date filtering remains API-level or future UI scope. Live stage streaming is not implemented: traces are measured backend records, and SSE provides refresh notifications when the persisted audit head changes.

On Windows, if the downloaded Chromium cannot start, set `PLAYWRIGHT_CHANNEL=chrome` in the shell before `pnpm test:e2e`. Browser tests require a completed production build because they also start the compiled frontend preview on port 4173.
#   A g e n t F e n c e - c v P r o j e c t  
 