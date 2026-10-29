import { afterEach, describe, expect, it, vi } from "vitest";
import { routeTeachingRequest } from "./routing";
import { runTeachingWorkflow } from "./run";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("answer the requested content instead of returning a catalogue miss", () => {
  it.each([
    "我想听一个科学故事", "给我讲个关于风的故事", "科学故事", "写一首关于磁铁的科学诗",
    "科学实验为什么要先猜想", "磁铁为什么吸不住铝", "怎么给小班讲科学故事",
    "如何解释影子的大小变化", "推荐的实验为什么没有成功",
  ])("routes %s to a conversational answer", message => {
    expect(routeTeachingRequest({ message }).task).toBe("chat");
  });

  it.each(["我想做一个科学实验", "给我一个简单的科学实验方案"])("routes %s to activity design", message => {
    expect(routeTeachingRequest({ message }).task).toBe("lesson");
  });

  it.each(["查找小班风的科学故事", "找《不存在的故事》的视频", "推荐小班风的科学诗", "给我资料库里科学故事的原文"])("retains strict lookup for %s", message => {
    expect(routeTeachingRequest({ message }).task).toBe("resources");
  });

  it("delivers a story on a catalogue miss through the streaming workflow", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "quality-test-key");
    vi.stubGlobal("fetch", async () => Response.json({ choices: [{ message: { content: "原创科学故事：纸船想知道风在哪里。小朋友轻轻扇动纸板，纸船移动了。原来空气流动就形成风。" } }] }));
    const events: unknown[] = [];
    const result = await runTeachingWorkflow({ message: "我想听一个科学故事" }, { catalog: [], onEvent: event => events.push(event) });
    expect(result.reply).toContain("纸船");
    expect(result.reply).not.toContain("暂未收录");
    expect(result.workflowState).toMatchObject({ task: "chat", draft: result.reply });
    expect(result.sources).toEqual([]);
    expect(result.labLinks).toEqual([]);
    expect(events.some(event => (event as { type: string }).type === "delta")).toBe(true);
  });

  it("retains story context when the user asks for a shorter version", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "quality-test-key");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const messages = JSON.parse(String(init.body)).messages as Array<{ role: string; content: string }>;
      return Response.json({ choices: [{ message: { content: messages.some(m => m.content.includes("纸船与风")) ? "短版原创故事：风吹动纸船，纸船发现风是流动的空气。" : "上下文丢失" } }] });
    });
    const result = await runTeachingWorkflow({ message: "短一点，给小班听", workflowState: { task: "chat", query: "我想听科学故事", draft: "纸船与风" } }, { catalog: [] });
    expect(result.reply).toContain("纸船");
    expect(result.reply).not.toBe("上下文丢失");
  });

  it("does not replace a missing named video with generated content", async () => {
    const result = await runTeachingWorkflow({ message: "找《不存在的故事》的视频" }, { catalog: [] });
    expect(result.reply).toContain("暂未收录");
    expect(result.labLinks).toEqual([]);
    expect(result.sources).toEqual([]);
  });
});
