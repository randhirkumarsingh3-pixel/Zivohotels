import { useState, useEffect, useCallback } from 'react';
import { Plus, Tag, Ticket, Pencil, Trash2, Power, X, CheckCircle2, AlertTriangle, Globe2, Building2, Sparkles } from 'lucide-react';

/**
 * Promotions setup, shared by Extranet -> Promotions (owner, one property) and Admin -> Promotions
 * (Zivo platform offers and any property's offers). Backend: /admin/promotions.
 *
 * mode 'owner': hotelId required; lists the property's promotions (editable) and the Zivo offers
 *               that apply to it (read-only). Owner promotions are funded by the hotel.
 * mode 'admin': hotelId optional (null = all promotions); can create Zivo platform offers and
 *               property offers, and choose who funds them.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin`;
const headers = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};
const call = async (path, method = 'GET', body) => {
  const res = await fetch(`${API}${path}`, { method, headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.message || 'Something went wrong');
  return json.data;
};
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ymd = (d) => (d ? new Date(d).toLocaleDateString('en-CA') : '');

const conditions = (p) => {
  const out = [];
  if (p.stayStart || p.stayEnd) out.push(`Stays ${p.stayStart ? `from ${day(p.stayStart)}` : ''}${p.stayEnd ? ` until ${day(p.stayEnd)}` : ''}`);
  if (p.bookStart || p.bookEnd) out.push(`Book ${p.bookStart ? `from ${day(p.bookStart)}` : ''}${p.bookEnd ? ` by ${day(p.bookEnd)}` : ''}`);
  if (p.minNights > 1) out.push(`Min ${p.minNights} nights`);
  if (p.minAdvanceDays != null) out.push(`Book ${p.minAdvanceDays}+ days ahead`);
  if (p.maxAdvanceDays != null) out.push(`Within ${p.maxAdvanceDays} days of check-in`);
  if (p.minBookingAmount) out.push(`Min booking ${inr(p.minBookingAmount)}`);
  if (p.maxDiscount && p.discountType === 'PERCENT') out.push(`Up to ${inr(p.maxDiscount)} off`);
  if (p.usageLimit) out.push(`${p.usageLimit} uses in total`);
  if (p.perUserLimit) out.push(`${p.perUserLimit} per guest`);
  if (p.firstBookingOnly) out.push('First booking only');
  return out;
};

const emptyForm = (hotelId, mode) => ({
  scope: mode === 'admin' && !hotelId ? 'PLATFORM' : 'PROPERTY',
  hotelId: hotelId || '',
  hotelIds: [],
  name: '', description: '', code: '', useCode: false,
  discountType: 'PERCENT', value: 10, maxDiscount: '', minBookingAmount: '',
  roomTypeIds: [], ratePlanIds: [],
  stayStart: '', stayEnd: '', bookStart: '', bookEnd: '',
  minNights: 1, minAdvanceDays: '', maxAdvanceDays: '',
  usageLimit: '', perUserLimit: '', firstBookingOnly: false,
  fundedBy: mode === 'admin' && !hotelId ? 'ZIVO' : 'HOTEL',
});

const fromPromotion = (p) => ({
  scope: p.scope, hotelId: p.hotelId || '', hotelIds: p.hotelIds || [],
  name: p.name, description: p.description || '', code: p.code || '', useCode: Boolean(p.code),
  discountType: p.discountType, value: p.value, maxDiscount: p.maxDiscount ?? '', minBookingAmount: p.minBookingAmount ?? '',
  roomTypeIds: p.roomTypeIds || [], ratePlanIds: p.ratePlanIds || [],
  stayStart: ymd(p.stayStart), stayEnd: ymd(p.stayEnd), bookStart: ymd(p.bookStart), bookEnd: ymd(p.bookEnd),
  minNights: p.minNights || 1, minAdvanceDays: p.minAdvanceDays ?? '', maxAdvanceDays: p.maxAdvanceDays ?? '',
  usageLimit: p.usageLimit ?? '', perUserLimit: p.perUserLimit ?? '', firstBookingOnly: p.firstBookingOnly,
  fundedBy: p.fundedBy,
});

const PromotionForm = ({ mode, initial, editingId, hotels, onCancel, onSaved }) => {
  const [f, setF] = useState(initial);
  const [roomTypes, setRoomTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k, id) => setF((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((i) => i !== id) : [...x[k], id] }));

  useEffect(() => {
    if (f.scope !== 'PROPERTY' || !f.hotelId) { setRoomTypes([]); return; }
    call(`/rooms?propertyId=${f.hotelId}`).then(setRoomTypes).catch(() => setRoomTypes([]));
  }, [f.scope, f.hotelId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.scope === 'PROPERTY' && !f.hotelId) return setError('Choose the property');
    if (f.useCode && !f.code.trim()) return setError('Enter the promo code, or choose "Applied automatically"');
    const body = {
      name: f.name, description: f.description || null,
      code: f.useCode ? f.code.trim().toUpperCase() : null,
      discountType: f.discountType, value: Number(f.value),
      maxDiscount: f.discountType === 'PERCENT' ? f.maxDiscount : null, minBookingAmount: f.minBookingAmount,
      stayStart: f.stayStart || null, stayEnd: f.stayEnd || null, bookStart: f.bookStart || null, bookEnd: f.bookEnd || null,
      minNights: Number(f.minNights) || 1, minAdvanceDays: f.minAdvanceDays, maxAdvanceDays: f.maxAdvanceDays,
      usageLimit: f.usageLimit, perUserLimit: f.perUserLimit, firstBookingOnly: f.firstBookingOnly,
      ...(mode === 'admin' ? { fundedBy: f.fundedBy } : {}),
      ...(f.scope === 'PROPERTY'
        ? { ...(editingId ? {} : { hotelId: f.hotelId }), roomTypeIds: f.roomTypeIds, ratePlanIds: f.ratePlanIds }
        : { hotelIds: f.hotelIds }),
    };
    setSaving(true);
    try {
      const saved = editingId ? await call(`/promotions/${editingId}`, 'PATCH', body) : await call('/promotions', 'POST', body);
      onSaved(saved, Boolean(editingId));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = 'px-3 py-2 border border-gray-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-brand-500 outline-none bg-white';
  const label = 'text-xs font-semibold text-gray-600';
  const plans = roomTypes.flatMap((rt) => (f.roomTypeIds.length === 0 || f.roomTypeIds.includes(rt.id) ? rt.ratePlans.map((rp) => ({ ...rp, rtName: rt.name })) : []));
  const example = f.discountType === 'PERCENT' ? `${f.value || 0}% off` : `₹${Number(f.value || 0).toLocaleString('en-IN')} off`;

  return (
    <form onSubmit={submit} className="bg-white border border-brand-200 rounded-xl shadow-sm p-5 space-y-5" aria-label="Promotion details">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">{editingId ? 'Edit promotion' : 'New promotion'}</h3>
        <button type="button" aria-label="Close" onClick={onCancel} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {mode === 'admin' && !editingId && (
        <div className="flex gap-2" role="radiogroup" aria-label="Promotion type">
          {[{ id: 'PLATFORM', label: 'Zivo offer (platform)', icon: Globe2 }, { id: 'PROPERTY', label: 'Offer for one property', icon: Building2 }].map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={f.scope === o.id} onClick={() => setF((x) => ({ ...x, scope: o.id, fundedBy: o.id === 'PLATFORM' ? 'ZIVO' : 'HOTEL' }))}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${f.scope === o.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>
              <o.icon size={15} /> {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className={label}>Promotion name (shown to guests)
          <input className={`${input} mt-1`} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Winter getaway" required />
        </label>
        {mode === 'admin' && f.scope === 'PROPERTY' && !editingId ? (
          <label className={label}>Property
            <select className={`${input} mt-1`} value={f.hotelId} onChange={(e) => setF((x) => ({ ...x, hotelId: e.target.value, roomTypeIds: [], ratePlanIds: [] }))} required>
              <option value="">Choose a property</option>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        ) : (
          <label className={label}>Short description (optional)
            <input className={`${input} mt-1`} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Save on 2+ night stays" />
          </label>
        )}
      </div>

      {/* Discount */}
      <section className="space-y-3">
        <p className="text-sm font-bold text-gray-800">Discount</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className={label}>Type
            <select className={`${input} mt-1`} value={f.discountType} onChange={(e) => set('discountType', e.target.value)}>
              <option value="PERCENT">Percentage off</option>
              <option value="FLAT">Fixed amount off (₹ per booking)</option>
            </select>
          </label>
          <label className={label}>{f.discountType === 'PERCENT' ? 'Percent off' : 'Amount off (₹)'}
            <input type="number" min="1" max={f.discountType === 'PERCENT' ? 90 : undefined} step="0.5" className={`${input} mt-1`} value={f.value} onChange={(e) => set('value', e.target.value)} required />
          </label>
          {f.discountType === 'PERCENT' && (
            <label className={label}>Maximum discount (₹, optional)
              <input type="number" min="1" className={`${input} mt-1`} value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} placeholder="No cap" />
            </label>
          )}
        </div>
        <p className="text-xs text-gray-500">Applied to the room price before GST. Guests get one promotion per booking: the biggest they qualify for.</p>
      </section>

      {/* How guests get it */}
      <section className="space-y-2">
        <p className="text-sm font-bold text-gray-800">How guests get it</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How guests get it">
          <button type="button" role="radio" aria-checked={!f.useCode} onClick={() => set('useCode', false)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border ${!f.useCode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}><Sparkles size={14} /> Applied automatically</button>
          <button type="button" role="radio" aria-checked={f.useCode} onClick={() => set('useCode', true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border ${f.useCode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}><Ticket size={14} /> With a promo code</button>
          {f.useCode && (
            <input aria-label="Promo code" className="px-3 py-2 border border-gray-200 rounded-lg text-sm uppercase font-mono w-44" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="e.g. WINTER10" maxLength={20} />
          )}
        </div>
        <p className="text-xs text-gray-500">{f.useCode ? 'Only guests who enter the code at checkout get it.' : 'Shown on search results and the hotel page with the discounted price, and applied at checkout.'}</p>
      </section>

      {/* Where */}
      {f.scope === 'PROPERTY' && roomTypes.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-bold text-gray-800">Rooms <span className="text-xs font-normal text-gray-500">(none selected = all rooms)</span></p>
          <div className="flex flex-wrap gap-2">
            {roomTypes.map((rt) => (
              <label key={rt.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${f.roomTypeIds.includes(rt.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                <input type="checkbox" className="rounded border-gray-300" checked={f.roomTypeIds.includes(rt.id)} onChange={() => toggle('roomTypeIds', rt.id)} /> {rt.name}
              </label>
            ))}
          </div>
          {plans.length > 1 && (
            <>
              <p className="text-xs font-semibold text-gray-600 pt-1">Rate plans (none selected = all)</p>
              <div className="flex flex-wrap gap-2">
                {plans.map((rp) => (
                  <label key={rp.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${f.ratePlanIds.includes(rp.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                    <input type="checkbox" className="rounded border-gray-300" checked={f.ratePlanIds.includes(rp.id)} onChange={() => toggle('ratePlanIds', rp.id)} /> {rp.rtName} · {rp.name}
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {f.scope === 'PLATFORM' && (
        <section className="space-y-2">
          <p className="text-sm font-bold text-gray-800">Properties <span className="text-xs font-normal text-gray-500">(none selected = every property)</span></p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {hotels.map((h) => (
              <label key={h.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${f.hotelIds.includes(h.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                <input type="checkbox" className="rounded border-gray-300" checked={f.hotelIds.includes(h.id)} onChange={() => toggle('hotelIds', h.id)} /> {h.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Conditions */}
      <section className="space-y-3">
        <p className="text-sm font-bold text-gray-800">Conditions <span className="text-xs font-normal text-gray-500">(all optional)</span></p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className={label}>Stay from<input type="date" className={`${input} mt-1`} value={f.stayStart} onChange={(e) => set('stayStart', e.target.value)} /></label>
          <label className={label}>Stay until (last night)<input type="date" className={`${input} mt-1`} value={f.stayEnd} min={f.stayStart} onChange={(e) => set('stayEnd', e.target.value)} /></label>
          <label className={label}>Bookable from<input type="date" className={`${input} mt-1`} value={f.bookStart} onChange={(e) => set('bookStart', e.target.value)} /></label>
          <label className={label}>Bookable until<input type="date" className={`${input} mt-1`} value={f.bookEnd} min={f.bookStart} onChange={(e) => set('bookEnd', e.target.value)} /></label>
          <label className={label}>Minimum nights<input type="number" min="1" className={`${input} mt-1`} value={f.minNights} onChange={(e) => set('minNights', e.target.value)} /></label>
          <label className={label}>Book at least (days ahead)<input type="number" min="0" className={`${input} mt-1`} value={f.minAdvanceDays} placeholder="Early bird" onChange={(e) => set('minAdvanceDays', e.target.value)} /></label>
          <label className={label}>Book at most (days ahead)<input type="number" min="0" className={`${input} mt-1`} value={f.maxAdvanceDays} placeholder="Last minute" onChange={(e) => set('maxAdvanceDays', e.target.value)} /></label>
          <label className={label}>Minimum booking (₹)<input type="number" min="1" className={`${input} mt-1`} value={f.minBookingAmount} placeholder="Before tax" onChange={(e) => set('minBookingAmount', e.target.value)} /></label>
          <label className={label}>Total uses<input type="number" min="1" className={`${input} mt-1`} value={f.usageLimit} placeholder="Unlimited" onChange={(e) => set('usageLimit', e.target.value)} /></label>
          <label className={label}>Uses per guest<input type="number" min="1" className={`${input} mt-1`} value={f.perUserLimit} placeholder="Unlimited" onChange={(e) => set('perUserLimit', e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2 mt-5 cursor-pointer">
            <input type="checkbox" className="rounded border-gray-300" checked={f.firstBookingOnly} onChange={(e) => set('firstBookingOnly', e.target.checked)} /> Only for a guest&apos;s first booking on Zivo
          </label>
        </div>
      </section>

      {mode === 'admin' && (
        <section className="space-y-2">
          <p className="text-sm font-bold text-gray-800">Who pays for the discount</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who pays for the discount">
            {[{ id: 'ZIVO', label: 'ZivoHotels', hint: 'The hotel is paid as if there were no discount' }, { id: 'HOTEL', label: 'The hotel', hint: 'The hotel\'s payout is on the discounted price' }].map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={f.fundedBy === o.id} title={o.hint} onClick={() => set('fundedBy', o.id)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${f.fundedBy === o.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>{o.label}</button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{f.fundedBy === 'ZIVO' ? 'ZivoHotels pays the discount: the hotel\'s commission and payout are on the full price.' : 'The hotel gives the discount: commission and payout are on the discounted price.'}</p>
        </section>
      )}
      {mode === 'owner' && <p className="text-xs text-gray-500">Your property funds this discount: commission and your payout are on the discounted price.</p>}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        {error && <p role="alert" className="mr-auto text-sm font-medium text-red-600">{error}</p>}
        {!error && <p className="mr-auto text-sm text-gray-500">Guests see: <strong className="text-green-700">{example}</strong>{f.useCode && f.code ? <> with code <span className="font-mono">{f.code}</span></> : ''}</p>}
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create promotion'}</button>
      </div>
    </form>
  );
};

const PromotionsManager = ({ mode = 'owner', hotelId = null }) => {
  const [rows, setRows] = useState(null);
  const [hotels, setHotels] = useState([]);
  const [filter, setFilter] = useState('ALL'); // admin: ALL | PLATFORM | PROPERTY
  const [editing, setEditing] = useState(null); // null | { initial, id? }
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');

  const flash = (type, text) => {
    setNotice({ type, text });
    if (type === 'success') setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 5000);
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const q = hotelId ? `?hotelId=${hotelId}` : filter !== 'ALL' ? `?scope=${filter}` : '';
      setRows(await call(`/promotions${q}`));
    } catch (e) {
      setError(e.message);
    }
  }, [hotelId, filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode === 'admin') call('/hotels').then((h) => setHotels((h || []).filter((x) => !x.isDeleted))).catch(() => setHotels([]));
  }, [mode]);

  const saved = (p, wasEdit) => {
    setEditing(null);
    flash('success', `${p.name} ${wasEdit ? 'saved' : 'created'}${p.code ? `. Code: ${p.code}` : '. It is applied automatically to eligible bookings.'}`);
    load();
  };
  const toggleActive = async (p) => {
    try {
      await call(`/promotions/${p.id}`, 'PATCH', { isActive: !p.isActive });
      flash('success', `${p.name} ${p.isActive ? 'paused' : 'is live again'}`);
      load();
    } catch (e) { flash('error', e.message); }
  };
  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      const r = await call(`/promotions/${p.id}`, 'DELETE');
      flash('success', r.message || `${p.name} deleted`);
      load();
    } catch (e) { flash('error', e.message); }
  };

  const own = (rows || []).filter((p) => p.canEdit);
  const zivo = (rows || []).filter((p) => !p.canEdit);
  const totals = own.reduce((t, p) => ({ bookings: t.bookings + (p.stats?.bookings || 0), discount: t.discount + (p.stats?.discount || 0), revenue: t.revenue + (p.stats?.revenue || 0) }), { bookings: 0, discount: 0, revenue: 0 });

  const card = (p) => (
    <div key={p.id} className={`bg-white border rounded-xl p-4 shadow-sm ${p.isActive ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${p.scope === 'PLATFORM' ? 'bg-indigo-50 text-indigo-600' : 'bg-green-50 text-green-600'}`}>
          {p.code ? <Ticket size={18} /> : <Tag size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-gray-900">{p.name}</h4>
            <span className="text-sm font-extrabold text-green-700">{p.label}</span>
            {p.code ? <span className="px-2 py-0.5 rounded bg-gray-900 text-white text-[11px] font-mono font-bold">{p.code}</span> : <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-[10px] font-bold">AUTOMATIC</span>}
            {p.scope === 'PLATFORM' && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">ZIVO OFFER</span>}
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.fundedBy === 'ZIVO' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>{p.fundedBy === 'ZIVO' ? 'FUNDED BY ZIVO' : 'FUNDED BY HOTEL'}</span>
            {!p.isActive && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-bold">PAUSED</span>}
          </div>
          {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
          <p className="text-xs text-gray-500 mt-1">
            {p.scope === 'PLATFORM' ? (p.targetHotels?.length ? p.targetHotels.map((h) => h.name).join(', ') : 'All properties') : (mode === 'admin' && p.hotelName ? `${p.hotelName} · ` : '')}
            {p.scope === 'PROPERTY' && (p.roomTypeIds?.length ? `${p.roomTypeIds.length} room type${p.roomTypeIds.length === 1 ? '' : 's'}` : 'All rooms')}
            {conditions(p).length ? ` · ${conditions(p).join(' · ')}` : ''}
          </p>
          {p.stats && (
            <p className="text-xs text-gray-600 mt-1"><strong>{p.stats.bookings}</strong> booking{p.stats.bookings === 1 ? '' : 's'} · {inr(p.stats.revenue)} revenue · {inr(p.stats.discount)} discount given</p>
          )}
        </div>
        {p.canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => toggleActive(p)} className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded hover:bg-gray-100 ${p.isActive ? 'text-gray-600' : 'text-green-700'}`}><Power size={13} /> {p.isActive ? 'Pause' : 'Go live'}</button>
            <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ id: p.id, initial: fromPromotion(p) })} className="p-1.5 text-gray-400 hover:text-brand-600"><Pencil size={15} /></button>
            <button type="button" aria-label={`Delete ${p.name}`} onClick={() => remove(p)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {notice && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {notice.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{ k: 'Bookings with a promotion', v: totals.bookings }, { k: 'Revenue from them', v: inr(totals.revenue) }, { k: 'Discount given', v: inr(totals.discount) }].map((s) => (
          <div key={s.k} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{s.k}</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900">{mode === 'owner' ? 'Your promotions' : 'Promotions'}</h3>
          {mode === 'admin' && !hotelId && (
            <div className="flex gap-1 ml-2" role="tablist">
              {[{ id: 'ALL', l: 'All' }, { id: 'PLATFORM', l: 'Zivo offers' }, { id: 'PROPERTY', l: 'Property offers' }].map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)} className={`px-3 py-1 rounded-full text-xs font-semibold ${filter === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t.l}</button>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing({ initial: emptyForm(hotelId, mode) })} className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">
            <Plus size={16} /> Create promotion
          </button>
        )}
      </div>

      {editing && <PromotionForm key={editing.id || 'new'} mode={mode} initial={editing.initial} editingId={editing.id} hotels={hotels} onCancel={() => setEditing(null)} onSaved={saved} />}

      {error && <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
      {!rows ? <p className="text-gray-400">Loading…</p> : own.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-500">
          No promotions yet. Create one: for example 10% off stays of 2+ nights (shown automatically), or a code for your regular guests.
        </div>
      ) : <div className="space-y-3">{own.map(card)}</div>}

      {mode === 'owner' && zivo.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Globe2 size={16} className="text-indigo-600" /> Zivo offers on your property</h3>
          <p className="text-xs text-gray-500 -mt-2">Run by ZivoHotels. When ZivoHotels funds the discount, your payout is on the full price.</p>
          {zivo.map(card)}
        </div>
      )}
    </div>
  );
};

export default PromotionsManager;
