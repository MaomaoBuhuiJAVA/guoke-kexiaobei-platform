import {MAX_SPEECH_BYTES, recognizeQwenSpeech, SpeechRecognitionError, validateSpeechWav} from "@/lib/qwen-asr";
export const runtime="nodejs";
const visits=new Map<string,{start:number;count:number}>();
let inFlight=0;
function reply(body:unknown,status=200) {
  return Response.json(body,{status,headers:{"Cache-Control":"private, no-store",...(status===429?{"Retry-After":"15"}:{})}});
}
export async function POST(request:Request) {
  const url=new URL(request.url);
  const host=request.headers.get("host") || url.host;
  const proto=request.headers.get("x-forwarded-proto") || url.protocol.replace(":","");
  const origin=request.headers.get("origin");
  if (request.headers.get("sec-fetch-site")==="cross-site" || origin && origin!==proto+"://"+host)
    return reply({error:"请从本网站发起语音输入。"},403);
  if (!["audio/wav","audio/x-wav"].includes(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || ""))
    return reply({error:"录音格式不支持，请重新录音。"},415);
  const declared=request.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared)>MAX_SPEECH_BYTES))
    return reply({error:"录音过长，请控制在30秒以内。"},413);
  const now=Date.now(),ip=request.headers.get("x-real-ip") || "local";
  for (const [key,value] of visits) if (now-value.start>=60000) visits.delete(key);
  const visit=visits.get(ip) || {start:now,count:0};
  if (visit.count>=30 || inFlight>=2 || !visits.has(ip) && visits.size>=1024)
    return reply({error:"语音请求较多，请稍后再说。"},429);
  visit.count++;visits.set(ip,visit);inFlight++;
  try {
    const reader=request.body?.getReader();
    if (!reader) return reply({error:"录音为空，请重新按住说话。"},400);
    const chunks:Uint8Array[]=[];let size=0;
    try {
      for (;;) {
        const chunk=await reader.read();if(chunk.done)break;
        size+=chunk.value.byteLength;
        if(size>MAX_SPEECH_BYTES){await reader.cancel();return reply({error:"录音过长，请控制在30秒以内。"},413);}
        chunks.push(chunk.value);
      }
    } finally {reader.releaseLock();}
    const bytes=Buffer.concat(chunks);
    if(!validateSpeechWav(bytes))return reply({error:"录音太短或格式无效，请重新说一次。"},400);
    const text=await recognizeQwenSpeech(bytes,{signal:request.signal});
    return reply({text});
  } catch(error) {
    if(error instanceof SpeechRecognitionError && error.code==="no-speech")return reply({error:error.message,code:"no-speech"},422);
    return reply({error:"语音转文字暂时不可用，请稍后重试。"},503);
  } finally {inFlight--;}
}
