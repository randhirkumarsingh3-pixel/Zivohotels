import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Search, UserPlus, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Mail, CheckCircle2 } from 'lucide-react';
import CustomersTable from '../components/users/CustomersTable';
import OwnersTable from '../components/users/OwnersTable';
import AdminsTable from '../components/users/AdminsTable';
import UserEditModal from '../components/users/UserEditModal';
import AddUserModal from '../components/users/AddUserModal';
import InviteUserModal from '../components/users/InviteUserModal';

const API_URL = '/api/v1/admin';
const PAGE_LIMIT = 10;

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Maps UI tab → API role param
const TAB_ROLE_MAP = {
  CUSTOMERS: 'CUSTOMER',
  OWNERS:    'OWNER',
  ADMINS:    'ADMIN',
};

const TABS = ['CUSTOMERS', 'OWNERS', 'ADMINS'];

const Users = () => {
  const [activeTab,    setActiveTab]    = useState('CUSTOMERS');
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');

  // Filters
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [page,         setPage]         = useState(1);
  const [meta,         setMeta]         = useState({ total: 0, totalPages: 1 });

  // Modals
  const [editingUser,   setEditingUser]   = useState(null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showInvite,    setShowInvite]    = useState(false);
  const [properties,   setProperties]    = useState([]);
  const [toast,        setToast]         = useState(''); // Success toast text

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  // Fetch properties for InviteUserModal owner assignment
  useEffect(() => {
    fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setProperties(d.data || []))
      .catch(() => {});
  }, []);

  // Debounce search to avoid firing on every keystroke
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  };

  // ─── Fetch Users ─────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams({
        role:  TAB_ROLE_MAP[activeTab],
        page,
        limit: PAGE_LIMIT,
      });
      if (statusFilter)    params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res  = await fetch(`${API_URL}/users?${params.toString()}`, { headers: getAuthHeaders() });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to load users');

      setUsers(data.data   || []);
      setMeta(data.meta    || { total: 0, totalPages: 1 });
    } catch (err) {
      setFetchError(err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, statusFilter, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ─── Status Change ────────────────────────────────────────────────────────────
  const handleStatusChange = async (id, newStatus) => {
    // Optimistic UI update
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));

    try {
      const res  = await fetch(`${API_URL}/users/${id}/status`, {
        method:  'PATCH',
        headers: getAuthHeaders(),
        body:    JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Status update failed');

      // Refresh to get accurate data
      if (newStatus === 'DELETED') {
        // Remove from list immediately on delete
        setUsers(prev => prev.filter(u => u.id !== id));
        setMeta(prev => ({ ...prev, total: prev.total - 1 }));
      }
    } catch (err) {
      setFetchError(err.message);
      // Rollback optimistic update
      fetchUsers();
    }
  };

  // ─── Save User Edit ───────────────────────────────────────────────────────────
  const handleSaveUser = async (id, updatedData) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updatedData } : u));
    setEditingUser(null);
  };

  // ─── CSV Export ───────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'Phone'];
    const rows = users.map(u =>
      [u.name, u.email, u.role, u.status, u.phone || ''].join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Zivo_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Tab Switch ───────────────────────────────────────────────────────────────
  const switchTab = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setStatusFilter('');
    setSearch('');
    setDebouncedSearch('');
  };

  // Pagination helpers
  const canPrev = page > 1;
  const canNext = page < meta.totalPages;
  const start   = meta.total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const end     = Math.min(page * PAGE_LIMIT, meta.total);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">
            Manage customers, property owners, and system administrators.
            {meta.total > 0 && <span className="ml-2 text-brand-600 font-medium">{meta.total} total</span>}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Mail size={15} /> Invite User
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <UserPlus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-brand-500 text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{fetchError} — <button onClick={fetchUsers} className="underline font-medium">Retry</button></span>
        </div>
      )}

      {/* Tabbed Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tab Bar */}
        <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-6 py-4 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-600 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-72 gap-3">
              <span className="w-9 h-9 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading {activeTab.toLowerCase()}...</p>
            </div>
          ) : users.length === 0 && !fetchError ? (
            <div className="flex flex-col items-center justify-center h-72 gap-2 text-gray-400">
              <span className="text-4xl">👤</span>
              <p className="text-sm font-medium">
                {statusFilter || debouncedSearch ? 'No users match your filters.' : `No ${activeTab.toLowerCase()} found.`}
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'CUSTOMERS' && <CustomersTable data={users} onEdit={setEditingUser} onStatusChange={handleStatusChange} />}
              {activeTab === 'OWNERS'    && <OwnersTable    data={users} onEdit={setEditingUser} onStatusChange={handleStatusChange} />}
              {activeTab === 'ADMINS'    && <AdminsTable    data={users} onEdit={setEditingUser} onStatusChange={handleStatusChange} />}
            </>
          )}
        </div>

        {/* Pagination Footer */}
        {!loading && meta.total > 0 && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Showing <span className="font-semibold text-gray-700">{start}–{end}</span> of <span className="font-semibold text-gray-700">{meta.total}</span> users
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!canPrev}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600"
              >
                <ChevronLeft size={14} /> Prev
              </button>

              {/* Page numbers */}
              <div className="flex gap-1 mx-1">
                {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                  // Sliding window of pages around current
                  let p;
                  if (meta.totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= meta.totalPages - 2) {
                    p = meta.totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-brand-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={!canNext}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
        />
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(msg) => { setShowAddModal(false); showToast(msg); fetchUsers(); }}
        />
      )}

      {/* Invite User Modal */}
      {showInvite && (
        <InviteUserModal
          properties={properties}
          onClose={() => setShowInvite(false)}
          onSuccess={(msg) => { setShowInvite(false); showToast(msg); fetchUsers(); }}
        />
      )}

      {/* Success Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-fade-in">
          <CheckCircle2 size={17} /> {toast}
        </div>
      )}
    </div>
  );
};

export default Users;
