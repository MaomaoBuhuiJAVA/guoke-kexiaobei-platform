import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const imageProps = { ...props };
  delete imageProps.fill;
  delete imageProps.priority;
  delete imageProps.unoptimized;
  return React.createElement("img", imageProps);
} }));
vi.mock("./SciencePet", () => ({ SciencePet: () => null }));

import { AgentHome } from "./AgentHome";
import { ScienceLab } from "./ScienceLab";

// Isolated synthetic session props; these tests never create accounts or records.
const user: SessionUser = { id: "navigation-test", name: "导航测试用户", role: "USER" };
const data = { profile: { shortName: "国科二幼" } } as React.ComponentProps<typeof AgentHome>["data"];
const renderers = [
  ["home", (session: SessionUser | null) => <AgentHome data={data} initialUser={session} />],
  ["lab", (session: SessionUser | null) => <ScienceLab initialItems={[]} initialUser={session} />],
] as const;

describe("science park navigation", () => {
  it("removes the home header shortcut and hero promotion for both session states", () => {
    for (const session of [null, user]) {
      const $ = load(renderToStaticMarkup(<AgentHome data={data} initialUser={session} />));
      expect($("header a[href='/games']").length).toBe(0);
      expect($(".home-hero__copy a[href='/games']").length).toBe(0);
    }
  });

  for (const [name, render] of renderers) {
    it(`${name}: visitors keep three module actions without a park shortcut`, () => {
      const $ = load(renderToStaticMarkup(render(null)));
      const nav = $("nav[aria-label='移动端主导航']");
      expect(nav.find("button, a").length).toBe(3);
      expect(nav.find("a[href='/games']").length).toBe(0);
    });

    it(`${name}: signed-in users get the park as a fourth bottom navigation link`, () => {
      const $ = load(renderToStaticMarkup(render(user)));
      const nav = $("nav[aria-label='移动端主导航']");
      expect(nav.find("button, a").length).toBe(4);
      expect(nav.find("a[href='/games']").text()).toContain("科学乐园");
      expect(nav.attr("style")).toContain("repeat(4,");
    });
  }
});
