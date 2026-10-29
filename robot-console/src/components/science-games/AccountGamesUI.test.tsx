import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) }));
vi.mock("./GameProvider", () => {
  const profile = { id: "fixture-profile", name: "旧档案", age: "中班", avatar: "planet" };
  return { useGameProgress: () => ({
    profile, progress: { version: 1, activeProfileId: profile.id, profiles: [profile], completions: [] },
    account: { id: "fixture-account", name: "测试账号" }, recordSource: "account", cloudBusy: false, cloudStatus: "ready", pendingCount: 0,
  }) };
});

import { GamesHome } from "./GamesHome";
import { ExplorationBoard } from "./ExplorationBoard";
import { ExplorerGrowth } from "./ExplorerGrowth";

describe("account-based game pages", () => {
  it("keeps the games home focused on the games without the record card or footer", () => {
    const $ = load(renderToStaticMarkup(<GamesHome />));
    expect($("section[aria-label='我的游戏记录']").length).toBe(0);
    expect($("footer").length).toBe(0);
    expect($("h2").map((_, element) => $(element).text()).get()).toEqual(["磁力打捞", "沉浮实验室", "影子工坊"]);
  });
  it("shows one online leaderboard without local scope tabs or personal summary", () => {
    const $ = load(renderToStaticMarkup(<ExplorationBoard />));
    const text = $("body").text();
    expect(text).not.toContain("我的科学游戏记录");
    expect(text).not.toContain("一起发现科学");
    expect(text).not.toContain("本机手册");
    expect(text).not.toContain("账号手册");
    expect(text).not.toContain("我的记录");
    expect($("[aria-label='榜单范围']").length).toBe(0);
    expect($("[aria-label='刷新排行榜']").length).toBe(1);
  });
  it("shows the account identity and records without a manual storage or sync panel", () => {
    const text = load(renderToStaticMarkup(<ExplorerGrowth />))("body").text();
    expect(text).toContain("测试账号");
    for (const removed of ["账号手册", "本机手册", "同步记录", "添加孩子", "当前档案"]) expect(text).not.toContain(removed);
  });
});
