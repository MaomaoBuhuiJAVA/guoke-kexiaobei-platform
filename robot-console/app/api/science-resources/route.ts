import { NextResponse } from "next/server";
import {persistOssUpload, readUploadForm, validateOssUpload, validateScienceVideo, discardScienceUpload, OssUploadValidationError} from "@/lib/oss-upload";
import {authorizeScienceWrite} from "@/lib/science-write-access";
import {getFreshSessionUser} from "@/lib/auth";
import {literatureMedia} from "@/lib/publish-literature";
import { prisma } from "@/lib/prisma";
import {
  getScienceKnowledgeItem,
  getScienceKnowledgeSummaries,
  searchScienceSummaries,
} from "@/lib/science-data";
import {
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

export async function POST(request: Request) {
  const denied = await authorizeScienceWrite(request, "create", 10);
  if (denied) return denied;
  const actor = await getFreshSessionUser();
  if (!actor) return NextResponse.json({error: "请先登录"}, {status: 401});
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
      if (isFile(video)) {
        validateScienceVideo(video);
        uploadedVideoFileName = video.name;
        files.push({file: video, folder: isStory ? "stories" : "videos", field: "videoUrl"});
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
  try {
    const submission = await prisma.scienceLiteratureSubmission.create({
      data: {
        ownerId: actor.id,
        category: resourceInput.category,
        title: resourceInput.title,
        payload: resourceInput,
        mediaUrls: literatureMedia(resourceInput),
        status: "PENDING",
      },
      select: {id: true, title: true, status: true},
    });
    return NextResponse.json({ submission, message: "已提交审核，通过后会在资源库公开。" }, {
      status: 201, headers: {"Cache-Control": "private, no-store"},
    });
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
  const teacherGroup = age === "教师";
  const scopedSummaries = teacherGroup ? summaries.filter(item => item.ageLabel === age && (item.category === "科学诗" || item.category === "科学故事")) : summaries;
  const searchQuery = [query, category, topic, teacherGroup ? "" : age, resourceType].filter(Boolean).join(" ");
  const matchedSummaries = searchQuery
    ? searchScienceSummaries(scopedSummaries, searchQuery, limit).filter(
        (item) => !topic || item.topic === topic,
      )
    : scopedSummaries;
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
