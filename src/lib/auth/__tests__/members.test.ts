import { describe, expect, it } from "vitest";
import { canManage } from "@/lib/auth/members";

describe("canManage", () => {
  it("lets an admin manage both teams", () => {
    expect(canManage({ role: "admin", team: null }, "girls")).toBe(true);
    expect(canManage({ role: "admin", team: null }, "boys")).toBe(true);
  });
  it("lets a girls coach manage only girls", () => {
    expect(canManage({ role: "coach", team: "girls" }, "girls")).toBe(true);
    expect(canManage({ role: "coach", team: "girls" }, "boys")).toBe(false);
  });
  it("lets a boys coach manage only boys", () => {
    expect(canManage({ role: "coach", team: "boys" }, "girls")).toBe(false);
    expect(canManage({ role: "coach", team: "boys" }, "boys")).toBe(true);
  });
});
