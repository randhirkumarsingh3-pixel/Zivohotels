/** Number and date formats for the operations pages. */
export const inr = (n) => (n === null || n === undefined ? '—' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`);
export const int = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));
export const pct = (n, d = 0) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(d)}%`);
export const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
export const STATUS_LABEL = { ok: 'OK', warn: 'Needs attention', down: 'Problem' };
