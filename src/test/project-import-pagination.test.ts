import { describe, expect, it } from "vitest";
import {
  IMPORT_FILES_PAGE_SIZE,
  paginateImportFiles,
} from "@/features/projects/ProjectRowDetails";

const files = (n: number) => Array.from({ length: n }, (_, i) => `file-${i}.nmf`);

describe("imported files pagination", () => {
  it("shows 10 files per page", () => {
    expect(IMPORT_FILES_PAGE_SIZE).toBe(10);
    const p = paginateImportFiles(files(25), 0);
    expect(p.pageCount).toBe(3);
    expect(p.rows).toHaveLength(10);
    expect(p.rows[0]).toBe("file-0.nmf");
  });

  it("serves the requested page and the partial last page", () => {
    const p = paginateImportFiles(files(25), 2);
    expect(p.rows).toEqual(["file-20.nmf", "file-21.nmf", "file-22.nmf", "file-23.nmf", "file-24.nmf"]);
  });

  it("clamps an out-of-range page instead of showing nothing", () => {
    expect(paginateImportFiles(files(25), 99).page).toBe(2);
    expect(paginateImportFiles(files(25), -1).page).toBe(0);
  });

  it("keeps a single page when there are 10 files or fewer", () => {
    const p = paginateImportFiles(files(10), 0);
    expect(p.pageCount).toBe(1);
    expect(p.rows).toHaveLength(10);
  });
});
