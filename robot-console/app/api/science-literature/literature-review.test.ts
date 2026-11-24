import {afterEach, beforeEach, expect, it, vi} from "vitest";

const {tx, queue, schedule, generate, invalidate, session} = vi.hoisted(() => ({
  tx: {
    scienceLiteratureSubmission: {findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn()},
    scienceKnowledgeItem: {create: vi.fn()},
    scienceKnowledgeResource: {createMany: vi.fn()},
  },
  queue: {findMany: vi.fn(), count: vi.fn()},
  schedule: vi.fn(), generate: vi.fn(), invalidate: vi.fn(), session: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({prisma: {scienceLiteratureSubmission: queue, $transaction: vi.fn((run) => run(tx))}}));
vi.mock("@/lib/auth", () => ({getFreshSessionUser: session}));
vi.mock("@/lib/generate-science-cover", () => ({generatePublishedPoemCover: generate}));
vi.mock("next/server", async (original) => ({...await original<object>(), after: schedule}));
vi.mock("next/cache", () => ({revalidateTag: invalidate}));

import {GET} from "./route";
import {PATCH} from "./[id]/review/route";

const teacher = {id: "reviewer", role: "USER", accountType: "TEACHER", identityVerified: true, phoneVerified: true, phone: "19900000001"};
const expectedUpdatedAt = "2026-11-24T08:00:00.000Z";
const payload = {category: "科学诗", title: "风", topic: "空气", ageLabel: "教师", body: "第一行\n\n第二行", videoUrl: "/api/media/uploads/science-resources/videos/poem.mp4"};
const params = {params: Promise.resolve({id: "submission"})};
const list = () => GET(new Request("https://lab.example/api/science-literature?category=科学诗"));
const decide = (input: {action: string; reviewNote?: string} = {action: "approve"}, origin = "https://lab.example") => PATCH(new Request("https://lab.example/api/science-literature/submission/review", {
  method: "PATCH", headers: {"content-type": "application/json", origin}, body: JSON.stringify({expectedUpdatedAt, ...input}),
}), params);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVIEW_TEACHER_PHONES", teacher.phone);
  session.mockResolvedValue(teacher);
  queue.findMany.mockResolvedValue([]);
  queue.count.mockResolvedValue(0);
  tx.scienceLiteratureSubmission.findUnique.mockResolvedValue({category: payload.category, payload});
  tx.scienceLiteratureSubmission.updateMany.mockResolvedValue({count: 1});
  tx.scienceKnowledgeItem.create.mockResolvedValue({id: "POEM-published"});
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  [null, 401],
  [{...teacher, phone: "19900000002"}, 403],
  [{...teacher, phoneVerified: false}, 403],
  [{...teacher, accountType: "PARENT"}, 403],
  [{...teacher, identityVerified: false}, 403],
])("refuses unprivileged accounts on both endpoints (%#)", async (actor, status) => {
  session.mockResolvedValue(actor);
  expect((await list()).status).toBe(status);
  expect((await decide()).status).toBe(status);
  expect(queue.findMany).not.toHaveBeenCalled();
  expect(tx.scienceLiteratureSubmission.findUnique).not.toHaveBeenCalled();
});

it("returns a private filtered queue to the designated teacher and to administrators", async () => {
  for (const actor of [teacher, {id: "admin", role: "ADMIN"}]) {
    session.mockResolvedValue(actor);
    const response = await list();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(queue.findMany).toHaveBeenCalledWith(expect.objectContaining({where: {category: "科学诗", status: "PENDING"}}));
});

it("publishes poem text and video, then schedules cover generation outside the review transaction", async () => {
  const response = await decide();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({status: "APPROVED", publishedItemId: "POEM-published"});
  expect(tx.scienceLiteratureSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {id: "submission", status: "PENDING", updatedAt: new Date(expectedUpdatedAt)},
    data: expect.objectContaining({status: "APPROVED", reviewedBy: teacher.id}),
  }));
  expect(tx.scienceKnowledgeItem.create).toHaveBeenCalledWith({data: expect.objectContaining({body: payload.body, ageLabel: "教师", videoUrl: payload.videoUrl})});
  expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith({data: [expect.objectContaining({resourceType: "视频资源", externalUrl: payload.videoUrl, isPublic: true})]});
  expect(tx.scienceLiteratureSubmission.update).toHaveBeenCalledWith({where: {id: "submission"}, data: {publishedItemId: "POEM-published"}});
  expect(generate).not.toHaveBeenCalled();
  await schedule.mock.calls[0][0]();
  expect(generate).toHaveBeenCalledWith("POEM-published", expect.objectContaining(payload));
});

it.each(["科学诗", "科学故事"])("preserves %s cover and attachments on approval", async (category) => {
  const coverUrl = "/api/media/uploads/science-resources/covers/manual.webp";
  const documentUrl = "/api/media/uploads/science-resources/supporting/notes.pdf";
  tx.scienceLiteratureSubmission.findUnique.mockResolvedValue({category, payload: {...payload, category, coverUrl, documentUrl}});
  expect((await decide()).status).toBe(200);
  expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith({data: expect.arrayContaining([
    expect.objectContaining({resourceType: "图片资源", publicPath: coverUrl}),
    expect.objectContaining({resourceType: "文档资源", externalUrl: documentUrl}),
  ])});
  expect(schedule).not.toHaveBeenCalled();
});

it("requires a reason to reject and never publishes a rejection", async () => {
  expect((await decide({action: "reject"})).status).toBe(400);
  expect((await decide({action: "reject", reviewNote: "补充来源"})).status).toBe(200);
  expect(tx.scienceLiteratureSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({status: "REJECTED", reviewNote: "补充来源"})}));
  expect(tx.scienceKnowledgeItem.create).not.toHaveBeenCalled();
  expect(schedule).not.toHaveBeenCalled();
});

it("blocks cross-site writes and prevents duplicate publication after a conflicting update", async () => {
  expect((await decide({action: "approve"}, "https://other.example")).status).toBe(403);
  expect(tx.scienceLiteratureSubmission.updateMany).not.toHaveBeenCalled();
  tx.scienceLiteratureSubmission.updateMany.mockResolvedValue({count: 0});
  expect((await decide()).status).toBe(409);
  expect(tx.scienceKnowledgeItem.create).not.toHaveBeenCalled();
});
