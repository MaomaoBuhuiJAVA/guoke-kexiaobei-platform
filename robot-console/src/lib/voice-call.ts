export type VoiceReplyMode = "brief" | "content";

/** A story request is narrative delivery, distinct from a catalogue lookup or operating instructions. */
export function requestsStoryContent(message: string) {
  const text = message.replace(/\s+/gu, "");
  return /故事/u.test(text) && !/资料库|资源库|园本|库里|库中|查找|检索|搜索|原文|视频|二维码|推荐|步骤|操作|教案|活动方案/u.test(text)
    && !/^(?:请|帮我|给我|麻烦)*(?:找|查)/u.test(text);
}

/** Content follow-ups inherit the latest user request, never an unrelated assistant example. */
export function voiceReplyMode(message: string, history: Array<{role: string; content: string}> = []): VoiceReplyMode {
  const contentRequest = /故事|科学诗|诗歌|童谣|首诗|朗读|朗诵|背诵/u;
  const continuation = /再(?:讲|读|来|说|推荐)|继续(?:讲|读|说)?|长一点|详细一点|完整(?:一点|一些)|换(?:一|个|成)|短一点/u;
  if (contentRequest.test(message)) return "content";
  if (continuation.test(message)) {
    for (let index = history.length - 1; index >= 0; index--) {
      const previous = history[index];
      if (previous.role !== "user") continue;
      if (contentRequest.test(previous.content)) return "content";
      if (!continuation.test(previous.content)) break;
    }
  }
  return "brief";
}

/** Short, friendly copy used when a call has no usable model answer. */
export const VOICE_CALL_EMPTY_REPLY = "我在听呢，小朋友，再说一遍吧！";
export const VOICE_CALL_SERVICE_ERROR = "哎呀，连接慢了一点，我们再试一次吧！";

/** The same prefix-stable text is used for streaming speech and the final reply. */
export function voiceCallSpeechText(value: string, mode: VoiceReplyMode = "brief"): string {
  let cleaned = value
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/giu, "")
    .replace(/```[\s\S]*?(?:```|$)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*(?:\)|$)/gu, "$1")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/\bhttps?(?::\S*)?$/giu, "")
    .replace(/[*_`>#\[\]-]+/gu, "")
    .trimStart();
  // Preserve the actual wording and line breaks when reading poems or stories.
  if (mode === "brief") cleaned = cleaned
    // Voice replies are for young listeners: remove formal report labels and
    // soften a few common, adult-facing phrases without changing the science.
    .replace(/^(?:答案|结论|回答|根据资料库|根据园本资料)[：:]\s*/u, "")
    .replace(/实验材料/gu, "要用的东西")
    .replace(/实验步骤/gu, "小步骤")
    .replace(/观察并记录/gu, "看一看、记下来")
    .replace(/注意事项/gu, "小提醒")
    .replace(/科学原理/gu, "为什么会这样")
    .replace(/\s+/gu, " ")
    .trim();
  else cleaned = cleaned.replace(/[^\S\n]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  // Length is guided at generation time. Never cut a completed reply mid-sentence
  // based on keyword classification: the same full text is displayed and spoken.
  return cleaned;
}

export function normalizeVoiceCallReply(value: string, mode: VoiceReplyMode = "brief"): string {
  return voiceCallSpeechText(value, mode) || VOICE_CALL_EMPTY_REPLY;
}

export const VOICE_CALL_PROMPT =
  "【电话对话模式】你是温柔、清楚的科学小伙伴，正在和3—6岁的小朋友或陪伴成人说话。只回答当前问题，普通知识问答通常用1至3句讲清楚；用户想听故事、诗歌或需要详细内容时完整交付，不受普通问答句数约束。用常见短句，不装幼稚、不重复上下文，也不主动添加用户没有要求的活动建议。先给准确结论，再补充一个必要解释或安全提醒。资源结果存在时，按真实标题或节选回答；没有匹配时明确说没找到或问一个简短问题，不要编造诗句或园本资源。普通知识问题不提资料库或检索过程。简单科学问题只讲一个关键原因。普通磁铁会吸引铁、镍、钴等少数金属，不是只吸铁；例如木块不是这几种材料，所以吸不住；铝虽然是金属，普通磁铁也吸不住。不说材料喜欢或不听话，也不用魔法、偏好或有意志比喻解释科学现象。不要使用Markdown、列表、标题、链接或成人术语。涉及火焰、火、电、尖锐物品、热水等内容时，不给操作步骤；需要陪同时提醒请老师或家长陪同。";

export function voiceCallPrompt(mode: VoiceReplyMode = "brief") {
  const base = mode === "content" ? VOICE_CALL_PROMPT
    .replace("按真实标题或节选回答", "按真实标题和正文回答")
    .replace("先给准确结论，再补充一个必要解释或安全提醒。", "直接交付完整正文，故事先进入情节，不先输出结论或安全告示。")
    : VOICE_CALL_PROMPT;
  return base + "\n【内容请求】用户想听故事时，直接讲一个适龄、完整的原创科学故事，默认约500至800字，简短标注原创。故事应有具体角色、场景、疑问、两至三个推进的情节、观察与发现和完整结尾，不把一句知识说明当成故事，不询问标题，也不说资料库没有内容。用户明确要短故事或指定篇幅时遵从要求。未指定主题时讲纸船遇到风的故事：风就是流动的空气，流动的空气推动纸船。用户指定主题时按其主题讲述。科学诗优先完整朗读本轮资料中的一首，保留原句，不压缩成摘要。明确查找库内原文时只依据本轮真实资料，缺少正文时说明缺口，不编造原文。角色可以拟人化，科学原因必须真实；吸不住不是推开，不能写磁铁推开或排斥木头、铝勺。火焰主题也可以讲安全的观察故事，通过成人陪伴下观看图片或视频展开情节；不将故事替换为材料清单、活动方案或安全告示，不讲点火、燃烧操作步骤，结尾自然融入简短安全提醒。资源详情由界面下方的卡片按钮提供，不朗读网址。遵守科学准确性和安全要求。" + FIRE_STORY_SCIENCE;
}

export const FIRE_STORY_SCIENCE = "\n【火焰故事科学核对】仅在故事涉及火焰时使用：燃料在足够高温下与氧气发生反应，释放热和光；不能说物质变成了光和热，也不能把牵手、跳舞等拟人语言当成科学解释。不要编造火焰颜色的固定上下顺序或用颜色一概判断温度；颜色和燃料、反应条件等有关，本轮不展开复杂燃烧细节。不要笼统说所有火都怕水，不建议儿童靠近或由成人拿着明火给幼儿看，始终以图片或视频观察展开。不夹杂英文词，不在故事外另列必要解释、科学原理或材料步骤，发现和提醒自然融入完整结尾。";
