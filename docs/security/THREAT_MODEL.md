# Threat model

## Assets and trust boundaries

Protect workspace records, credential material, policy authority, human review integrity, and evidence continuity. Agents and their intent/arguments are untrusted. Browsers are untrusted. OPA and the gateway service are trusted authorization dependencies. PostgreSQL is the trusted transactional persistence boundary; signing keys are trusted independently of ordinary record editors.

Only synthetic domain objects are executed. The product has no network-capable connector, arbitrary URL fetch, shell connector, unrestricted SQL tool, or production finance integration. All API and database administrators are outside the protection offered by ordinary RBAC.

| Threat                                         | Implemented boundary                                                                       | Verification                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Broken access control / IDOR / tenant crossing | Server-derived workspace, scoped resource queries, current memberships                     | Machine and human cross-workspace tests                        |
| Excessive agency / prompt injection            | Structured arguments, scoped grants, fixed deterministic Rego                              | Injection and export rejection tests                           |
| Approval bypass / substitution                 | Exact payload hash, stored arguments, RBAC, independent reviewer                           | Payload mutation, self-review, operator denial tests           |
| Replay / racing reviewers                      | Workspace row lock, unique idempotency binding, terminal transition checks                 | Concurrent synthetic payments and reviews                      |
| Stale previews                                 | Resource version and published policy version checked again                                | Invoice mutation test and policy review invalidation           |
| Credential leakage                             | High-entropy credential hashes; once-only issuance; logger excludes bodies and credentials | Stored hash test, exported evidence redaction                  |
| Revocation / expiry                            | Credential and grant expiry checked at invocation and after review                         | Expired and revoked identity/grant tests                       |
| Indeterminate authorization                    | Strict OPA response schema and timeout; fail closed                                        | Outage and malformed output tests                              |
| CSRF / session abuse                           | Session-bound token, exact Origin, SameSite Strict, expiry                                 | CSRF, hostile origin, expired-session tests                    |
| XSS / injection                                | React escaped text, bounded Zod schemas, Prisma parameters, no HTML injection              | Argument allowlist regression; no full XSS scanner claim       |
| SSRF / arbitrary code                          | No dynamic connector addresses or code execution                                           | Unknown operation and URL-field rejection                      |
| Log editing / missing evidence                 | Canonical SHA-256 chain, HMAC signatures, atomic sequencing/head                           | Record alteration and truncated-tail tests                     |
| Abuse                                          | Request/body limits, login and API rate limits, lab quota                                  | Configuration and manual review; distributed abuse not claimed |

## Known limits

Full application/signing-key compromise, full DB snapshot rollback, host compromise, malicious OPA admin, compromised dependencies, browser extensions, side channels, and denial of service are not prevented by this implementation. OPA must remain private and is unauthenticated in loopback-only development. PostgreSQL app queries implement tenant isolation; RLS is not yet enabled. Rate limits are memory-local and Express proxy trust is deliberately disabled until an operator defines a trusted ingress topology.

There is no MFA, SSO, password recovery, invitation workflow, session revocation console, distributed job runner, immutable external checkpoint, or automated cryptographic key rotation. Human sessions last eight hours; machine credentials default to 24 hours. Capabilities have per-request ceilings, not cumulative budgets. Evidence exports are bounded to the first 10,000 workspace events; use pagination/archive infrastructure for larger datasets.

Authentication failures for recognized credentials are recorded. Unknown credentials and schema failures have structured request errors, but not a fully persistent anonymous attack log. Connector exceptions roll back; no successful execution is claimed. Sensitive request text is omitted from audit records; internal persisted invocation arguments are required for approvals and need an operational data-retention policy.

Audit verification assumes a trusted current workspace head and signing key. Changing a signed event or deleting a tail while keeping the current head is detected. A privileged attacker who rolls back the entire DB including the head is not detected without external checkpoints. The service does not claim immutable evidence or exactly-once effects in external systems.

## Retention and operations

The demo reset deletes a whole fixed synthetic workspace and its evidence, so keep any needed exports first. Isolated lab, test, and benchmark workspaces remain for reproducibility. A deployed system needs scheduled, reviewed archival/retention for these workspaces and expired sessions, anchored audit heads, restore testing, and documented key custody. Never delete individual audit records as a retention mechanism; rotate/anchor complete chains instead.
