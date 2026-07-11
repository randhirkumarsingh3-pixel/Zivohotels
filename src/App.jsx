import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ExperimentProvider } from './context/ExperimentContext';

// Customer Flow (KEEP STATIC, DO NOT LAZY LOAD)
import CustomerLayout from './layouts/CustomerLayout';
import Home from './pages/Home';
import Listing from './pages/Listing';
import Detail from './pages/Detail';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AcceptInvite from './pages/AcceptInvite';
import MyBookings from './pages/MyBookings';

// LAYOUTS (LAZY)
const MasterLayout = lazy(() => import('./layouts/MasterLayout'));
const ExtranetLayout = lazy(() => import('./layouts/ExtranetLayout'));

// Zivo Master Admin Pages (LAZY)
const ExecutiveDashboard = lazy(() => import('./admin/pages/ExecutiveDashboard'));
const Properties = lazy(() => import('./admin/pages/Properties'));
const PropertyReview = lazy(() => import('./admin/pages/PropertyReview'));
const PropertyWizard = lazy(() => import('./admin/pages/PropertyWizard'));
const Configuration = lazy(() => import('./admin/pages/Configuration'));
const InventoryPricing = lazy(() => import('./admin/pages/InventoryPricing'));
const Agreements = lazy(() => import('./admin/pages/Agreements'));
const _Bookings = lazy(() => import('./admin/pages/Bookings'));
const ChannelManager = lazy(() => import('./admin/pages/ChannelManager'));
const Users = lazy(() => import('./admin/pages/Users'));
const Reports = lazy(() => import('./admin/pages/Reports'));
const _Settings = lazy(() => import('./admin/pages/Settings'));
const SystemControlCenter = lazy(() => import('./admin/pages/SystemControlCenter'));
const PricingRMS = lazy(() => import('./admin/pages/PricingRMS'));
const FinanceOS = lazy(() => import('./admin/pages/FinanceOS'));
const FraudRiskCenter = lazy(() => import('./admin/pages/FraudRiskCenter'));
const OperatorDecisionCenter = lazy(() => import('./admin/pages/OperatorDecisionCenter'));
const SessionExplorer = lazy(() => import('./admin/pages/SessionExplorer'));
const SystemHealth = lazy(() => import('./admin/pages/SystemHealth'));
const LiveOpsCommandCenter = lazy(() => import('./admin/pages/LiveOpsCommandCenter'));

// Master Intelligence Pages (LAZY)
const DemandForecasting = lazy(() => import('./admin/pages/DemandForecasting'));
const WalletControl = lazy(() => import('./admin/pages/WalletControl'));

// Hotel Extranet Pages (LAZY)
const ExtranetDashboard = lazy(() => import('./extranet/pages/ExtranetDashboard'));
const ExtranetInventory = lazy(() => import('./extranet/pages/ExtranetInventory'));
const ExtranetFinance = lazy(() => import('./extranet/pages/ExtranetFinance'));
const ExtranetPerformance = lazy(() => import('./extranet/pages/ExtranetPerformance'));
const ExtranetLogin = lazy(() => import('./extranet/pages/ExtranetLogin'));
const ExtranetProperty = lazy(() => import('./extranet/pages/ExtranetProperty'));
const ExtranetRooms = lazy(() => import('./extranet/pages/ExtranetRooms'));
const ExtranetBookings = lazy(() => import('./extranet/pages/ExtranetBookings'));
const ExtranetReviews = lazy(() => import('./extranet/pages/ExtranetReviews'));
const ExtranetPromotions = lazy(() => import('./extranet/pages/ExtranetPromotions'));
const ExtranetSettings = lazy(() => import('./extranet/pages/ExtranetSettings'));
const PropertyOnboarding = lazy(() => import('./extranet/pages/PropertyOnboarding'));

import { ExtranetProvider } from './extranet/context/ExtranetContext';

const LoaderFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-gray-50">
    <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function App() {
  return (
    <ExperimentProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<LoaderFallback />}>
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
              <Route path="properties/review" element={<PropertyReview />} />
              <Route path="properties/new" element={<PropertyWizard />} />
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

            {/* FULLSCREEN ADMIN PROPERTY WIZARD ROUTES */}
            <Route 
              path="/admin/properties/new" 
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <PropertyWizard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/properties/edit/:id" 
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <PropertyWizard />
                </ProtectedRoute>
              } 
            />
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
        </Suspense>
      </Router>
    </ExperimentProvider>
  );
}

export default App;
