import Link from "next/link";
import {Trophy} from "lucide-react";
import styles from "./ScienceRanking.module.css";
export function ScienceRankingEntry(){return <Link className={styles.entry} href="/lab/rankings" aria-label="资源排行榜" title="资源排行榜"><Trophy size={21}/><span>排行榜</span></Link>;}
