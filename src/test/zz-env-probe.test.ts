import { it, expect } from "vitest";
import { isApiMode } from "@/lib/api/http";
it("literal vs variable", () => {
  const m = import.meta as unknown as { env: Record<string, string> };
  console.log("literal", import.meta.env.VITE_BC4_DATA, "variable", m.env.VITE_BC4_DATA, "mode", isApiMode());
  expect(1).toBe(1);
});
