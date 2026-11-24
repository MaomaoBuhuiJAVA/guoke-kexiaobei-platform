import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    scienceKnowledgeItem: { create: vi.fn() },
    scienceLiteratureSubmission: { create: vi.fn() },
    scienceKnowledgeResource: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/science-data", () => ({
  getScienceKnowledgeItem: vi.fn(),
  getScienceKnowledgeSummaries: vi.fn(),
  searchScienceSummaries: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({getFreshSessionUser: vi.fn()}));
vi.mock("@/lib/science-write-access", () => ({authorizeScienceWrite: vi.fn()}));

import { prisma } from "@/lib/prisma";
import {getFreshSessionUser} from "@/lib/auth";
import {authorizeScienceWrite} from "@/lib/science-write-access";
import {createOssClient} from "@/lib/oss-media";
vi.mock("@/lib/oss-media", async importOriginal => ({...await importOriginal<object>(), createOssClient: vi.fn()}));
import {getScienceKnowledgeItem, getScienceKnowledgeSummaries} from "@/lib/science-data";
import { GET, PATCH, POST } from "./route";

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/science-resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("science resource creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFreshSessionUser).mockResolvedValue({id: "author", name: "老师", role: "USER"});
    vi.mocked(prisma.scienceLiteratureSubmission.create).mockResolvedValue({id: "submission", title: "风的旅行", status: "PENDING"} as never);
    vi.mocked(authorizeScienceWrite).mockResolvedValue(null);
  });

  it.each([
    {category: "科学诗", videoUrl: "https://example.test/poem.mp4"},
    {category: "科学诗", videoUrl: ""},
    {category: "科学故事", videoUrl: "https://example.test/story.mp4"},
  ])("queues $category without publishing it (video: $videoUrl)", async ({category, videoUrl}) => {
    const coverUrl = "https://example.test/cover.webp";
    const documentUrl = "https://example.test/poem.docx";
    const body = "第一行\n\n第二行";
    const response = await POST(jsonRequest({category, title: "风的旅行", ageLabel: "教师", topic: "风", body, coverUrl, videoUrl, documentUrl, ownerId: "spoofed", status: "APPROVED"}));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({submission: {id: "submission", status: "PENDING"}});
    expect(prisma.scienceLiteratureSubmission.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({
      category, ownerId: "author", status: "PENDING", mediaUrls: expect.arrayContaining([coverUrl, documentUrl, ...(videoUrl ? [videoUrl] : [])]),
      payload: expect.objectContaining({category, ageLabel: "教师", body, videoUrl}),
    })}));
    expect(prisma.scienceKnowledgeItem.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a science story without a video before writing", async () => {
    const response = await POST(jsonRequest({
      category: "科学故事",
      title: "小水滴旅行记",
      ageLabel: "大班",
      topic: "水循环",
      body: "故事文本",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "科学故事需要提供视频地址或上传视频" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts a validated story video file in lieu of a pre-existing public URL", async () => {
    const {validateScienceResourceSubmit} = await import("@/lib/science-resource-submit");
    const input = {category: "科学故事", title: "小水滴", ageLabel: "小班", topic: "水循环", body: "故事"};
    expect(validateScienceResourceSubmit(input).ok).toBe(false);
    expect(validateScienceResourceSubmit(input, {uploadedVideo: true}).ok).toBe(true);
  });

  it("explains when the catalogue database is unavailable", async () => {
    vi.mocked(prisma.scienceLiteratureSubmission.create).mockRejectedValue(
      new Error("Error validating datasource: DATABASE_URL is invalid"),
    );

    const response = await POST(jsonRequest({
      category: "科学诗",
      title: "小雨滴",
      ageLabel: "小班",
      topic: "水循环",
      body: "小雨滴，落下来。",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "资料库连接未配置，暂时无法保存。",
      code: "DATABASE_UNAVAILABLE",
    });
  });

  it("rejects unauthenticated writes before reading the body or storing files", async () => {
    vi.mocked(authorizeScienceWrite).mockResolvedValue(Response.json({error: "请先登录"}, {status: 401}));
    const request = jsonRequest({category: "科学诗", title: "blocked"});
    const read = vi.spyOn(request, "json");
    expect((await POST(request)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects invalid multipart metadata before any OSS write", async () => {
    const put = vi.fn(); vi.mocked(createOssClient).mockReturnValue({put} as never);
    const form = new FormData(); form.set("file", new File(["poem"], "poem.txt", {type: "text/plain"}));
    const response = await POST(new Request("http://localhost/api/science-resources", {method: "POST", body: form}));
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });
  it("cleans newly uploaded inline files when the database transaction fails", async () => {
    const put = vi.fn().mockResolvedValue({}), remove = vi.fn().mockResolvedValue({});
    vi.mocked(createOssClient).mockReturnValue({put, delete: remove} as never);
    vi.mocked(prisma.scienceLiteratureSubmission.create).mockRejectedValue(new Error("database unavailable"));
    const form = new FormData();
    for (const [key, value] of Object.entries({category: "科学诗", title: "风", topic: "风", ageLabel: "小班", body: "风吹"})) form.set(key, value);
    form.set("file", new File(["poem"], "poem.txt", {type: "text/plain"}));
    const response = await POST(new Request("http://localhost/api/science-resources", {method: "POST", body: form}));
    expect(response.status).toBe(503);
    expect(put).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0][0]);
  });
  it("rejects oversized JSON before parsing and writing", async () => {
    const response = await POST(new Request("http://localhost/api/science-resources", {method: "POST", headers: {"content-type": "application/json", "content-length": "10000000"}, body: "{}"}));
    expect(response.status).toBe(413);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not expose a public cover replacement endpoint", async () => {
    const response = await PATCH();
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "封面同步接口不对外开放" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

it("filters an explicit teacher group exactly without treating teacher in a title as an age group", async () => {
  const poem = {id: "teacher-poem", category: "科学诗", ageLabel: "教师"};
  const normal = {id: "normal", category: "科学故事", ageLabel: "小班", title: "教师讲故事"};
  const experiment = {id: "experiment", category: "科学实验", ageLabel: "教师"};
  vi.mocked(getScienceKnowledgeSummaries).mockResolvedValue([poem, normal, experiment] as never);
  vi.mocked(getScienceKnowledgeItem).mockResolvedValue(null);
  const response = await GET(new Request(`http://localhost/api/science-resources?age=${encodeURIComponent("教师")}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({items: [poem], count: 1});
});
