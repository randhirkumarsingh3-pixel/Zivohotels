import { useState, useEffect, useCallback } from 'react';
import {
  IndianRupee, CalendarCheck, TrendingUp, Building,
  XCircle, RefreshCw, ArrowUpRight, ArrowDownRight, Minus,
  Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getAdminAnalyticsKpis, 
  getAdminAnalyticsRevenue, 
  getAdminAnalyticsBookings, 
  getAdminAnalyticsTopProperties, 
  getAdminBookings 
} from '../../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => {
  if (v == null || isNaN(v)) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000)  return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)    return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, subtitle, icon, delta, trend, color = 'brand', loading }) => {
  const colorMap = {
    brand:  'bg-brand-50 text-brand-600',
    green:  'bg-green-50 text-green-600',
    blue:   'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    red:    'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
          {loading ? (
            <div className="h-8 w-28 bg-gray-100 animate-pulse rounded-lg mt-1" />
          ) : (
            <h3 className="text-2xl font-bold text-gray-900 tabular-nums">{value}</h3>
          )}
          {subtitle && !loading && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.brand} shrink-0 ml-3`}>
          {icon}
        </div>
      </div>
      {delta != null && !loading && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon size={14} />
          <span>{Math.abs(parseFloat(delta))}% vs last month</span>
        </div>
      )}
    </div>
  );
};

// ─── CSS Bar Chart ────────────────────────────────────────────────────────────
const BarChart = ({ data, loading }) => {
  if (loading) return (
    <div className="flex items-end gap-1 h-36 px-2">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="flex-1 bg-gray-100 animate-pulse rounded-t"
          style={{ height: `${Math.random() * 60 + 20}%` }} />
      ))}
    </div>
  );

  if (!data?.length) return (
    <div className="h-36 flex items-center justify-center text-gray-300 text-sm">No data yet</div>
  );

  const max = Math.max(...data.map(d => d.revenue), 1);
  const step = Math.max(1, Math.floor(data.length / 12));
  const visible = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-40">
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.revenue / max) * 100));
          return (
            <div key={i} className="flex-1 group relative flex items-end">
              <div
                className="w-full rounded-t bg-brand-500 group-hover:bg-brand-600 transition-colors"
                style={{ height: `${h}%` }}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {fmtDate(d.date)}: {fmt(d.revenue)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
        {visible.slice(0, 5).map(d => <span key={d.date}>{fmtDate(d.date)}</span>)}
      </div>
    </div>
  );
};

// ─── Donut Chart ─────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#1a56db', '#0e9f6e', '#e3a008', '#e02424', '#7e3af2'];

const DonutChart = ({ data, loading }) => {
  if (loading) return (
    <div className="w-36 h-36 mx-auto rounded-full bg-gray-100 animate-pulse" />
  );

  if (!data?.length || data.every(d => d.count === 0)) return (
    <div className="w-36 h-36 mx-auto rounded-full border-8 border-gray-100 flex items-center justify-center text-xs text-gray-300">
      No data
    </div>
  );

  const total = data.reduce((s, d) => s + d.count, 0);
  let cumulative = 0;

  const stops = data.map((d, i) => {
    const pct = (d.count / total) * 100;
    const from = cumulative;
    cumulative += pct;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}% ${cumulative}%`;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-32 h-32 rounded-full"
        style={{
          background: `conic-gradient(${stops.join(', ')})`,
          mask: 'radial-gradient(circle at center, transparent 38%, black 38%)',
          WebkitMask: 'radial-gradient(circle at center, transparent 38%, black 38%)',
        }}
      />
      <div className="space-y-1.5 w-full">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="text-gray-600 truncate max-w-[100px]">
                {d.label.replace('_', ' ')}
              </span>
            </div>
            <span className="font-semibold text-gray-800 tabular-nums">
              {d.count} <span className="text-gray-400 font-normal">({Math.round(d.count / total * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Top Properties Table ──────────────────────────────────────────────────────
const TopPropertiesTable = ({ data, loading }) => {
  const max = Math.max(...(data?.map(d => d.revenue) || [1]), 1);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-4 bg-gray-100 animate-pulse rounded" />
          <div className="flex-1 h-4 bg-gray-100 animate-pulse rounded" />
          <div className="w-16 h-4 bg-gray-100 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );

  if (!data?.length) return <p className="text-center text-gray-300 text-sm py-6">No data</p>;

  return (
    <div className="space-y-4">
      {data.map((p, i) => (
        <div key={p.hotelId || i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-gray-300 w-5 text-center shrink-0">{i + 1}</span>
              <span className="font-semibold text-gray-900 truncate">{p.name}</span>
              <span className="text-gray-400 text-xs truncate hidden sm:block">{p.city}</span>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="font-bold text-gray-900 tabular-nums">{fmt(p.revenue)}</p>
              <p className="text-xs text-gray-400">{p.bookings} bookings</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${Math.round((p.revenue / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Recent Bookings Mini-table ────────────────────────────────────────────────
const STATUS_COLORS = {
  CONFIRMED: 'bg-blue-50 text-blue-700',
  PENDING:   'bg-yellow-50 text-yellow-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-700',
  NO_SHOW:   'bg-gray-100 text-gray-600',
};

const RecentBookings = ({ data, loading, onViewAll }) => (
  <div>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-bold text-gray-800">Recent Bookings</h3>
      <button onClick={onViewAll}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
        View All <Eye size={12} />
      </button>
    </div>
    {loading ? (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 h-4 bg-gray-100 animate-pulse rounded" />
            <div className="w-20 h-4 bg-gray-100 animate-pulse rounded" />
            <div className="w-16 h-4 bg-gray-100 animate-pulse rounded" />
          </div>
        ))}
      </div>
    ) : !data?.length ? (
      <p className="text-sm text-gray-300 text-center py-6">No bookings yet</p>
    ) : (
      <div className="space-y-1">
        {data.map(b => (
          <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{b.guestName}</p>
              <p className="text-xs text-gray-400 truncate">{b.hotel?.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-gray-900 tabular-nums">
                {fmt(b.totalAmount)}
              </p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5 ${STATUS_COLORS[b.status] || STATUS_COLORS.PENDING}`}>
                {b.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();

  const [kpis,         setKpis]         = useState(null);
  const [revenue,      setRevenue]      = useState([]);
  const [bookingStats, setBookingStats] = useState(null);
  const [topProps,     setTopProps]     = useState([]);
  const [recentBk,     setRecentBk]     = useState([]);
  const [days,         setDays]         = useState(30);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kRes, rRes, bRes, tRes, recentRes] = await Promise.all([
        getAdminAnalyticsKpis(),
        getAdminAnalyticsRevenue(days),
        getAdminAnalyticsBookings(days),
        getAdminAnalyticsTopProperties(days),
        getAdminBookings({ limit: 5, page: 1 })
      ]);

      if (kRes.success)      setKpis(kRes.data);
      if (rRes.success)      setRevenue(rRes.data);
      if (bRes.success)      setBookingStats(bRes.data);
      if (tRes.success)      setTopProps(tRes.data);
      if (recentRes.success) setRecentBk(recentRes.data || []);
      
    } catch (err) {
      setError('Failed to load analytics data. Make sure the backend is running.');
      console.error('Dashboard Error:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Live performance overview · real data</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 text-xs font-semibold">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md transition-all ${days === d ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={fetchAll} disabled={loading}
            className="border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <XCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Revenue This Month"
          value={kpis?.revenue?.thisMonth != null ? fmt(kpis.revenue.thisMonth) : '—'}
          subtitle={`Total all-time: ${kpis?.revenue?.total != null ? fmt(kpis.revenue.total) : '…'}`}
          icon={<IndianRupee size={22} />}
          delta={kpis?.revenue?.delta}
          trend={kpis?.revenue?.trend}
          color="green"
          loading={loading}
        />
        <KpiCard
          title="Active Bookings"
          value={kpis?.bookings?.active ?? kpis?.bookings?.thisMonth ?? '—'}
          subtitle={`All time: ${kpis?.bookings?.total ?? '…'} confirmed`}
          icon={<CalendarCheck size={22} />}
          delta={kpis?.bookings?.delta}
          trend={kpis?.bookings?.trend}
          color="blue"
          loading={loading}
        />
        <KpiCard
          title="Cancellation Rate"
          value={kpis?.cancellation?.rate != null ? `${kpis?.cancellation?.rate}%` : '—'}
          subtitle={`${kpis?.cancellation?.count ?? '…'} cancellations this month`}
          icon={<TrendingUp size={22} />}
          trend={(kpis?.cancellation?.rate || 0) > 20 ? 'down' : 'up'}
          color="purple"
          loading={loading}
        />
        <KpiCard
          title="Live Properties"
          value={kpis?.properties?.live ?? '—'}
          subtitle={`${kpis?.properties?.total ?? '…'} total configured`}
          icon={<Building size={22} />}
          color="brand"
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800">Revenue Trend</h3>
            <span className="text-xs text-gray-400">Last {days} days</span>
          </div>
          <BarChart data={revenue} loading={loading} />
          {!loading && revenue?.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span>Total: <strong className="text-gray-700">{fmt(revenue.reduce((s, d) => s + (d.revenue || 0), 0))}</strong></span>
              <span>Peak: <strong className="text-gray-700">{fmt(Math.max(...revenue.map(d => d.revenue || 0)))}</strong></span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800">Booking Mix</h3>
            <span className="text-xs text-gray-400">By status</span>
          </div>
          <DonutChart data={bookingStats?.byStatus} loading={loading} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-800">Top Properties by Revenue</h3>
            <span className="text-xs text-gray-400">Last {days}d</span>
          </div>
          <TopPropertiesTable data={topProps} loading={loading} />
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-800 mb-4">Payment Type Split</h3>
            <DonutChart data={bookingStats?.byPaymentType} loading={loading} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <RecentBookings
          data={recentBk}
          loading={loading}
          onViewAll={() => navigate('/admin/bookings')}
        />
      </div>
    </div>
  );
};

export default Dashboard;
