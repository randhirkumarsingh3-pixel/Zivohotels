import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, MapPin, Building, X,
  AlertCircle, RefreshCw, Star, ChevronDown
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/admin`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ─── Validation ──────────────────────────────────────────────────────────────
const validate = (data) => {
  const errors = {};
  if (!data.name?.trim())     errors.name     = 'Property name is required.';
  if (!data.city?.trim())     errors.city     = 'City is required.';
  if (!data.location?.trim()) errors.location = 'Full address is required.';
  if (!data.ownerId?.trim())  errors.ownerId  = 'Owner ID is required.';
  if (data.latitude !== '' && data.latitude !== undefined) {
    const lat = parseFloat(data.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) errors.latitude = 'Must be between -90 and +90';
  }
  if (data.longitude !== '' && data.longitude !== undefined) {
    const lng = parseFloat(data.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) errors.longitude = 'Must be between -180 and +180';
  }
  return errors;
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    LIVE:        'bg-green-50 text-green-700 ring-green-600/20',
    ACTIVE:      'bg-green-50 text-green-700 ring-green-600/20',
    IN_REVIEW:   'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    DRAFT:       'bg-blue-50 text-blue-700 ring-blue-600/20',
    PAUSED:      'bg-orange-50 text-orange-700 ring-orange-600/20',
    SUSPENDED:   'bg-red-50 text-red-700 ring-red-600/20',
    THROTTLED:   'bg-amber-50 text-amber-700 ring-amber-600/20',
    BLOCKED:     'bg-black text-white ring-gray-600/20',
    INACTIVE:    'bg-gray-100 text-gray-600 ring-gray-400/20',
  };
  return (
    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ${map[status] || map.DRAFT}`}>
      {status}
    </span>
  );
};

// ─── PropertyFormModal ────────────────────────────────────────────────────────
const PropertyFormModal = ({ hotel, onClose, onSaved }) => {
  const isEditing = Boolean(hotel);
  const [form, setForm] = useState({
    name:        hotel?.name        || '',
    city:        hotel?.city        || '',
    location:    hotel?.location    || '',
    description: hotel?.description || '',
    ownerId:     hotel?.owner?.id   || hotel?.ownerId || '',
    status:      hotel?.status      || 'DRAFT',
    latitude:    hotel?.latitude    != null ? String(hotel.latitude)  : '',
    longitude:   hotel?.longitude   != null ? String(hotel.longitude) : '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      const url    = isEditing ? `${API_URL}/hotels/${hotel.id}` : `${API_URL}/hotels`;
      const method = isEditing ? 'PUT' : 'POST';

      const res  = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(form) });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to save property');

      onSaved(data.data, isEditing);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{isEditing ? 'Edit Property' : 'Add New Property'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{isEditing ? `Editing: ${hotel.name}` : 'All fields are validated before saving.'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {apiError && (
          <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Property Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Property Name *</label>
              <input
                name="name" value={form.name} onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                placeholder="e.g. Zivo Grand Palace"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">City *</label>
              <input
                name="city" value={form.city} onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm ${errors.city ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                placeholder="e.g. Mumbai"
              />
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
              <div className="relative">
                <select
                  name="status" value={form.status} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm appearance-none bg-white"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Full Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Address / Location *</label>
              <input
                name="location" value={form.location} onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm ${errors.location ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                placeholder="e.g. Nariman Point, South Mumbai"
              />
              {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
            </div>

            {/* Owner ID */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Owner User ID *</label>
              <input
                name="ownerId" value={form.ownerId} onChange={handleChange}
                className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono ${errors.ownerId ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                placeholder="UUID of the property owner"
              />
              {errors.ownerId && <p className="text-red-500 text-xs mt-1">{errors.ownerId}</p>}
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                name="description" value={form.description} onChange={handleChange} rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none"
                placeholder="Brief description of the property..."
              />
            </div>

            {/* Coordinates */}
            <div className="md:col-span-2">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-3">GPS Coordinates</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Latitude</label>
                    <input
                      type="number" step="any" name="latitude" value={form.latitude} onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono ${
                        errors.latitude ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="e.g. 19.0760" min="-90" max="90"
                    />
                    {errors.latitude && <p className="text-red-500 text-xs mt-1">{errors.latitude}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Longitude</label>
                    <input
                      type="number" step="any" name="longitude" value={form.longitude} onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono ${
                        errors.longitude ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="e.g. 72.8777" min="-180" max="180"
                    />
                    {errors.longitude && <p className="text-red-500 text-xs mt-1">{errors.longitude}</p>}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Enter coordinates (e.g., 19.0760, 72.8777). Find them at maps.google.com</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg shadow-sm disabled:opacity-60 flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isEditing ? 'Update Property' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────
const DeleteConfirmModal = ({ hotel, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setApiError('');
    try {
      const res = await fetch(`${API_URL}/hotels/${hotel.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      // 204 = no body; 200 = JSON body
      if (res.status === 204) {
        onDeleted(hotel.id);
        return;
      }

      // Try to parse JSON for error messages
      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (res.status === 401) {
        throw new Error('Session expired. Please log in again as Admin.');
      }
      if (res.status === 403) {
        throw new Error('Only Admins can delete properties.');
      }
      if (!res.ok) {
        throw new Error(data.message || `Delete failed (HTTP ${res.status})`);
      }

      onDeleted(hotel.id);
    } catch (err) {
      // Network-level error (backend not running)
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setApiError('Cannot reach the server. Is the backend running on port 5000?');
      } else {
        setApiError(err.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 className="text-red-500" size={24} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Delete Property?</h3>
        <p className="text-sm text-gray-500 mb-2">
          <strong>{hotel.name}</strong> will be soft-deleted and hidden from the platform. This action can be reversed by an admin.
        </p>
        {apiError && <p className="text-red-500 text-xs mb-3">{apiError}</p>}
        <div className="flex gap-3 justify-center mt-6">
          <button onClick={onClose} className="px-5 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} className="px-5 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-60 flex items-center gap-2">
            {deleting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Properties Page ─────────────────────────────────────────────────────
const Properties = () => {
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch]         = useState('');

  const [editingHotel, setEditingHotel]   = useState(null);
  const [deletingHotel, setDeletingHotel] = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res  = await fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load properties');
      setProperties(data.data || []);
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const handleSaved = (savedHotel, isEditing) => {
    if (isEditing) {
      setProperties((prev) => prev.map((h) => (h.id === savedHotel.id ? savedHotel : h)));
    } else {
      setProperties((prev) => [savedHotel, ...prev]);
    }
    setEditingHotel(null);
    setShowAddModal(false);
  };

  const handleDeleted = (deletedId) => {
    setProperties((prev) => prev.filter((h) => h.id !== deletedId));
    setDeletingHotel(null);
  };

  const filtered = properties.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.city?.toLowerCase().includes(search.toLowerCase()) ||
    p.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Property Management</h1>
          <p className="text-gray-500 mt-1">Manage your hotel portfolio, locations, and assigned owners.</p>
        </div>
        <button
          onClick={() => navigate('/extranet/onboarding')}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors shadow-sm w-fit"
        >
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search properties, city, location..."
            className="w-full sm:w-72 px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            onClick={fetchProperties}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* States */}
        {fetchError && (
          <div className="m-5 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{fetchError} — <button onClick={fetchProperties} className="underline">Retry</button></span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold tracking-wide">
                  <tr>
                    <th className="px-6 py-4">Property</th>
                    <th className="px-6 py-4">City</th>
                    <th className="px-6 py-4">Rating</th>
                    <th className="px-6 py-4">Owner</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-gray-400">
                        {search ? `No properties matching "${search}"` : 'No properties found. Add your first one!'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((hotel) => (
                      <tr key={hotel.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                              <Building size={18} />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{hotel.name}</p>
                              <p className="text-xs text-gray-500 flex items-center mt-0.5">
                                <MapPin size={11} className="mr-1" />{hotel.location}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{hotel.city}</td>
                        <td className="px-6 py-4">
                          {hotel.rating ? (
                            <span className="flex items-center gap-1 font-semibold text-amber-600">
                              <Star size={14} className="fill-current" />{hotel.rating}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">Not rated</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-700">{hotel.owner?.name || '—'}</span>
                          <br />
                          <span className="text-xs text-gray-400">{hotel.owner?.email}</span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={hotel.status || 'DRAFT'} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/admin/properties/edit/${hotel.id}`)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setDeletingHotel(hotel)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer count */}
            {filtered.length > 0 && (
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                Showing {filtered.length} of {properties.length} properties
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <PropertyFormModal onClose={() => setShowAddModal(false)} onSaved={handleSaved} />
      )}

      {/* Edit Modal */}
      {editingHotel && (
        <PropertyFormModal hotel={editingHotel} onClose={() => setEditingHotel(null)} onSaved={handleSaved} />
      )}

      {/* Delete Confirm Modal */}
      {deletingHotel && (
        <DeleteConfirmModal hotel={deletingHotel} onClose={() => setDeletingHotel(null)} onDeleted={handleDeleted} />
      )}
    </div>
  );
};

export default Properties;
