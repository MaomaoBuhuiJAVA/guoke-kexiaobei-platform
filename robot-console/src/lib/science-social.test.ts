import {expect,it} from "vitest";
import {validateScienceComment,sortSciencePopularity} from "./science-social";
it("accepts a useful scientific comment and normalizes spaces",()=>{
  expect(validateScienceComment('  这个实验很有趣，孩子发现了新现象。  ')).toEqual({ok:true,body:'这个实验很有趣，孩子发现了新现象。'});
});
it.each(['你是傻逼','你真是傻　逼','ＳＢ东西','色情约炮','去死吧','加微信代开发票','ＦＵＣＫ you','f u c k you'])("rejects common prohibited or disguised content: %s",text=>{
  expect(validateScienceComment(text).ok).toBe(false);
});
it.each(['',' '.repeat(5),'字'.repeat(501)])("rejects empty or oversized comments",text=>expect(validateScienceComment(text).ok).toBe(false));
it("sorts refreshed cards by views and category rankings by likes without mutating input",()=>{
  const items=[{id:'a'},{id:'b'},{id:'c'}],stats={a:{views:2,likes:10},b:{views:9,likes:1},c:{views:9,likes:5}};
  expect(sortSciencePopularity(items,stats,'views').map(x=>x.id)).toEqual(['c','b','a']);
  expect(sortSciencePopularity(items,stats,'likes').map(x=>x.id)).toEqual(['a','c','b']);
  expect(items.map(x=>x.id)).toEqual(['a','b','c']);
});
