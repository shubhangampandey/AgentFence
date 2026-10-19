package agentfence_test
import rego.v1
import data.agentfence
base := {"tool":"crm","operation":"customer.read","agentId":"support","environment":"sandbox","classification":"internal","amount":0,"hour":12,"rules":[]}
rule := {"id":"r","effect":"PERMIT","tool":"crm","operation":"*","agentId":"*","environment":"*","classification":"*","minAmount":0,"maxAmount":10000,"startHour":0,"endHour":24,"priority":100,"explanation":"Scoped read"}
test_default_deny if {agentfence.decision.effect == "DENY" with input as base}
test_explicit_permit if {agentfence.decision.effect == "PERMIT" with input as object.union(base,{"rules":[rule]})}
test_deny_overrides if {deny := object.union(rule,{"id":"deny","effect":"DENY"}); agentfence.decision.effect == "DENY" with input as object.union(base,{"rules":[rule,deny]})}
test_approval_overrides_permit if {approval := object.union(rule,{"id":"approval","effect":"APPROVAL"}); agentfence.decision.effect == "APPROVAL" with input as object.union(base,{"rules":[rule,approval]})}
test_environment_scope if {agentfence.decision.effect == "DENY" with input as object.union(base,{"rules":[object.union(rule,{"environment":"production"})]})}
test_utc_time_scope if {agentfence.decision.effect == "DENY" with input as object.union(base,{"hour":23,"rules":[object.union(rule,{"endHour":18})]})}
