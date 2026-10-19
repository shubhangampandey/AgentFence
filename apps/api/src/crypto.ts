import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const digest = (value: unknown) => hash(canonical(value));
export const sign = (value: string, key: string) =>
  createHmac("sha256", key).update(value).digest("hex");
export function equal(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function redact(value: unknown): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string")
    return value.replace(
      /af_[A-Za-z0-9_-]{43}|Bearer\s+[A-Za-z0-9._-]{16,}|AIza[A-Za-z0-9_-]{30,}/g,
      "[REDACTED]",
    );
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /password|secret|credential|token|email|content|account|note|intent/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
