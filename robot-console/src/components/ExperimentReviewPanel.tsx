"use client";
/* Reviewer-authorized private uploads use same-origin media routes. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import type {ExperimentInput} from "@/lib/science-experiment";
import {EXPERIMENT_FIELDS} from "@/lib/experiment-fields";
import styles from "./ExperimentReview.module.css";
type Submission={id:string;title:string;payload:ExperimentInput;status:"PENDING"|"APPROVED"|"REJECTED";reviewNote:string|null;publishedItemId:string|null;createdAt:string;updatedAt:string;reviewedAt:string|null;owner:{name:string};reviewer:{name:string}|null};
const labels={PENDING:"待审核",APPROVED:"已通过",REJECTED:"已退回"};
export function ExperimentReviewPanel({reviewerName}:{reviewerName:string}){
  const [status,setStatus]=useState("PENDING"),[page,setPage]=useState(1),[data,setData]=useState<{submissions:Submission[];total:number}|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Submission|null>(null),[note,setNote]=useState("");
  const dialog=useRef<HTMLDialogElement>(null),busyRef=useRef(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try{const response=await fetch(`/api/science-experiments?review=1&status=${status}&page=${page}`,{cache:"no-store",signal});const value=await response.json();if(!response.ok)throw new Error(value.error||"加载失败");if(!signal?.aborted)setData(value);}
    catch(reason){if(!signal?.aborted)setError(reason instanceof Error?reason.message:"加载失败");}finally{if(!signal?.aborted)setLoading(false);}
  },[status,page]);
  useEffect(()=>{const controller=new AbortController();const task=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(task);controller.abort();};},[load]);
  useEffect(()=>{if(selected)dialog.current?.showModal();else dialog.current?.close();},[selected]);
  async function decide(action:"approve"|"reject"){
    if(!selected||busyRef.current)return;
    if(action==="reject"&&!note.trim()){setError("请填写退回原因");return;}
    if(!window.confirm(action==="approve"?"确认审核通过并公开这份实验？":"确认退回这份实验？"))return;
    busyRef.current=true;setBusy(true);setError("");
    try{
      const response=await fetch(`/api/science-experiments/${selected.id}/review`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,reviewNote:note,expectedUpdatedAt:selected.updatedAt})});
      const value=await response.json();if(!response.ok)throw new Error(value.error||"审核失败");
      setSelected(null);setNotice(action==="approve"?"审核已通过，实验已加入公开资源库。":"实验已退回，审核意见已记录。");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"审核失败");}finally{busyRef.current=false;setBusy(false);}
  }
  return <main className={styles.page}><header className={styles.heading}><div><h1>科学实验审核</h1><p>{reviewerName} · 核对实验内容、安全提醒与附件，通过后公开展示。</p></div><Link href="/lab?type=科学实验">返回科学实验库</Link></header>
    <nav className={styles.filters} aria-label="实验审核状态">{[["PENDING","待审核"],["APPROVED","已通过"],["REJECTED","已退回"],["ALL","全部"]].map(([key,label])=><button key={key} aria-pressed={status===key} type="button" onClick={()=>{setStatus(key);setPage(1);}}>{label}</button>)}<button type="button" onClick={()=>void load()}>刷新</button></nav>
    {notice&&<p role="status">{notice}</p>}{error&&!selected&&<p role="alert" className={styles.error}>{error}</p>}
    {loading?<p role="status">正在加载实验…</p>:!data?.submissions.length?<div className={styles.empty}>暂无符合条件的实验投稿</div>:<ul className={styles.list}>{data.submissions.map(item=><li key={item.id}><div><h2>{item.title}</h2><p>{item.payload.ageLabel} · {item.payload.topic} · 投稿人：{item.owner.name}</p><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div><span>{labels[item.status]}</span><button type="button" onClick={()=>{setSelected(item);setNote("");setError("");}}>{item.status==="PENDING"?"查看审核":"查看记录"}</button></li>)}</ul>}
    <footer className={styles.pagination}><span>共 {data?.total||0} 份实验</span><button type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页</span><button type="button" disabled={page*12>=(data?.total||0)} onClick={()=>setPage(page+1)}>下一页</button></footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="experiment-review-title" onCancel={event=>{if(busy)event.preventDefault();else setSelected(null);}}>{selected&&<><header><h2 id="experiment-review-title">{selected.title}</h2><button type="button" disabled={busy} onClick={()=>setSelected(null)}>关闭</button></header><p>{selected.payload.ageLabel} · {selected.payload.topic} · {selected.payload.author}</p>
      {selected.payload.description&&<p>{selected.payload.description}</p>}{EXPERIMENT_FIELDS.map(([key,label])=><section key={key}><h3>{label}</h3><p className={styles.text}>{selected.payload[key]}</p></section>)}
      {selected.payload.coverUrl&&<section><h3>封面</h3><img src={selected.payload.coverUrl} alt="实验封面"/></section>}
      {selected.payload.stepImages.map((image,index)=><figure key={index}><img src={image.url} alt={`步骤图${index+1}`}/><figcaption>步骤图{index+1} · {image.caption}</figcaption></figure>)}
      {selected.payload.videoUrl&&<video src={selected.payload.videoUrl} controls playsInline preload="metadata" aria-label="实验视频"/>}
      {selected.payload.documentUrl&&<a href={selected.payload.documentUrl} target="_blank" rel="noopener noreferrer">打开教案 / 原稿：{selected.payload.documentName}</a>}
      {selected.status==="PENDING"?<><label>审核意见（退回时必填）<textarea value={note} disabled={busy} maxLength={2000} onChange={event=>setNote(event.target.value)} rows={4}/></label>{error&&<p role="alert" className={styles.error}>{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>void decide("reject")}>退回修改</button><button className={styles.primary} type="button" disabled={busy} onClick={()=>void decide("approve")}>{busy?"保存中…":"通过并公开"}</button></footer></>:<section><h3>审核记录 · {labels[selected.status]}</h3><p>审核人：{selected.reviewer?.name||"未记录"}</p><p>{selected.reviewNote||"未填写审核意见"}</p>{selected.publishedItemId&&<Link href={`/lab?item=${selected.publishedItemId}`}>查看已发布实验卡片</Link>}</section>}
    </>}</dialog>
  </main>;
}
