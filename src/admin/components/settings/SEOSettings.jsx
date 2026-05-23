import { useState, useEffect } from 'react';
import { Save, Globe, Code, Loader2 } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

const SEOSettings = () => {
  const [activeTab, setActiveTab] = useState('global');
  const [selectedPage, setSelectedPage] = useState('homepage');
  const [seoData, setSeoData] = useState({
    global: {
      brandName: 'ZivoHotels',
      canonicalBase: 'https://www.zivohotels.com',
      defaultTitle: 'ZivoHotels - Premium Stays Across India',
      defaultDescription: 'Book premium hotels and resorts at the best prices with ZivoHotels.',
      keywords: 'hotels, resorts, booking, india, luxury stays',
      ogImageUrl: 'https://zivohotels.com/assets/og-default.jpg'
    },
    pagewise: {
      homepage: { title: '', description: '', robots: 'index, follow' },
      search: { title: '', description: '', robots: 'index, follow' },
      detail: { title: '', description: '', robots: 'index, follow' },
      city: { title: 'Best Hotels in {{city}} | ZivoHotels', description: 'Find the best premium stays in {{city}}. Book now for exclusive discounts!', robots: 'index, follow' }
    },
    advanced: {
      robotsTxt: "User-agent: *\nDisallow: /admin/\nDisallow: /checkout/\nAllow: /\n\nSitemap: https://www.zivohotels.com/sitemap.xml",
      schemaEnabled: true
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        if (config.seo_settings) {
          setSeoData(config.seo_settings);
        }
      } catch (err) {
        console.error('Failed to fetch SEO settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ seo_settings: seoData });
      alert('SEO settings saved successfully');
    } catch (err) {
      console.error('Failed to save SEO settings:', err);
      alert('Failed to save SEO settings');
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (field, value) => {
    setSeoData(prev => ({
      ...prev,
      global: { ...prev.global, [field]: value }
    }));
  };

  const updatePage = (field, value) => {
    setSeoData(prev => ({
      ...prev,
      pagewise: {
        ...prev.pagewise,
        [selectedPage]: { ...prev.pagewise[selectedPage], [field]: value }
      }
    }));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      <p className="text-gray-500 text-sm mt-4">Loading SEO settings...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">SEO & Metadata Settings</h3>
        <p className="text-sm text-gray-500">Configure global and page-specific SEO for higher search engine rankings.</p>
      </div>

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('global')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'global' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Global SEO</button>
        <button onClick={() => setActiveTab('pagewise')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'pagewise' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Page-wise SEO</button>
        <button onClick={() => setActiveTab('advanced')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'advanced' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Advanced (Schema/Robots)</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        
        {activeTab === 'global' && (
          <div className="space-y-6 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input type="text" value={seoData.global.brandName} onChange={(e) => updateGlobal('brandName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Canonical URL Base</label>
                <input type="text" value={seoData.global.canonicalBase} onChange={(e) => updateGlobal('canonicalBase', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Title</label>
                <input type="text" value={seoData.global.defaultTitle} onChange={(e) => updateGlobal('defaultTitle', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Description</label>
                <textarea rows="3" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" value={seoData.global.defaultDescription} onChange={(e) => updateGlobal('defaultDescription', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Global Keywords (Comma separated)</label>
                <input type="text" value={seoData.global.keywords} onChange={(e) => updateGlobal('keywords', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pagewise' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="font-medium text-gray-700">Select Page Route:</label>
              <select value={selectedPage} onChange={(e) => setSelectedPage(e.target.value)} className="border border-gray-300 rounded-lg px-4 py-2 outline-none w-64">
                <option value="homepage">Homepage (/)</option>
                <option value="search">Search Results (/hotels)</option>
                <option value="detail">Hotel Detail (/hotel/:id)</option>
                <option value="city">City Page (/hotels/:city)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Title</label>
                <input type="text" value={seoData.pagewise[selectedPage]?.title} onChange={(e) => updatePage('title', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
                <textarea rows="2" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm" value={seoData.pagewise[selectedPage]?.description} onChange={(e) => updatePage('description', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Robots.txt Editor</label>
              <textarea 
                rows="6" 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm bg-gray-50 text-gray-800" 
                value={seoData.advanced.robotsTxt}
                onChange={(e) => setSeoData(prev => ({ ...prev, advanced: { ...prev.advanced, robotsTxt: e.target.value } }))}
              />
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Save SEO Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SEOSettings;
