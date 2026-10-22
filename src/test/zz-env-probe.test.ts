import { it, expect } from "vitest";
import { isApiMode } from "@/lib/api/http";
it("env probe", () => {
  const m = import.meta as unknown as { env: Record<string, string> };
  console.log("raw", m.env.VITE_BC4_DATA, "mode", isApiMode());
  try {
    m.env.VITE_BC4_DATA = "mock";
    console.log("assign ok ->", m.env.VITE_BC4_DATA, "mode", isApiMode());
  } catch (e) {
    console.log("assign threw", String(e));
  }
  console.log("descriptor", JSON.stringify(Object.getOwnPropertyDescriptor(m.env, "VITE_BC4_DATA")));
  expect(1).toBe(1);
});
