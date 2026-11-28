import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Handshake, Loader2, Plus, Clock, FileWarning, FileSignature, ArrowRight, Settings2, TrendingUp } from 'lucide-react';
import { adminBusinessApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import AddOrganisation from '../components/business/AddOrganisation';

/**
 * Admin → Business & Partners → Overview: ZivoPlus for Business (companies) and ZivoPlus Partner
 * Hub (travel agents) at a glance: applications waiting (oldest first), accounts by status, this
 * month's bookings and value against last month, the busiest accounts, and what needs checking
 * (documents, unsigned agreements). Add a company or agent on their behalf from here.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const KIND = { CORPORATE: ['Company', Briefcase, '/admin/companies'], AGENCY: ['Travel agent', Handshake, '/admin/travel-agents'] };
const pct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);

const PortalCard = ({ kind, title, sub, d }) => {
  const [, Icon, path] = KIND[kind];
  const c = d.counts[kind] || {};
  const m = d.month[kind]; const l = d.lastMonth[kind];
  const change = pct(m.value, l.value);
  const open = kind === 'AGENCY' ? d.portals.agencyEnabled : d.portals.corporateEnabled;
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center"><Icon size={22} aria-hidden="true" /></span>
          <div><h2 className="font-bold text-gray-900">{title}</h2><p className="text-xs text-gray-500">{sub}</p></div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${open ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{open ? 'Taking applications' : 'Applications closed'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['To review', (c.IN_REVIEW || 0) + (c.ON_HOLD || 0)], ['Active', c.ACTIVE || 0], ['Suspended', c.SUSPENDED || 0], ['Rejected', c.REJECTED || 0]].map(([label, n]) => (
          <Link key={label} to={path} className="rounded-lg bg-gray-50 hover:bg-gray-100 py-2"><p className="text-xl font-bold text-gray-900 tabular-nums">{n}</p><p className="text-[11px] text-gray-600">{label}</p></Link>
        ))}
      </div>
      <div className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">This month</p>
          <p className="font-bold text-gray-900">{m.bookings} booking{m.bookings === 1 ? '' : 's'} · {inr(m.value)}</p>
          <p className="text-xs text-gray-500">Last month {l.bookings} · {inr(l.value)}</p>
        </div>
        {change !== null && <span className={`text-sm font-semibold inline-flex items-center gap-1 ${change >= 0 ? 'text-green-800' : 'text-red-700'}`}><TrendingUp size={15} aria-hidden="true" className={change < 0 ? 'rotate-180' : ''} />{change >= 0 ? '+' : ''}{change}%</span>}
      </div>
      <Link to={path} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline">Open {kind === 'AGENCY' ? 'travel agents' : 'companies'} <ArrowRight size={14} aria-hidden="true" /></Link>
    </section>
  );
};

const BusinessOverview = () => {
  usePageTitle('Business & Partners');
  const { can } = useAccess();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => adminBusinessApi.overview().then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const go = (o) => navigate(`${KIND[o.kind][2]}?id=${o.id}`);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business &amp; Partners</h1>
          <p className="text-sm text-gray-600 mt-1">Companies on ZivoPlus for Business and travel agents on ZivoPlus Partner Hub: onboarding, accounts and how they are booking.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/business-settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 underline"><Settings2 size={15} aria-hidden="true" /> Business settings</Link>
          {can('business.manage') && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-white"><Plus size={15} aria-hidden="true" /> Add company or agent</button>}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {!d ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={28} /></div> : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <PortalCard kind="CORPORATE" title="ZivoPlus for Business" sub="Companies booking work travel" d={d} />
            <PortalCard kind="AGENCY" title="ZivoPlus Partner Hub" sub="Travel agents booking for customers" d={d} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-200" aria-labelledby="wait-h">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 id="wait-h" className="font-bold text-gray-900 flex items-center gap-2"><Clock size={17} className="text-navy-700" aria-hidden="true" /> Waiting for a decision</h2>
                <span className="text-xs text-gray-500">Oldest first</span>
              </div>
              {d.waiting.length === 0 ? <p className="p-5 text-sm text-gray-500">Nothing waiting.</p> : (
                <ul className="divide-y divide-gray-100">
                  {d.waiting.map((o) => {
                    const [label, Icon] = KIND[o.kind];
                    return (
                      <li key={o.id}>
                        <button type="button" onClick={() => go(o)} className="w-full text-left px-5 py-3 hover:bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                          <span><span className="font-semibold text-gray-900">{o.name}</span><span className="block text-xs text-gray-500 flex items-center gap-1"><Icon size={12} aria-hidden="true" /> {label} · {o.code} · {o.city} · {o.documentsCount} document{o.documentsCount === 1 ? '' : 's'}</span></span>
                          <span className="text-right text-xs">
                            <span className={`px-2 py-0.5 rounded-md font-semibold ${o.status === 'ON_HOLD' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-800'}`}>{o.status === 'ON_HOLD' ? 'More details asked' : 'In review'}</span>
                            <span className={`block mt-1 ${o.waitingDays > 2 ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{o.waitingDays ? `${o.waitingDays} day${o.waitingDays === 1 ? '' : 's'} waiting` : 'Today'}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="space-y-5">
              <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3" aria-labelledby="att-h">
                <h2 id="att-h" className="font-bold text-gray-900">Needs checking</h2>
                <p className="text-sm text-gray-700 flex items-center gap-2"><FileWarning size={16} className="text-amber-600" aria-hidden="true" /> {d.attention.documentsToCheck} KYC document{d.attention.documentsToCheck === 1 ? '' : 's'} not checked</p>
                <p className="text-sm text-gray-700 flex items-center gap-2"><FileSignature size={16} className="text-navy-700" aria-hidden="true" /> {d.attention.unsignedAgreements} active account{d.attention.unsignedAgreements === 1 ? '' : 's'} without a signed agreement</p>
              </section>
              <section className="bg-white rounded-2xl border border-gray-200" aria-labelledby="top-h">
                <h2 id="top-h" className="px-5 pt-4 pb-2 font-bold text-gray-900">Busiest this month</h2>
                {d.top.length === 0 ? <p className="px-5 pb-4 text-sm text-gray-500">No bookings yet this month.</p> : (
                  <ul className="divide-y divide-gray-100 pb-1">
                    {d.top.map((o) => (
                      <li key={o.id}><button type="button" onClick={() => go(o)} className="w-full text-left px-5 py-2.5 hover:bg-gray-50 flex justify-between gap-2 text-sm"><span className="truncate"><b className="text-gray-900">{o.name}</b><span className="block text-xs text-gray-500">{KIND[o.kind][0]} · {o.code}</span></span><span className="text-right whitespace-nowrap"><b>{inr(o.value)}</b><span className="block text-xs text-gray-500">{o.bookings} booking{o.bookings === 1 ? '' : 's'}</span></span></button></li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {adding && <AddOrganisation onClose={() => setAdding(false)} onCreated={(o) => { setAdding(false); go(o); }} />}
    </div>
  );
};

export default BusinessOverview;
