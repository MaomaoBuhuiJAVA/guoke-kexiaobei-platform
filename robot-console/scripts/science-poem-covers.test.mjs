import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(projectRoot, "src", "data", "science-knowledge.json");
const coverRoot = path.join(projectRoot, "public", "science-poem-covers");
const legacyDatabasePoemIds = ["POEM-4d99657dbe24"]; // 小乌龟 exists only in the database.

function poemItems() {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8")).filter(
    (item) => item.category === "科学诗",
  );
}

test("every science poem has a non-empty card cover", () => {
  const poems = poemItems();
  assert.equal(poems.length, 111);

  for (const id of [...poems.map((poem) => poem.id), ...legacyDatabasePoemIds]) {
    const coverPath = path.join(coverRoot, `${id}.webp`);
    assert.ok(fs.existsSync(coverPath), `missing cover for ${id}`);
    assert.ok(fs.statSync(coverPath).size > 0, `empty cover for ${id}`);
  }
});
