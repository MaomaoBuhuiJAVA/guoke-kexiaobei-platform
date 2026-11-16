"use client";
import {useState} from "react";
import {ReviewDashboard} from "./ReviewDashboard";
import {ExperimentReviewPanel} from "./ExperimentReviewPanel";
export function ReviewCenter({reviewerName}:{reviewerName:string}){
  const [tab,setTab]=useState("works");
  return <><nav aria-label="审核内容类型" className="flex flex-wrap justify-center gap-3 border-b border-[#dce8df] bg-[#f6f9f4] px-4 py-4">{[["works","作品投稿"],["experiments","科学实验"]].map(([key,label])=><button className={`rounded-lg border px-5 py-2 text-sm ${tab===key?"border-[#176b5d] bg-[#176b5d] text-white":"border-[#d1e2d8] bg-white text-[#315b4c]"}`} type="button" key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>{tab==="works"?<ReviewDashboard reviewerName={reviewerName}/>:<ExperimentReviewPanel reviewerName={reviewerName}/>}</>;
}
