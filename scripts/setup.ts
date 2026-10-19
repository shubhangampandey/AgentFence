import { mkdir, writeFile, access, chmod, rename } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
await mkdir(".local", { recursive: true });
try {
  await access(".env");
  console.log("Keeping existing .env");
} catch {
  await writeFile(
    ".env",
    `NODE_ENV=development\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres\nDATABASE_POOL_SIZE=1\nOPA_URL=http://127.0.0.1:8181\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nAUDIT_SIGNING_KEY=${randomBytes(32).toString("hex")}\nWEB_ORIGIN=http://localhost:5173\nAPI_PORT=4000\nDEMO_ENABLED=true\nDEMO_PASSWORD=${randomBytes(16).toString("base64url")}\nGEMINI_ENABLED=false\n`,
  );
  console.log("Generated .env with random local secrets.");
}
const binary = resolve(
  ".local",
  process.platform === "win32" ? "opa.exe" : "opa",
);
try {
  const version = execFileSync(binary, ["version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (!version.includes("Version: 1.21.2"))
    throw new Error("Updating pinned OPA");
  console.log("OPA 1.21.2 already installed");
} catch {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const file = `opa_${platform}_${arch}${platform === "windows" ? ".exe" : platform === "linux" ? "_static" : ""}`;
  const url = `https://github.com/open-policy-agent/opa/releases/download/v1.21.2/${file}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
  if (!response.ok) throw new Error(`OPA download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksumResponse = await fetch(url + ".sha256", {
    signal: AbortSignal.timeout(30000),
  });
  if (!checksumResponse.ok) throw new Error("OPA checksum download failed");
  const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("OPA checksum mismatch");
  await writeFile(binary + ".download", bytes);
  await rename(binary + ".download", binary);
  await chmod(binary, 0o755);
  console.log("Installed checksum-verified OPA v1.21.2");
}
