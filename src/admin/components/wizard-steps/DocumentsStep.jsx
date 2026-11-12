import { useState, useEffect, useCallback } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Clock, Eye, Loader2, ShieldCheck } from 'lucide-react';
import {
  KYC_DOCUMENT_TYPES,
  KYC_ACCEPT,
  fetchKycDocuments,
  uploadKycDocument,
  openKycDocument,
} from '../../../services/kycApi';

const formatSize = (bytes) => {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const StatusBadge = ({ status }) => {
  if (status === 'VERIFIED') return <span className="flex items-center text-xs font-medium text-green-600"><CheckCircle2 size={14} className="mr-1" /> Verified</span>;
  if (status === 'REJECTED') return <span className="flex items-center text-xs font-medium text-red-600"><XCircle size={14} className="mr-1" /> Rejected</span>;
  return <span className="flex items-center text-xs font-medium text-amber-600"><Clock size={14} className="mr-1" /> Pending review</span>;
};

/**
 * KYC documents step, used by both the admin property wizard and the owner onboarding wizard.
 * `hotelId` must be passed by the wizard (each wizard keeps its own draft id).
 */
const DocumentsStep = ({ hotelId }) => {
  const [documents, setDocuments] = useState([]);
  const [uploadingType, setUploadingType] = useState(null);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    if (!hotelId) return;
    try {
      setDocuments(await fetchKycDocuments(hotelId));
    } catch (err) {
      setError(err.message);
    }
  }, [hotelId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (documentType, file) => {
    setError('');
    setUploadingType(documentType);
    try {
      await uploadKycDocument(hotelId, documentType, file);
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingType(null);
    }
  };

  const handleView = async (documentId) => {
    setError('');
    try {
      await openKycDocument(documentId);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!hotelId) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 text-sm">
        Save the property first (fill in Basic Info and click <strong>Save Draft</strong>), then come back to upload documents.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Property Documents (KYC)</h3>
        <p className="text-sm text-gray-500 mt-1">
          Upload the compliance and verification documents for this property. PDF, JPG or PNG, up to 10 MB each.
          The PAN card and a cancelled cheque (plus the GST certificate if the property has a GSTIN) are
          required before the property can be submitted for review, along with bank details.
        </p>
        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <ShieldCheck size={14} className="text-green-600" /> Documents are stored privately and are only visible to you and the ZivoHotels verification team.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <ul className="divide-y divide-gray-100">
          {KYC_DOCUMENT_TYPES.map(({ type, label, required }) => {
            const doc = documents.find((d) => d.documentType === type);
            const isUploading = uploadingType === type;
            return (
              <li key={type} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                    <FileText size={24} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-gray-900">
                      {label}
                      {required && <span className="ml-2 text-xs font-medium text-amber-700">{required}</span>}
                    </h4>
                    {doc ? (
                      <div className="mt-1 space-y-1">
                        <StatusBadge status={doc.documentStatus} />
                        {doc.fileName && (
                          <p className="text-xs text-gray-500 truncate">{doc.fileName}{doc.fileSize ? ` · ${formatSize(doc.fileSize)}` : ''}</p>
                        )}
                        {doc.documentStatus === 'REJECTED' && doc.rejectionReason && (
                          <p className="text-xs text-red-500">Reason: {doc.rejectionReason}. Please upload a corrected file.</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">Not uploaded</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {doc?.hasFile && (
                    <button
                      type="button"
                      onClick={() => handleView(doc.id)}
                      className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
                    >
                      <Eye size={16} /> View
                    </button>
                  )}
                  <label className={`bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-2 ${uploadingType ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                    {isUploading ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      className="hidden"
                      accept={KYC_ACCEPT}
                      aria-label={`Upload ${label}`}
                      disabled={Boolean(uploadingType)}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = ''; // allow choosing the same file again
                        if (file) handleUpload(type, file);
                      }}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default DocumentsStep;
