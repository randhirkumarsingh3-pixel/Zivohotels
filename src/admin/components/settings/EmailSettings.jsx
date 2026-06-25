import { useState, useEffect } from 'react';
import { Mail, Save, Code, Loader2 } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

const EmailSettings = () => {
  const [activeTemplate, setActiveTemplate] = useState('booking_confirmation');
  const [templatesData, setTemplatesData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [_error, setError] = useState('');

  const templates = [
    { id: 'booking_confirmation', name: 'Booking Confirmation' },
    { id: 'cancellation', name: 'Booking Cancellation' },
    { id: 'refund', name: 'Refund Processed' },
    { id: 'signup', name: 'User Signup Welcome' },
  ];

  const defaultTemplates = {
    booking_confirmation: {
      subject: 'Your Booking is Confirmed - ZivoHotels',
      content: `Dear {{guest_name}},\n\nYour booking at {{property_name}} is confirmed!\n\nBooking ID: {{booking_id}}\nCheck-in: {{check_in_date}}\nCheck-out: {{check_out_date}}\nTotal Amount: {{total_amount}}\n\nWe look forward to hosting you.\n\nBest Regards,\nThe ZivoHotels Team`
    },
    cancellation: {
      subject: 'Booking Cancelled - ZivoHotels',
      content: `Dear {{guest_name}},\n\nYour booking at {{property_name}} has been cancelled.\n\nBooking ID: {{booking_id}}\n\nIf this was a mistake, please contact us immediately.`
    },
    refund: {
      subject: 'Refund Processed - ZivoHotels',
      content: `Dear {{guest_name}},\n\nYour refund for booking {{booking_id}} has been processed successfully.`
    },
    signup: {
      subject: 'Welcome to ZivoHotels!',
      content: `Dear {{guest_name}},\n\nWelcome to ZivoHotels! We're glad to have you with us.`
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        setTemplatesData(config.email_templates || defaultTemplates);
      } catch (err) {
        console.error('Failed to fetch email settings:', err);
        setError('Failed to load email templates');
        setTemplatesData(defaultTemplates);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ email_templates: templatesData });
      alert('Email templates saved successfully');
    } catch (err) {
      console.error('Failed to save email settings:', err);
      alert('Failed to save email templates');
    } finally {
      setSaving(false);
    }
  };

  const updateCurrentTemplate = (field, value) => {
    setTemplatesData(prev => ({
      ...prev,
      [activeTemplate]: {
        ...prev[activeTemplate],
        [field]: value
      }
    }));
  };

  const variables = [
    '{{guest_name}}', '{{property_name}}', '{{booking_id}}', 
    '{{check_in_date}}', '{{check_out_date}}', '{{total_amount}}', 
    '{{hotel_address}}', '{{cancellation_policy}}'
  ];

  const handleCopyVar = (variable) => {
    navigator.clipboard.writeText(variable);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      <p className="text-gray-500 text-sm">Loading templates...</p>
    </div>
  );

  const currentTemplate = templatesData[activeTemplate] || { subject: '', content: '' };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Email Configuration</h3>
        <p className="text-sm text-gray-500">Manage automated email templates and dynamic variables.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Template Selector */}
        <div className="w-full lg:w-64 space-y-2">
          <h4 className="font-semibold text-gray-700 text-sm mb-3">Templates</h4>
          {templates.map(t => (
            <button 
              key={t.id}
              onClick={() => setActiveTemplate(t.id)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTemplate === t.id ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Editor Area */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div className="flex items-center text-gray-700 font-medium text-sm w-full">
              <Mail size={16} className="mr-2 shrink-0" /> Subject: 
              <input 
                type="text" 
                className="ml-2 border border-gray-300 rounded px-2 py-1 flex-1 outline-none focus:border-brand-500" 
                value={currentTemplate.subject}
                onChange={(e) => updateCurrentTemplate('subject', e.target.value)}
              />
            </div>
            <button className="text-gray-500 hover:text-brand-600 ml-4"><Code size={18} title="View Source" /></button>
          </div>
          
          <div className="p-4 flex-1">
            <textarea 
              value={currentTemplate.content}
              onChange={(e) => updateCurrentTemplate('content', e.target.value)}
              className="w-full h-64 p-4 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm text-gray-700"
            />
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Available Dynamic Variables (Click to Copy)</h4>
            <div className="flex flex-wrap gap-2">
              {variables.map(v => (
                <button 
                  key={v} 
                  onClick={() => handleCopyVar(v)}
                  className="text-xs bg-white border border-gray-300 px-2 py-1 rounded text-gray-600 hover:border-brand-500 hover:text-brand-600 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />} 
          Save Template
        </button>
      </div>
    </div>
  );
};

export default EmailSettings;
