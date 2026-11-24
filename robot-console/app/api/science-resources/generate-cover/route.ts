import {authorizeScienceWrite} from "@/lib/science-write-access";
import { NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/public-rate-limit";
import { persistScienceCoverImage, persistScienceCoverUrl, persistSciencePoetryCoverUrl } from "@/lib/science-cover-sync";
import { generateScienceCover } from "@/lib/generate-science-cover";
import { ModelUnavailableError } from "@/lib/native-workflow/model";

export const runtime = "nodejs";
export const maxDuration = 120;


function fallbackCover(category: string) {
  return category === "科学故事" ? "/lab-category-buttons/story.png" : "/lab-category-buttons/poetry.png";
}

export async function POST(request: Request) {
  const denied = await authorizeScienceWrite(request, "generate-cover", 6);
  if (denied) return denied;
  const limited = checkPublicRateLimit(request, "science-cover", 6);
  if (limited) return limited;
  let body: {
    itemId?: unknown;
    title?: unknown;
    category?: unknown;
    topic?: unknown;
    poem?: unknown;
    author?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body");
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim().slice(0, 160) : "";
  const category = body.category === "科学故事" ? "科学故事" : "科学诗";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 160) : "";
  const poem = typeof body.poem === "string" ? body.poem.trim().slice(0, 6000) : "";
  if (!title) return NextResponse.json({ error: "请先填写标题" }, { status: 400 });

  let sourceUrl: string;
  try {
    sourceUrl = await generateScienceCover(category, topic, poem, request.signal);
  } catch (error) {
    if (request.signal.aborted) throw error;
    return NextResponse.json({error: error instanceof ModelUnavailableError ? error.message : "封面生成暂时失败，请稍后重试", fallbackUrl: fallbackCover(category)}, {status: 503});
  }

  const persistedCoverUrl = itemId ? await persistScienceCoverImage(sourceUrl, title) : null;
  const synced = itemId && persistedCoverUrl
    ? await (category === "科学诗"
      ? persistSciencePoetryCoverUrl(itemId, persistedCoverUrl)
      : persistScienceCoverUrl(itemId, persistedCoverUrl, category)).catch(() => null)
    : null;
  // Private OSS paths need a durable database reference before the media route
  // can serve them. Preserve the actual provider image if that write fails.
  const usableStoredUrl = synced ? persistedCoverUrl : null;
  return NextResponse.json({
    coverUrl: synced?.coverUrl || usableStoredUrl || sourceUrl,
    persisted: Boolean(usableStoredUrl),
    synced: Boolean(synced),
    ...(synced ? { itemId: synced.itemId } : {}),
    title,
    category,
  }, {headers: {"Cache-Control": "no-store"}});
}
