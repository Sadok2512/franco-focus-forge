import { z } from "zod";

export const FileSummaryCellSchema = z.object({
  value: z.union([z.string(), z.number()]).nullable(),
  n: z.number().int().nullable(),
  max: z.number().nullable(),
  unit: z.string().nullable(),
  source_event: z.string(),
  reason: z.string().nullable(),
  query_id: z.string(),
});

export const FileSummarySchema = z.object({
  file_id: z.string(),
  filename: z.string(),
  cells: z.record(z.string(), FileSummaryCellSchema),
});

export const FileSummaryResponseSchema = z.object({
  project_id: z.string(),
  offset: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  query_id: z.string(),
  files: z.array(FileSummarySchema),
});

export type FileSummaryCell = z.infer<typeof FileSummaryCellSchema>;
export type FileSummaryResponse = z.infer<typeof FileSummaryResponseSchema>;
