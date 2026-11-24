import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ExperimentProvider } from './context/ExperimentContext';

// Customer Flow (KEEP STATIC, DO NOT LAZY LOAD)
import CustomerLayout from './layouts/CustomerLayout';
import Home from './pages/Home';
const Listing = lazy(() => import('./pages/Listing'));
const Detail = lazy(() => import('./pages/Detail'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Login = lazy(() => import('./pages/Login'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Signup = lazy(() => import('./pages/Signup'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Rewards = lazy(() => import('./pages/Rewards'));
const Wallet = lazy(() => import('./pages/Wallet'));
const Membership = lazy(() => import('./pages/Membership'));
const Help = lazy(() => import('./pages/Help'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Account = lazy(() => import('./pages/Account'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PlaceLanding = lazy(() => import('./pages/PlaceLanding'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const ListProperty = lazy(() => import('./pages/ListProperty'));
const HourlyCheckout = lazy(() => import('./pages/HourlyCheckout'));
import AccountGuard from './components/auth/AccountGuard';
import SignInNudge from './components/SignInNudge';

// LAYOUTS (LAZY)
const MasterLayout = lazy(() => import('./layouts/MasterLayout'));
const ExtranetLayout = lazy(() => import('./layouts/ExtranetLayout'));

// Zivo Master Admin Pages (LAZY)
const AdminDashboard = lazy(() => import('./admin/pages/Dashboard')); // live figures (the old Executive Dashboard was sample data)
const Properties = lazy(() => import('./admin/pages/Properties'));
const PropertyReview = lazy(() => import('./admin/pages/PropertyReview'));
const PropertyWizard = lazy(() => import('./admin/pages/PropertyWizard'));
const Configuration = lazy(() => import('./admin/pages/Configuration'));
const InventoryPricing = lazy(() => import('./admin/pages/InventoryPricing'));
const Agreements = lazy(() => import('./admin/pages/Agreements'));
const AdminBookings = lazy(() => import('./admin/pages/Bookings'));
const ChannelManager = lazy(() => import('./admin/pages/ChannelManager'));
const Users = lazy(() => import('./admin/pages/Users'));
const Reports = lazy(() => import('./admin/pages/Reports'));
const PlatformSettings = lazy(() => import('./admin/pages/Settings'));
const SystemControlCenter = lazy(() => import('./admin/pages/SystemControlCenter'));
const PricingRMS = lazy(() => import('./admin/pages/PricingRMS'));
const AdminPromotions = lazy(() => import('./admin/pages/Promotions'));
const ReviewModeration = lazy(() => import('./admin/pages/ReviewModeration'));
const AdminLoyalty = lazy(() => import('./admin/pages/Loyalty'));
const ExtranetWallet = lazy(() => import('./extranet/pages/ExtranetWallet'));
const ExtranetMembership = lazy(() => import('./extranet/pages/ExtranetMembership'));
const AdminMembership = lazy(() => import('./admin/pages/Membership'));
const FinanceLedger = lazy(() => import('./admin/pages/FinanceLedger'));
const FinancePayouts = lazy(() => import('./admin/pages/FinancePayouts'));
const FinanceDocuments = lazy(() => import('./admin/pages/FinanceDocuments'));
const FinanceSettings = lazy(() => import('./admin/pages/FinanceSettings'));
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
const ExtranetDynamicPricing = lazy(() => import('./extranet/pages/ExtranetDynamicPricing'));
const ExtranetFinance = lazy(() => import('./extranet/pages/ExtranetFinance'));
const ExtranetPerformance = lazy(() => import('./extranet/pages/ExtranetPerformance'));
const ExtranetLogin = lazy(() => import('./extranet/pages/ExtranetLogin'));
const ExtranetProperty = lazy(() => import('./extranet/pages/ExtranetProperty'));
const ContentScores = lazy(() => import('./admin/pages/ContentScores'));
const ExtranetContentScore = lazy(() => import('./extranet/pages/ExtranetContentScore'));
const ExtranetRooms = lazy(() => import('./extranet/pages/ExtranetRooms'));
const ExtranetBookings = lazy(() => import('./extranet/pages/ExtranetBookings'));
const ExtranetReviews = lazy(() => import('./extranet/pages/ExtranetReviews'));
const ExtranetPromotions = lazy(() => import('./extranet/pages/ExtranetPromotions'));
const ExtranetSettings = lazy(() => import('./extranet/pages/ExtranetSettings'));
const PropertyOnboarding = lazy(() => import('./extranet/pages/PropertyOnboarding'));
const ExtranetHourly = lazy(() => import('./extranet/pages/ExtranetHourly'));
const ExtranetTeam = lazy(() => import('./extranet/pages/ExtranetTeam'));
const AdminStaff = lazy(() => import('./admin/pages/Staff'));
const AdminSeo = lazy(() => import('./admin/pages/Seo'));
const AdminGoogleHotels = lazy(() => import('./admin/pages/GoogleHotels'));
const AdminHourly = lazy(() => import('./admin/pages/Hourly'));

import { ExtranetProvider } from './extranet/context/ExtranetContext';

const LoaderFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-gray-50">
    <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const PlaceOrNotFound = () => (useLocation().pathname.startsWith('/hotels-in-') ? <PlaceLanding /> : <NotFound />);

function App() {
  return (
    <ExperimentProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AccountGuard />
        <SignInNudge />
        <Suspense fallback={<LoaderFallback />}>
          <Routes>
            {/* PUBLIC & CUSTOMER ROUTES */}
            <Route element={<CustomerLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/hotels" element={<Listing />} />
              <Route path="/hotel/:id" element={<Detail />} />
              <Route path="/help" element={<Help />} />
              <Route path="/privacy" element={<Privacy />} />
              {/* City and area pages (/hotels-in-bengaluru) are matched inside PlaceLanding; anything else is not found */}
              <Route path="*" element={<PlaceOrNotFound />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/list-your-property" element={<ListProperty />} />
              <Route path="/set-password" element={<ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER', 'MANAGER']}><SetPassword /></ProtectedRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/account" element={<ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER']}><Account /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              {/* Separate logins: admin console, hotel partners (extranet), guests (/login) */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/owner/login" element={<Navigate to="/extranet/login" replace />} />
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
              <Route path="/checkout/hourly" element={<ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER']}><HourlyCheckout /></ProtectedRoute>} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/membership" element={<Membership />} />
              <Route path="/wallet" element={<ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'OWNER']}><Wallet /></ProtectedRoute>} />
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
              <Route index element={<AdminDashboard />} />
              
              {/* Supply */}
              <Route path="properties" element={<Properties />} />
              <Route path="properties/review" element={<PropertyReview />} />
              <Route path="content-scores" element={<ContentScores />} />
              <Route path="properties/new" element={<PropertyWizard />} />
              <Route path="agreements" element={<Agreements />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="hourly" element={<AdminHourly />} />

              {/* Inventory & Distro */}
              <Route path="configuration" element={<Configuration />} />
              <Route path="inventory-pricing" element={<InventoryPricing />} />
              <Route path="channel-manager" element={<ChannelManager />} />

              {/* Pricing & RMS */}
              <Route path="pricing-rms" element={<PricingRMS />} />
              <Route path="promotions" element={<AdminPromotions />} />
              <Route path="reviews" element={<ReviewModeration />} />
              <Route path="loyalty" element={<AdminLoyalty />} />
              <Route path="membership" element={<AdminMembership />} />
              <Route path="forecasting" element={<DemandForecasting />} />

              {/* Analytics */}
              <Route path="analytics/rps" element={<SessionExplorer />} />
              <Route path="reports" element={<Reports />} />

              {/* Experiments */}
              <Route path="experiments" element={<OperatorDecisionCenter />} />

              {/* Finance */}
              <Route path="finance/ledger" element={<FinanceLedger />} />
              <Route path="finance/payouts" element={<FinancePayouts />} />
              <Route path="finance/documents" element={<FinanceDocuments />} />
              <Route path="finance/settings" element={<FinanceSettings />} />
              <Route path="wallets" element={<WalletControl />} />

              {/* Risk */}
              <Route path="fraud" element={<FraudRiskCenter />} />

              {/* Core Admin */}
              <Route path="users" element={<Users />} />
              <Route path="staff" element={<AdminStaff />} />
              <Route path="seo" element={<AdminSeo />} />
              <Route path="google-hotels" element={<AdminGoogleHotels />} />
              <Route path="control-center" element={<SystemControlCenter />} />
              <Route path="live-ops" element={<LiveOpsCommandCenter />} />
              <Route path="settings" element={<SystemHealth />} />
              {/* Tax slabs (GST), booking rules, gateway, emails... (was built but never routed) */}
              <Route path="platform-settings" element={<PlatformSettings />} />
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
              <Route path="property/score" element={<ExtranetContentScore />} />
              <Route path="rooms" element={<ExtranetRooms />} />
              <Route path="inventory" element={<ExtranetInventory />} />
              <Route path="hourly" element={<ExtranetHourly />} />
              <Route path="pricing" element={<ExtranetDynamicPricing />} />
              <Route path="bookings" element={<ExtranetBookings />} />
              <Route path="finance" element={<ExtranetFinance />} />
              <Route path="wallet" element={<ExtranetWallet />} />
              <Route path="member-prices" element={<ExtranetMembership />} />
              <Route path="reviews" element={<ExtranetReviews />} />
              <Route path="promotions" element={<ExtranetPromotions />} />
              <Route path="performance" element={<ExtranetPerformance />} />
              <Route path="settings" element={<ExtranetSettings />} />
              <Route path="team" element={<ExtranetTeam />} />
            </Route>

          </Routes>
        </Suspense>
      </Router>
    </ExperimentProvider>
  );
}

export default App;
