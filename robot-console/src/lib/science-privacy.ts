type PublicMaterial = {author: string};

/** Redact known child attribution at the public output boundary; retain source records. */
export function publicScienceItem<T extends PublicMaterial>(item: T): T {
  if (!/(?:托|小|中|大)[零一二三四五六七八九十\d]*班/u.test(item.author) || /老师|教师/u.test(item.author)) return item;
  const name = item.author.replace(/^.*?(?:托|小|中|大)[零一二三四五六七八九十\d]*班\s*/u, "").match(/^[\p{Script=Han}·]{2,8}/u)?.[0];
  const redact = (value: unknown, key = ""): unknown => {
    if (typeof value === "string") {
      // File addresses must keep working. Human-readable metadata is redacted.
      if (/^(?:id|baseId|knowledgeBaseId|videoUrl|coverUrl|publicPath|externalUrl)$/u.test(key)) return value;
      return name ? value.replaceAll(item.author, "小朋友").replaceAll(name, "小朋友") : value.replaceAll(item.author, "小朋友");
    }
    if (Array.isArray(value)) return value.map(entry => redact(entry));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, redact(entry, field)]));
    return value;
  };
  return {...redact(item) as T, author: "小朋友"};
}
