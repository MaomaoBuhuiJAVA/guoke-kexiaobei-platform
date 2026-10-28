import bcrypt from "bcryptjs";
import {randomBytes} from "node:crypto";
import {prisma} from "@/lib/prisma";
import {AuthRequestError} from "@/lib/auth-request";
import {normalizeUsername} from "@/lib/username";

export type RegistrationProfile = {
  name: string;
  phone: string;
  username: string | null;
  accountType: "PARENT" | "TEACHER";
  identityVerified: boolean;
};

export function parseRegistrationProfile(body: Record<string, unknown>): RegistrationProfile {
  const username = body.username === undefined || body.username === "" ? null : normalizeUsername(body.username);
  if (body.username !== undefined && body.username !== "" && !username)
    throw new AuthRequestError("用户名需为 2 至 24 位中文、字母、数字或下划线，以中文或字母开头。");

  if (typeof body.name !== "string") throw new AuthRequestError("请填写姓名或称呼。");
  const name = body.name.trim();
  if (!name || name.length > 50 || /[\u0000-\u001f\u007f]/u.test(name))
    throw new AuthRequestError("姓名或称呼请填写 1 至 50 个字。");

  if (typeof body.phone !== "string" || !/^1[3-9]\d{9}$/u.test(body.phone.trim()))
    throw new AuthRequestError("请填写有效的 11 位手机号码。");

  if (body.accountType !== "PARENT" && body.accountType !== "TEACHER")
    throw new AuthRequestError("请选择家长或老师身份。");
  if (body.accountType === "TEACHER" && (typeof body.teacherCode !== "string" || body.teacherCode !== (process.env.TEACHER_REGISTRATION_CODE ?? "guokeey")))
    throw new AuthRequestError("老师注册码不正确，请向园方确认。");

  return {
    name,
    phone: body.phone.trim(),
    username,
    accountType: body.accountType,
    identityVerified: body.accountType === "TEACHER",
  };
}

export async function assertRegistrationAvailable(profile: RegistrationProfile) {
  if (await prisma.user.findUnique({where: {phone: profile.phone}, select: {id: true}}))
    throw new AuthRequestError("该手机号已注册，请直接登录。", 409);
  if (profile.username && await prisma.user.findUnique({where: {username: profile.username}, select: {id: true}}))
    throw new AuthRequestError("该用户名已被使用，请换一个。", 409);
}

export async function createRegisteredAccount(profile: RegistrationProfile, password: string | undefined, phoneVerified: boolean) {
  const accountPassword = password ?? randomBytes(32).toString("base64url");
  return prisma.user.create({
    // SMS-only accounts still need a password hash for the legacy schema.
    data: {
      ...profile,
      email: `${profile.phone}@accounts.local.invalid`,
      phoneVerified,
      passwordHash: await bcrypt.hash(accountPassword, 12),
      role: "USER",
    },
    select: {id: true, name: true, username: true, phone: true, role: true, accountType: true, identityVerified: true},
  });
}
