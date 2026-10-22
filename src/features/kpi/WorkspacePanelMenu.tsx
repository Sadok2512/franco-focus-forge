// Shared "..." panel menu used by every workspace panel (KPI graph, Metrics
// card, Metrics table) so actions live in one compact, identical menu.
import type { ComponentProps, ReactNode, Ref } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspacePanelMenu({
  label,
  triggerRef,
  onCloseAutoFocus,
  children,
}: {
  label: string;
  triggerRef?: Ref<HTMLButtonElement>;
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="kpi-icon"
          aria-label={label}
          title={label}
          data-testid="workspace-panel-menu"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[210px]"
        data-testid="workspace-panel-menu-content"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
