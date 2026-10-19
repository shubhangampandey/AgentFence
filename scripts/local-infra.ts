import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const pg = await PGlite.create(resolve(".local/postgres"));
const server = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: Number(process.env.LOCAL_DB_PORT ?? 5433),
});
await server.start();
const opa = spawn(
  resolve(".local", process.platform === "win32" ? "opa.exe" : "opa"),
  [
    "run",
    "--server",
    `--addr=127.0.0.1:${process.env.LOCAL_OPA_PORT ?? 8181}`,
    "infrastructure/opa",
  ],
  { stdio: "inherit", windowsHide: true },
);
opa.on("error", (e) => {
  console.error("OPA startup failed", e.message);
  process.exitCode = 1;
});
console.log(
  `Local PostgreSQL (PGlite) :${process.env.LOCAL_DB_PORT ?? 5433} and OPA :${process.env.LOCAL_OPA_PORT ?? 8181}. Development only. Set DATABASE_POOL_SIZE=1 for PGlite.`,
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  opa.kill();
  await server.stop();
  await pg.close();
  process.exit();
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
