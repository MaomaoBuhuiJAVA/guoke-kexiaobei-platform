import Link from "next/link";
import Image from "next/image";
import styles from "./ScienceRanking.module.css";
export function ScienceRankingEntry(){return <Link className={styles.entry} href="/lab/rankings" aria-label="资源排行榜" title="资源排行榜"><Image src="/assets/ranking-trophy.svg" width={38} height={42} alt=""/><span>排行榜</span></Link>;}
