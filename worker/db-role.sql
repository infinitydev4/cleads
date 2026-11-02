-- Optional, recommended: a dedicated PostgreSQL role for the AI worker (docs/crm-v1/WORKER-IA.md).
-- It reads and writes rows but never changes the schema (migrations stay with the CRM's Netlify build).
-- Run once on the Railway database with its owner role, choosing the password on your own computer:
--   psql "<owner URL>" -v password="$(openssl rand -base64 32 | tr -d '/+=')" -f worker/db-role.sql
-- then use postgresql://cleads_ai_worker:<that password>@<host>:<port>/<database>?sslmode=require&connection_limit=5

CREATE ROLE cleads_ai_worker LOGIN PASSWORD :'password' CONNECTION LIMIT 10;

DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO cleads_ai_worker', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO cleads_ai_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cleads_ai_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cleads_ai_worker;

-- Tables that later migrations create (run by the role executing this script) are granted too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cleads_ai_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cleads_ai_worker;
