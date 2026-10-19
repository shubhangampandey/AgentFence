import { mkdir, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const version = "1.21.2";
const binary = "opa_linux_amd64_static";
const url = `https://github.com/open-policy-agent/opa/releases/download/v${version}/${binary}`;
const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
if (!response.ok) throw new Error(`OPA download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const checksumResponse = await fetch(`${url}.sha256`, {
  signal: AbortSignal.timeout(30000),
});
if (!checksumResponse.ok) throw new Error("OPA checksum download failed");
const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
if (createHash("sha256").update(bytes).digest("hex") !== expected)
  throw new Error("OPA checksum mismatch");
await mkdir(".render-bin", { recursive: true });
await writeFile(".render-bin/opa", bytes);
await chmod(".render-bin/opa", 0o755);
for (const args of [["db:generate"], ["build"]]) {
  execFileSync("pnpm", args, { stdio: "inherit" });
}
