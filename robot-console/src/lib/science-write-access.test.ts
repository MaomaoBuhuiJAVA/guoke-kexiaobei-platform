import {beforeEach, expect, it, vi} from "vitest";
vi.mock("./auth", () => ({getFreshSessionUser: vi.fn()}));
import {getFreshSessionUser} from "./auth";
import {authorizeScienceWrite} from "./science-write-access";

const request = (origin = "https://guokeey.cn") => new Request("https://guokeey.cn/api/science-resources", {method: "POST", headers: {origin}});
beforeEach(() => {vi.mocked(getFreshSessionUser).mockReset();});
it("rejects anonymous and unverified accounts before any write", async () => {
  vi.mocked(getFreshSessionUser).mockResolvedValue(null);
  expect((await authorizeScienceWrite(request(), "create"))?.status).toBe(401);
  vi.mocked(getFreshSessionUser).mockResolvedValue({id: "unverified", role: "USER", name: "teacher", accountType: "TEACHER", identityVerified: false});
  expect((await authorizeScienceWrite(request(), "create"))?.status).toBe(403);
});
it("allows only verified teachers and administrators", async () => {
  for (const user of [
    {id: "teacher-access", role: "USER" as const, name: "teacher", accountType: "TEACHER" as const, identityVerified: true},
    {id: "admin-access", role: "ADMIN" as const, name: "admin"},
  ]) {
    vi.mocked(getFreshSessionUser).mockResolvedValue(user);
    expect(await authorizeScienceWrite(request(), "create")).toBeNull();
  }
  vi.mocked(getFreshSessionUser).mockResolvedValue({id: "parent-access", role: "USER", name: "parent", accountType: "PARENT", identityVerified: true});
  expect((await authorizeScienceWrite(request(), "create"))?.status).toBe(403);
});
it("blocks cross-site submissions even with a valid account", async () => {
  vi.mocked(getFreshSessionUser).mockResolvedValue({id: "admin-origin", role: "ADMIN", name: "admin"});
  expect((await authorizeScienceWrite(request("https://example.invalid"), "create"))?.status).toBe(403);
});
it("limits repeated writes per account even when the forwarded IP changes", async () => {
  vi.mocked(getFreshSessionUser).mockResolvedValue({id: "limited-account", role: "ADMIN", name: "admin"});
  expect(await authorizeScienceWrite(request(), "test-limit", 1)).toBeNull();
  const blocked = await authorizeScienceWrite(request(), "test-limit", 1);
  expect(blocked?.status).toBe(429);
  expect(blocked?.headers.get("retry-after")).toBeTruthy();
});
it("fails closed when fresh identity verification is unavailable", async () => {
  vi.mocked(getFreshSessionUser).mockRejectedValue(new Error("database private detail"));
  const blocked = await authorizeScienceWrite(request(), "create");
  expect(blocked?.status).toBe(503);
  expect(await blocked?.text()).not.toContain("private detail");
});
