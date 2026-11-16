import type {Metadata} from "next";
import {ScienceRankings} from "@/components/ScienceRankings";
import {getSessionUser} from "@/lib/auth";
export const metadata:Metadata={title:"资源排行榜 | 科小贝资源库"};
export const dynamic="force-dynamic";
export default async function RankingsPage(){return <ScienceRankings user={await getSessionUser()}/>;}
