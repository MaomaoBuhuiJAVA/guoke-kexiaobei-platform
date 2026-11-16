"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {LoaderCircle,Upload,X} from "lucide-react";
import type {ExperimentInput} from "@/lib/science-experiment";
import {EXPERIMENT_FIELDS} from "@/lib/experiment-fields";
import {uploadScienceMaterial} from "@/lib/science-upload-client";
import styles from "./ExperimentSubmit.module.css";

export function ExperimentSubmitDialog({onClose,onSubmitted}:{onClose:()=>void;onSubmitted:(title:string)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState<number|null>(null);
  const [images,setImages]=useState<Array<{file:File;caption:string}>>([]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const form=new FormData(event.currentTarget);
    if(images.length>12){setError("步骤图片最多12张");return;}
    setBusy(true);setError("");
    try{
      const input=Object.fromEntries(form.entries()) as unknown as ExperimentInput;
      input.coverUrl="";input.videoUrl="";input.documentUrl="";input.documentName="";input.stepImages=[];
      const upload=async(field:string,folder:"covers"|"supporting"|"stories")=>{const file=form.get(field);return file instanceof File&&file.size?uploadScienceMaterial(file,folder,setProgress):"";};
      input.coverUrl=await upload("cover","covers");
      input.videoUrl=await upload("video","stories");
      input.documentUrl=await upload("document","supporting");
      const doc=form.get("document");if(doc instanceof File&&doc.size)input.documentName=doc.name;
      for(const image of images)input.stepImages.push({url:await uploadScienceMaterial(image.file,"supporting",setProgress),caption:image.caption});
      setProgress(null);
      const response=await fetch("/api/science-experiments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"提交失败，请重试");
      onSubmitted(input.title);
    }catch(reason){setError(reason instanceof Error?reason.message:"提交失败，请重试");}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="experiment-upload-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <header className={styles.header}><div><small>新增园本资料 · 科学实验</small><h2 id="experiment-upload-title">上传科学实验</h2></div><button type="button" aria-label="关闭实验上传" disabled={busy} onClick={onClose}><X size={22}/></button></header>
    <form onSubmit={submit}>
      <p className={styles.hint}>按实验卡片结构填写。提交后进入审核，教师或管理员审核通过后才会公开展示。</p>
      <fieldset disabled={busy} className={styles.fields}>
        <div className={styles.grid}>
          <label>实验标题 *<input name="title" required maxLength={160} placeholder="例如：纸桥承重"/></label>
          <label>适用年龄段 *<select name="ageLabel" required defaultValue=""><option value="" disabled>请选择</option>{["托班","小班","中班","大班"].map(age=><option key={age}>{age}</option>)}</select></label>
          <label>科学主题 *<input name="topic" required maxLength={160} placeholder="例如：结构与力"/></label>
          <label>作者 / 提供者 *<input name="author" required maxLength={160} placeholder="教师或教研组"/></label>
        </div>
        <label>内容简介<textarea name="description" maxLength={20000} rows={2} placeholder="简要说明实验的观察重点"/></label>
        {EXPERIMENT_FIELDS.map(([key,label])=><label key={key}>{label} *<textarea name={key} required maxLength={20000} rows={key==="steps"?5:3} placeholder={key==="steps"?"按顺序逐行填写操作步骤及观察现象":`填写${label}`}/></label>)}
        <div className={styles.grid}>
          <label>封面图片（可选）<input name="cover" type="file" accept="image/png,image/jpeg,image/webp"/></label>
          <label>实验视频（可选）<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime"/></label>
          <label>教案 / 原稿（可选）<input name="document" type="file" accept=".pdf,.doc,.docx,.txt,.ppt,.pptx"/></label>
          <label>步骤图片（可选，最多12张）<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event=>{const files=Array.from(event.target.files||[]);setImages(files.map(file=>({file,caption:""})));}}/></label>
        </div>
        <p className={styles.hint}>每份附件不超过100MB。步骤图按下方顺序展示，可调整顺序并补充说明。</p>
        {images.map((image,index)=><div className={styles.step} key={index}><span>步骤图 {index+1} · {image.file.name}</span><input aria-label={`步骤图${index+1}说明`} value={image.caption} maxLength={200} placeholder="这一步的说明" onChange={event=>setImages(current=>current.map((item,i)=>i===index?{...item,caption:event.target.value}:item))}/><div><button type="button" disabled={index===0} onClick={()=>setImages(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})}>上移</button><button type="button" onClick={()=>setImages(current=>current.filter((_,i)=>i!==index))}>移除</button></div></div>)}
      </fieldset>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <footer className={styles.footer}><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy} className={styles.primary}>{busy?<LoaderCircle size={16}/>:<Upload size={16}/>} {busy?progress===null?"提交中…":`上传中 ${progress}%`:"提交审核"}</button></footer>
    </form>
  </dialog>;
}
