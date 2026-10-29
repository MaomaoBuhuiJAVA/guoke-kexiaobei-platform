import { describe, expect, it } from "vitest";
import { accountStats, explorerStats, type GameProgress } from "./progress";

describe("account record totals", () => {
  it("counts preserved server records from all owned legacy profiles", () => {
    const now = new Date("2026-10-29T01:00:00Z");
    const progress: GameProgress = {
      version: 1, activeProfileId: "one",
      profiles: ["one", "two"].map(id => ({ id, name: "隔离测试", age: "中班", avatar: "planet" })),
      completions: [
        { id: "record-one", profileId: "one", gameId: "magnet", completedAt: now.toISOString(), points: 10 },
        { id: "record-two", profileId: "two", gameId: "water", completedAt: now.toISOString(), points: 10 },
      ],
    };
    expect(accountStats(progress, now)).toMatchObject({ totalPoints: 20, todayPoints: 20, weekPoints: 20, topics: 2 });
    expect(explorerStats(progress, "one", now).totalPoints).toBe(10);
  });
});
