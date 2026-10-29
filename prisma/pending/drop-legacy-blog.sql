-- DESTRUCTIVE. Not part of the automatic migrations on purpose.
--
-- Drops the former blog / AI stack and the NextAuth adapter tables, which nothing reads any more
-- (the public blog is gone, sessions are JWT). It also removes the AI provider keys that were stored in clear text.
--
-- Kept on purpose: "BillingCompany", "Document", "DocumentItem", "Rib" (invoices must be kept for years),
-- "SharedDocument", "Appointment", "Availability", "BreakTime", "Exception" and the "USER" accounts
-- (the old screens still read them until the meetings epic, E8).
--
-- Before running it:
--   1. take a dump:  pg_dump --format=custom --file=cleads-before-drop.dump "$DATABASE_URL"
--   2. check you do not need the articles: SELECT count(*) FROM "Article";
--   3. run:          psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/pending/drop-legacy-blog.sql
--   4. in prisma/schema.prisma delete the models marked LEGACY and the two openai* columns of NotificationSettings,
--      then create the matching migration: npx prisma migrate dev --create-only --name drop_legacy_blog
--      (it must contain the same statements; mark it applied with `prisma migrate resolve --applied <name>`).

BEGIN;
DROP TABLE IF EXISTS "_ArticleToTag", "Comment", "Article", "ArticleSchedule", "Category", "Tag", "Theme", "Settings";
DROP TABLE IF EXISTS "Account", "Session", "VerificationToken";
ALTER TABLE "NotificationSettings" DROP COLUMN IF EXISTS "openaiApiKey", DROP COLUMN IF EXISTS "openaiModel";
COMMIT;
