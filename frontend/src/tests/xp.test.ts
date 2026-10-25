import { describe, expect, it } from "vitest";

import { xpProgress } from "../lib/xp";

describe("xpProgress", () => {
  it("mirrors the backend level formula at its boundaries", () => {
    expect(xpProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(xpProgress(99)).toEqual({ level: 1, xpIntoLevel: 99, xpForNextLevel: 100 });
    expect(xpProgress(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 300 });
    expect(xpProgress(399)).toEqual({ level: 2, xpIntoLevel: 299, xpForNextLevel: 300 });
    expect(xpProgress(400)).toEqual({ level: 3, xpIntoLevel: 0, xpForNextLevel: 500 });
  });

  it("clamps invalid negative totals to zero", () => {
    expect(xpProgress(-10)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100 });
  });
});
