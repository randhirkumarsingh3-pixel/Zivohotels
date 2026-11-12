import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, FileText, AlertCircle } from 'lucide-react';
import {
  fetchKycDocuments,
  openKycDocument,
  reviewKycDocument,
  kycDocumentLabel,
} from '../../services/kycApi';

export default function ReviewDocuments({ hotelId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDocs = useCallback(async () => {
    if (!hotelId) return;
    try {
      setDocuments(await fetchKycDocuments(hotelId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleVerify = async (id, status) => {
    let reason;
    if (status === 'REJECTED') {
      reason = prompt('Why is this document rejected? The owner will see this reason.');
      if (!reason || !reason.trim()) return;
    }
    setError('');
    try {
      await reviewKycDocument(id, status, reason);
      await loadDocs();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleView = async (id) => {
    setError('');
    try {
      await openKycDocument(id);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading documents...</div>;

  return (
    <div className="space-y-3 mt-4">
      <h3 className="font-semibold text-gray-800">Uploaded Documents</h3>

      {error && <div role="alert" className="p-3 text-sm bg-red-50 text-red-600 rounded border border-red-100">{error}</div>}

      {documents.length === 0 ? (
        <div className="p-4 text-sm bg-orange-50 text-orange-700 rounded border border-orange-100 flex items-center gap-2">
          <AlertCircle size={16} /> No documents uploaded by owner.
        </div>
      ) : (
        <div className="grid gap-3">
          {documents.map(doc => (
            <div key={doc.id} className="border border-gray-200 p-3 rounded-lg flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{kycDocumentLabel(doc.documentType)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {doc.hasFile ? (
                      <button type="button" onClick={() => handleView(doc.id)} className="text-xs text-blue-600 hover:underline">
                        View file{doc.fileName ? ` (${doc.fileName})` : ''}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">File unavailable — ask the owner to re-upload</span>
                    )}
                    <span className="text-xs text-gray-400">|</span>
                    <span className={`text-xs font-semibold ${doc.documentStatus === 'VERIFIED' ? 'text-green-600' : doc.documentStatus === 'REJECTED' ? 'text-red-600' : 'text-amber-600'}`}>
                      {doc.documentStatus}
                    </span>
                    {doc.version > 1 && <span className="text-xs text-gray-400">v{doc.version}</span>}
                  </div>
                  {doc.rejectionReason && <p className="text-xs text-red-500 mt-1">Reason: {doc.rejectionReason}</p>}
                </div>
              </div>

              {doc.documentStatus === 'PENDING' && doc.hasFile && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleVerify(doc.id, 'VERIFIED')} title="Verify" aria-label={`Verify ${kycDocumentLabel(doc.documentType)}`} className="p-1.5 text-green-600 hover:bg-green-100 rounded">
                    <CheckCircle size={18} />
                  </button>
                  <button onClick={() => handleVerify(doc.id, 'REJECTED')} title="Reject" aria-label={`Reject ${kycDocumentLabel(doc.documentType)}`} className="p-1.5 text-red-600 hover:bg-red-100 rounded">
                    <XCircle size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
