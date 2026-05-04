import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFixtureImport } from '../../src/server/lib/importService';
import { buildCategorizedSpendWorkbook } from '../../src/server/lib/workbook';
import { resetDbForTests } from '../../src/server/lib/store';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

beforeEach(() => resetDbForTests());

describe('categorized spend workbook export', () => {
  it('returns a multi-sheet xlsx buffer after categorizing imported spend', async () => {
    createFixtureImport(fixture('happy-path.csv'), { date: 'Date', description: 'Description', amount: 'Amount', account: 'Account', category: 'Category', vendor: 'Vendor', memo: 'Memo' }, 'spend-positive');
    const workbook = await buildCategorizedSpendWorkbook();
    expect(Buffer.isBuffer(workbook)).toBe(true);
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.length).toBeGreaterThan(5000);
  });
});
