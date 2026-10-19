import { describe, it, expect } from 'vitest';
import { identifyTrees } from '@/features/dict-v2/parameter-identity';
import { buildGroupedTable } from '@/features/dict-v2/grouped-table';
import type { DictTreeResponse, DistributionBlock } from '@/lib/api/dict-v2';
import recorded from '../../audit/bc2-lot-a/responses.json';
import distributions from '../../audit/bc2-lot-a/distributions.json';

describe('BC2 lot A — recorded TEST2 API evidence', () => {
 it('does not invent group percentages or totals absent from the API', () => {
  const body=distributions.responses.find(r=>r.body.group_by==='operator_band')!.body;
  const table=buildGroupedTable(body.blocks as DistributionBlock[], 'operator_band');
  expect(table.rows.length).toBeGreaterThan(0);
  for(const row of table.rows) {
   expect(row.total).toBeNull();
   for(const cell of Object.values(row.cells)) {
    expect(cell.percentage).toBeNull();expect(cell.denominator).toBeNull();
   }
  }
 });
 it('does not infer a canonical key by removing array indices', () => {
  const trees=identifyTrees(recorded.catalog.body as DictTreeResponse,recorded.raw.body as DictTreeResponse);
  const leaves=trees.raw!.tree.flatMap(t=>t.origins.flatMap(o=>o.messages.flatMap(m=>m.groups.flatMap(g=>g.kpis))));
  const indexed=leaves.find(l=>l.param_key.includes('/[0]/measId'))!;
  expect(indexed).toBeDefined();
  expect(indexed['distribution_key']).toBeNull();
  expect(indexed['mapping_error']).toBeTruthy();
 });
});
