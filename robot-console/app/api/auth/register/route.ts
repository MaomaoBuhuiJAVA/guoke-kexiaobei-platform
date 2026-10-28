import { NextResponse } from "next/server";
import {Prisma} from "@prisma/client";
import { createSession } from "@/lib/auth";
import {AuthRequestError} from "@/lib/auth-request";
import {assertRegistrationAvailable, createRegisteredAccount, parseRegistrationProfile} from "@/lib/auth-registration";

export async function POST(request: Request) {
  const reply = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto");
  let publicOrigin;
  try { publicOrigin = new URL(`${protocol === "https" || protocol === "http" ? protocol + ":" : requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`).origin; }
  catch { return reply({ error: "注册请求地址无效" }, 400); }
  if (origin && origin !== publicOrigin) return reply({ error: "请从本网站的注册页面创建账号" }, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return reply({ error: "注册请求格式无效" }, 415);
  if (Number(request.headers.get("content-length")) > 4096) return reply({ error: "注册内容过长" }, 413);

  let value: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096) return reply({ error: "注册内容过长" }, 413);
    value = JSON.parse(text);
  } catch { return reply({ error: "注册请求格式无效" }, 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return reply({ error: "请填写姓名、手机号和密码" }, 400);
  const body = value as Record<string, unknown>;
  if (body.acceptedPolicies !== true) return reply({ error: "请先阅读并同意用户协议和隐私政策" }, 400);
  if (typeof body.password !== "string") return reply({ error: "请填写密码" }, 400);
  const password = body.password;
  let profile: ReturnType<typeof parseRegistrationProfile>;
  try { profile = parseRegistrationProfile(body); }
  catch (error) {
    if (error instanceof AuthRequestError) return reply({error: error.message}, error.status);
    return reply({error: "注册请求无效"}, 400);
  }
  if (password.length < 8) return reply({ error: "密码至少需要 8 位" }, 400);
  // bcrypt only considers the first 72 bytes; reject rather than silently truncate.
  if (Buffer.byteLength(password, "utf8") > 72) return reply({ error: "密码过长，请缩短一些（英文和数字最多 72 位）" }, 400);

  try {
    await assertRegistrationAvailable(profile);
    const user = await createRegisteredAccount(profile, password, false);
    try { await createSession(user); }
    catch { return reply({ registered: true, requiresLogin: true }, 201); }
    return reply({ registered: true, user }, 201);
  } catch (error) {
    if (error instanceof AuthRequestError) return reply({error: error.message}, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return reply({ error: "该手机号或用户名已注册，请直接登录或更换用户名。" }, 409);
    return reply({ error: "注册服务暂时无法连接，请稍后重试" }, 503);
  }
}
