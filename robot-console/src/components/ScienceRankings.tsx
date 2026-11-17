"use client";
import Link from "next/link";
import Image from "next/image";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowUpRight,BookOpen,Clapperboard,FlaskConical,Heart,Eye,Trophy} from "lucide-react";
import {BrandLogo} from "./BrandLogo";
import {AccountMenu} from "./AccountMenu";
import type {SessionUser} from "@/lib/auth";
import type {ScienceSocialStats} from "@/lib/science-social";
import styles from "./ScienceRanking.module.css";
type Ranked={id:string;title:string;author?:string;ageLabel:string;topic:string;category:string;rank:number;href:string;stats:ScienceSocialStats};
const categories=[{name:"科学诗",Icon:BookOpen},{name:"科学故事",Icon:Clapperboard},{name:"科学实验",Icon:FlaskConical}];
export function ScienceRankings({user}:{user:SessionUser|null}){
  const [category,setCategory]=useState("科学诗"),[items,setItems]=useState<Ranked[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[refresh,setRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/science-social?category=${encodeURIComponent(category)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||"排行榜加载失败");if(!controller.signal.aborted)setItems(result.items);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"排行榜暂时不可用");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[category,refresh]);
  return <div className={styles.page}><header className={styles.header}><Link href="/" className={styles.brand}><BrandLogo size={42}/><strong>科小贝资源库</strong></Link><AccountMenu initialUser={user}/></header><main className={styles.main}><Link href="/lab" className={styles.back}><ArrowLeft size={16}/>返回资源库</Link><div className={styles.hero}><span className={styles.medal}><Image src="/assets/ranking-trophy.svg" width={60} height={68} alt=""/></span><h1>资源人气榜</h1><p>每一次喜欢，都是对科学发现的鼓励。</p><small>按点赞数量排名 · 同赞数按浏览次数排序</small></div><nav aria-label="排行榜分类" className={styles.tabs}>{categories.map(({name,Icon})=><button key={name} type="button" aria-pressed={category===name} onClick={()=>{if(name===category)return;setLoading(true);setError("");setCategory(name);}}><Icon size={18}/>{name}</button>)}</nav>
    {loading?<p className={styles.state} role="status">正在加载排行榜…</p>:error?<div className={styles.state} role="alert"><p>{error}</p><button type="button" onClick={()=>{setLoading(true);setError("");setRefresh(value=>value+1);}}>重新加载</button></div>:!items.length?<p className={styles.state}>这个分类还没有公开资料。</p>:<ol className={styles.list}>{items.map(item=><li key={item.id} data-rank={item.rank}><Link href={item.href} className={styles.row}><span className={`${styles.rank} ${item.rank<=3?styles.top:""}`}>{item.rank<=3?<Trophy size={16}/>:null}{item.rank}</span><div className={styles.copy}><strong>{item.title}</strong><small>{item.ageLabel} · {item.topic}</small>{item.rank<=10&&<span className={styles.author}>作者 / 提供者：{item.author||"未署名"}</span>}</div><div className={styles.numbers}><span><Heart size={15}/>{item.stats.likes}</span><small><Eye size={14}/>{item.stats.views}</small></div><ArrowUpRight className={styles.arrow} size={17}/></Link></li>)}</ol>}
    <p className={styles.footnote}>打开条目即可查看正文、点赞和参与评论。</p></main></div>;
}
