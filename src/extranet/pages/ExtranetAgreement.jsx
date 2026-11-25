import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, FileText, Download, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { agreementApi } from '../../services/api';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet → Agreement: the owner reads the listing agreement ZivoPlus prepared from their
 * onboarding details, downloads it, and signs it electronically: typed full name, consent, and a
 * one-time code sent to their account email. Team members can read and download it.
 */
const day = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const openPdf = async (hotelId, setErr) => {
  try {
    const blob = await agreementApi.pdf(hotelId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { setErr(e.message || 'Could not open the PDF.'); }
};

const ExtranetAgreement = () => {
  const { hotelId: paramId } = useParams();
  const { hotelId: ctxId } = useExtranet();
  const hotelId = paramId || ctxId;
  const [data, setData] = useState(undefined);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [codeInfo, setCodeInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(() => {
    if (!hotelId) return;
    agreementApi.view(hotelId).then(setData).catch((e) => { setErr(e.message); setData(null); });
  }, [hotelId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = 'Agreement · ZivoPlus Extranet'; }, []);

  const sendCode = async () => {
    setBusy('code'); setErr('');
    try { setCodeInfo(await agreementApi.sendCode(hotelId)); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const sign = async () => {
    setBusy('sign'); setErr('');
    try {
      await agreementApi.sign(hotelId, { name, code, consent, contentHash: data.contentHash });
      setDone(true); load();
    } catch (e) { setErr(e.message); if (/updated since/i.test(e.message || '')) load(); } finally { setBusy(''); }
  };

  if (data === undefined) return <p className="text-sm text-gray-500 flex items-center gap-2 p-6"><Loader2 size={16} className="animate-spin" /> Loading the agreement…</p>;
  if (!data) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Agreement</h1>
        <p className="text-sm text-gray-700">There&apos;s no agreement for this property yet. ZivoPlus prepares it when the property is approved, and you&apos;ll get an email when it&apos;s ready to sign.</p>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <Link to="/extranet" className="text-sm font-semibold text-brand-700 underline">Back to dashboard</Link>
      </div>
    );
  }

  const signed = ['SIGNED', 'ACTIVE'].includes(data.status);
  const waiting = data.status === 'PENDING_SIGNATURE';

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500">{data.property?.name} · {data.reference}</p>
          <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
        </div>
        <button type="button" onClick={() => openPdf(hotelId, setErr)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50">
          <Download size={16} aria-hidden="true" /> {signed ? 'Download signed copy (PDF)' : 'Download (PDF)'}
        </button>
      </div>

      {signed ? (
        <div role="status" className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 flex gap-3">
          <CheckCircle2 size={22} className="text-green-700 shrink-0" aria-hidden="true" />
          <div className="text-sm text-green-900">
            <p className="font-bold">{done ? 'Signed. Thank you.' : 'Signed'}</p>
            <p>Signed by {data.signerName} on {day(data.signedAt)}. A copy has been emailed to you. {data.property?.status === 'READY_FOR_GO_LIVE' ? 'ZivoPlus will take your property live shortly.' : ''}</p>
          </div>
        </div>
      ) : waiting ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-bold">Please read the agreement and sign it below to go live.</p>
          <p>Commission: <b>{data.commissionRate}%</b> of the room price before GST, plus GST on the commission · Term: {data.termMonths} months</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-700">This agreement is being prepared by ZivoPlus. You&apos;ll get an email when it&apos;s ready to sign.</div>
      )}

      <article className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-8 max-h-[70vh] overflow-y-auto" aria-label="Agreement text">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-4"><FileText size={14} aria-hidden="true" /> {data.reference}</div>
        {/* Prepared by ZivoPlus on the server from the template; every value is escaped there */}
        <div className="agreement-text text-[15px] leading-relaxed text-gray-800 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-5 [&_h2]:mb-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_.miss]:bg-red-50 [&_.miss]:text-red-700" dangerouslySetInnerHTML={{ __html: data.html }} />
      </article>

      {waiting && data.canSign && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4" aria-labelledby="sign-h">
          <h2 id="sign-h" className="font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={18} className="text-brand-700" aria-hidden="true" /> Sign electronically</h2>
          <label className="block text-sm font-semibold text-gray-800">Your full name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1 w-full max-w-md px-3 py-2.5 border border-gray-300 rounded-lg text-base" placeholder="As you would sign it" />
          </label>
          <label className="flex items-start gap-3 text-sm text-gray-800">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-4 h-4" />
            <span>I have read this agreement and I&apos;m authorised to sign it for {data.property?.name}. I agree to sign it electronically, and that this has the same effect as my handwritten signature.</span>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" onClick={sendCode} disabled={busy === 'code' || !consent || name.trim().length < 3}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-50">
              {busy === 'code' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {codeInfo ? 'Send a new code' : 'Email me a signing code'}
            </button>
            {codeInfo && (
              <>
                <label className="text-sm font-semibold text-gray-800">Code
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="block mt-1 w-32 px-3 py-2.5 border border-gray-300 rounded-lg text-base tracking-widest" placeholder="6 digits" />
                </label>
                <button type="button" onClick={sign} disabled={busy === 'sign' || code.length !== 6}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">
                  {busy === 'sign' && <Loader2 size={15} className="animate-spin" />} Sign agreement
                </button>
              </>
            )}
          </div>
          {codeInfo && <p className="text-xs text-gray-600">We sent a code to {data.signerEmail}. It&apos;s valid for {codeInfo.expiresInMinutes} minutes.{codeInfo.testCode ? ` Test mode: your code is ${codeInfo.testCode}.` : ''}</p>}
          <p className="text-xs text-gray-500">ZivoPlus records your name, email, the time, your IP address and a fingerprint of this exact text with your signature.</p>
        </section>
      )}
      {waiting && !data.canSign && <p className="text-sm text-gray-600">Only the property&apos;s owner account can sign. Ask the owner to sign in and open this page.</p>}
      {err && <p role="alert" className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700">{err}</p>}
    </div>
  );
};

export default ExtranetAgreement;
