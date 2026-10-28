import {Prisma} from "@prisma/client";
import {createSession} from "@/lib/auth";
import {authError, authReply, readAuthJson, AuthRequestError, smsProof} from "@/lib/auth-request";
import {assertRegistrationAvailable, createRegisteredAccount, parseRegistrationProfile} from "@/lib/auth-registration";
import {verifySms} from "@/lib/sms";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    if (body.acceptedPolicies !== true) throw new AuthRequestError("请先阅读并同意用户协议和隐私政策。");
    const profile = parseRegistrationProfile(body);
    const proof = smsProof(body, profile.phone, "register");

    await assertRegistrationAvailable(profile);
    await verifySms([proof]);
    const user = await createRegisteredAccount(profile, undefined, true);

    try { await createSession(user); }
    catch { return authReply({registered: true, requiresLogin: true}, 201); }
    return authReply({registered: true, user}, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return authError(new AuthRequestError("该手机号或用户名已注册，请直接登录或更换用户名。", 409));
    return authError(error);
  }
}
