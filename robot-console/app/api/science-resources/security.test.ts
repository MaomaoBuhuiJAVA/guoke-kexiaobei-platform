import {beforeEach, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({getFreshSessionUser: vi.fn()}));
import {getFreshSessionUser} from "@/lib/auth";
import {POST as create} from "./route";
import {POST as upload} from "./upload/route";
import {POST as recognize} from "./recognize/route";
import {POST as cover} from "./generate-cover/route";

beforeEach(() => {vi.mocked(getFreshSessionUser).mockResolvedValue(null);});
it.each([["create", create], ["upload", upload], ["recognize", recognize], ["cover", cover]] as const)("%s refuses anonymous requests before parsing input", async (_name, handler) => {
  const request = new Request("https://guokeey.cn/api/science-resources", {method: "POST", body: "invalid"});
  const json = vi.spyOn(request, "json"), form = vi.spyOn(request, "formData");
  expect((await handler(request)).status).toBe(401);
  expect(json).not.toHaveBeenCalled();
  expect(form).not.toHaveBeenCalled();
});
