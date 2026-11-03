-- E28 Le copilote qui agit, lot 1 (docs/crm-v1/AGENTS-IA.md §12). Additive: the agents' rights matrix.
-- AlterTable
ALTER TABLE "AgentDefinition" ADD COLUMN "actionPolicy" JSONB;
