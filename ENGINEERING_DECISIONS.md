# Engineering decisions

## Why OPA

Authorization must be deterministic, inspectable, testable without an LLM, and separate from tool execution. Structured rule JSON is validated through Zod, and a fixed Rego module evaluates trusted resource and identity attributes. Users cannot execute Rego, JavaScript, SQL, or generated code. All matching denies override approvals, which override permits. Numeric priority affects presentation; it never lets a permit outrank a deny. Missing policy, missing result, malformed output, non-2xx response, or timeout denies execution.

Rule matching includes exact tool/operation, agent, environment, classification, integer USD amount, and UTC hour bounds. There are no inferred privileges from the agent's stated intent. Policies are whole-workspace versioned rule bundles. Draft simulation runs actual OPA evaluations on deterministic fixtures plus up to 100 recent invocations. A successful evaluation marks the immutable version validated; publication rechecks OPA availability. A partial unique PostgreSQL index prevents two active versions per workspace.

## Why PostgreSQL and Prisma

The core domain requires transactional record updates and database-enforced idempotency. Prisma 7 with its matching node-postgres driver adapter supplies typed database access and versioned SQL migrations. Invocation, agent, membership, and audit records have workspace foreign keys and indexes; synthetic resources are typed by connector/kind and validated at the boundary. JSON stores variable connector payloads and structured rules, while relational identity and unique constraints carry the important integrity boundaries. This is a deliberate compact schema, not dozens of empty enterprise tables.

## Why the gateway is authoritative

The only executable connector entry is the internal connector function called by the gateway service. Both bearer-authenticated machine invocations and session-authenticated playground invocations use it. The frontend cannot set approved/authorized/role/risk/policy fields. It can select a workspace-owned agent only with invocation permission. Resource reads always resolve workspace and tool before data is returned. Collection operations apply both resource IDs and classification limits.

## Approval is separate from authorization

Approval is a human decision about a particular stored operation, not a reusable bearer permission. Invocation arguments are canonicalized and SHA-256 hashed. A review submits only action and expected hash, and cannot replace arguments. A current workspace member with approval permission is checked inside the transaction. Initiating humans cannot approve their own request. Every approved request rechecks credential expiry/revocation, agent suspension, grants, resource version, active policy, and policy version. Changed resources or published policy versions require a new invocation and preview. Approval expires after 15 minutes and has no transferable token.

## Replay and concurrency

`UNIQUE(workspaceId, agentId, idempotencyKey)` binds a key to one payload. Reusing it with identical tool/operation/arguments returns the original invocation, including after an approval. Substituting arguments returns 409. Repeating approval after a terminal transition returns 409.

The application locks the workspace row with `SELECT FOR UPDATE` for security mutations, invocations, reviews, and evidence appends. This intentionally simple design serializes same-workspace work across API processes on real PostgreSQL. Connector writes, invocation status, and audit events commit together. Independent workspaces can execute concurrently. OPA calls have a two-second timeout; database transactions have bounded wait/runtime. The lock is deliberately coarse and limits throughput; the benchmark exposes that cost. External systems cannot participate in this database transaction and are not implemented. We do not claim exactly-once external execution. An external connector would need an outbox, downstream idempotency, durable attempt states, reconciliation, and an explicit unknown-outcome state.

## Audit integrity

Each event includes a workspace sequence, previous hash, canonical redacted body, SHA-256 hash, and HMAC-SHA256 signature. The locked workspace stores the current sequence/head. A verifier checks sequence continuity, every hash/signature, and the stored tail. An edited record, missing entry, or truncation relative to this head is detected. Normal synthetic side effects and their evidence share a transaction.

This is tamper-evident relative to a trusted current head and signing key. It is not immutable storage. A complete snapshot rollback including the head, application/key compromise, deletion of the entire workspace, or a trusted service intentionally forging new events exceeds the implemented guarantee. No externally witnessed checkpoints are claimed. A future deployment should periodically anchor signed heads to independent write-once storage.

## Sessions and roles

Humans use random server-managed sessions; only session hashes are stored. Passwords use Argon2id. HttpOnly, SameSite=Strict cookies become Secure in production. Mutations require a session-bound CSRF token and the exact configured Origin. Current membership is loaded server-side. Roles are an explicit matrix: approvers can read/review but cannot manage agents or policy; auditors and viewers read; security operators can manage agents, invoke, author policy, and run the lab; administrators/owners additionally manage members and settings. Owners and self-role changes are protected. SSO, MFA, recovery, invitations, and selecting among memberships are future work.

Machine credentials are 256-bit random secrets stored as SHA-256 hashes (high entropy makes password-style hashing unnecessary); default lifetime is 24 hours, maximum 24 hours. Capabilities default to zero access, expire, bind tools/operations/environment/classification/resource IDs, and can set a quantitative per-invocation ceiling. They are not cumulative spending budgets. Rotation revokes prior credentials in the same locked transaction.

## Tenant isolation

Session workspace comes from server session state and current membership. Machine workspace comes from the credential's agent. No request-body workspace can override either. Every resource/invocation/policy/membership lookup includes that trusted workspace. Cross-workspace agent selection is rejected. Database row-level security is not implemented; application scoping and regression tests are the current boundary. Add RLS and role separation for defense in depth.

## Gemini cannot decide

Optional Gen AI calls receive only a redacted stored decision after an explicit consent boolean. Output is bounded and validated. A deadline returns deterministic fallback explanations. No generated content enters the authorization path, changes policy, executes a tool, or approves a request. No model identifier is guessed: enabling integration requires an explicit server model configuration. Policy suggestions and finding remediation generation are not implemented.

## Deliberate omissions and further hardening

Redis and workers would add complexity without making atomic synthetic execution more reliable. Their absence is appropriate here, but process-local rate limits do not protect a distributed fleet. SSE emits refresh hints, not fake execution-stage events; the interface displays actual recorded stage timing.

For deployment: use least-privilege DB roles, network isolation and authenticated/mTLS OPA access, pinned image digests, a trusted TLS proxy, secure secret management, shared rate limiting, per-user quotas, short session lifetimes, session administration, external audit anchoring, backup/restore drills, retention policies, dependency scanning, broader browser/accessibility coverage, load testing, and independent penetration testing. Docker configuration and CI are prepared; only checks reported in the verification report were actually executed.

PGlite uses a single database connection (DATABASE_POOL_SIZE=1). Its socket multiplexer is a local development aid and is not a substitute for PostgreSQL concurrency guarantees. The same regression suite was run against native PostgreSQL and the fallback.

Technical references: [Prisma client setup](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction), [OPA policy language](https://www.openpolicyagent.org/docs/policy-language), [Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting).
