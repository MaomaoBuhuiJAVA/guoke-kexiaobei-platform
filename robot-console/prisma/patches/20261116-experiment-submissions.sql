BEGIN;
CREATE TABLE IF NOT EXISTS "ScienceExperimentSubmission" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "StudentWorkStatus" NOT NULL DEFAULT 'PENDING', "reviewNote" TEXT,
  "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3), "publishedItemId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScienceExperimentSubmission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScienceExperimentSubmission_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScienceExperimentSubmission_status_createdAt_idx" ON "ScienceExperimentSubmission"("status","createdAt");
CREATE INDEX IF NOT EXISTS "ScienceExperimentSubmission_ownerId_createdAt_idx" ON "ScienceExperimentSubmission"("ownerId","createdAt");
-- Use the existing application table owner so the runtime role can access the new queue.
DO $$
DECLARE app_owner TEXT;
BEGIN
  SELECT tableowner INTO app_owner FROM pg_tables WHERE schemaname='public' AND tablename='User';
  IF app_owner IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "ScienceExperimentSubmission" OWNER TO %I',app_owner);
  END IF;
END $$;
COMMIT;
