import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VisualizationItems } from "@/features/kpi/VisualizationMenu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
describe("temporal capability from catalogue",()=>{
 it("does not enable an aggregate with throughput units",()=>{
  render(<DropdownMenu open><DropdownMenuTrigger>Views</DropdownMenuTrigger><DropdownMenuContent><VisualizationItems throughput onChange={()=>{}} /></DropdownMenuContent></DropdownMenu>);
  const item=screen.getByRole("menuitem",{name:"Série (Task Time)"});
  expect(item).toHaveAttribute("aria-disabled","true");
  expect(item.parentElement).toHaveAttribute("title","pas de série temporelle pour ce KPI (source agrégée)");
 });
 it("enables a proven temporal source",()=>{
  render(<DropdownMenu open><DropdownMenuTrigger>Views</DropdownMenuTrigger><DropdownMenuContent><VisualizationItems seriesAvailable onChange={()=>{}} /></DropdownMenuContent></DropdownMenu>);
  expect(screen.getByRole("menuitem",{name:"Série (Task Time)"})).not.toHaveAttribute("aria-disabled","true");
 });
});
