# Signing in and registering

Use **Create an account** on `/login`, or visit `/register`. Registration requires a name, valid email and a password of 14–200 characters. It creates a private sandbox workspace and grants OWNER only within that new workspace; it never grants access to Northstar or another user's data. Registration signs you in immediately using the existing HttpOnly session and CSRF protections. Emails are trimmed and matched case-insensitively; passwords are never trimmed. Passwords are hashed with Argon2id. Email ownership verification and password-reset email are not implemented.

The seeded local administrator is `owner@northstar.example`; use the `DEMO_PASSWORD` from your local `.env`, not a password copied from another deployment. Seed passwords are initial provisioning values: changing `.env` alone does not overwrite existing password hashes. Existing accounts can change their password in Settings. New visitors should register their own accounts rather than trying the portfolio email against the demo account.

Start local database/OPA infrastructure with `pnpm infra:local` before the API. A database outage is not an invalid password. Local `.env` and `.env.production.local` are separate and must not be committed. The production session cookie requires HTTPS and the frontend must proxy `/api` to the backend. Production origin checks still require the exact `WEB_ORIGIN`; development additionally accepts localhost/127.0.0.1/IPv6 loopback aliases on the same protocol and port.

`GET /api/auth/session` returns 200/null for an anonymous or expired session, so opening the login flow does not produce an expected console 401. Protected APIs and incorrect passwords still return 401; this does not bypass authentication.

Run `pnpm exec vitest run tests/security/auth.test.ts` for isolated database-backed registration, duplicate-race, login/logout, cookie, CSRF and origin checks. The test uses an ephemeral PostgreSQL-compatible database and does not modify the local application database.
