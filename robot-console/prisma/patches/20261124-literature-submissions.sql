BEGIN;
CREATE TABLE IF NOT EXISTS "ScienceLiteratureSubmission" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "category" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "StudentWorkStatus" NOT NULL DEFAULT 'PENDING', "reviewNote" TEXT,
  "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3), "publishedItemId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScienceLiteratureSubmission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScienceLiteratureSubmission_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScienceLiteratureSubmission_category_status_createdAt_idx" ON "ScienceLiteratureSubmission"("category","status","createdAt");
CREATE INDEX IF NOT EXISTS "ScienceLiteratureSubmission_ownerId_createdAt_idx" ON "ScienceLiteratureSubmission"("ownerId","createdAt");
CREATE INDEX IF NOT EXISTS "ScienceLiteratureSubmission_mediaUrls_idx" ON "ScienceLiteratureSubmission" USING GIN ("mediaUrls");
DO $$
DECLARE app_owner TEXT;
BEGIN
  SELECT tableowner INTO app_owner FROM pg_tables WHERE schemaname='public' AND tablename='User';
  IF app_owner IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "ScienceLiteratureSubmission" OWNER TO %I',app_owner);
  END IF;
END $$;
COMMIT;
