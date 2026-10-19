import type { Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { db, locked } from "./db.js";
import { config, isWebOrigin } from "./config.js";
import { hash, token, sign, equal } from "./crypto.js";
import { check } from "./errors.js";
import { can, type Role } from "../../../packages/shared/src/index.js";
import { appendAudit } from "./audit.js";
// Express exposes its supported request augmentation point as a global namespace.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        workspaceId: string;
        role: Role;
        name: string;
        email: string;
      };
      correlationId: string;
    }
  }
}
export const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api",
};
export async function login(email: string, password: string, res: Response) {
  const user = await db.user.findFirst({
    where: {
      email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
    },
    include: { memberships: true },
  });
  // Fixed-cost Argon2 work also occurs for unknown users.
  const dummy =
    "$argon2id$v=19$m=65536,t=3,p=4$YWdlbnRmZW5jZWR1bW15MQ$VJx52Vr26KxLUEYGwN/N5IR4dp/Kg/POJ6VKJNrDj0k";
  const valid = await argon2
    .verify(user?.passwordHash ?? dummy, password)
    .catch(() => false);
  check(user && valid, 401, "INVALID_LOGIN");
  const membership = user.memberships[0];
  check(membership, 403, "NO_WORKSPACE_MEMBERSHIP");
  const raw = token();
  const csrfToken = sign(raw, config.SESSION_SECRET);
  await db.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      workspaceId: membership.workspaceId,
      csrfHash: hash(csrfToken),
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  await locked(membership.workspaceId, (tx) =>
    appendAudit(tx, membership.workspaceId, "USER_LOGIN", user.id, {
      role: membership.role,
    }),
  );
  res.cookie("af_session", raw, { ...cookieOptions, maxAge: 8 * 3600000 });
  return {
    csrfToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: membership.role,
    },
    workspace: await db.workspace.findUnique({
      where: { id: membership.workspaceId },
      select: { id: true, name: true, environment: true },
    }),
  };
}
export async function register(
  name: string,
  email: string,
  password: string,
  res: Response,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true },
  });
  check(!existing, 409, "EMAIL_ALREADY_REGISTERED");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { id: randomUUID(), name: `${name}'s workspace` },
      });
      await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash,
          memberships: { create: { workspaceId: workspace.id, role: "OWNER" } },
        },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      check(false, 409, "EMAIL_ALREADY_REGISTERED");
    throw error;
  }
  return login(normalizedEmail, password, res);
}
export async function authenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const raw = req.cookies?.af_session;
    check(typeof raw === "string", 401, "AUTHENTICATION_REQUIRED");
    const session = await db.session.findUnique({
      where: { id: hash(raw) },
      include: { user: true },
    });
    check(session && session.expiresAt > new Date(), 401, "SESSION_EXPIRED");
    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: session.workspaceId,
          userId: session.userId,
        },
      },
    });
    check(membership, 403, "WORKSPACE_ACCESS_REVOKED");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied = req.get("X-CSRF-Token");
      check(
        supplied &&
          equal(hash(supplied), session.csrfHash) &&
          isWebOrigin(req.get("Origin")),
        403,
        "CSRF_REJECTED",
      );
    }
    req.auth = {
      userId: session.userId,
      workspaceId: session.workspaceId,
      role: membership.role,
      name: session.user.name,
      email: session.user.email,
    };
    next();
  } catch (e) {
    next(e);
  }
}
export const requirePermission =
  (permission: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      check(
        req.auth && can(req.auth.role, permission),
        403,
        "PERMISSION_DENIED",
      );
      next();
    } catch (e) {
      next(e);
    }
  };
