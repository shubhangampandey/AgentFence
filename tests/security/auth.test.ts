import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile } from "node:fs/promises";
import type { Express } from "express";

let app: Express;
let database: PGlite;
let server: PGLiteSocketServer;
let disconnect: () => Promise<void>;
const origin = "http://localhost:5173";
const originalEnvironment = { ...process.env };
const modifiedVariables = [
  "DATABASE_URL",
  "DATABASE_POOL_SIZE",
  "NODE_ENV",
  "WEB_ORIGIN",
  "SESSION_SECRET",
  "AUDIT_SIGNING_KEY",
  "GEMINI_ENABLED",
];
const account = {
  name: "Registration Test",
  email: "new-owner@example.test",
  password: "New-owner-passphrase-2026!",
};

beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(
    await readFile(
      "prisma/migrations/202610170001_initial/migration.sql",
      "utf8",
    ),
  );
  server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0 });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  process.env.DATABASE_POOL_SIZE = "1";
  process.env.NODE_ENV = "test";
  process.env.WEB_ORIGIN = origin;
  process.env.SESSION_SECRET = "test-only-session-secret-not-for-production";
  process.env.AUDIT_SIGNING_KEY = "test-only-audit-secret-not-for-production";
  process.env.GEMINI_ENABLED = "false";
  ({ app } = await import("../../apps/api/src/app.js"));
  const { db } = await import("../../apps/api/src/db.js");
  disconnect = () => db.$disconnect();
});
afterAll(async () => {
  await disconnect?.();
  await server?.stop();
  await database?.close();
  for (const name of modifiedVariables) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
});

describe("registration and credential sign-in", () => {
  it("returns an anonymous session without an expected console 401; protects private APIs", async () => {
    expect((await request(app).get("/api/auth/session")).body).toBeNull();
    expect((await request(app).get("/api/session")).status).toBe(401);
  });
  it("creates an isolated owner workspace, sets an HttpOnly cookie and supports logout and normalized login", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({ ...account, email: ` ${account.email.toUpperCase()} ` });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(account.email);
    expect(registered.body.user.role).toBe("OWNER");
    expect(registered.body.workspace.id).not.toBe("northstar");
    expect(registered.body.user.passwordHash).toBeUndefined();
    const cookie = registered.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    const session = await request(app)
      .get("/api/auth/session")
      .set("Cookie", cookie);
    expect(session.body.workspace.id).toBe(registered.body.workspace.id);
    expect(session.body.user.userId).toBe(registered.body.user.id);
    const stored = await database.query<{ passwordHash: string }>(
      'SELECT "passwordHash" FROM "User" WHERE email=$1',
      [account.email],
    );
    expect(stored.rows[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      (
        await request(app)
          .post("/api/auth/logout")
          .set("Cookie", cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", registered.body.csrfToken)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/auth/session").set("Cookie", cookie)).body,
    ).toBeNull();
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({
            email: ` ${account.email.toUpperCase()} `,
            password: account.password,
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ email: account.email, password: "incorrect" })
      ).status,
    ).toBe(401);
  });
  it("rejects duplicates, short passwords, injected roles, and foreign origins", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "http://127.0.0.1:5173")
          .send({ email: account.email, password: account.password })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "http://localhost:5174")
          .send({ email: account.email, password: account.password })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .set("Origin", origin)
          .send(account)
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ ...account, password: "short" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ ...account, role: "ADMIN" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .set("Origin", "https://evil.example")
          .send(account)
      ).status,
    ).toBe(403);
  });
  it("handles concurrent duplicate registrations without orphan workspaces", async () => {
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ ...account, email: "race@example.test" }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const workspaces = await database.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "Workspace"',
    );
    expect(workspaces.rows[0].count).toBe(2);
  });
});
