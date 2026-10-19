package agentfence
import rego.v1

matches contains r if {
  some r in input.rules
  r.tool in ["*", input.tool]
  r.operation in ["*", input.operation]
  r.agentId in ["*", input.agentId]
  r.environment in ["*", input.environment]
  r.classification in ["*", input.classification]
  input.amount >= r.minAmount
  input.amount <= r.maxAmount
  input.hour >= r.startHour
  input.hour < r.endHour
}
denies := [r | some r in matches; r.effect == "DENY"]
approvals := [r | some r in matches; r.effect == "APPROVAL"]
permits := [r | some r in matches; r.effect == "PERMIT"]
default effect := "DENY"
effect := "DENY" if {count(denies) > 0}
effect := "APPROVAL" if {count(denies) == 0; count(approvals) > 0}
effect := "PERMIT" if {count(denies) == 0; count(approvals) == 0; count(permits) > 0}
decision := {"effect": effect, "matchedRules": [r.id | some r in matches], "explanations": [r.explanation | some r in matches], "codes": [code]} if {
  code := concat("", ["POLICY_",effect])
}
