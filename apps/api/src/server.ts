import { app, logger } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
const server = app.listen(config.API_PORT, "0.0.0.0", () =>
  logger.info({ port: config.API_PORT }, "AgentFence API listening"),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
