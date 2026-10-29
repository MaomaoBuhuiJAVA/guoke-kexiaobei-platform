import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/games" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) }));
// Isolated synthetic UI fixtures: no accounts, completion requests or scores are saved.
vi.mock("./GameProvider", () => {
  const profile = { id: "navigation-fixture", name: "导航测试", age: "中班", avatar: "planet" };
  return {
    GameProvider: ({ children }: { children: React.ReactNode }) => children,
    useGameProgress: () => ({
      ready: true, storageError: false, profile, recordSource: "device", account: null,
      progress: { version: 1, activeProfileId: profile.id, profiles: [profile], completions: [] },
      cloudBusy: false, pendingCount: 0, cloudStatus: "ready", cloudError: null,
    }),
  };
});
vi.mock("./useGameReward", () => ({ useGameReward: () => ({
  reward: { points: 10, reason: "隔离的完成状态测试" }, pending: false,
  award: vi.fn(), clearReward: vi.fn(),
}) }));

import { GameShell } from "./GameShell";
import { GamesHome } from "./GamesHome";
import { ExplorerGrowth } from "./ExplorerGrowth";
import { MagnetGame } from "./MagnetGame";

describe("single leaderboard shortcut", () => {
  it.each([
    ["/games", <GamesHome key="home" />],
    ["/games/growth", <ExplorerGrowth key="growth" />],
    ["/games/play/magnet", <MagnetGame key="magnet" />],
  ])("%s keeps only the labeled header shortcut", (pathname, content) => {
    state.pathname = pathname;
    const $ = load(renderToStaticMarkup(<GameShell>{content}</GameShell>));
    const ranking = $("a[href='/games/leaderboard']");
    expect(ranking.length).toBe(1);
    expect($("header a[href='/games/leaderboard'] span").text()).toBe("排行榜");
    expect(ranking.attr("aria-label")).toBe("排行榜");
    expect($("nav[aria-label='科学乐园导航'] a[href='/games/leaderboard']").length).toBe(0);
    if (pathname === "/games") {
      expect($("body").text()).not.toContain("科小贝的动手科学馆");
      expect($("nav[aria-label='科学乐园导航'] a").map((_, element) => $(element).text()).get()).toEqual(["科学乐园", "我的成长", "资源库"]);
    }
  });
});
