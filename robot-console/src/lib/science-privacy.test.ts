import {expect, it} from "vitest";
import {publicScienceItem} from "./science-privacy";
it("redacts a child attribution and repeated names without changing media addresses", () => {
  const input = {author: "小三班测试甲", excerpt: "演绎/提供：小三班测试甲", body: "测试甲分享的故事", sourceFile: "小三班测试甲.docx", title: "月亮", resources: [{title: "测试甲的视频", filePath: "小三班测试甲.mp4", source: "小三班测试甲", externalUrl: "/api/media/story-123.mp4"}], videoUrl: "/api/media/story-123.mp4"};
  const result = publicScienceItem(input);
  expect(JSON.stringify(result)).not.toContain("测试甲");
  expect(result.author).toBe("小朋友");
  expect(result.videoUrl).toBe(input.videoUrl);
  expect(result.resources[0].externalUrl).toBe(input.resources[0].externalUrl);
  expect(input.author).toBe("小三班测试甲");
});
it("preserves teacher attribution and scientific titles", () => {
  const item = {author: "示例老师", title: "小班科学", excerpt: "教师版", resources: []};
  expect(publicScienceItem(item)).toEqual(item);
});
