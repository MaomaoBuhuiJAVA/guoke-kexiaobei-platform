import { NextResponse } from "next/server";
import {persistOssUpload, readUploadForm, validateOssUpload, discardScienceUpload, OssUploadValidationError} from "@/lib/oss-upload";
import {authorizeScienceWrite} from "@/lib/science-write-access";
import {publicScienceItem} from "@/lib/science-privacy";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getScienceKnowledgeItem,
  getScienceKnowledgeSummaries,
  searchScienceSummaries,
} from "@/lib/science-data";
import {
  createScienceResourceIds,
  type ScienceResourceSubmitInput,
  validateScienceResourceSubmit,
} from "@/lib/science-resource-submit";

export const dynamic = "force-dynamic";

// Small multipart submissions share the OSS storage used by the upload route.
const MAX_INLINE_UPLOAD_BYTES = 5 * 1024 * 1024;

function persistenceFailureResponse(error: unknown, fallbackMessage: string) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code ?? "")
    : "";
  const databaseUnavailable =
    name === "PrismaClientInitializationError" ||
    /Error validating datasource|DATABASE_URL|Can't reach database server|P1000|P1001|P1011/iu.test(message) ||
    /P1000|P1001|P1011/u.test(code);

  if (databaseUnavailable) {
    return NextResponse.json(
      { error: "资料库连接未配置，暂时无法保存。", code: "DATABASE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 503 });
}

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "size" in value);
}

function serializeCreatedItem(
  item: {
    id: string;
    baseId: string;
    semester: string;
    category: string;
    title: string;
    ageLabel: string;
    topic: string;
    author: string;
    sourceFile: string;
    sourcePage: string;
    allocationBasis: string;
    tags: string[];
    ingestStatus: string;
    duplicateOf: string;
    imageCount: number;
    videoUrl: string;
    excerpt: string;
    body: string;
    resources: Array<{
      id: string;
      resourceType: string;
      knowledgeBaseId: string;
      semester: string;
      title: string;
      filePath: string;
      publicPath: string;
      externalUrl: string;
      source: string;
      isPublic: boolean;
    }>;
  },
) {
  const resources = item.resources.map((resource) => ({
    id: resource.id,
    type: resource.resourceType,
    knowledgeBaseId: resource.knowledgeBaseId,
    semester: resource.semester,
    title: resource.title,
    filePath: resource.filePath,
    publicPath: resource.publicPath,
    externalUrl: resource.externalUrl,
    source: resource.source,
    isPublic: resource.isPublic,
  }));
  const cover = resources.find(
    (resource) => resource.type === "图片资源" && /(?:封面|cover)/iu.test(resource.title),
  );

  return {
    id: item.id,
    baseId: item.baseId,
    semester: item.semester,
    category: item.category,
    title: item.title,
    ageLabel: item.ageLabel,
    topic: item.topic,
    author: item.author,
    sourceFile: item.sourceFile,
    sourcePage: item.sourcePage,
    allocationBasis: item.allocationBasis,
    tags: item.tags,
    ingestStatus: item.ingestStatus,
    duplicateOf: item.duplicateOf,
    imageCount: item.imageCount,
    videoUrl: item.videoUrl,
    excerpt: item.excerpt,
    body: item.body,
    resources,
    resourceTypes: Array.from(new Set(resources.map((resource) => resource.type))),
    ...(cover?.externalUrl || cover?.publicPath
      ? { coverUrl: cover.externalUrl || cover.publicPath }
      : {}),
  };
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

export async function POST(request: Request) {
  const denied = await authorizeScienceWrite(request, "create", 10);
  if (denied) return denied;
  const files: Array<{file: File; folder: string; field: string}> = [];
  const storedKeys: string[] = [];
  const cleanup = async () => {
    const results = await Promise.allSettled(storedKeys.map(discardScienceUpload));
    if (results.some(result => result.status === "rejected")) console.error("Science upload rollback incomplete; private orphan objects need review");
  };
  let input: Record<string, unknown>;
  let uploadedVideoFileName = "";
  let uploadedDocumentFileName = "";
  try {
    if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
      const form = await readUploadForm(request, 3 * MAX_INLINE_UPLOAD_BYTES + 512 * 1024);
      const value = (key: string) => {
        const field = form.get(key);
        return typeof field === "string" ? field.trim() : "";
      };
      const video = form.get("video") ?? form.get("videoFile");
      const poemFile = form.get("file");
      const supportingFile = form.get("supportingFile");
      const category = value("category");
      const isStory = category === "科学故事";
      const sourceFile = value("sourceFile") ||
        (isFile(poemFile) ? poemFile.name : isFile(video) ? video.name : "");
      input = {
        category,
        title: value("title"),
        ageLabel: value("ageLabel") || value("age"),
        topic: value("topic"),
        author: value("author") || value("provider"),
        body: value("body") || value("poemText") || value("content") || value("description"),
        excerpt: value("excerpt") || value("description"),
        sourceFile,
        videoUrl: value("videoUrl"),
        coverUrl: value("coverUrl"),
        documentUrl: value("documentUrl"),
        documentName: value("documentName") || (isFile(poemFile) ? poemFile.name : ""),
        supportingUrl: value("supportingUrl"),
        supportingName: value("supportingName"),
      };
      if (isStory && isFile(video)) {
        uploadedVideoFileName = video.name;
        files.push({file: video, folder: "stories", field: "videoUrl"});
      }
      if (!isStory && isFile(poemFile)) {
        uploadedDocumentFileName = poemFile.name;
        files.push({file: poemFile, folder: "poems", field: "documentUrl"});
      }
      if (isFile(supportingFile)) files.push({file: supportingFile, folder: "supporting", field: "supportingUrl"});
      for (const {file} of files) validateOssUpload(file, MAX_INLINE_UPLOAD_BYTES);
    } else {
      if (Number(request.headers.get("content-length")) > 512 * 1024) throw new OssUploadValidationError("提交内容过长", 413);
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) try {
        for (;;) {
          const {done, value} = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 512 * 1024) {await reader.cancel(); throw new OssUploadValidationError("提交内容过长", 413);}
          chunks.push(value);
        }
      } finally {reader.releaseLock();}
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      input = body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
    }
  } catch (error) {
    if (error instanceof OssUploadValidationError) return NextResponse.json({error: error.message}, {status: error.status});
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const validation = validateScienceResourceSubmit(input, {uploadedVideo: files.some(file => file.field === "videoUrl")});
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const ids = createScienceResourceIds(validation.value.category === "科学诗" ? "POEM" : "STORY");
  const sourceFile = validation.value.sourceFile ||
    uploadedVideoFileName || uploadedDocumentFileName ||
    `用户提交/${validation.value.category}/${validation.value.title}`;
  const resourceInput = { ...validation.value, sourceFile };
  try {
    for (const {file, folder, field} of files) {
      const uploaded = await persistOssUpload(file, {folder: `science-resources/${folder}`, maxBytes: MAX_INLINE_UPLOAD_BYTES});
      storedKeys.push(uploaded.key);
      Object.assign(resourceInput, {[field]: uploaded.url});
    }
  } catch (error) {
    await cleanup();
    return NextResponse.json({error: error instanceof OssUploadValidationError ? error.message : "附件暂时无法保存，请稍后重试"}, {status: error instanceof OssUploadValidationError ? error.status : 503});
  }
  const rows = resourceRows(resourceInput, ids);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.scienceKnowledgeItem.create({
        data: {
          id: ids.id,
          baseId: ids.baseId,
          semester: validation.value.ageLabel,
          category: validation.value.category,
          title: validation.value.title,
          ageLabel: validation.value.ageLabel,
          topic: validation.value.topic,
          author: validation.value.author,
          sourceFile,
          sourcePage: "",
          allocationBasis: "用户提交",
          tags: [validation.value.category, validation.value.topic, validation.value.ageLabel].filter(Boolean),
          ingestStatus: "用户提交",
          duplicateOf: "",
          knowledgeFile: sourceFile,
          imageCount: rows.filter((row) => row.resourceType === "图片资源").length,
          videoUrl: resourceInput.videoUrl,
          excerpt: validation.value.excerpt,
          body: validation.value.body,
          sortOrder: 0,
        },
      });
      if (rows.length) await tx.scienceKnowledgeResource.createMany({ data: rows });
      const resources = rows.map((row) => ({
        id: String(row.id),
        resourceType: String(row.resourceType),
        knowledgeBaseId: String(row.knowledgeBaseId),
        semester: String(row.semester),
        title: String(row.title),
        filePath: String(row.filePath),
        publicPath: String(row.publicPath),
        externalUrl: String(row.externalUrl),
        source: String(row.source),
        isPublic: Boolean(row.isPublic),
      }));
      return { ...item, resources };
    });
    return NextResponse.json({ item: publicScienceItem(serializeCreatedItem(created)) }, { status: 201 });
  } catch (error) {
    await cleanup();
    return persistenceFailureResponse(error, "资料暂时无法保存，请稍后重试");
  }
}

export async function PATCH() {
  // Cover synchronization is an internal server-side operation. Keeping a
  // public PATCH would let anyone overwrite a known poem's cover URL.
  return NextResponse.json({ error: "封面同步接口不对外开放" }, { status: 405, headers: { Allow: "GET, POST" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item")?.trim();

  if (itemId) {
    const item = await getScienceKnowledgeItem(itemId);
    if (!item) {
      return NextResponse.json({ error: "resource not found" }, { status: 404 });
    }

    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const topic = url.searchParams.get("topic")?.trim() ?? "";
  const age = url.searchParams.get("age")?.trim() ?? "";
  const resourceType = url.searchParams.get("resourceType")?.trim() ?? "";
  const hasSearch = Boolean(query || category || topic || age || resourceType);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 10;

  const summaries = await getScienceKnowledgeSummaries();
  const searchQuery = [query, category, topic, age, resourceType].filter(Boolean).join(" ");
  const matchedSummaries = hasSearch
    ? searchScienceSummaries(summaries, searchQuery, limit).filter(
        (item) => !topic || item.topic === topic,
      )
    : summaries;
  const selectedSummaries = hasSearch ? matchedSummaries.slice(0, limit) : matchedSummaries;
  const items = hasSearch
    ? await Promise.all(
        selectedSummaries.map(async (summary) => (await getScienceKnowledgeItem(summary.id)) ?? summary),
      )
    : selectedSummaries;

  return NextResponse.json(
    {
      items,
      count: items.length,
      ...(hasSearch
        ? { query, filters: { category, topic, age, resourceType, limit } }
        : {}),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
