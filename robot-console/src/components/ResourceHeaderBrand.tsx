import Link from "next/link";
import {BrandLogo} from "./BrandLogo";
import {ScienceRankingEntry} from "./ScienceRankingEntry";
export function ResourceHeaderBrand(){return <div className="site-brand-actions"><Link className="site-resource-brand" href="/" aria-label="科小贝资源库首页"><BrandLogo size={42}/><span><strong>科小贝资源库</strong><small>幼儿科学教育助手</small></span></Link><ScienceRankingEntry/></div>;}
