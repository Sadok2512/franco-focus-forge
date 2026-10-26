import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  lang: z.enum(["en", "fr"]),
  status: z.record(z.union([z.string().max(300), z.number(), z.null()])),
  metadata: z.record(z.string().max(300)),
  notes: z.string().max(2000),
});

export const diagnoseRsrpFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { diagnoseRsrp } = await import("./rsrp-diagnosis.server");
    try {
      return { ok: true as const, text: await diagnoseRsrp(data) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "AI diagnosis failed." };
    }
  });
