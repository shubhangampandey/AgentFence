# Verification report

Executed locally on 17 October 2026. This report describes observed results, not certification or a claim of an external deployment.

| Check                                        | Result                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Frozen dependency installation               | Passed; exact package versions and lockfile retained                                                   |
| Prisma schema validation / migration status  | Passed; versioned SQL applied to native PostgreSQL 18.6 and the PGlite fallback                        |
| Deterministic Northstar seed                 | Passed on both database paths                                                                          |
| Demo reset and re-seed                       | Passed; fixed workspace scope, production guard, unrelated workspaces preserved                        |
| TypeScript strict checking                   | Passed                                                                                                 |
| ESLint, including after SDK generation       | Passed; generated output excluded                                                                      |
| React production build                       | Passed; largest JavaScript chunk approximately 207 kB, graph loaded separately                         |
| Production frontend rendering                | Passed at desktop/mobile widths, including the lazy decision graph                                     |
| Compiled backend and SDK build               | Passed; SDK ESM and declarations generated and local package archive created                           |
| Native PostgreSQL regression suite           | 31 tests passed                                                                                        |
| PGlite development fallback regression suite | 31 tests passed with `DATABASE_POOL_SIZE=1`                                                            |
| Real OPA Rego tests                          | 6 tests passed on OPA 1.21.2                                                                           |
| Playwright desktop and mobile                | 4 tests passed using installed Chrome, approximately 24 seconds total                                  |
| Compiled API + built SDK local smoke         | Passed readiness, successful read, idempotent replay, and denied export                                |
| Benchmark                                    | Completed; eight measured cases, zero recorded errors; JSON artifact includes sample sizes/environment |
| Public cloud deployment                      | Not attempted                                                                                          |
| Docker builds / Compose execution            | Prepared only; Docker is not installed on this host                                                    |
| Remote CI workflow                           | Prepared; not executed on GitHub                                                                       |
| Live Gemini request                          | Not executed; no API key/model configured                                                              |

## What the automated tests actually cover

Mandatory acceptance cases A–J are implemented in `tests/security/gateway.test.ts`: authorized read with evidence, denied bulk export with no connector output, independent approved payment, expired credentials, untrusted prompt intent, concurrent replay prevention, workspace isolation through machine/service and human APIs, real policy simulation/publication, operation without Gemini, and audit tampering detection.

Additional cases cover competing reviewers, argument substitution, stale invoice version, expired/single-use approvals, credential and capability revocation after approval, policy publication after preview, stored argument tampering, OPA outage and malformed response, default deny and deny precedence, quantitative limits, scoped collection output, unknown operations/URL fields/forged client authorization, CSRF, hostile Origin, expired sessions, hashed credentials, role restrictions, canonical serialization, preserved redacted timestamps, signed-tail truncation, SDK denial/authentication handling, OpenAPI contract shape, and a real isolated 14-experiment Security Lab run.

The browser workflow visits public landing/login, signs in as operator, previews without execution, executes a CRM lookup, blocks export, queues a synthetic payment, verifies audit evidence, types in the command palette, opens/closes a registration modal with Escape, visits every major workspace route, checks horizontal overflow, then signs in as an independent approver and completes the payment. It checks uncaught page errors. The same workflow runs at desktop and iPhone-sized widths in Chromium through installed Chrome. A separate browser case exercises the built frontend bundle and dynamically loaded decision graph. It is not a complete WCAG audit, Safari/iOS engine test, or exhaustive policy-editor browser suite.

## Defects found and resolved

- Prisma's registry `latest` CLI tag resolved to a prerelease; the CLI/client/adapter were aligned to stable 7.10.1 and all dependencies pinned.
- Concurrent sockets through PGlite's development multiplexer failed; the fallback now explicitly uses a single application pool connection. Native PostgreSQL retains the default pool of ten.
- Mobile content had horizontal overflow from an absolutely positioned screen-reader label; its containing position was corrected.
- A short mobile viewport could not scroll to the last sidebar items; navigation now has its own bounded scroll area and is hidden from focus while closed.
- Modal focus handling could reset while typing in the command palette; a stable close reference and mount-only focus trap now preserve input focus.
- Recursive evidence redaction converted Date instances into empty objects; dates are now serialized to ISO strings, with a regression assertion and a browser check for invalid dates.
- Transient local Windows socket denials interrupted read queries and browser runs. Read-only API queries now have bounded retries, session dependency failures preserve the existing workspace instead of incorrectly redirecting to login, and the development proxy reuses bounded connections. Authorization/connector failures still cannot allow execution.
- Generated SDK artifacts initially entered the source lint set; generated directories are now explicitly excluded.

- Production chunk splitting exposed a vendor-module initialization error; preserving source execution order fixed it. Built-bundle browser tests now cover it.
- A final authorization response could arrive after a short-lived credential or approval expired; identity, grant, approval time, and UTC hour are now checked again immediately before connector execution, with an explicit regression.

## Environment limitations and exact browser command

The downloaded Chromium executable initially failed to launch on this Windows host (`spawn UNKNOWN`). Installed Chrome was used successfully:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
pnpm test:e2e
```

The default project channel remains downloaded Chromium for portable environments/CI after `pnpm exec playwright install chromium`. No system firewall/security settings were changed.

Automatic approval review rejected an attempted production-mode local launch with `blocked by policy`. A safer loopback-only in-process smoke test against the compiled API and compiled SDK succeeded. HTTPS ingress, production cookies, Docker images, and a hosted deployment have not been exercised here.

OPA 1.21.2 was downloaded from the official release and verified against its published SHA-256 checksum. The benchmark was rerun against this version. Sample sizes are 50 for ordinary cases and 10 for full verification/concurrent batches. The recorded permitted gateway p50/p95 are 19.202/21.333 ms on this host; these are local measurements, not capacity promises. Consult the JSON artifact and methodology for all cases and limitations.

## Remaining scope

The deterministic platform is functional. Remaining enterprise/optional scope includes SSO/MFA, invitations/recovery and account lifecycle, workspace switching, advanced policy groups and multi-bundle management, externally witnessed audit checkpoints/key rotation, distributed limits/queues, external connector outcomes, retention automation, live per-stage streaming, AI policy suggestions/remediation, and an actual deployment. Gemini's backend decision explanation adapter compiles, requires explicit consent, and falls back safely; its live provider behavior is unverified.
