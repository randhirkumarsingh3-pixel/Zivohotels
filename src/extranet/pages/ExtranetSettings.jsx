import { useState } from 'react';
import { User, Bell, Shield, CreditCard, 
  Key, Mail, Phone, Save, LogOut,
  Lock, Smartphone, Users, Eye,
  EyeOff, Edit3
} from 'lucide-react';

const ExtranetSettings = () => {
  const [activeSection, setActiveSection] = useState('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [notifications, setNotifications] = useState({
    bookingAlerts: true,
    reviewAlerts: true,
    payoutAlerts: true,
    marketingEmails: false,
    smsAlerts: true,
    whatsappAlerts: true,
  });

  const sections = [
    { id: 'profile', name: 'Account Profile', icon: User },
    { id: 'notifications', name: 'Notification Preferences', icon: Bell },
    { id: 'security', name: 'Security & Access', icon: Shield },
    { id: 'billing', name: 'Billing & Bank', icon: CreditCard },
    { id: 'team', name: 'Team Management', icon: Users },
  ];

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-gray-500 font-medium mt-1">Manage your account preferences and configuration.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Nav */}
        <div className="space-y-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeSection === s.id ? 'bg-brand-50 text-brand-600 font-bold border border-brand-100' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <s.icon size={18} />
              <span className="text-sm">{s.name}</span>
            </button>
          ))}
          
          <div className="pt-6 mt-6 border-t border-gray-100">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-red-500 hover:bg-red-50 transition-all">
              <LogOut size={18} />
              <span className="text-sm font-bold">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-100">
                <h3 className="text-xl font-black text-gray-900">Account Profile</h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">Manage your personal and hotel account details.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-6 pb-6 border-b border-gray-100">
                  <div className="w-20 h-20 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-black border border-brand-200">
                    RK
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-gray-900">Rajesh Kumar</h4>
                    <p className="text-sm text-gray-500 font-medium">Hotel Owner • Primary Account</p>
                    <button className="mt-2 text-[10px] font-black text-brand-600 uppercase tracking-widest hover:underline">Change Photo</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Full Name</label>
                    <input type="text" defaultValue="Rajesh Kumar" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Role</label>
                    <input type="text" defaultValue="Hotel Owner" disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-500 cursor-default" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input type="email" defaultValue="rajesh@grandzivo.com" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input type="text" defaultValue="+91 98100 42000" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none" />
                    </div>
                  </div>
                </div>

                <button className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20">
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-100">
                <h3 className="text-xl font-black text-gray-900">Notification Preferences</h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">Choose how you want to be notified about important events.</p>
              </div>
              <div className="p-8 space-y-2">
                {[
                  { key: 'bookingAlerts', label: 'New Booking Alerts', desc: 'Get notified when a new booking is made.' },
                  { key: 'reviewAlerts', label: 'Guest Review Alerts', desc: 'Get notified when a guest leaves a review.' },
                  { key: 'payoutAlerts', label: 'Payout Notifications', desc: 'Get notified when a payout is processed.' },
                  { key: 'marketingEmails', label: 'Marketing & Tips', desc: 'Receive tips and offers from Zivo to grow your business.' },
                  { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Receive critical alerts via SMS.' },
                  { key: 'whatsappAlerts', label: 'WhatsApp Notifications', desc: 'Get booking summaries on WhatsApp.' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-5 rounded-2xl hover:bg-gray-50 transition-all">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{item.label}</h4>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{item.desc}</p>
                    </div>
                    <button 
                      onClick={() => toggleNotification(item.key)}
                      className={`w-12 h-6 rounded-full transition-all ${notifications[item.key] ? 'bg-brand-600' : 'bg-gray-200'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform mt-0.5 ${notifications[item.key] ? 'translate-x-6 ml-0.5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="space-y-8">
              <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-100">
                  <h3 className="text-xl font-black text-gray-900">Password & Security</h3>
                </div>
                <div className="p-8 space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Current Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input type={showPassword ? 'text' : 'password'} defaultValue="placeholder" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-12 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none" />
                      <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">New Password</label>
                      <input type="password" placeholder="Enter new password" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Confirm New Password</label>
                      <input type="password" placeholder="Confirm new password" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                    </div>
                  </div>
                  <button className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 transition-all">
                    <Key size={16} /> Update Password
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
                <h3 className="text-lg font-black text-gray-900 mb-4">Two-Factor Authentication</h3>
                <div className="flex items-center justify-between p-5 bg-green-50 rounded-2xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <Smartphone className="text-green-600" size={20} />
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">SMS-based 2FA</h4>
                      <p className="text-xs text-gray-500 font-medium">Verification code sent to +91 98100 XXXXX</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-green-200">ENABLED</span>
                </div>
              </div>
            </div>
          )}

          {/* Billing Section */}
          {activeSection === 'billing' && (
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-100">
                <h3 className="text-xl font-black text-gray-900">Billing & Bank Details</h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">Manage your payout details and billing information.</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="bg-gray-900 rounded-3xl p-8 text-white">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Primary Bank Account</h4>
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-[9px] font-black uppercase tracking-widest">VERIFIED</span>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Account Holder</p>
                      <p className="text-sm font-black">Grand Zivo Hotels Pvt Ltd</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Bank Name</p>
                      <p className="text-sm font-black">HDFC Bank</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Account Number</p>
                      <p className="text-sm font-black">XXXX XXXX XXXX 4829</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">IFSC Code</p>
                      <p className="text-sm font-black">HDFC0001234</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">GSTIN</label>
                    <input type="text" defaultValue="07AABCG1234A1Z5" disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-500 cursor-default" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">PAN Number</label>
                    <input type="text" defaultValue="AABCG1234A" disabled className="w-full bg-gray-100 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-500 cursor-default" />
                  </div>
                </div>

                <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5">
                  <p className="text-xs text-brand-700 font-medium leading-relaxed">
                    <strong className="font-black">Note:</strong> To update bank details or tax information, please raise a support ticket. Changes require verification for security.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Team Management Section */}
          {activeSection === 'team' && (
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Team Management</h3>
                  <p className="text-sm text-gray-500 mt-1 font-medium">Manage who has access to your extranet.</p>
                </div>
                <button className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">
                  <Users size={14} /> Invite Member
                </button>
              </div>
              <div className="p-4">
                {[
                  { name: 'Rajesh Kumar', email: 'rajesh@grandzivo.com', role: 'Owner', status: 'Active', lastLogin: '2 min ago' },
                  { name: 'Sunita Devi', email: 'sunita@grandzivo.com', role: 'Manager', status: 'Active', lastLogin: '1 hr ago' },
                  { name: 'Amit Verma', email: 'amit@grandzivo.com', role: 'Front Desk', status: 'Active', lastLogin: '4 hrs ago' },
                ].map((member, i) => (
                  <div key={i} className="flex items-center justify-between p-5 rounded-2xl hover:bg-gray-50 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-black text-sm border border-brand-100">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{member.name}</h4>
                        <p className="text-[10px] text-gray-400 font-medium">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-black text-gray-600 uppercase tracking-widest">{member.role}</span>
                      <span className="text-[10px] text-gray-400 font-medium">Last: {member.lastLogin}</span>
                      <button className="p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all">
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExtranetSettings;
