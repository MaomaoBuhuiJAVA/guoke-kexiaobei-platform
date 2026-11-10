import {getFreshSessionUser} from "./auth";
import {checkAuthOrigin} from "./auth-request";
import {canManageScience} from "./science-access";
import {checkPublicRateLimit} from "./public-rate-limit";

const deny = (error: string, status: number) => Response.json({error}, {status, headers: {"Cache-Control": "private, no-store"}});

export async function authorizeScienceWrite(request: Request, operation: string, limit = 10): Promise<Response | null> {
  try {checkAuthOrigin(request);} catch {return deny("请从本网站的资源库操作", 403);}
  try {
    const user = await getFreshSessionUser();
    if (!user) return deny("请先登录", 401);
    if (!canManageScience(user)) return deny("需要园方核验的教师或管理员权限", 403);
    // Account identity comes from the verified session, never a caller-supplied IP.
    const identity = new Request(request.url, {headers: {"x-forwarded-for": user.id}});
    return checkPublicRateLimit(identity, `science-write:${operation}`, limit);
  } catch {
    return deny("暂时无法核对资料管理权限，请稍后重试", 503);
  }
}
