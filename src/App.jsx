import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ExperimentProvider } from './context/ExperimentContext';

// Layouts
import CustomerLayout from './layouts/CustomerLayout';
import MasterLayout from './layouts/MasterLayout';
import ExtranetLayout from './layouts/ExtranetLayout';

// Public Pages
import Home from './pages/Home';
import Listing from './pages/Listing';
import Detail from './pages/Detail';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AcceptInvite from './pages/AcceptInvite';
import MyBookings from './pages/MyBookings';

// Zivo Master Admin Pages
import ExecutiveDashboard from './admin/pages/ExecutiveDashboard';
import Properties from './admin/pages/Properties';
import PropertyWizard from './admin/pages/PropertyWizard';
import Configuration from './admin/pages/Configuration';
import InventoryPricing from './admin/pages/InventoryPricing';
import Agreements from './admin/pages/Agreements';
import Bookings from './admin/pages/Bookings';
import ChannelManager from './admin/pages/ChannelManager';
import Users from './admin/pages/Users';
import Reports from './admin/pages/Reports';
import Settings from './admin/pages/Settings';
import SystemControlCenter from './admin/pages/SystemControlCenter';
import PricingRMS from './admin/pages/PricingRMS';
import FinanceOS from './admin/pages/FinanceOS';
import FraudRiskCenter from './admin/pages/FraudRiskCenter';
import OperatorDecisionCenter from './admin/pages/OperatorDecisionCenter';
import SessionExplorer from './admin/pages/SessionExplorer';
import SystemHealth from './admin/pages/SystemHealth';
import LiveOpsCommandCenter from './admin/pages/LiveOpsCommandCenter';

// Master Intelligence Pages
import DemandForecasting from './admin/pages/DemandForecasting';
import WalletControl from './admin/pages/WalletControl';

// Hotel Extranet Pages
import ExtranetDashboard from './extranet/pages/ExtranetDashboard';
import ExtranetInventory from './extranet/pages/ExtranetInventory';
import ExtranetFinance from './extranet/pages/ExtranetFinance';
import ExtranetPerformance from './extranet/pages/ExtranetPerformance';
import ExtranetLogin from './extranet/pages/ExtranetLogin';
import ExtranetProperty from './extranet/pages/ExtranetProperty';
import ExtranetRooms from './extranet/pages/ExtranetRooms';
import ExtranetBookings from './extranet/pages/ExtranetBookings';
import ExtranetReviews from './extranet/pages/ExtranetReviews';
import ExtranetPromotions from './extranet/pages/ExtranetPromotions';
import ExtranetSettings from './extranet/pages/ExtranetSettings';
import PropertyOnboarding from './extranet/pages/PropertyOnboarding';
import { ExtranetProvider } from './extranet/context/ExtranetContext';

function App() {
  return (
    <ExperimentProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* PUBLIC & CUSTOMER ROUTES */}
          <Route element={<CustomerLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/hotels" element={<Listing />} />
            <Route path="/hotel/:id" element={<Detail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/owner/login" element={<Login />} />
            <Route path="/extranet/login" element={<ExtranetLogin />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route 
              path="/checkout" 
              element={
                <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER']}>
                  <Checkout />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/my-bookings" 
              element={
                <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER']}>
                  <MyBookings />
                </ProtectedRoute>
              } 
            />
          </Route>

          {/* ZIVO MASTER ADMIN ROUTES */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <MasterLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ExecutiveDashboard />} />
            
            {/* Supply */}
            <Route path="properties" element={<Properties />} />
            <Route path="properties/new" element={<PropertyWizard />} />
            <Route path="properties/edit/:id" element={<PropertyWizard />} />
            <Route path="agreements" element={<Agreements />} />

            {/* Inventory & Distro */}
            <Route path="configuration" element={<Configuration />} />
            <Route path="inventory-pricing" element={<InventoryPricing />} />
            <Route path="channel-manager" element={<ChannelManager />} />

            {/* Pricing & RMS */}
            <Route path="pricing-rms" element={<PricingRMS />} />
            <Route path="forecasting" element={<DemandForecasting />} />

            {/* Analytics */}
            <Route path="analytics/rps" element={<SessionExplorer />} />
            <Route path="reports" element={<Reports />} />

            {/* Experiments */}
            <Route path="experiments" element={<OperatorDecisionCenter />} />

            {/* Finance */}
            <Route path="finance/ledger" element={<FinanceOS />} />
            <Route path="finance/payouts" element={<FinanceOS />} />
            <Route path="wallets" element={<WalletControl />} />

            {/* Risk */}
            <Route path="fraud" element={<FraudRiskCenter />} />

            {/* Core Admin */}
            <Route path="users" element={<Users />} />
            <Route path="control-center" element={<SystemControlCenter />} />
            <Route path="live-ops" element={<LiveOpsCommandCenter />} />
            <Route path="settings" element={<SystemHealth />} />
          </Route>

          {/* PROPERTY ONBOARDING (Fullscreen Wizard) */}
          <Route 
            path="/extranet/onboarding" 
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                <ExtranetProvider>
                  <PropertyOnboarding />
                </ExtranetProvider>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/extranet/onboarding/:hotelId" 
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                <ExtranetProvider>
                  <PropertyOnboarding />
                </ExtranetProvider>
              </ProtectedRoute>
            } 
          />

          {/* HOTEL EXTRANET ROUTES */}
          <Route 
            path="/extranet" 
            element={
              <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                <ExtranetLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ExtranetDashboard />} />
            
            <Route path="property" element={<ExtranetProperty />} />
            <Route path="rooms" element={<ExtranetRooms />} />
            <Route path="inventory" element={<ExtranetInventory />} />
            <Route path="pricing" element={<ExtranetInventory />} />
            <Route path="bookings" element={<ExtranetBookings />} />
            <Route path="finance" element={<ExtranetFinance />} />
            <Route path="reviews" element={<ExtranetReviews />} />
            <Route path="promotions" element={<ExtranetPromotions />} />
            <Route path="performance" element={<ExtranetPerformance />} />
            <Route path="settings" element={<ExtranetSettings />} />
          </Route>

          {/* Default Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ExperimentProvider>
  );
}

export default App;
