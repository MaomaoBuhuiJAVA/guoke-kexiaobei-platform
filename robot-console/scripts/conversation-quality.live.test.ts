import { beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { runTeachingWorkflow, type NativeChatBody } from "../src/lib/native-workflow/run";
import catalog from "../src/data/science-knowledge.json";
import type { ScienceKnowledgeItem } from "../src/lib/science-types";
import type { AiChatResponse } from "../src/lib/ai-chat-stream";

// Explicitly opt in. CI/unit tests must never consume provider quota or need real secrets.
const live = process.env.RUN_LIVE_CHAT_QA === "1";
const cases = [
  { name: "broad-story", message: "我想听一个科学故事", contains: /原创|故事/u, minimum: 100 },
  { name: "wind-story", message: "给小班讲一个关于风的科学故事，不超过250字", contains: /风|空气/u, minimum: 80 },
  { name: "shadow-story", message: "讲个影子的故事，要讲清楚影子怎么来的", contains: /光|挡|遮/u, minimum: 80 },
  { name: "original-poem", message: "编一首四行的磁铁科学诗，明确是原创", contains: /原创/u, minimum: 20 },
  { name: "question-with-category", message: "科学实验为什么要先猜想", contains: /猜|预测|验证|比较/u, minimum: 20 },
  { name: "magnet-explanation", message: "为什么磁铁吸得住铁钉，却吸不住铝片？", contains: /铁|铝/u, minimum: 20 },
  { name: "recommendation-followup", message: "推荐的实验为什么没有成功", contains: /现象|材料|步骤|哪|什么|描述/u, minimum: 15 },
  { name: "teaching-story", message: "怎么给小班讲科学故事", contains: /小班|短|故事|简单/u, minimum: 20 },
  { name: "generic-activity", message: "我想做一个科学实验，用纸和风就行", contains: /纸|风/u, minimum: 80 },
  { name: "bare-story", message: "科学故事", contains: /故事|原创/u, minimum: 80 },
  { name: "reflection-story", message: "给小班讲个水面倒影的科学故事", contains: /倒影|反射/u, minimum: 80 },
  { name: "water-cycle-story", message: "讲一个小水滴旅行的科学故事，要说清云和雨是怎么来的", contains: /凝结|小水滴/u, minimum: 100 },
  { name: "evaporation-explanation", message: "水蒸发后真的消失了吗？怎么跟小朋友解释？", contains: /水蒸气|空气/u, minimum: 20 },
  { name: "found-catalogue", message: "推荐小班磁铁的科学诗", contains: /磁铁|磁力/u, minimum: 15, source: true },
  { name: "missing-named-video", message: "找《月亮上修风车》的实验视频", contains: /未|没有|找不到/u, minimum: 15, missing: true },
  { name: "voice-story", message: "我想听一个科学故事", voiceCall: true, contains: /风|空气|光|影|磁|水|浮/u, minimum: 15 },
  { name: "voice-magnet-story", message: "给我讲个磁铁的科学故事", voiceCall: true, contains: /磁铁|铁钉/u, minimum: 15 },
  { name: "voice-science", message: "铝是金属，磁铁为什么吸不住它", voiceCall: true, contains: /铝|金属|磁/u, minimum: 10 },
] as const;

describe.skipIf(!live).sequential("real-provider conversation acceptance", () => {
  const report: Array<Record<string, unknown>> = [];
  let story: AiChatResponse | undefined;
  const destination = path.resolve(process.env.CHAT_QA_OUTPUT || path.join(tmpdir(), "guoke-chat-quality"));
  beforeAll(() => {
    config({ path: ".env.production.local", quiet: true });
    config({ path: ".env.local", quiet: true });
    process.env.DATABASE_URL = "";
  });
  async function save() {
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "results.json"), JSON.stringify(report, null, 2));
  }
  for (const sample of cases) it(sample.name, async () => {
    const started = Date.now();
    const body: NativeChatBody = { message: sample.message, voiceCall: "voiceCall" in sample ? sample.voiceCall : false };
    const result = await runTeachingWorkflow(body, { catalog: catalog as ScienceKnowledgeItem[] });
    if (sample.name === "broad-story") story = result;
    report.push({ name: sample.name, message: sample.message, reply: result.reply, task: result.workflowState?.task, sources: result.sources, agentResult: result.agentResult, elapsedMs: Date.now() - started });
    await save();
    console.log(JSON.stringify(report.at(-1)));
    expect(result.agentResult).toBeUndefined();
    expect(result.reply).toMatch(sample.contains);
    expect(result.reply.length).toBeGreaterThanOrEqual(sample.minimum);
    if (!("missing" in sample)) expect(result.reply).not.toMatch(/暂未收录|补充标题.*主题|资料库未命中/u);
    if ("source" in sample) expect(result.sources?.length).toBeGreaterThan(0);
    if ("missing" in sample) { expect(result.sources).toEqual([]); expect(result.labLinks).toEqual([]); }
    if ("voiceCall" in sample) expect(Array.from(result.reply).length).toBeLessThanOrEqual(72);
    if ("voiceCall" in sample) expect(result.reply).not.toMatch(/磁铁只爱|磁铁喜欢/u);
    if (sample.name === "voice-magnet-story") expect(result.reply.replace(/(?:不是|不会|并非)(?:推开|排斥)/gu, "")).not.toMatch(/推开|排斥|只爱/u);
    if (sample.name === "wind-story") expect(result.reply).not.toMatch(/风.{0,4}推着空气/u);
    if (sample.name === "recommendation-followup") {
      // A short clarification may include an example, but must not invent a cause.
      expect(result.reply.length).toBeLessThan(120);
      expect(result.reply).not.toMatch(/磁铁可能|电池电量不足|通常是因为/u);
    }
    if (sample.name === "generic-activity") expect(result.reply).not.toMatch(/电风扇|吹风机|电池/u);
    if (["broad-story", "wind-story", "shadow-story", "bare-story", "original-poem"].includes(sample.name)) expect(result.reply).toContain("原创");
  }, 90000);
  it("short-story-followup", async () => {
    expect(story?.workflowState).toBeDefined();
    const result = await runTeachingWorkflow({ message: "短一点，给小班听，100字以内", workflowState: story!.workflowState }, { catalog: catalog as ScienceKnowledgeItem[] });
    report.push({ name: "short-story-followup", previous: story!.reply, reply: result.reply, task: result.workflowState?.task, agentResult: result.agentResult });
    await save();
    console.log(JSON.stringify(report.at(-1)));
    expect(result.agentResult).toBeUndefined();
    expect(result.reply.length).toBeGreaterThan(30);
    expect(result.reply.length).toBeLessThan(180);
    expect(result.reply).not.toContain("暂未收录");
  }, 90000);
});
