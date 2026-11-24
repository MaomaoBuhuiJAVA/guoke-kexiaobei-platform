import type { Prisma } from "@prisma/client";
import { createScienceResourceIds, type ScienceResourceSubmitInput } from "./science-resource-submit";

export function literatureMedia(value: ScienceResourceSubmitInput) {
  return [...new Set([value.coverUrl, value.videoUrl, value.documentUrl, value.supportingUrl].filter(Boolean))];
}

function resourceRows(
  value: ScienceResourceSubmitInput,
  ids: { id: string; baseId: string },
) {
  const rows: Prisma.ScienceKnowledgeResourceCreateManyInput[] = [];
  const sourcePrefix = value.sourceFile || `用户提交/${value.category}/${value.title}`;

  if (value.coverUrl) {
    rows.push({
      id: `RESOURCE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      resourceType: "图片资源",
      knowledgeBaseId: ids.baseId,
      semester: value.ageLabel,
      title: `${value.title} · 封面`,
      filePath: sourcePrefix,
      publicPath: value.coverUrl,
      externalUrl: value.coverUrl,
      source: sourcePrefix,
      isPublic: true,
      sortOrder: 0,
    });
  }
  if (value.videoUrl) {
    rows.push({
      id: `RESOURCE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      resourceType: "视频资源",
      knowledgeBaseId: ids.baseId,
      semester: value.ageLabel,
      title: `${value.title} · 视频`,
      filePath: sourcePrefix,
      publicPath: "",
      externalUrl: value.videoUrl,
      source: sourcePrefix,
      isPublic: true,
      sortOrder: rows.length,
    });
  }
  if (value.documentUrl) {
    rows.push({
      id: `RESOURCE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      resourceType: "文档资源",
      knowledgeBaseId: ids.baseId,
      semester: value.ageLabel,
      title: `${value.title} · ${value.documentName || "原稿"}`,
      filePath: sourcePrefix,
      publicPath: "",
      externalUrl: value.documentUrl,
      source: sourcePrefix,
      isPublic: true,
      sortOrder: rows.length,
    });
  }
  if (value.supportingUrl) {
    rows.push({
      id: `RESOURCE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      resourceType: "文档资源",
      knowledgeBaseId: ids.baseId,
      semester: value.ageLabel,
      title: `${value.title} · ${value.supportingName || "补充材料"}`,
      filePath: sourcePrefix,
      publicPath: "",
      externalUrl: value.supportingUrl,
      source: sourcePrefix,
      isPublic: true,
      sortOrder: rows.length,
    });
  }

  return rows;
}

export async function publishLiterature(tx: Prisma.TransactionClient, value: ScienceResourceSubmitInput) {
  const ids = createScienceResourceIds(value.category === "科学诗" ? "POEM" : "STORY");
  const sourceFile = value.sourceFile || `用户提交/${value.category}/${value.title}`;
  const rows = resourceRows(value, ids);
  const item = await tx.scienceKnowledgeItem.create({
    data: {
      id: ids.id,
      baseId: ids.baseId,
      semester: value.ageLabel,
      category: value.category,
      title: value.title,
      ageLabel: value.ageLabel,
      topic: value.topic,
      author: value.author,
      sourceFile,
      sourcePage: "",
      allocationBasis: "用户提交",
      tags: [value.category, value.topic, value.ageLabel].filter(Boolean),
      ingestStatus: "用户提交",
      duplicateOf: "",
      knowledgeFile: sourceFile,
      imageCount: rows.filter((row) => row.resourceType === "图片资源").length,
      videoUrl: value.videoUrl,
      excerpt: value.excerpt,
      body: value.body,
      sortOrder: 0,
    },
  });
  if (rows.length) await tx.scienceKnowledgeResource.createMany({ data: rows });
  return item.id;
}
