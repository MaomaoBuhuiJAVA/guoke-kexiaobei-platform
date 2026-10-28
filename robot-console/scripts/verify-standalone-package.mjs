import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Verify resources relative to server.js: HTTP 200 for HTML alone is insufficient.
const root = path.resolve(process.argv[2] ?? "../deploy-package");
const standalone = path.join(root, ".next/standalone");
assert.ok((await stat(path.join(standalone, "server.js"))).isFile());
assert.ok((await stat(path.join(standalone, ".next/BUILD_ID"))).isFile());
let checked = 0;
async function verifyTree(relative, requiredExtensions = []) {
  const source = path.join(root, relative);
  const target = path.join(standalone, relative);
  const extensions = new Set();
  async function visit(folder = "") {
    for (const entry of await readdir(path.join(source, folder), { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      const expected = await readFile(path.join(source, file));
      const actual = await readFile(path.join(target, file));
      const hash = bytes => createHash("sha256").update(bytes).digest("hex");
      assert.equal(hash(actual), hash(expected), `Packaged asset differs: ${relative}/${file}`);
      extensions.add(path.extname(file));
      checked++;
    }
  }
  await visit();
  for (const extension of requiredExtensions) assert.ok(extensions.has(extension), `Missing ${extension} resources`);
}
await verifyTree(".next/static", [".css", ".js"]);
await verifyTree("public");
console.log(`Standalone resources verified: ${checked} files`);
