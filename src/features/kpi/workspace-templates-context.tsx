import { createContext, useContext } from "react";
import type {
  WorkspaceTemplate,
  WorkspaceTemplateConfiguration,
} from "@/lib/api/workspace-templates";

export type WorkspaceTemplatesContextValue = {
  templates: WorkspaceTemplate[];
  activeTemplate: WorkspaceTemplate | null;
  loading: boolean;
  error: Error | null;
  workspaceDirty: boolean;
  currentConfiguration: () => WorkspaceTemplateConfiguration;
  retry: () => void;
  apply: (template: WorkspaceTemplate) => Promise<void>;
  create: (name: string, description: string | null) => Promise<void>;
  update: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  remove: () => Promise<void>;
};

const WorkspaceTemplatesContext = createContext<WorkspaceTemplatesContextValue | null>(null);

export const WorkspaceTemplatesProvider = WorkspaceTemplatesContext.Provider;

export function useWorkspaceTemplates() {
  return useContext(WorkspaceTemplatesContext);
}
