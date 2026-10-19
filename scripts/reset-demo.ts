import { db } from "../apps/api/src/db.js";
import { config } from "../apps/api/src/config.js";
import { seedWorkspace } from "../prisma/seed.js";
if (config.NODE_ENV === "production" || config.DEMO_ENABLED !== "true")
  throw new Error(
    "Demo reset is available only in explicitly enabled non-production environments.",
  );
// Fixed scope: never accept a caller-supplied workspace ID for destructive reset.
await db.$transaction(async (tx) => {
  await tx.session.deleteMany({ where: { workspaceId: "northstar" } });
  await tx.workspace.deleteMany({ where: { id: "northstar" } });
});
await seedWorkspace();
console.log(
  "Northstar synthetic workspace reset. Other workspaces were preserved.",
);
await db.$disconnect();
