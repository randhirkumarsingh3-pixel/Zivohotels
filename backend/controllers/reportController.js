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

/** Rows sent for the on-screen table (the page shows 500). */
const SCREEN_ROWS = 500;

/**
 * The same report with the same filters, asked for by several people (or the screen and then the
 * download) within 60 seconds, is worked out once per server process.
 */
const RECENT_MS = 60 * 1000;
const recent = new Map(); // key -> { at, promise }
const sharedRun = (key, query) => {
  const { format: _format, ...filters } = query; // eslint-disable-line no-unused-vars
  const id = `${key}:${JSON.stringify(Object.keys(filters).sort().map((k) => [k, filters[k]]))}`;
  const hit = recent.get(id);
  if (hit && Date.now() - hit.at < RECENT_MS) return hit.promise;
  const promise = reports.runReport(key, query);
  recent.set(id, { at: Date.now(), promise });
  promise.catch(() => recent.delete(id));
  // Keep only a few results in memory (a big report can be tens of MB)
  if (recent.size > 10) {
    for (const [k, v] of recent) if (Date.now() - v.at >= RECENT_MS || recent.size > 10) recent.delete(k);
  }
  return promise;
};

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
  const data = await sharedRun(key, req.query);
  const format = String(req.query.format || 'json');
  // On screen the page shows the first rows only; totals cover all of them and downloads have
  // every row. Sending all 20,000 rows to the browser cost hundreds of MB on the server.
  if (format === 'json') {
    const rowCount = data.rows.length;
    return res.json({ success: true, data: { ...data, rows: data.rows.slice(0, SCREEN_ROWS), rowCount } });
  }

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
