import {expect,it} from "vitest";
import {validateExperiment, experimentBody} from "./science-experiment";
const input={title:"纸桥承重",ageLabel:"中班",topic:"结构与力",author:"科学组",objectives:"比较纸桥的承重",materials:"纸、积木",steps:"折叠纸桥\n逐个放上积木",principle:"形状影响承重",safety:"成人陪伴，避免积木掉落",stepImages:[{url:"/api/media/uploads/science-resources/supporting/step.png",caption:"折叠纸桥"}]};
it("keeps an experiment's complete structure and ordered step images",()=>{
  const result=validateExperiment(input);
  expect(result.ok).toBe(true);
  if(!result.ok)return;
  expect(experimentBody(result.value)).toContain("## 实验步骤\n折叠纸桥\n逐个放上积木");
  expect(result.value.stepImages[0].caption).toBe("折叠纸桥");
});
it.each(["objectives","materials","steps","principle","safety"])("rejects a missing %s before creating a submission",field=>{
  expect(validateExperiment({...input,[field]:""}).ok).toBe(false);
});
it("rejects unsafe attachment URLs and excess images",()=>{
  expect(validateExperiment({...input,stepImages:[{url:"javascript:alert(1)",caption:""}]}).ok).toBe(false);
  expect(validateExperiment({...input,stepImages:Array(13).fill(input.stepImages[0])}).ok).toBe(false);
});
