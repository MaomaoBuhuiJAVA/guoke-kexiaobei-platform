import {NextResponse} from "next/server";
import {AuthRequestError, checkAuthOrigin} from "@/lib/auth-request";
import {checkPublicRateLimit} from "@/lib/public-rate-limit";
import {readLimitedText} from "@/lib/realtime-video-http";
import {retrieveTeachingResources} from "@/lib/native-workflow/resources";

export const runtime = "nodejs";
const headers = {"Cache-Control": "private, no-store"};
export async function POST(request: Request) {
  try {
    checkAuthOrigin(request);
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new AuthRequestError("请求格式无效。", 415);
    const limited = checkPublicRateLimit(request, "video-resources", 30);
    if (limited) return limited;
    const body = JSON.parse(await readLimitedText(request, 4096)) as {name?: unknown; query?: unknown};
    if (!body || body.name !== "search_science_resources" || typeof body.query !== "string" || !body.query.trim() || body.query.length > 600)
      throw new AuthRequestError("资源查询内容无效。", 400);
    const result = await retrieveTeachingResources(body.query.trim(), {signal: request.signal});
    return NextResponse.json({evidence: result.context.slice(0, 12_000) || "未找到匹配的园本资源。", labLinks: result.labLinks.slice(0, 5)}, {headers});
  } catch (error) {
    const invalid = error instanceof SyntaxError;
    return NextResponse.json({error: error instanceof AuthRequestError ? error.message : invalid ? "请求格式无效。" : "暂时无法查询园本资源。"}, {status: error instanceof AuthRequestError ? error.status : invalid ? 400 : 503, headers});
  }
}
