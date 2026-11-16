import {describe, expect, it, vi} from "vitest";
const retrieve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/native-workflow/resources", () => ({retrieveTeachingResources: retrieve}));
import {POST} from "./route";

const req = (body: unknown) => new Request("https://guokeey.cn/api/video-call/resources", {method: "POST", headers: {"Content-Type": "application/json", Origin: "https://guokeey.cn", "x-forwarded-for": String(Math.random())}, body: JSON.stringify(body)});
describe("video read-only resource tool", () => {
  it("rejects unknown tool names and long queries", async () => {
    expect((await POST(req({name: "delete", query: "风"}))).status).toBe(400);
    expect((await POST(req({name: "search_science_resources", query: "风".repeat(601)}))).status).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it("returns bounded published evidence and canonical lab links", async () => {
    retrieve.mockResolvedValueOnce({context: "公开科学资料", labLinks: [{id: "wind", title: "风", href: "/lab?item=wind"}]});
    const response = await POST(req({name: "search_science_resources", query: "小班风的科学诗"}));
    expect(await response.json()).toEqual({evidence: "公开科学资料", labLinks: [{id: "wind", title: "风", href: "/lab?item=wind"}]});
    expect(retrieve).toHaveBeenCalledWith("小班风的科学诗", expect.objectContaining({signal: expect.any(AbortSignal)}));
  });
});
