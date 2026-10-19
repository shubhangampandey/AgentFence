# Deterministic policy model

The backend posts `{input:{rules,tool,operation,agentId,environment,classification,amount,hour}}` to OPA's `/v1/data/agentfence/decision`. Rules come from the workspace's active version; identity/environment come from the server's agent record; classification comes from the actual workspace resource; amount is a schema-validated integer USD amount; hour is current UTC server time. Untrusted intent is not included.

Each rule has an ID/name, `PERMIT|DENY|APPROVAL` effect, tool/operation selector, agent/environment selector, classification, inclusive amount bounds, half-open UTC hour bounds, display priority, and explanation. Selectors use exact strings or `*`; regular expressions and executable code are not supported. All rule conditions must match.

| Matching effects                                                                      | Decision |
| ------------------------------------------------------------------------------------- | -------- |
| Any DENY                                                                              | DENY     |
| No DENY, at least one APPROVAL                                                        | APPROVAL |
| No DENY or APPROVAL, at least one PERMIT                                              | PERMIT   |
| No matching rules                                                                     | DENY     |
| Missing active version, timeout, network/HTTP failure, undefined/malformed OPA output | DENY     |

The decision contract is `{effect,matchedRules,explanations,codes}` and is validated before use. The gateway enforces capabilities first, so a policy permit never creates a missing grant. The final execution recheck uses the same contract and cannot accept a browser or model verdict.

The overlap analyzer compares rule pairs for shared wildcard/exact selectors, intersecting classification/agent/environment, overlapping inclusive amount bounds, and overlapping UTC hours. Opposite effects are shown for review. These overlaps can be intentional (for example a broad permit constrained by a confidential-data deny); enforcement always applies fixed deny/approval/permit precedence. Numeric priority never changes this precedence.

Drafts are immutable versioned rule bundles. Simulation compares actual OPA decisions for the active and candidate versions against six deterministic fixture requests plus up to 100 recent stored invocations. It labels changed outcomes and deny-to-non-deny expansions. It does not predict unsampled traffic or changes to capability grants. Publishing is transactional and records an audit event; a database partial unique index enforces a single active version.

To roll back, copy a previous version as a new draft, simulate, and publish, or republish a previously validated version. Review execution checks the current policy's version and publication timestamp against the invocation so even republishing the same version invalidates an older pending preview.
