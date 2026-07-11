import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const DocumentsStep = ({ formData, updateForm }) => {
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL;
  const hotelId = formData.id || localStorage.getItem('currentHotelId_admin');

  const DOC_TYPES = [
    { type: 'GST', label: 'GST Certificate' },
    { type: 'PAN', label: 'PAN Card' },
    { type: 'TRADE_LICENSE', label: 'Trade License' },
    { type: 'FIRE_SAFETY', label: 'Fire NOC / Safety Certificate' },
    { type: 'BANK_PROOF', label: 'Cancelled Cheque' }
  ];

  useEffect(() => {
    if (hotelId) {
      fetchDocuments();
    }
  }, [hotelId]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/kyc/${hotelId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocuments(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  const handleUpload = async (docType, file) => {
    if (!hotelId) {
      alert('Please save the property as a draft first (click Save Draft) before uploading documents.');
      return;
    }

    if (!file) return;

    setIsUploading(true);
    setUploadError('');

    try {
      // 1. Upload to Image service (or a dedicated document bucket). For now, use the images endpoint or assume we have a documentUrl.
      // Since we don't have a specific file upload endpoint for docs right now, we will use the existing images upload endpoint.
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      // Let's assume the /images endpoint works for any file and returns { url }
      const uploadRes = await fetch(`${API_URL}/images/upload`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeaders()['Authorization']
        },
        body: formDataUpload
      });
      
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message || 'Failed to upload file');
      
      const documentUrl = uploadData.data?.url || uploadData.url;

      // 2. Link to KYC Record
      const linkRes = await fetch(`${API_URL}/kyc/${hotelId}/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ documentType: docType, documentUrl })
      });

      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkData.message || 'Failed to save document record');

      // Refresh list
      fetchDocuments();
    } catch (err) {
      setUploadError(err.message);
      alert(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const getDocStatus = (type) => {
    return documents.find(d => d.documentType === type);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Property Documents (KYC)</h3>
        <p className="text-sm text-gray-500 mt-1">Upload the required compliance and verification documents for this property.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <ul className="divide-y divide-gray-100">
          {DOC_TYPES.map(doc => {
            const uploadedDoc = getDocStatus(doc.type);
            return (
              <li key={doc.type} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{doc.label}</h4>
                    {uploadedDoc ? (
                      <div className="flex items-center gap-2 mt-1">
                        {uploadedDoc.documentStatus === 'VERIFIED' && <span className="flex items-center text-xs font-medium text-green-600"><CheckCircle2 size={14} className="mr-1" /> Verified</span>}
                        {uploadedDoc.documentStatus === 'PENDING' && <span className="flex items-center text-xs font-medium text-amber-600"><Clock size={14} className="mr-1" /> Pending Review</span>}
                        {uploadedDoc.documentStatus === 'REJECTED' && <span className="flex items-center text-xs font-medium text-red-600"><XCircle size={14} className="mr-1" /> Rejected</span>}
                        {uploadedDoc.rejectionReason && <p className="text-xs text-red-500 mt-1">{uploadedDoc.rejectionReason}</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">Not uploaded</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-2">
                    <UploadCloud size={16} />
                    {uploadedDoc ? 'Replace File' : 'Upload File'}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleUpload(doc.type, e.target.files[0]);
                        }
                      }}
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      
      {uploadError && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
          {uploadError}
        </div>
      )}
    </div>
  );
};

export default DocumentsStep;
