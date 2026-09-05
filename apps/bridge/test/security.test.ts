import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSafe, hashContent } from "../src/filesystem/FileService.ts";
describe("filesystem security", () => {
  it("rejects traversal", () => assert.throws(() => resolveSafe("/tmp/ws", "../etc/passwd"), /traversal/));
  it("rejects absolute escape", () => assert.throws(() => resolveSafe("/tmp/ws", "/etc/passwd"), /traversal/));
  it("allows child", () => assert.equal(resolveSafe("/tmp/ws", "src/a.ts"), "/tmp/ws/src/a.ts"));
  it("hashes", () => assert.equal(hashContent("x").length, 40));
});
