import "dotenv/config";
import { AgentFenceClient } from "../packages/sdk/src/index.js";
if (!process.env.AGENTFENCE_AGENT_KEY)
  throw new Error(
    "Issue a scoped credential in Agents and set AGENTFENCE_AGENT_KEY",
  );
const client = new AgentFenceClient({
  baseUrl: process.env.AGENTFENCE_URL ?? "http://localhost:4000",
  apiKey: process.env.AGENTFENCE_AGENT_KEY,
});
const result = await client.invoke({
  tool: "crm",
  operation: "customer.read",
  arguments: { customerId: "customer_001" },
  idempotencyKey: "example-" + crypto.randomUUID(),
});
console.log(JSON.stringify(result, null, 2));
