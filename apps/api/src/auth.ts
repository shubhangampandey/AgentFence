import type { Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { db, locked } from "./db.js";
import { config } from "./config.js";
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
  const user = await db.user.findUnique({
    where: { email },
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
          req.get("Origin") === config.WEB_ORIGIN,
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
