import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Send, Download, Search, Settings2, X, FileSignature, Trash2 } from 'lucide-react';
import { agreementApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Agreements: every property's listing agreement. ZivoPlus prepares it from the template
 * (Agreement template) and the property's onboarding details, with the commission agreed for that
 * property; the owner gets an email to read and sign it online (typed name + emailed code).
 */
const STATUS = {
  DRAFT: ['bg-gray-100 text-gray-700', 'Draft'],
  PENDING_SIGNATURE: ['bg-amber-100 text-amber-900', 'Waiting for signature'],
  SIGNED: ['bg-green-100 text-green-800', 'Signed'],
  ACTIVE: ['bg-green-100 text-green-800', 'Signed'],
  EXPIRED: ['bg-red-100 text-red-700', 'Expired'],
  PENDING: ['bg-gray-100 text-gray-700', 'Not prepared'],
};
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const openBlob = async (fn, setErr) => {
  try { const url = URL.createObjectURL(await fn()); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e) { setErr(e.message || 'Could not open the PDF.'); }
};

const PrepareDialog = ({ hotel, onClose, onDone }) => {
  const [commission, setCommission] = useState(hotel.agreement?.commissionRate ?? '');
  const [payoutCycle, setPayoutCycle] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const body = () => ({ commissionRate: commission === '' ? undefined : Number(commission), payoutCycle: payoutCycle || undefined });
  const doPreview = async () => {
    setBusy('preview'); setErr('');
    try { setPreview(await agreementApi.preview(hotel.id, body())); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  useEffect(() => { doPreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy('send'); setErr('');
    try { await agreementApi.prepare(hotel.id, { ...body(), send: true }); onDone(`Agreement sent to ${hotel.owner?.email || 'the owner'}.`); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="prep-h">
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="prep-h" className="text-lg font-bold text-gray-900">Prepare agreement: {hotel.name}</h2><p className="text-sm text-gray-600">{hotel.owner?.name} · {hotel.owner?.email}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-500"><X size={18} /></button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-700">Commission (%)
            <input type="number" min="0.5" max="50" step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="Required" className="block mt-1 w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-700">Payouts
            <select value={payoutCycle} onChange={(e) => setPayoutCycle(e.target.value)} className="block mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">As set for the property</option><option value="T+2">2 days after check-out</option><option value="Weekly">Weekly (Wednesday)</option><option value="15 days">Twice a month</option><option value="Monthly">Monthly</option>
            </select>
          </label>
          <button type="button" onClick={doPreview} disabled={!!busy} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold">{busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : 'Update preview'}</button>
        </div>
        {preview?.missing?.length > 0 && (
          <div className="rounded-xl bg-red-50 text-red-800 text-sm px-4 py-3"><b>Missing before it can be sent:</b><ul className="list-disc pl-5 mt-1">{preview.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
        )}
        {preview && (
          <article className="border border-gray-200 rounded-xl p-5 text-sm leading-relaxed text-gray-800 [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_.miss]:bg-red-50 [&_.miss]:text-red-700" aria-label="Preview">
            <p className="text-xs text-gray-500 mb-2">Preview from template v{preview.templateVersion}. Red: details still missing.</p>
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          </article>
        )}
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={send} disabled={!!busy || !(Number(commission) > 0) || preview?.missing?.length > 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 text-white text-sm font-bold disabled:opacity-50">
            {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Prepare and email the owner
          </button>
        </div>
      </div>
    </div>
  );
};

const Agreements = () => {
  usePageTitle('Agreements');
  const { can } = useAccess();
  const canManage = can('properties.approve');
  const [rows, setRows] = useState(null);
  const [needs, setNeeds] = useState([]);
  const [counts, setCounts] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [preparing, setPreparing] = useState(null);
  const [offline, setOffline] = useState(null); // { hotelId, note }

  const load = useCallback(() => {
    setErr('');
    agreementApi.list({ status, search }).then((r) => { setRows(r?.data || []); setCounts(r?.meta?.counts || r?.counts || null); setNeeds(r?.meta?.needsAgreement || r?.needsAgreement || []); }).catch((e) => setErr(e.message));
  }, [status, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const cancel = async (a) => {
    setErr(''); setMsg('');
    try { await agreementApi.cancel(a.id); setMsg(`Agreement ${a.reference || ''} cancelled.${a.status === 'SIGNED' ? ' The property is back to pending.' : ''}`); load(); } catch (e) { setErr(e.message); }
  };
  const recordOffline = async () => {
    setErr('');
    try { await agreementApi.markSigned(offline.hotelId, offline.note); setOffline(null); setMsg('Paper signature recorded.'); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreements</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">Listing agreements are prepared from the template with each property&apos;s details and commission, emailed to the owner, and signed online with a code sent to their email.</p>
        </div>
        <Link to="/admin/agreement-template" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold"><Settings2 size={15} /> Agreement template</Link>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Waiting for signature', counts.pending], ['Signed', counts.signed], ['Drafts', counts.draft], ['Need an agreement', needs.length]].map(([k, v]) => (
            <div key={k} className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs font-semibold text-gray-500">{k}</p><p className="text-2xl font-bold tabular-nums">{v}</p></div>
          ))}
        </div>
      )}

      {needs.length > 0 && canManage && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h2 className="font-bold text-gray-900">Properties without a prepared agreement</h2>
          <p className="text-sm text-gray-700">Approved or live, but no agreement text was prepared (approved before this, or never sent).</p>
          <ul className="mt-3 divide-y divide-amber-200">
            {needs.map((h) => (
              <li key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><b>{h.name}</b> <span className="text-gray-600">· {h.city} · {h.status.replace(/_/g, ' ').toLowerCase()}{h.agreement?.commissionRate ? ` · ${h.agreement.commissionRate}% on file` : ''}</span></span>
                <button type="button" onClick={() => setPreparing(h)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-white text-xs font-bold"><FileText size={13} /> Prepare</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Property, owner or email" className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All</option><option value="PENDING_SIGNATURE">Waiting for signature</option><option value="SIGNED">Signed</option><option value="DRAFT">Draft</option>
        </select>
      </div>

      {msg && <p role="status" className="text-sm px-4 py-2 rounded-lg bg-green-50 text-green-800">{msg}</p>}
      {err && <p role="alert" className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700">{err}</p>}

      <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        {!rows ? <p className="p-6 text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p> : rows.length === 0 ? <p className="p-6 text-sm text-gray-500">No agreements yet. They&apos;re prepared when a property is approved.</p> : (
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100"><th className="px-4 py-2">Property</th><th className="px-4 py-2">Agreement</th><th className="px-4 py-2 text-right">Commission</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Sent / signed</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((a) => {
                const st = STATUS[a.status] || STATUS.PENDING;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3"><b>{a.hotel?.name || '—'}</b><span className="block text-xs text-gray-500">{a.hotel?.owner?.email}</span></td>
                    <td className="px-4 py-3 text-xs">{a.reference || <span className="text-gray-400">Not prepared</span>}{a.templateVersion ? <span className="block text-gray-500">template v{a.templateVersion}</span> : null}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{a.commissionRate != null ? `${a.commissionRate}%` : <span className="text-red-600">Not set</span>}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${st[0]}`}>{st[1]}</span>{a.viewedAt && a.status === 'PENDING_SIGNATURE' ? <span className="block text-xs text-gray-500 mt-1">Opened {when(a.viewedAt)}</span> : null}</td>
                    <td className="px-4 py-3 text-xs">{a.signedAt ? <>Signed {when(a.signedAt)}<span className="block text-gray-500">{a.signerName}{a.signatureMethod === 'OFFLINE' ? ' (paper)' : ''}</span></> : a.sentAt ? `Sent ${when(a.sentAt)}` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {a.reference && <button type="button" onClick={() => openBlob(() => agreementApi.adminPdf(a.hotelId), setErr)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold"><Download size={13} /> PDF</button>}
                        {canManage && !['SIGNED', 'ACTIVE'].includes(a.status) && a.hotel && <button type="button" onClick={() => setPreparing({ ...a.hotel, agreement: a })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold"><Send size={13} /> {a.reference ? 'Update & resend' : 'Prepare'}</button>}
                        {canManage && a.status === 'PENDING_SIGNATURE' && <button type="button" onClick={() => setOffline({ hotelId: a.hotelId, note: '' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold"><FileSignature size={13} /> Paper copy</button>}
                        {canManage && <button type="button" onClick={() => cancel(a)} aria-label={`Cancel agreement for ${a.hotel?.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {offline && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="off-h">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
            <h2 id="off-h" className="font-bold text-gray-900">Record a paper signature</h2>
            <p className="text-sm text-gray-600">Only if the owner signed a printed copy instead of signing online.</p>
            <input value={offline.note} onChange={(e) => setOffline({ ...offline, note: e.target.value })} placeholder="e.g. Signed copy received 12 Dec, filed in Legal drive" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setOffline(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button><button type="button" disabled={offline.note.trim().length < 5} onClick={recordOffline} className="px-4 py-2 rounded-lg bg-navy-800 text-white text-sm font-bold disabled:opacity-50">Record</button></div>
          </div>
        </div>
      )}
      {preparing && <PrepareDialog hotel={preparing} onClose={() => setPreparing(null)} onDone={(m) => { setPreparing(null); setMsg(m); load(); }} />}
    </div>
  );
};

export default Agreements;
