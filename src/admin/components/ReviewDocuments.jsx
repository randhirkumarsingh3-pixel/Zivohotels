import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, FileText, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export default function ReviewDocuments({ hotelId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hotelId) fetchDocs();
  }, [hotelId]);

  const fetchDocs = async () => {
    try {
      const res = await fetch(`${API_URL}/kyc/${hotelId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setDocuments(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (id, status, reason = '') => {
    if (status === 'REJECTED' && !reason) {
      reason = prompt('Enter rejection reason:');
      if (!reason) return;
    }
    try {
      const res = await fetch(`${API_URL}/kyc/${id}/verify`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, reason })
      });
      if (res.ok) fetchDocs();
    } catch (err) {
      alert('Failed to update document status');
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading documents...</div>;
  if (documents.length === 0) return <div className="p-4 text-sm bg-orange-50 text-orange-700 rounded border border-orange-100 flex items-center gap-2"><AlertCircle size={16}/> No documents uploaded by owner.</div>;

  return (
    <div className="space-y-3 mt-4">
      <h3 className="font-semibold text-gray-800">Uploaded Documents</h3>
      <div className="grid gap-3">
        {documents.map(doc => (
          <div key={doc.id} className="border border-gray-200 p-3 rounded-lg flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded">
                <FileText size={18} />
              </div>
              <div>
                <p className="font-medium text-sm">{doc.documentType}</p>
                <div className="flex items-center gap-2 mt-1">
                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View File</a>
                  <span className="text-xs text-gray-400">|</span>
                  <span className={`text-xs font-semibold ${doc.documentStatus === 'VERIFIED' ? 'text-green-600' : doc.documentStatus === 'REJECTED' ? 'text-red-600' : 'text-amber-600'}`}>
                    {doc.documentStatus}
                  </span>
                </div>
                {doc.rejectionReason && <p className="text-xs text-red-500 mt-1">Reason: {doc.rejectionReason}</p>}
              </div>
            </div>
            
            {doc.documentStatus === 'PENDING' && (
              <div className="flex gap-2">
                <button onClick={() => handleVerify(doc.id, 'VERIFIED')} className="p-1.5 text-green-600 hover:bg-green-100 rounded">
                  <CheckCircle size={18} />
                </button>
                <button onClick={() => handleVerify(doc.id, 'REJECTED')} className="p-1.5 text-red-600 hover:bg-red-100 rounded">
                  <XCircle size={18} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
