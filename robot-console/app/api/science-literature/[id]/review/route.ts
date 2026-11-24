import {after, NextResponse} from "next/server";
import {revalidateTag} from "next/cache";
import {getFreshSessionUser} from "@/lib/auth";
import {checkAuthOrigin, readAuthJson, AuthRequestError} from "@/lib/auth-request";
import {canReviewSubmissions} from "@/lib/review-access";
import {generatePublishedPoemCover} from "@/lib/generate-science-cover";
import {publishLiterature} from "@/lib/publish-literature";
import {validateScienceResourceSubmit, type ScienceResourceSubmitInput} from "@/lib/science-resource-submit";
import {prisma} from "@/lib/prisma";

const headers = {"Cache-Control": "private, no-store"};
export const maxDuration = 150;

export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    checkAuthOrigin(request);
    const actor = await getFreshSessionUser();
    if (!actor) throw new AuthRequestError("请先登录", 401);
    if (!canReviewSubmissions(actor)) throw new AuthRequestError("没有审核权限", 403);
    const body = await readAuthJson(request, 8192);
    if (body.action !== "approve" && body.action !== "reject" || typeof body.expectedUpdatedAt !== "string") {
      throw new AuthRequestError("请刷新投稿后重新审核");
    }
    const version = new Date(body.expectedUpdatedAt);
    if (!Number.isFinite(version.getTime())) throw new AuthRequestError("请刷新投稿后重新审核");
    if (body.reviewNote !== undefined && typeof body.reviewNote !== "string") throw new AuthRequestError("审核意见格式无效");
    const note = (typeof body.reviewNote === "string" ? body.reviewNote : "").trim();
    if (note.length > 2000 || body.action === "reject" && !note) throw new AuthRequestError("请填写有效的审核意见，退回时必须说明原因");

    const {id} = await params;
    const status = body.action === "approve" ? "APPROVED" : "REJECTED";
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.scienceLiteratureSubmission.findUnique({where: {id}});
      if (!submission) throw new AuthRequestError("投稿不存在", 404);
      const claim = await tx.scienceLiteratureSubmission.updateMany({
        where: {id, status: "PENDING", updatedAt: version},
        data: {status, reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note || null},
      });
      if (claim.count !== 1) throw new AuthRequestError("投稿或审核状态已更新，请刷新后重试", 409);
      if (status === "REJECTED") return null;
      const payload = submission.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AuthRequestError("投稿内容不完整，请退回修改");
      const validation = validateScienceResourceSubmit(payload);
      if (!validation.ok || validation.value.category !== submission.category) throw new AuthRequestError("投稿内容不完整，请退回修改");

      const itemId = await publishLiterature(tx, validation.value);
      await tx.scienceLiteratureSubmission.update({where: {id}, data: {publishedItemId: itemId}});
      const autoCover: ScienceResourceSubmitInput | null = validation.value.category === "科学诗" && !validation.value.coverUrl ? validation.value : null;
      return {itemId, autoCover};
    });

    if (result) {
      revalidateTag("science-knowledge", {expire: 0});
      const {itemId, autoCover} = result;
      if (autoCover) after(async () => {
        if (await generatePublishedPoemCover(itemId, autoCover)) revalidateTag("science-knowledge", {expire: 0});
      });
    }
    return NextResponse.json({ok: true, status, publishedItemId: result?.itemId ?? null}, {headers});
  } catch (error) {
    return NextResponse.json({error: error instanceof AuthRequestError ? error.message : "审核未完成，请稍后重试"}, {
      status: error instanceof AuthRequestError ? error.status : 503, headers,
    });
  }
}
