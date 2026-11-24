"use client";
/* Reviewer-only covers may use authenticated media routes. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import type {ReviewFilter, ReviewStatus} from "@/lib/review-types";
import type {ScienceResourceSubmitInput, ScienceSubmitCategory} from "@/lib/science-resource-submit";
import styles from "./ExperimentReview.module.css";

type Submission = {
  id: string;
  title: string;
  payload: ScienceResourceSubmitInput;
  status: ReviewStatus;
  reviewNote: string | null;
  publishedItemId: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {name: string};
  reviewer: {name: string} | null;
};
const labels = {PENDING: "待审核", APPROVED: "已通过", REJECTED: "已退回", ALL: "全部"};
const filters = Object.keys(labels) as ReviewFilter[];

export function LiteratureReviewPanel({category, reviewerName}: {category: ScienceSubmitCategory; reviewerName: string}) {
  const [status, setStatus] = useState<ReviewFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{submissions: Submission[]; total: number; pageSize: number} | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({category, status, page: String(page)});
      const response = await fetch(`/api/science-literature?${query}`, {cache: "no-store", signal});
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "加载失败");
      if (!signal.aborted) {
        setData(value);
        if (page > 1 && !value.submissions.length) setPage(page - 1);
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [category, status, page]);

  useEffect(() => {
    const controller = new AbortController();
    const task = setTimeout(() => void load(controller.signal), 0);
    return () => {clearTimeout(task); controller.abort();};
  }, [load, refresh]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    else if (!selected) dialog.current?.close();
  }, [selected]);

  async function decide(action: "approve" | "reject") {
    if (!selected || busyRef.current) return;
    if (action === "reject" && !note.trim()) {setError("请填写退回原因"); return;}
    if (!window.confirm(action === "approve" ? "确认审核通过并公开这份投稿？" : "确认退回这份投稿？")) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/science-literature/${encodeURIComponent(selected.id)}/review`, {
        method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action, reviewNote: note, expectedUpdatedAt: selected.updatedAt}),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "审核失败");
      setSelected(null);
      setNotice(action === "approve" ? "审核已通过，投稿已加入公开资源库。" : "投稿已退回，审核意见已记录。");
      setRefresh(current => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审核失败");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const content = selected?.payload;
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>{category}审核</h1><p>审核人：{reviewerName}</p></div><Link href={`/lab?type=${encodeURIComponent(category)}`}>返回{category}资源库</Link></header>
    <nav className={styles.filters} aria-label="投稿审核状态">
      {filters.map(key => <button key={key} type="button" aria-pressed={status === key} onClick={() => {setStatus(key); setPage(1);}}>{labels[key]}</button>)}
      <button type="button" onClick={() => setRefresh(current => current + 1)}>刷新</button>
    </nav>
    {notice && <p role="status">{notice}</p>}
    {error && !selected && <p role="alert" className={styles.error}>{error}</p>}
    {loading ? <p role="status">正在加载投稿…</p> : data?.submissions.length ? <ul className={styles.list}>
      {data.submissions.map(item => <li key={item.id}>
        <div><h2>{item.title}</h2><p>{item.payload.ageLabel} · {item.payload.topic} · 投稿人：{item.owner.name}</p><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>
        <span>{labels[item.status]}</span>
        <button type="button" onClick={() => {setSelected(item); setNote(""); setError("");}}>{item.status === "PENDING" ? "查看审核" : "查看记录"}</button>
      </li>)}
    </ul> : !error && <div className={styles.empty}>暂无符合条件的{category}投稿</div>}
    <footer className={styles.pagination}>
      <span>共 {data?.total ?? 0} 份投稿</span><button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} 页</span>
      <button type="button" disabled={loading || page * (data?.pageSize ?? 12) >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>下一页</button>
    </footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="literature-review-title" onCancel={event => {if (busy) event.preventDefault(); else setSelected(null);}}>
      {selected && content && <>
        <header><h2 id="literature-review-title">{selected.title}</h2><button type="button" disabled={busy} onClick={() => setSelected(null)}>关闭</button></header>
        <p>{content.ageLabel} · {content.topic} · {content.author}</p>
        {content.body && <section><h3>{category === "科学诗" ? "科学诗正文" : "内容简介 / 教学提示"}</h3><p className={styles.text}>{content.body}</p></section>}
        {content.coverUrl && <section><h3>封面</h3><img src={content.coverUrl} alt="投稿封面" /></section>}
        {content.videoUrl && <section><h3>视频</h3><video src={content.videoUrl} controls playsInline preload="metadata" aria-label="投稿视频" /><p><a href={content.videoUrl} target="_blank" rel="noopener noreferrer">打开视频</a></p></section>}
        {(content.documentUrl || content.supportingUrl) && <section><h3>附件</h3><ul>
          {content.documentUrl && <li><a href={content.documentUrl} target="_blank" rel="noopener noreferrer">{content.documentName || "原稿"}</a></li>}
          {content.supportingUrl && <li><a href={content.supportingUrl} target="_blank" rel="noopener noreferrer">{content.supportingName || "补充材料"}</a></li>}
        </ul></section>}
        {selected.status === "PENDING" ? <>
          <label>审核意见（退回时必填）<textarea value={note} disabled={busy} maxLength={2000} onChange={event => setNote(event.target.value)} rows={4} /></label>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <footer><button type="button" disabled={busy} onClick={() => void decide("reject")}>退回修改</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void decide("approve")}>{busy ? "保存中…" : "通过并公开"}</button></footer>
        </> : <section>
          <h3>审核记录 · {labels[selected.status]}</h3><p>审核人：{selected.reviewer?.name || "未记录"}</p><p>{selected.reviewNote || "未填写审核意见"}</p>
          {selected.publishedItemId && <Link href={`/lab?item=${encodeURIComponent(selected.publishedItemId)}`}>查看已发布资源</Link>}
        </section>}
      </>}
    </dialog>
  </main>;
}
