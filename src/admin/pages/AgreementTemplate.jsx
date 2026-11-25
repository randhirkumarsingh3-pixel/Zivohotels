import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Copy } from 'lucide-react';
import { agreementApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Agreement template: the wording of the property listing agreement. Each save is a new
 * version; agreements already sent keep the text they were prepared with. {{fields}} are filled
 * from the property's onboarding details when an agreement is prepared.
 */
const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50';

const AgreementTemplate = () => {
  usePageTitle('Agreement template');
  const { can } = useAccess();
  const canEdit = can('settings.manage');
  const [t, setT] = useState(null);
  const [fields, setFields] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => { agreementApi.template().then((d) => { setT(d.template); setFields(d.fields); setDefaults(d.defaultTemplate); }).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  if (!t) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={16} className="animate-spin" /> Loading…</>}</p>;

  const set = (k, v) => setT((cur) => ({ ...cur, [k]: v }));
  const setSection = (i, k, v) => setT((cur) => ({ ...cur, sections: cur.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const move = (i, d) => setT((cur) => { const s = [...cur.sections]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); return { ...cur, sections: s }; });
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const d = await agreementApi.saveTemplate(t); setT(d.template); setMsg({ ok: true, text: `Saved as version ${d.template.version}. New agreements use it; ones already sent keep their text.` }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const copy = async (k) => { try { await navigator.clipboard.writeText(`{{${k}}}`); setCopied(k); setTimeout(() => setCopied(''), 1500); } catch { /* select manually */ } };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreement template</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">The wording of the property listing agreement. Version {t.version}{t.updatedAt ? `, saved ${new Date(t.updatedAt).toLocaleDateString('en-IN')} by ${t.updatedBy}` : ' (the starting wording)'}. Have your lawyer review it before use.</p>
        </div>
        <Link to="/admin/agreements" className="text-sm font-semibold text-navy-800 underline">Agreements</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4 min-w-0">
          <section className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-gray-700 md:col-span-2">Title
              <input className={input} value={t.title} disabled={!canEdit} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-gray-700">Term (months)
              <input type="number" min="1" max="120" className={input} value={t.termMonths} disabled={!canEdit} onChange={(e) => set('termMonths', e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-gray-700">Notice to end (days)
              <input type="number" min="0" max="365" className={input} value={t.noticeDays} disabled={!canEdit} onChange={(e) => set('noticeDays', e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-gray-700 md:col-span-2">Courts with jurisdiction
              <input className={input} value={t.jurisdiction} disabled={!canEdit} onChange={(e) => set('jurisdiction', e.target.value)} />
            </label>
          </section>

          {t.sections.map((s, i) => (
            <section key={i} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex-1 text-xs font-semibold text-gray-700">Heading
                  <input className={input} value={s.heading} disabled={!canEdit} onChange={(e) => setSection(i, 'heading', e.target.value)} />
                </label>
                {canEdit && (
                  <div className="flex gap-1 pt-5">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Move down" disabled={i === t.sections.length - 1} onClick={() => move(i, 1)} className="p-2 rounded-lg border border-gray-200 disabled:opacity-30"><ArrowDown size={14} /></button>
                    <button type="button" aria-label="Remove section" onClick={() => setT((cur) => ({ ...cur, sections: cur.sections.filter((_, j) => j !== i) }))} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <label className="block text-xs font-semibold text-gray-700">Text <span className="font-normal text-gray-500">(blank line: new paragraph; lines starting &quot;- &quot;: a list)</span>
                <textarea rows={Math.min(14, Math.max(4, s.body.split('\n').length + 1))} className={`${input} font-mono text-[13px] leading-relaxed`} value={s.body} disabled={!canEdit} onChange={(e) => setSection(i, 'body', e.target.value)} />
              </label>
            </section>
          ))}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setT((cur) => ({ ...cur, sections: [...cur.sections, { heading: `${cur.sections.length}. New section`, body: '' }] }))} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold"><Plus size={15} /> Add section</button>
              {defaults && <button type="button" onClick={() => setT((cur) => ({ ...cur, ...defaults, version: cur.version, updatedAt: cur.updatedAt, updatedBy: cur.updatedBy, history: cur.history }))} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold"><RotateCcw size={15} /> Start from the default wording</button>}
              <button type="button" onClick={save} disabled={busy} className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-bold disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save as new version</button>
            </div>
          )}
          {msg && <p role="status" className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 self-start">
          <section className="bg-white border border-gray-200 rounded-2xl p-4">
            <h2 className="font-bold text-gray-900 text-sm">Fields</h2>
            <p className="text-xs text-gray-500 mt-0.5">Filled from the property&apos;s details. Click to copy.</p>
            <ul className="mt-3 space-y-1.5 max-h-[55vh] overflow-y-auto">
              {fields.map(([k, d]) => (
                <li key={k}>
                  <button type="button" onClick={() => copy(k)} className="w-full text-left group">
                    <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5 group-hover:bg-navy-50">{`{{${k}}}`}</code> {copied === k ? <span className="text-xs text-green-700">copied</span> : <Copy size={11} className="inline text-gray-300" />}
                    <span className="block text-xs text-gray-500">{d}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {t.history?.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
              <h2 className="font-bold text-gray-900 text-sm">Earlier versions</h2>
              <ul className="mt-2 text-xs text-gray-600 space-y-1">{t.history.slice(0, 8).map((h) => <li key={h.version}>v{h.version}{h.updatedAt ? ` · ${new Date(h.updatedAt).toLocaleDateString('en-IN')} · ${h.updatedBy}` : ' · default'}</li>)}</ul>
              <p className="text-xs text-gray-500 mt-2">Each agreement keeps a copy of the exact text it was sent with.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AgreementTemplate;
