import {NextResponse} from "next/server";
import {AuthRequestError, checkAuthOrigin} from "@/lib/auth-request";
import {checkPublicRateLimit} from "@/lib/public-rate-limit";
import {realtimeVideoConfig, realtimeVideoSession} from "@/lib/realtime-video-config";
import {readLimitedText} from "@/lib/realtime-video-http";

export const runtime = "nodejs";
const headers = {"Cache-Control": "private, no-store"};
const unavailable = "视频通话服务尚未就绪，请稍后重试，也可以继续语音或文字对话。";
export async function GET() {
  return NextResponse.json({available: Boolean(realtimeVideoConfig())}, {headers});
}
export async function POST(request: Request) {
  try {
    checkAuthOrigin(request);
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/sdp")
      throw new AuthRequestError("通话请求格式无效。", 415);
    const limited = checkPublicRateLimit(request, "video-session", 8);
    if (limited) return limited;
    const config = realtimeVideoConfig();
    if (!config) return NextResponse.json({error: unavailable}, {status: 503, headers});
    const sdp = await readLimitedText(request, 128 * 1024);
    if (!sdp.startsWith("v=0") || !/^m=audio /mu.test(sdp) || !/^m=video /mu.test(sdp))
      throw new AuthRequestError("未获取到有效的音视频连接。", 400);
    const response = await fetch(config.endpoint, {
      method: "POST", headers: {"Content-Type": "application/sdp", Authorization: `Bearer ${config.key}`},
      body: sdp, signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]), cache: "no-store", redirect: "error",
    });
    if (!response.ok) {await response.body?.cancel(); throw new Error("Upstream unavailable");}
    const answer = await readLimitedText(response, 128 * 1024);
    if (!answer.startsWith("v=0") || !/^m=audio /mu.test(answer)) throw new Error("Invalid SDP answer");
    return NextResponse.json({sdp: answer, session: realtimeVideoSession(config)}, {headers});
  } catch (error) {
    const status = error instanceof AuthRequestError ? error.status : 503;
    return NextResponse.json({error: error instanceof AuthRequestError ? error.message : unavailable}, {status, headers});
  }
}
