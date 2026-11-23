/**
 * Admin → Reports. Any staff member with dashboard access sees the operational reports; the money
 * reports (revenue, payments, refunds, settlements, tax) also need finance.view. Each report is
 * shown on screen (JSON) or downloaded as CSV or Excel with the same filters.
 */
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { canAdmin } from '../services/accessService.js';
import reports from '../services/reportService.js';
import { buildCsv, buildXlsx } from '../utils/xlsx.js';

const canFinance = (req) => canAdmin(req.user, 'finance.view');

export const listReports = asyncHandler(async (req, res) => {
  const hotels = await prisma.hotel.findMany({ where: { isDeleted: false }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' } });
  res.json({ success: true, data: { reports: reports.catalogue(canFinance(req)), hotels, cities: [...new Set(hotels.map((h) => h.city).filter(Boolean))].sort() } });
});

export const getReport = asyncHandler(async (req, res) => {
  const { key } = req.params;
  if (!reports.exists(key)) return res.status(404).json({ success: false, message: 'Unknown report' });
  if (reports.isFinanceReport(key) && !canFinance(req)) {
    return res.status(403).json({ success: false, code: 'NO_PERMISSION', message: 'This report needs the finance permission. Ask your administrator for access.' });
  }
  const data = await reports.runReport(key, req.query);
  const format = String(req.query.format || 'json');
  if (format === 'json') return res.json({ success: true, data });

  const name = `ZivoPlus-${data.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}-${data.filters.from}-to-${data.filters.to}`;
  const columns = data.columns;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(buildCsv({ columns, rows: data.rows, totals: data.totals }));
  }
  if (format === 'xlsx') {
    const sheets = [{ name: data.title, columns, rows: data.rows, totals: data.totals }];
    if (data.cards?.length) sheets.push({ name: 'Summary', columns: [{ key: 'label', label: 'Item' }, { key: 'value', label: 'Value', type: 'number' }], rows: data.cards });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    return res.send(buildXlsx(sheets));
  }
  return res.status(400).json({ success: false, message: 'format must be json, csv or xlsx' });
});
