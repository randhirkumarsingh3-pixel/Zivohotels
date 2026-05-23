import { Outlet } from 'react-router-dom';
import Sidebar from '../admin/components/Sidebar';

const AdminLayout = () => {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10">
          <h1 className="text-lg font-semibold text-gray-800">Property Management System</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium bg-brand-50 text-brand-700 px-3 py-1 rounded-full border border-brand-100">
              Live Environment
            </span>
          </div>
        </header>
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
