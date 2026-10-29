"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Trophy } from "lucide-react";
import { AGE_GROUPS, type AgeGroup } from "@/lib/science-games/catalog";
import { chinaWeek } from "@/lib/science-games/progress";
import type { ExplorerProfile } from "@/lib/science-games/progress";
import { useGameProgress } from "./GameProvider";
import { ExplorerAvatar } from "./ExplorerAvatar";
import styles from "./ExplorationBoard.module.css";

type BoardRow = ExplorerProfile & { weekPoints: number; topics: number; rank: number };
type OnlineBoard = { key: string; rows: BoardRow[]; weekStart?: string; weekEnd?: string; error?: string };

export function ExplorationBoard() {
  const { profile, account } = useGameProgress();
  const [age, setAge] = useState(profile.age);
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState<OnlineBoard | null>(null);
  const queryKey = `${age}:${attempt}`;
  const currentWeek = chinaWeek(new Date());
  const loading = online?.key !== queryKey;
  const error = online?.key === queryKey ? online.error : null;
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 12000);
    void fetch(`/api/games/leaderboard?${new URLSearchParams({ age })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "联网周榜暂时无法打开。");
      if (!Array.isArray(data.rows)) throw new Error("榜单暂时无法读取，请稍后重试。");
      if (!controller.signal.aborted) setOnline({ key: queryKey, rows: data.rows, weekStart: data.weekStart, weekEnd: data.weekEnd });
    }).catch(error => {
      if (!disposed) setOnline({ key: queryKey, rows: [], error: controller.signal.aborted ? "读取超时，请检查网络后重试。" : error instanceof Error ? error.message : "网络暂时中断，请重试。" });
    }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [age, queryKey]);
  const rows: BoardRow[] = !loading && !error ? online?.rows ?? [] : [];
  const weekStart = new Date(`${online?.key === queryKey && online.weekStart ? online.weekStart : currentWeek}T00:00:00Z`);
  // API end is the exclusive next-Monday boundary; the label shows Sunday.
  const weekEnd = online?.key === queryKey && online.weekEnd ? new Date(new Date(`${online.weekEnd}T00:00:00Z`).getTime() - 86400000) : new Date(weekStart.getTime() + 6 * 86400000);
  const formatDate = (date: Date) => `${date.getUTCMonth() + 1}.${String(date.getUTCDate()).padStart(2, "0")}`;
  const isMine = (id: string) => Boolean(account) && id === profile.id;
  function changeAge(value: AgeGroup) { setAge(value); }
  return <div className={styles.board}>
    <section className={styles.heading}>
      <div><h1>探索排行榜<span>。</span></h1><p className={styles.subtitle}>看看这一周，大家玩过哪些科学主题。</p></div>
      <span className={styles.weekTag}><span>本周</span><strong>{formatDate(weekStart)} — {formatDate(weekEnd)}</strong></span>
    </section>
    <div className={styles.boardToolbar}><div className={styles.ageTabs} role="group" aria-label="按年龄段查看">{AGE_GROUPS.map(item => <button key={item} onClick={() => changeAge(item)} aria-pressed={age === item} className={age === item ? styles.tabActive : ""}>{item}</button>)}</div><span className={styles.participants}>{loading ? "正在读取…" : error ? "" : `${rows.length} 位探索家`}</span><button type="button" className={styles.refreshBoard} onClick={() => setAttempt(value => value + 1)} aria-label="刷新排行榜"><RefreshCw size={15} /></button></div>
    <section className={styles.boardList} aria-label={`${age}探索榜`}>
      <div className={styles.boardLabels}><span>排名</span><span>探索家</span><span>本周积分</span></div>
      {loading ? <div className={styles.empty} role="status"><p>正在翻开本周的探索记录…</p></div> : error ? <div className={styles.empty} role="status"><span className={styles.emptyAvatar}><ExplorerAvatar kind="cloud" /></span><h2>联网周榜暂时没能打开</h2><p>{error}</p><button type="button" className={styles.secondaryButton} onClick={() => setAttempt(value => value + 1)}>再试一次 <RefreshCw size={15} /></button></div> : rows.length ? rows.map(row => <div key={row.id} className={`${styles.boardRow} ${isMine(row.id) ? styles.myBoardRow : ""}`}><span className={`${styles.rank} ${row.rank === 1 && row.weekPoints > 0 ? styles.firstRank : ""}`}>{row.weekPoints === 0 ? "—" : row.rank === 1 ? <Trophy size={20} strokeWidth={1.8} aria-label="第一名" /> : String(row.rank).padStart(2, "0")}</span><div className={styles.rowIdentity}><span className={styles.boardAvatar}><ExplorerAvatar kind={row.avatar} /></span><div><strong>{row.name}{isMine(row.id) && <small>我</small>}</strong><span>{row.weekPoints ? `探索了 ${row.topics} 个主题` : "本周还没有游戏记录"}</span></div></div><strong className={styles.boardPoints}>{row.weekPoints}<small> 分</small></strong></div>) : <div className={styles.empty}><span className={styles.emptyAvatar}><ExplorerAvatar kind="seed" /></span><h2>{age}还没有游戏记录</h2><p>{account ? "完成游戏，就能留下你的发现。" : "登录后完成游戏，就能留下你的发现。"}</p><Link href="/games" className={styles.secondaryButton}>去玩游戏 <ArrowRight size={16} /></Link></div>}
    </section>
    <details className={styles.rules}><summary>积分与榜单规则</summary><p>每个账号每天首次完成每款游戏获得 10 分，每天最多获得 30 分。按北京时间每周一 00:00 开启新周，累计积分保留。各年龄段分别排名，同分并列；0 分账号暂不显示名次。使用提示和重复游玩均不扣分。</p><p>登录后游戏记录会自动保存。离线完成的记录在恢复网络后补交，按收到记录的日期计分。</p></details>
  </div>;
}
