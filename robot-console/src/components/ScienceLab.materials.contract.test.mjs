import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/ScienceLab.tsx"), "utf8");
const uploadClient = fs.readFileSync(path.resolve("src/lib/science-upload-client.ts"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("adds the material entry only for science poems and stories", () => {
  assert.match(component, /selection\.category === "科学诗" \|\| selection\.category === "科学故事"/);
  assert.match(component, /className="science-material-add"/);
  assert.match(component, /aria-label="添加新材料"/);
  assert.match(component, /title="添加新材料"/);
  assert.match(component, /<Plus size=\{16\} aria-hidden="true" \/>/);
  assert.match(component, /setMaterialCategory\(selection\.category as MaterialCategory\)/);
});

test("collects the required poem and story fields in the existing laboratory dialog", () => {
  assert.match(component, /<h2 id="science-material-dialog-title">添加新材料<\/h2>/);
  assert.match(component, /科学诗正文 <b>\*<\/b>/);
  assert.match(component, /故事视频 <b>\*<\/b>/);
  assert.match(component, /内容简介 \/ 教学提示 <b>\*<\/b>/);
  assert.match(component, /\/api\/science-resources\/recognize/);
});

test("offers an optional cover-image upload and includes it in the material submit payload", () => {
  const dialog = component.match(/function ScienceMaterialDialog\([\s\S]*?\n}\n\nexport function ScienceLab/)?.[0] ?? component;

  assert.match(component, /coverFile: File \| null/);
  assert.match(dialog, /const \[coverFile, setCoverFile\] = useState<File \| null>\(null\)/);
  assert.match(dialog, /<span>封面图片（可选）<\/span>/);
  assert.match(dialog, /accept="image\/\*,\.jpg,\.jpeg,\.png,\.webp"/);
  assert.match(dialog, /setCoverFile\(event\.target\.files\?\.\[0\] \?\? null\)/);
  assert.match(dialog, /category,\s*form,\s*coverFile,\s*poemFile,\s*videoFile,\s*supportingFile,/);
});

test("uploads files through the server-side OSS endpoint before submitting for review", () => {
  assert.match(component, /import \{ uploadScienceMaterial \} from "@\/lib\/science-upload-client"/);
  assert.match(uploadClient, /xhr\.open\("POST", "\/api\/science-resources\/upload"\)/);
  assert.match(uploadClient, /xhr\.timeout = 180_000/);
  assert.match(component, /uploadMaterialFile\(videoFile, category === "科学故事" \? "stories" : "videos", onUploadProgress\)/);
  assert.match(component, /科学诗视频（可选）/);
  assert.match(component, /requestBody\.set\("videoUrl", videoUrl\)/);
  assert.match(component, /requestBody\.set\("documentUrl", await uploadMaterialFile/);
});

test("uses a user-uploaded cover before submitting the material", () => {
  const submitFlow = component.match(/const submitMaterial = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0] ?? component;

  assert.match(submitFlow, /form,\s*coverFile,\s*poemFile,\s*videoFile,\s*supportingFile,/);
  assert.match(
    submitFlow,
    /if \(coverFile\) \{[\s\S]*?uploadMaterialFile\(coverFile, "covers", onUploadProgress\)[\s\S]*?requestBody\.set\("coverUrl", coverUrl\);/,
  );
});

test("uses the first story-video frame as a WebP cover before submitting the story", () => {
  assert.match(component, /function extractVideoFirstFrame\(file: File\)/);
  assert.match(component, /document\.createElement\("video"\)/);
  assert.match(component, /canvas\.toBlob\([\s\S]*?"image\/webp"/);
  assert.match(component, /URL\.revokeObjectURL\(/);
  assert.match(uploadClient, /"videos"/);

  const submitFlow = component.match(/const submitMaterial = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0] ?? component;
  assert.match(submitFlow, /if \(videoFile\)/);
  assert.match(submitFlow, /extractVideoFirstFrame\(videoFile\)/);
  assert.match(submitFlow, /uploadMaterialFile\(storyCover, "covers", onUploadProgress\)/);
  assert.match(submitFlow, /requestBody\.set\("coverUrl",/);
  assert.match(submitFlow, /requestBody\.set\("videoUrl", videoUrl\)/);
  assert.match(submitFlow, /category === "科学故事" && !coverFile \? extractVideoFirstFrame\(videoFile\) : Promise\.resolve\(null\)/);
  assert.match(submitFlow, /if \(storyCover\)/);
});

test("defers automatic poem cover generation until after review", () => {
  const review = fs.readFileSync(path.resolve("app/api/science-literature/[id]/review/route.ts"), "utf8");
  assert.doesNotMatch(component, /fetch\("\/api\/science-resources\/generate-cover"/);
  assert.match(review, /category === "科学诗" && !validation\.value\.coverUrl/);
  assert.match(review, /after\(async \(\) => \{\s*if \(await generatePublishedPoemCover/);
});

test("shows a dismissible success card after material creation", () => {
  assert.match(component, /title: "已提交审核"/);
  assert.match(component, /className="science-material-success-toast"/);
  assert.match(component, /<CheckCircle2 /);
  assert.match(component, /onClick=\{\(\) => setMaterialSuccessNotice\(null\)\}/);
});

test("uses generated literature covers as a full card image instead of a framed thumbnail", () => {
  const coverRule = styles.match(/\.knowledge-card__media > \.knowledge-card__literature-art \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(coverRule, /position: absolute/);
  assert.match(coverRule, /inset: 0/);
  assert.match(coverRule, /width: 100%/);
  assert.match(coverRule, /height: 100%/);
  assert.match(coverRule, /object-fit: cover/);
  assert.doesNotMatch(coverRule, /object-fit: contain/);
});

test("preserves line and stanza breaks in submitted poem text without changing other Markdown", () => {
  assert.match(component, /const submittedPoem = display\.category === "科学诗" && userSubmittedLiterature/);
  assert.match(component, /submittedPoem \? detailBody : <Markdown>\{detailBody\}<\/Markdown>/);
  assert.match(styles, /\.knowledge-detail__content--verse\s*\{[^}]*white-space:\s*pre-wrap\s*;/);
});

test("does not repeat a user-submitted poem or story cover in its detail gallery", () => {
  assert.match(component, /const userSubmittedLiterature =/);
  assert.match(component, /display\.category === "科学诗" \|\| display\.category === "科学故事"/);
  assert.match(component, /item\?\.allocationBasis === "用户提交"/);
  assert.match(component, /const detailImages = display\.category === "科学故事" \|\| userSubmittedLiterature/);
  assert.match(component, /images\.filter\(\(image\) => !\/\(\?:封面\|cover\)\/iu\.test\(image\.title\)\)/);

  const literatureGallery = component.match(/\{detailImages\.length && display\.category !== "科学实验" \?[\s\S]*?\) : null\}/)?.[0] ?? "";
  assert.match(literatureGallery, /detailImages\.map\(\(image\) =>/);
  assert.doesNotMatch(literatureGallery, /\{images\.map/);
});
