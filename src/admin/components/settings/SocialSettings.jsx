import { useState, useEffect } from 'react';
import { Save, Facebook, Instagram, Twitter, Linkedin, Loader2 } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

const SocialSettings = () => {
  const [socialData, setSocialData] = useState({
    facebook: 'https://facebook.com/zivohotels',
    instagram: 'https://instagram.com/zivohotels',
    twitter: 'https://x.com/zivohotels',
    linkedin: 'https://linkedin.com/company/zivohotels'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        if (config.social_settings) {
          setSocialData(config.social_settings);
        }
      } catch (err) {
        console.error('Failed to fetch social settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ social_settings: socialData });
      alert('Social links saved successfully');
    } catch (err) {
      console.error('Failed to save social settings:', err);
      alert('Failed to save social links');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setSocialData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      <p className="text-gray-500 text-sm mt-4">Loading social links...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Social Media Configuration</h3>
        <p className="text-sm text-gray-500">Configure global links to your social media profiles.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm max-w-3xl">
        <div className="space-y-6">
          
          <div className="flex items-center">
            <div className="w-10 h-10 bg-[#1877F2] rounded flex items-center justify-center shrink-0 mr-4">
              <Facebook size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Page URL</label>
              <input type="url" value={socialData.facebook} onChange={(e) => updateField('facebook', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-tr from-[#fd5949] to-[#d6249f] rounded flex items-center justify-center shrink-0 mr-4">
              <Instagram size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram Profile URL</label>
              <input type="url" value={socialData.instagram} onChange={(e) => updateField('instagram', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-10 h-10 bg-black rounded flex items-center justify-center shrink-0 mr-4">
              <Twitter size={20} className="text-white fill-current" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">X (Twitter) Profile URL</label>
              <input type="url" value={socialData.twitter} onChange={(e) => updateField('twitter', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-10 h-10 bg-[#0A66C2] rounded flex items-center justify-center shrink-0 mr-4">
              <Linkedin size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn Company Page</label>
              <input type="url" value={socialData.linkedin} onChange={(e) => updateField('linkedin', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Save Social Links
          </button>
        </div>
      </div>
    </div>
  );
};

export default SocialSettings;
