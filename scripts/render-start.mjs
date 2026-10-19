import { spawn } from "node:child_process";
import { resolve } from "node:path";
import express from "express";

process.env.API_PORT = process.env.PORT || process.env.API_PORT || "4000";
process.env.OPA_URL = "http://127.0.0.1:8181";
if (!process.env.DATABASE_URL || !process.env.DEMO_PASSWORD)
  throw new Error("Configure DATABASE_URL and DEMO_PASSWORD before starting");
const policy = spawn(
  resolve(".render-bin/opa"),
  ["run", "--server", "--addr=127.0.0.1:8181", "infrastructure/opa"],
  { stdio: "inherit" },
);
let closing = false;
let server;
let database;
function stop(exitCode = 0) {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  const finish = async () => {
    policy.kill("SIGTERM");
    await database?.$disconnect();
    process.exit(exitCode);
  };
  if (server) server.close(() => void finish());
  else void finish();
}
policy.on("error", () => stop(1));
policy.on("exit", () => {
  if (!closing) stop(1);
});
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    ready = await fetch(`${process.env.OPA_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    })
      .then((result) => result.ok)
      .catch(() => false);
    if (ready) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!ready) throw new Error("OPA failed its startup health check");
  const migrate = spawn(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "inherit" },
  );
  await new Promise((done, reject) => {
    migrate.on("error", reject);
    migrate.on("exit", (code) =>
      code === 0 ? done() : reject(new Error("Database migration failed")),
    );
  });
  const seed = spawn(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    stdio: "inherit",
  });
  await new Promise((done, reject) => {
    seed.on("error", reject);
    seed.on("exit", (code) =>
      code === 0 ? done() : reject(new Error("Workspace bootstrap failed")),
    );
  });
  const { app } = await import("../dist/server/apps/api/src/app.js");
  const { db } = await import("../dist/server/apps/api/src/db.js");
  database = db;
  app.use(express.static(resolve("dist/web")));
  app.get("/{*path}", (_request, response) =>
    response.sendFile(resolve("dist/web/index.html")),
  );
  server = app.listen(Number(process.env.API_PORT), "0.0.0.0", () =>
    console.log(
      "AgentFence is listening with local OPA and managed PostgreSQL",
    ),
  );
  server.on("error", () => stop(1));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Startup failed");
  stop(1);
}
