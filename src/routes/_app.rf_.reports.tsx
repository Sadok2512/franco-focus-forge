import { createFileRoute } from "@tanstack/react-router";
import { DriveTestReportsPage } from "@/features/rf-modules/DriveTestReportsPage";
import "@/features/rf-modules/drive-test-reports.css";

export const Route = createFileRoute("/_app/rf_/reports")({
  head: () => ({ meta: [{ title: "Drive Test Reports — BC4" }, { name: "description", content: "Project-scoped LTE and NR drive-test analytical reports." }] }),
  component: DriveTestReportsPage,
});
