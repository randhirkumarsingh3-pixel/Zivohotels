/**
 * A small Excel (.xlsx) writer: one or more sheets of rows, with a bold header row that stays in
 * view, money / number / percentage / date formats, sensible column widths and an optional bold
 * totals row. Enough for reports and statements without a large spreadsheet library.
 *
 * sheets: [{ name, columns: [{ key, label, type }], rows: [{...}], totals?: {...} }]
 * type: 'text' | 'money' | 'int' | 'number' | 'pct' | 'date' | 'datetime'
 */
import { zipSync, strToU8 } from 'fflate';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // Characters XML 1.0 doesn't allow
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// Excel stores dates as days since 1899-12-30. Moments (datetime) are shown in India time; calendar
// dates (stored at midnight UTC) as they are.
const IST = 330 * 60000;
const excelDate = (v, type) => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : (d.getTime() + (type === 'datetime' ? IST : 0)) / 86400000 + 25569;
};
const textDate = (v, type) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const x = new Date(d.getTime() + (type === 'datetime' ? IST : 0)).toISOString();
  return type === 'datetime' ? `${x.slice(0, 10)} ${x.slice(11, 16)}` : x.slice(0, 10);
};

// Style ids (cellXfs order in styles.xml): 0 text, 1 header, 2 money, 3 int, 4 pct, 5 date, 6 datetime,
// 7 number, then the same in bold for the totals row (8..14)
const STYLE = { text: 0, money: 2, int: 3, pct: 4, date: 5, datetime: 6, number: 7 };
const BOLD = { text: 8, money: 9, int: 10, pct: 11, date: 12, datetime: 13, number: 14 };

const cell = (ref, value, type, bold) => {
  const s = (bold ? BOLD : STYLE)[type] ?? 0;
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${s}"/>`;
  if (type === 'date' || type === 'datetime') {
    const n = excelDate(value, type);
    return n === null ? `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${esc(value)}</t></is></c>` : `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  }
  if (['money', 'int', 'number', 'pct'].includes(type) && Number.isFinite(Number(value))) {
    // Percentages are stored as fractions so Excel shows 15% for 15
    return `<c r="${ref}" s="${s}"><v>${type === 'pct' ? Number(value) / 100 : Number(value)}</v></c>`;
  }
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
};

const sheetXml = ({ columns, rows, totals }) => {
  const widths = columns.map((c) => {
    const longest = Math.max(String(c.label).length, ...rows.slice(0, 500).map((r) => String(r[c.key] ?? '').length));
    const base = c.type === 'date' ? 12 : c.type === 'datetime' ? 18 : c.type === 'money' ? 14 : 8;
    return Math.min(48, Math.max(base, longest + 2));
  });
  const lines = [];
  lines.push(`<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t>${esc(c.label)}</t></is></c>`).join('')}</row>`);
  rows.forEach((r, ri) => {
    lines.push(`<row r="${ri + 2}">${columns.map((c, i) => cell(`${colName(i)}${ri + 2}`, r[c.key], c.type || 'text', false)).join('')}</row>`);
  });
  if (totals) {
    const rn = rows.length + 2;
    lines.push(`<row r="${rn}">${columns.map((c, i) => cell(`${colName(i)}${rn}`, i === 0 && totals[c.key] == null ? 'Total' : totals[c.key], i === 0 && totals[c.key] == null ? 'text' : c.type || 'text', true)).join('')}</row>`);
  }
  const last = `${colName(Math.max(0, columns.length - 1))}${rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${lines.join('')}</sheetData>
${rows.length ? `<autoFilter ref="A1:${last}"/>` : ''}
</worksheet>`;
};

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="dd-mmm-yyyy"/><numFmt numFmtId="167" formatCode="dd-mmm-yyyy hh:mm"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13294B"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="2" fillId="0" borderId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Builds an .xlsx file (Buffer) from sheets. */
export const buildXlsx = (sheets) => {
  // Sheet names: unique, at most 31 characters, without : \ / ? * [ ]
  const used = new Set();
  const names = sheets.map((s, i) => {
    let n = String(s.name || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;
    while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i + 1}`;
    used.add(n.toLowerCase());
    return n;
  });
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return Buffer.from(zipSync(files, { level: 6 }));
};

/** CSV with a byte-order mark, so Excel opens ₹ and Hindi names correctly. */
export const buildCsv = ({ columns, rows, totals }) => {
  const q = (v, type) => {
    if (v === null || v === undefined) return '';
    const s = (type === 'date' || type === 'datetime') && v !== '' ? textDate(v, type) : String(v);
    // A leading = + - @ would run as a formula in Excel
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const out = [columns.map((c) => q(c.label)).join(',')];
  for (const r of rows) out.push(columns.map((c) => q(r[c.key], c.type)).join(','));
  if (totals) out.push(columns.map((c, i) => q(i === 0 && totals[c.key] == null ? 'Total' : totals[c.key])).join(','));
  return `\uFEFF${out.join('\r\n')}\r\n`;
};

export default { buildXlsx, buildCsv };
