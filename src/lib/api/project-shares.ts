import { z } from "zod";
import { apiFetch } from "./http";

export const ProjectShareSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "ingenieur", "lecteur"]),
  created_at: z.string(),
});
export type ProjectShare = z.infer<typeof ProjectShareSchema>;

export function getProjectShares(projectId: string): Promise<ProjectShare[]> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/shares`, ProjectShareSchema.array());
}

export function addProjectShare(projectId: string, email: string): Promise<ProjectShare> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/shares`, ProjectShareSchema, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function removeProjectShare(projectId: string, userId: string): Promise<null> {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/shares/${encodeURIComponent(userId)}`,
    z.null(),
    { method: "DELETE" },
  );
}
