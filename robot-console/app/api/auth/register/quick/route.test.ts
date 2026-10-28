import {beforeEach, describe, expect, it, vi} from "vitest";
import {Prisma} from "@prisma/client";
vi.mock("@/lib/auth", () => ({createSession: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findUnique: vi.fn(), create: vi.fn()}}}));
vi.mock("@/lib/sms", () => ({verifySms: vi.fn()}));
import {createSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";
import {SmsError} from "@/lib/sms/service";
import {POST} from "./route";

const valid = {
  name: "小小探索者",
  phone: "13800138000",
  accountType: "PARENT",
  challengeId: "123e4567-e89b-12d3-a456-426614174000",
  code: "123456",
  acceptedPolicies: true,
};

function request(body: unknown = valid) {
  return new Request("https://guokeey.cn/api/auth/register/quick", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
}

describe("SMS quick registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockImplementation((async ({data}: Prisma.UserCreateArgs) => ({
      id: "new-user",
      name: data.name,
      username: data.username,
      phone: data.phone,
      accountType: data.accountType,
      identityVerified: data.identityVerified,
      role: data.role,
    })) as never);
  });

  it("verifies the registration code and creates a phone-verified session", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(verifySms).toHaveBeenCalledWith([{
      challengeId: valid.challengeId,
      phone: valid.phone,
      purpose: "register",
      code: valid.code,
    }]);
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data;
    expect(data.phoneVerified).toBe(true);
    expect(data.passwordHash).not.toBe(valid.code);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({phone: valid.phone, role: "USER"}));
    expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  });

  it("does not consume a code when the phone is already registered", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({id: "existing-user"} as never);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(verifySms).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("does not create an account when SMS verification fails", async () => {
    vi.mocked(verifySms).mockRejectedValueOnce(new SmsError("验证码不正确、已过期或已使用，请重新获取。"));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("requires policy consent before checking or consuming a code", async () => {
    const response = await POST(request({...valid, acceptedPolicies: false}));

    expect(response.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(verifySms).not.toHaveBeenCalled();
  });
});
