import { expect } from 'chai';
import { unzipSync, strFromU8 } from 'fflate';
import { normaliseFilters, addTotals, groupRows, catalogue } from '../../services/reportService.js';
import { buildXlsx, buildCsv } from '../../utils/xlsx.js';

describe('Reports', () => {
  describe('filters', () => {
    it('defaults to this month and keeps from before to', () => {
      const f = normaliseFilters({});
      expect(f.from).to.match(/^\d{4}-\d{2}-01$/);
      expect(normaliseFilters({ from: '2026-12-31', to: '2026-12-01' })).to.include({ from: '2026-12-01', to: '2026-12-31' });
    });
    it('ignores values it does not know', () => {
      const f = normaliseFilters({ from: 'yesterday', stayType: 'WEEKLY', paymentType: 'CASH', groupBy: 'year' });
      expect(f.stayType).to.equal(null);
      expect(f.paymentType).to.equal(null);
      expect(f.groupBy).to.equal(null);
    });
    it('limits a report to about two years', () => {
      const f = normaliseFilters({ from: '2020-01-01', to: '2026-12-31' });
      expect((Date.parse(f.to) - Date.parse(f.from)) / 86400000).to.be.at.most(731);
    });
  });

  describe('totals and grouping', () => {
    const columns = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'property', label: 'Property' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'lead', label: 'Lead', type: 'int', total: 'avg' }, { key: 'n', label: 'Attempts', type: 'int', total: 'none' }];
    const rows = [
      { date: '2026-12-01', property: 'A', amount: 100.105, lead: 2, n: 1 },
      { date: '2026-12-09', property: 'B', amount: 50, lead: 4, n: 3 },
      { date: '2026-12-10', property: 'A', amount: 25.5, lead: null, n: 1 },
    ];
    it('adds up money, averages averages, leaves counts that do not add up', () => {
      expect(addTotals(columns, rows)).to.deep.equal({ amount: 175.61, lead: 3 });
    });
    it('groups by property and by week (weeks start on Monday)', () => {
      const byHotel = groupRows({}, columns, rows, 'property');
      expect(byHotel.rows).to.deep.equal([{ group: 'A', count: 2, amount: 125.61, lead: 2 }, { group: 'B', count: 1, amount: 50, lead: 4 }]);
      expect(groupRows({}, columns, rows, 'week').rows.map((r) => r.group)).to.deep.equal(['Week of 2026-11-30', 'Week of 2026-12-07']);
    });
    it('works out percentages again from the totals', () => {
      const occ = [{ key: 'available', type: 'int' }, { key: 'sold', type: 'int' }, { key: 'occupancy', type: 'pct' }];
      const derive = (t) => ({ ...t, occupancy: t.available ? (t.sold / t.available) * 100 : 0 });
      expect(addTotals(occ, [{ available: 10, sold: 9 }, { available: 30, sold: 1 }], derive).occupancy).to.equal(25);
    });
  });

  it('shows money reports only to staff with the finance permission', () => {
    const all = catalogue(true).map((r) => r.key);
    const ops = catalogue(false).map((r) => r.key);
    expect(all).to.include.members(['bookings', 'revenue', 'payments', 'refunds', 'collections', 'tax', 'settlements']);
    expect(ops).to.include('bookings').and.not.include.members(['revenue', 'payments', 'refunds', 'collections', 'tax', 'settlements']);
  });

  describe('downloads', () => {
    const columns = [{ key: 'when', label: 'When', type: 'datetime' }, { key: 'guest', label: 'Guest' }, { key: 'amount', label: 'Amount', type: 'money' }];
    const rows = [{ when: new Date('2026-12-01T06:30:00Z'), guest: '=HYPERLINK("x")', amount: 1234.5 }, { when: new Date('2026-12-02T00:00:00Z'), guest: 'Rao, "Anu"', amount: -10 }];
    it('CSV: India time, safe from formulas, quotes commas and quotes, totals row', () => {
      const csv = buildCsv({ columns, rows, totals: { amount: 1224.5 } });
      expect(csv.charCodeAt(0)).to.equal(0xFEFF);
      const lines = csv.slice(1).trim().split('\r\n');
      expect(lines[0]).to.equal('When,Guest,Amount');
      expect(lines[1]).to.equal('2026-12-01 12:00,"\'=HYPERLINK(""x"")",1234.5');
      expect(lines[2]).to.equal('2026-12-02 05:30,"Rao, ""Anu""",-10');
      expect(lines[3]).to.equal('Total,,1224.5');
    });
    it('Excel: a real workbook with the sheets, header, numbers and totals', () => {
      const files = unzipSync(buildXlsx([{ name: 'Bookings', columns, rows, totals: { amount: 1224.5 } }, { name: 'Summary', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] }]));
      expect(Object.keys(files)).to.include.members(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
      expect(strFromU8(files['xl/workbook.xml'])).to.include('name="Bookings"').and.include('name="Summary"');
      const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
      expect(sheet).to.include('<t>Amount</t>').and.include('<v>1234.5</v>').and.include('&quot;x&quot;').and.include('state="frozen"');
      expect(sheet).to.include('<row r="4">'); // header + 2 rows + totals
    });
  });
});
