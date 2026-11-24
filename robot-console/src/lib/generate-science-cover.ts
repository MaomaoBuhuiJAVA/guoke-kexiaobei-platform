import { generateTeachingImage } from "./native-workflow/images";
import { persistScienceCoverImage, persistSciencePoetryCoverUrl } from "./science-cover-sync";
import type { ScienceResourceSubmitInput, ScienceSubmitCategory } from "./science-resource-submit";

export async function generateScienceCover(category: ScienceSubmitCategory, topic: string, poem: string, signal: AbortSignal) {
  const prompt = [
    `请生成一张适合幼儿园${category}资源库的无文字纯插画封面。`,
    topic ? `仅用于理解的视觉主题：${topic}。` : "",
    poem ? `仅用于理解的科学意象：${poem.slice(0, 800)}。不要把这些文字画入图片。` : "",
    "要求：明亮、友好、原创卡通绘本风格；画面突出科学主题；方形构图，主体居中，四周保留少量安全留白；不出现真实儿童面孔。题名和作者不参与绘图，只用于保存文件。",
    "画面必须是纯插画，严格禁止一切文字或类文字痕迹：不得出现中文汉字、英文或其他拉丁字母、数字、标题、作者署名、标签、标志、徽章、品牌元素、水印或乱码式伪文字；不要在任何位置绘制可读或不可读的字符。不要边框或棋盘格。",
    "STRICT NEGATIVE CONSTRAINT: the artwork must contain ZERO text or text-like marks. No Chinese characters, Latin or English letters, numbers, title, author name, labels, logos, badges, brand marks, watermarks, or gibberish/pseudo-text anywhere in the image.",
    "输出一张公开可访问的图片文件。",
    "请让最终回复包含生成的图片文件，不要只给文字描述。",
  ].filter(Boolean).join("\n");
  return (await generateTeachingImage({prompt, ratio: "1:1", signal})).url;
}

export async function generatePublishedPoemCover(itemId: string, value: ScienceResourceSubmitInput) {
  try {
    const generated = await generateScienceCover("科学诗", value.topic, value.body, AbortSignal.timeout(100_000));
    const cover = await persistScienceCoverImage(generated, value.title);
    return cover ? await persistSciencePoetryCoverUrl(itemId, cover) : null;
  } catch {
    return null;
  }
}
