BEGIN;
CREATE TABLE IF NOT EXISTS "ScienceResourceStats" (
 "itemId" TEXT PRIMARY KEY, "views" INTEGER NOT NULL DEFAULT 0,"likes" INTEGER NOT NULL DEFAULT 0,"comments" INTEGER NOT NULL DEFAULT 0,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ScienceResourceStats_nonnegative" CHECK ("views">=0 AND "likes">=0 AND "comments">=0)
);
CREATE TABLE IF NOT EXISTS "ScienceResourceLike" (
 "itemId" TEXT NOT NULL,"userId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("itemId","userId"), FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScienceResourceLike_userId_idx" ON "ScienceResourceLike"("userId");
CREATE TABLE IF NOT EXISTS "ScienceResourceComment" (
 "id" TEXT PRIMARY KEY,"itemId" TEXT NOT NULL,"authorId" TEXT NOT NULL,"body" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScienceResourceComment_itemId_createdAt_id_idx" ON "ScienceResourceComment"("itemId","createdAt","id");
CREATE INDEX IF NOT EXISTS "ScienceResourceComment_authorId_idx" ON "ScienceResourceComment"("authorId");
CREATE TABLE IF NOT EXISTS "ScienceResourceView" (
 "itemId" TEXT NOT NULL,"visitorHash" TEXT NOT NULL,"windowStart" TIMESTAMP(3) NOT NULL, PRIMARY KEY("itemId","visitorHash","windowStart")
);
CREATE INDEX IF NOT EXISTS "ScienceResourceView_windowStart_idx" ON "ScienceResourceView"("windowStart");
DO $$ DECLARE app_owner TEXT; table_name TEXT;
BEGIN
 SELECT tableowner INTO app_owner FROM pg_tables WHERE schemaname='public' AND tablename='User';
 IF app_owner IS NOT NULL THEN
  FOREACH table_name IN ARRAY ARRAY['ScienceResourceStats','ScienceResourceLike','ScienceResourceComment','ScienceResourceView'] LOOP
   EXECUTE format('ALTER TABLE %I OWNER TO %I',table_name,app_owner);
  END LOOP;
 END IF;
END $$;
COMMIT;
