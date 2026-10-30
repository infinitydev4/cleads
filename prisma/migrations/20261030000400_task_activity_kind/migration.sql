-- Tasks leave a trace in the fiche's history (E7). Additive; no data touched.
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'TASK';
