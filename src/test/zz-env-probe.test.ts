import { it, expect } from "vitest";
it("env", () => { console.log("DATA=", import.meta.env.VITE_BC4_DATA, "PROC=", process.env.VITE_BC4_DATA); expect(1).toBe(1); });
