import {AuthRequestError} from "./auth-request";

/** Limit streamed requests too; Content-Length alone is not a trustworthy bound. */
export async function readLimitedText(request: Pick<Request, "headers" | "body">, maxBytes: number): Promise<string> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AuthRequestError("提交内容过长。", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder(); let size = 0, text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      size += part.value.byteLength;
      if (size > maxBytes) {await reader.cancel(); throw new AuthRequestError("提交内容过长。", 413);}
      text += decoder.decode(part.value, {stream: true});
    }
  } finally {reader.releaseLock();}
}
