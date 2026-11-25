import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, ShieldCheck, Mail, CheckCircle2, Fingerprint, RefreshCw, Trophy } from 'lucide-react';
import { businessApi } from '../../services/api';

/**
 * The organisation's agreement with ZivoPlus (agents and companies): read it, sign it (an admin of
 * the organisation: emailed code, or Aadhaar eSign when ZivoPlus uses it), download the PDF.
 * Also the agent's incentive progress card for the Overview tab.
 */
const day = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const openBlob = async (fn, setErr) => {
  try { const b = await fn(); const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { setErr(e.message); }
};

export const AgreementTab = ({ org, onSigned }) => {
  const [a, setA] = useState(undefined);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [codeInfo, setCodeInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const [useEmail, setUseEmail] = useState(false);
  const load = useCallback(() => businessApi.agreement(org.id).then(setA).catch((e) => { setErr(e.message); setA(null); }), [org.id]);
  useEffect(() => { load(); }, [load]);
  const pending = a?.status === 'PENDING_SIGNATURE' && a?.signing?.leegalityStatus === 'SENT';
  useEffect(() => {
    if (!pending) return undefined;
    let n = 0;
    const t = setInterval(() => { n += 1; if (n > 20) clearInterval(t); else load(); }, 30000);
    return () => clearInterval(t);
  }, [pending, load]);

  if (a === undefined) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  if (!a?.exists) return <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-2xl p-5">{err || 'ZivoPlus prepares your agreement when your organisation is approved. You\'ll get an email when it\'s ready to sign.'}</p>;

  const signed = a.status === 'SIGNED';
  const aadhaar = a.signing?.method === 'LEEGALITY_AADHAAR' && !useEmail;
  const run = async (key, fn) => { setBusy(key); setErr(''); try { await fn(); } catch (e) { setErr(e.message); if (/updated since/i.test(e.message || '')) load(); } finally { setBusy(''); } };
  const sendCode = () => run('code', async () => setCodeInfo(await businessApi.agreementCode(org.id)));
  const sign = () => run('sign', async () => { await businessApi.signAgreement(org.id, { name, code, consent, contentHash: a.contentHash }); await load(); window.scrollTo({ top: 0, behavior: 'smooth' }); onSigned?.(); });
  const startAadhaar = () => run('aadhaar', async () => { const r = await businessApi.agreementAadhaar(org.id, { consent, contentHash: a.contentHash }); if (!r?.signUrl) throw new Error('Leegality didn\'t return a signing link. Please try again.'); window.location.assign(r.signUrl); });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><p className="text-xs font-semibold text-gray-500">{a.reference}</p><h2 className="text-xl font-bold text-gray-900">{a.title}</h2></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openBlob(() => businessApi.agreementPdf(org.id), setErr)} className={`${btn} border border-gray-300 bg-white`}><Download size={15} /> {signed ? 'Signed copy (PDF)' : 'Download (PDF)'}</button>
          {signed && a.signatureMethod === 'AADHAAR_ESIGN' && <button type="button" onClick={() => openBlob(() => businessApi.agreementPdf(org.id, true), setErr)} className={`${btn} border border-gray-300 bg-white`}><Download size={15} /> Audit trail</button>}
        </div>
      </div>
      {signed ? (
        <p role="status" className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-900 flex gap-2"><CheckCircle2 size={18} aria-hidden="true" /> Signed by {a.signerName} on {day(a.signedAt)}{a.signatureMethod === 'AADHAAR_ESIGN' ? ' with Aadhaar eSign' : ''}.</p>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">{a.required ? 'Please read and sign this agreement: booking opens once it is signed.' : 'Please read and sign this agreement.'}</p>
      )}
      <article className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-8 max-h-[60vh] overflow-y-auto text-[15px] leading-relaxed text-gray-800 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-5 [&_h2]:mb-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3" aria-label="Agreement text">
        {/* Prepared by ZivoPlus on the server from the template; every value is escaped there */}
        <div dangerouslySetInnerHTML={{ __html: a.html }} />
      </article>
      {a.canSign && aadhaar && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Fingerprint size={18} className="text-brand-700" aria-hidden="true" /> Sign with Aadhaar eSign</h3>
          <p className="text-sm text-gray-700">You&apos;ll sign this exact document on Leegality with an OTP to the mobile number linked to your Aadhaar.</p>
          {a.signing.sandbox && <p className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 text-amber-900">Test mode (Leegality sandbox): signatures made now have no legal effect.</p>}
          {a.signing.leegalityStatus === 'SENT' && <p role="status" className="text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-900 flex items-center gap-2">You opened Leegality to sign; this page updates on its own once it&apos;s done. <button type="button" onClick={load} className="underline font-semibold inline-flex items-center gap-1"><RefreshCw size={13} /> Check now</button></p>}
          {['REJECTED', 'EXPIRED', 'FAILED'].includes(a.signing.leegalityStatus) && <p className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-800">Signing on Leegality didn&apos;t complete. You can start again.</p>}
          <label className="flex items-start gap-2 text-sm text-gray-800"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>I have read this agreement and I&apos;m authorised to sign it for {org.legalName}. I agree to sign it with Aadhaar eSign.</span></label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!consent || busy === 'aadhaar'} onClick={startAadhaar} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy === 'aadhaar' ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} />} {a.signing.leegalityStatus === 'SENT' ? 'Continue signing' : 'Sign with Aadhaar'}</button>
            {a.signing.emailFallback && <button type="button" onClick={() => setUseEmail(true)} className="text-sm font-semibold text-gray-700 underline">Sign with an emailed code instead</button>}
          </div>
        </section>
      )}
      {a.canSign && !aadhaar && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={18} className="text-brand-700" aria-hidden="true" /> Sign electronically</h3>
          <label className="block text-sm font-semibold text-gray-800">Your full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1 w-full max-w-md px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm" /></label>
          <label className="flex items-start gap-2 text-sm text-gray-800"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>I have read this agreement and I&apos;m authorised to sign it for {org.legalName}. I agree to sign it electronically, with the same effect as my handwritten signature.</span></label>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" disabled={busy === 'code' || !consent || name.trim().length < 3} onClick={sendCode} className={`${btn} border border-gray-300`}>{busy === 'code' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {codeInfo ? 'Send a new code' : 'Email me a signing code'}</button>
            {codeInfo && <>
              <label className="text-sm font-semibold text-gray-800">Code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="block mt-1 w-32 px-3 py-2.5 border border-gray-300 rounded-lg text-base tracking-widest" /></label>
              <button type="button" disabled={busy === 'sign' || code.length !== 6} onClick={sign} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy === 'sign' && <Loader2 size={15} className="animate-spin" />} Sign agreement</button>
            </>}
          </div>
          {codeInfo && <p className="text-xs text-gray-600">We sent a code to {a.signerEmail}.{codeInfo.testCode ? ` Test mode: your code is ${codeInfo.testCode}.` : ''}</p>}
          {useEmail && <button type="button" onClick={() => setUseEmail(false)} className="text-sm font-semibold text-gray-700 underline">Sign with Aadhaar instead</button>}
        </section>
      )}
      {!signed && !a.canSign && <p className="text-sm text-gray-600">An admin of your organisation signs the agreement.</p>}
      {err && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{err}</p>}
    </div>
  );
};

/** Agent's monthly incentive progress (Overview). */
export const IncentiveCard = ({ org }) => {
  const [p, setP] = useState(null);
  useEffect(() => { businessApi.incentives(org.id).then(setP).catch(() => setP({ enabled: false })); }, [org.id]);
  if (!p?.enabled) return null;
  const top = p.slabs[p.slabs.length - 1];
  const pct = Math.min(100, Math.round(((p.roomNights + p.upcomingRoomNights) / Math.max(1, (p.next || top).minRoomNights)) * 100));
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h3 className="font-bold text-gray-900 flex items-center gap-2"><Trophy size={18} className="text-amber-600" aria-hidden="true" /> Incentives this month{p.tier && p.tier !== 'STANDARD' ? ` · ${p.tier.charAt(0)}${p.tier.slice(1).toLowerCase()} last month` : ''}</h3>
      <p className="text-sm text-gray-700">{p.roomNights} room nights checked out{p.upcomingRoomNights ? `, ${p.upcomingRoomNights} more booked to check out this month` : ''}. {p.current ? `You're at ${p.current.name}: +${p.current.bonusPct}% (about ${inr(p.estimatedBonus)} so far).` : ''} {p.next ? `${p.toNext} more to reach ${p.next.name} (+${p.next.bonusPct}%).` : 'You\'re at the top slab.'}</p>
      <div className="h-2 rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next slab"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-gray-500">{p.slabs.map((s) => `${s.name}: ${s.minRoomNights}+ room nights, +${s.bonusPct}%`).join(' · ')}. Paid on room charges (before GST) of stays that check out in the month, credited early next month less TDS.{p.last ? ` Last credit: ${inr(p.last.amount)} for ${p.last.month}.` : ''}</p>
    </section>
  );
};
