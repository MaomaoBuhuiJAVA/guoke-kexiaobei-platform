import { describe, expect, it } from "vitest";
import {
  normalizeVoiceCallReply,
  VOICE_CALL_EMPTY_REPLY,
  VOICE_CALL_PROMPT,
  VOICE_CALL_SERVICE_ERROR,
  voiceReplyMode,
} from "./voice-call";

describe("voice call replies", () => {
  it("preserves a complete story and the original wording of a poem in content mode", () => {
    const story = "纸船停在水面上，小朋友轻轻扇动纸板，空气流动起来。".repeat(12) + "纸船向前走了，原来风就是流动的空气。";
    expect(normalizeVoiceCallReply(story, "content")).toBe(story);
    expect(normalizeVoiceCallReply("《小实验》\n实验材料排排站，\n观察并记录新发现。", "content"))
      .toBe("《小实验》\n实验材料排排站，\n观察并记录新发现。");
  });

  it("uses longer delivery for content requests and their follow-ups without lengthening a new factual question", () => {
    expect(voiceReplyMode("讲一个科学故事")).toBe("content");
    expect(voiceReplyMode("火 焰 有关的 科 学 故 事")).toBe("content");
    expect(voiceReplyMode("推荐一首关于风的科学诗")).toBe("content");
    expect(voiceReplyMode("请朗读《风》")).toBe("content");
    const history = [{role: "user", content: "讲个故事"}, {role: "assistant", content: "纸船遇见了风。"}];
    expect(voiceReplyMode("再讲一个", history)).toBe("content");
    expect(voiceReplyMode("再长一点", history)).toBe("content");
    expect(voiceReplyMode("再讲一个", [...history, {role: "user", content: "再讲一个"}, {role: "assistant", content: "小纸船到了岸边。"}])).toBe("content");
    expect(voiceReplyMode("为什么会下雨？", history)).toBe("brief");
  });

  it("keeps a normal short reply unchanged", () => {
    expect(normalizeVoiceCallReply("可以试试影子剧场。把手电筒和小玩偶准备好。"))
      .toBe("可以试试影子剧场。把手电筒和小玩偶准备好。");
  });

  it("removes markdown without cutting off the model's complete answer even on the brief path", () => {
    const reply = normalizeVoiceCallReply("## 活动建议\n可以做一个光影实验。" + "请观察并记录变化。".repeat(20));
    expect(reply).not.toContain("##");
    expect(reply).toContain("请看一看、记下来变化。".repeat(20));
    expect(reply.endsWith("变化。")).toBe(true);
  });

  it("keeps a full content reply beyond the previous 2400-character cap", () => {
    const story = "风吹过水面，纸船慢慢向前走。".repeat(200) + "最后，纸船平安到达岸边。";
    expect(normalizeVoiceCallReply(story, "content")).toBe(story);
  });

  it("uses child-friendly wording for common formal phrases", () => {
    expect(normalizeVoiceCallReply("答案：请准备实验材料，按照实验步骤观察并记录科学原理。"))
      .toBe("请准备要用的东西，按照小步骤看一看、记下来为什么会这样。");
  });

  it("provides a playful fallback when the model returns no spoken text", () => {
    expect(normalizeVoiceCallReply("   ")).toBe(VOICE_CALL_EMPTY_REPLY);
    expect(VOICE_CALL_EMPTY_REPLY).toContain("小朋友");
    expect(VOICE_CALL_SERVICE_ERROR).toContain("再试一次");
  });

  it("requires a concise spoken answer", () => {
    expect(VOICE_CALL_PROMPT).toContain("普通知识问答");
    expect(VOICE_CALL_PROMPT).toContain("不要使用Markdown");
    expect(VOICE_CALL_PROMPT).toContain("3—6岁");
    expect(VOICE_CALL_PROMPT).toContain("科学小伙伴");
    expect(VOICE_CALL_PROMPT).toContain("请老师或家长陪同");
    expect(VOICE_CALL_PROMPT).toContain("资源结果存在时，按真实标题或节选回答");
    expect(VOICE_CALL_PROMPT).toContain("不要编造诗句或园本资源");
    expect(VOICE_CALL_PROMPT).toContain("不主动添加用户没有要求的活动建议");
    expect(VOICE_CALL_PROMPT).toContain("不用魔法、偏好或有意志比喻解释科学现象");
    expect(VOICE_CALL_PROMPT).toContain("普通知识问题不提资料库或检索过程");
    expect(VOICE_CALL_PROMPT).toContain("普通磁铁会吸引铁、镍、钴等少数金属");
    expect(VOICE_CALL_PROMPT).toContain("铝虽然是金属，普通磁铁也吸不住");
  });
});
