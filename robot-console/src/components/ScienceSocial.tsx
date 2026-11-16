"use client";
import Link from "next/link";
import {createContext,useContext,useCallback,useEffect,useRef,useState,type ReactNode,type FormEvent} from "react";
import {Eye,Heart,MessageCircle,Send,Trash2} from "lucide-react";
import {EMPTY_SCIENCE_STATS,type ScienceSocialStats} from "@/lib/science-social";
import styles from "./ScienceSocial.module.css";

type SocialContext={stats:Record<string,ScienceSocialStats>;order:Record<string,ScienceSocialStats>;ready:boolean;error:string;loggedIn:boolean;update:(id:string,stats:Partial<ScienceSocialStats>)=>void};
const Context=createContext<SocialContext>({stats:{},order:{},ready:false,error:"",loggedIn:false,update:()=>{}});
export function ScienceSocialProvider({children}:{children:ReactNode}){
  const [stats,setStats]=useState<Record<string,ScienceSocialStats>>({}),[order,setOrder]=useState<Record<string,ScienceSocialStats>>({}),[ready,setReady]=useState(false),[error,setError]=useState(""),[loggedIn,setLoggedIn]=useState(false);
  const update=useCallback((id:string,value:Partial<ScienceSocialStats>)=>setStats(current=>({...current,[id]:{...(current[id]||EMPTY_SCIENCE_STATS),...value}})),[]);
  useEffect(()=>{const controller=new AbortController();void fetch('/api/science-social',{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||"互动数据暂时不可用");if(controller.signal.aborted)return;setStats(result.stats);setOrder(result.stats);setLoggedIn(result.loggedIn);setReady(true);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"互动数据暂时不可用");});return()=>controller.abort();},[]);
  return <Context.Provider value={{stats,order,ready,error,loggedIn,update}}>{children}</Context.Provider>;
}
export function useScienceSocial(){return useContext(Context);}
type Comment={id:string;body:string;createdAt:string;authorName:string;canDelete:boolean};
export function ResourceComments({itemId,title}:{itemId:string;title:string}){
  const {loggedIn,update,stats}=useScienceSocial();
  const [comments,setComments]=useState<Comment[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState(""),[body,setBody]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const requestSequence=useRef(0),sending=useRef(false);
  const load=useCallback(async(currentPage:number,signal?:AbortSignal)=>{const sequence=++requestSequence.current;setLoading(true);setError("");try{const response=await fetch(`/api/science-social/${itemId}?page=${currentPage}`,{cache:"no-store",signal});const result=await response.json();if(!response.ok)throw new Error(result.error||"评论加载失败");if(signal?.aborted||sequence!==requestSequence.current)return;setComments(result.comments);setTotal(result.total);setPage(currentPage);}catch(reason){if(!signal?.aborted&&sequence===requestSequence.current)setError(reason instanceof Error?reason.message:"评论加载失败");}finally{if(!signal?.aborted&&sequence===requestSequence.current)setLoading(false);}},[itemId]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(1,controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[load]);
  async function send(event:FormEvent){event.preventDefault();if(sending.current||!body.trim())return;sending.current=true;setBusy(true);setError("");setNotice("");try{const response=await fetch(`/api/science-social/${itemId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"comment",body})});const result=await response.json();if(!response.ok)throw new Error(result.error||"发送失败");setBody("");setNotice("评论已发布");update(itemId,{comments:(stats[itemId]?.comments||total)+1});await load(1);}catch(reason){setError(reason instanceof Error?reason.message:"评论发送失败");}finally{setBusy(false);sending.current=false;}}
  async function remove(id:string){if(sending.current||!window.confirm("确认删除这条评论？"))return;sending.current=true;setBusy(true);try{const response=await fetch(`/api/science-social/${itemId}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({commentId:id})});const result=await response.json();if(!response.ok)throw new Error(result.error||"删除失败");update(itemId,{comments:Math.max(0,(stats[itemId]?.comments||total)-1)});await load(comments.length===1&&page>1?page-1:page);}catch(reason){setError(reason instanceof Error?reason.message:"删除失败");}finally{setBusy(false);sending.current=false;}}
  return <section className={styles.comments} aria-label={`《${title}》评论区`}><h3>评论区 <span>{total}</span></h3>
    {loggedIn?<form onSubmit={send}><label className={styles.sr} htmlFor={`comment-${itemId}`}>评论《{title}》</label><textarea id={`comment-${itemId}`} value={body} onChange={event=>setBody(event.target.value)} placeholder="分享你的观察或教学心得，文明交流" maxLength={500} rows={3} disabled={busy}/><div className={styles.sendRow}><small>{Array.from(body).length}/500</small><button type="submit" disabled={busy||!body.trim()}><Send size={14}/>{busy?"发送中…":"发送评论"}</button></div></form>:<p className={styles.login}><Link href={`/auth?next=${encodeURIComponent(`/lab?item=${itemId}`)}`}>登录后发表评论</Link></p>}
    {error&&<p role="alert" className={styles.error}>{error}<button type="button" onClick={()=>void load(page)}>重试加载</button></p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {loading?<p role="status" className={styles.empty}>正在加载评论…</p>:comments.length?<ul>{comments.map(comment=><li key={comment.id}><div className={styles.commentMeta}><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString("zh-CN")}</time>{comment.canDelete&&<button type="button" aria-label="删除评论" disabled={busy} onClick={()=>void remove(comment.id)}><Trash2 size={14}/></button>}</div><p>{comment.body}</p></li>)}</ul>:<p className={styles.empty}>还没有评论，来分享第一个发现吧。</p>}
    {total>20&&<div className={styles.pagination}><button type="button" disabled={loading||page===1} onClick={()=>void load(page-1)}>上一页</button><span>{page}/{Math.ceil(total/20)}</span><button type="button" disabled={loading||page*20>=total} onClick={()=>void load(page+1)}>下一页</button></div>}
  </section>;
}
export function ResourceSocialBar({itemId,title,alwaysComments=false}:{itemId:string;title:string;alwaysComments?:boolean}){
  const {stats,ready,error,loggedIn,update}=useScienceSocial();const current=stats[itemId]||EMPTY_SCIENCE_STATS;
  const [expanded,setExpanded]=useState(alwaysComments),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");const sending=useRef(false);
  async function like(){if(sending.current)return;if(!loggedIn){setNotice("请登录后点赞");return;}sending.current=true;setBusy(true);setNotice("");try{const response=await fetch(`/api/science-social/${itemId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({liked:!current.liked})});const result=await response.json();if(!response.ok)throw new Error(result.error||"点赞失败");update(itemId,result.stats);}catch(reason){setNotice(reason instanceof Error?reason.message:"点赞失败");}finally{setBusy(false);sending.current=false;}}
  return <div className={styles.root}><div className={styles.bar}>
    <button type="button" aria-label={`${current.liked?"取消点赞":"点赞"}《${title}》`} aria-pressed={current.liked} disabled={busy||!ready} onClick={()=>void like()}><Heart size={16} fill={current.liked?"currentColor":"none"}/><span>{ready?current.likes:"—"}</span></button>
    <button type="button" aria-label={`评论《${title}》`} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><MessageCircle size={16}/><span>{ready?current.comments:"评论"}</span></button>
    <span className={styles.views} title="浏览次数" aria-label={`浏览次数：${ready?current.views:"加载中"}`}><Eye size={16}/><span>{ready?current.views:"—"}</span></span>
  </div>{notice&&<p role="status" className={styles.notice}>{notice}{!loggedIn&&<Link href={`/auth?next=${encodeURIComponent(`/lab?item=${itemId}`)}`}>去登录</Link>}</p>}{error&&<p className={styles.error}>{error}</p>}{expanded&&<ResourceComments itemId={itemId} title={title}/>}</div>;
}
export function RecordScienceView({itemId}:{itemId:string}){
  const {update,ready}=useScienceSocial();const recorded=useRef<string|null>(null);
  useEffect(()=>{if(!ready||recorded.current===itemId)return;recorded.current=itemId;void fetch(`/api/science-social/${itemId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"view"})}).then(async response=>{if(!response.ok)return;const result=await response.json();update(itemId,{views:result.stats.views});}).catch(()=>{});},[itemId,update,ready]);return null;
}
