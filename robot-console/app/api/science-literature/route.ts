import {getFreshSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {canReviewSubmissions} from "@/lib/review-access";
import {SUBMIT_CATEGORIES} from "@/lib/science-resource-submit";
import type {ReviewStatus} from "@/lib/review-types";

const headers = {"Cache-Control": "private, no-store"};
const pageSize = 12;

export async function GET(request: Request) {
  try {
    const actor = await getFreshSessionUser();
    if (!actor) return Response.json({error: "请先登录"}, {status: 401, headers});
    if (!canReviewSubmissions(actor)) return Response.json({error: "没有审核权限"}, {status: 403, headers});

    const params = new URL(request.url).searchParams;
    const category = params.get("category");
    const status = params.get("status") || "PENDING";
    const page = Number(params.get("page") || 1);
    if (!category || !SUBMIT_CATEGORIES.some(choice => choice === category) ||
        !["PENDING", "APPROVED", "REJECTED", "ALL"].includes(status) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return Response.json({error: "筛选条件无效"}, {status: 400, headers});
    }
    const where = {category, ...(status !== "ALL" ? {status: status as ReviewStatus} : {})};
    const [submissions, total] = await Promise.all([
      prisma.scienceLiteratureSubmission.findMany({
        where, orderBy: [{createdAt: "desc"}, {id: "desc"}], take: pageSize, skip: (page - 1) * pageSize,
        select: {id: true, title: true, payload: true, status: true, reviewNote: true, publishedItemId: true, createdAt: true, updatedAt: true,
          owner: {select: {name: true}}, reviewer: {select: {name: true}}},
      }),
      prisma.scienceLiteratureSubmission.count({where}),
    ]);
    return Response.json({submissions, total, page, pageSize}, {headers});
  } catch {
    return Response.json({error: "审核列表暂时无法加载"}, {status: 503, headers});
  }
}
