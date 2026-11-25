import { Suspense } from 'react';
import { lazyPage } from './utils/lazyPage';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ExperimentProvider } from './context/ExperimentContext';

// Customer Flow (KEEP STATIC, DO NOT LAZY LOAD)
import CustomerLayout from './layouts/CustomerLayout';
import Home from './pages/Home';
const Listing = lazyPage(() => import('./pages/Listing'));
const Detail = lazyPage(() => import('./pages/Detail'));
const Checkout = lazyPage(() => import('./pages/Checkout'));
const Login = lazyPage(() => import('./pages/Login'));
const AdminLogin = lazyPage(() => import('./pages/AdminLogin'));
const Signup = lazyPage(() => import('./pages/Signup'));
const AcceptInvite = lazyPage(() => import('./pages/AcceptInvite'));
const MyBookings = lazyPage(() => import('./pages/MyBookings'));
const Rewards = lazyPage(() => import('./pages/Rewards'));
const Wallet = lazyPage(() => import('./pages/Wallet'));
const Membership = lazyPage(() => import('./pages/Membership'));
const Help = lazyPage(() => import('./pages/Help'));
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'));
const Account = lazyPage(() => import('./pages/Account'));
const Privacy = lazyPage(() => import('./pages/Privacy'));
const Terms = lazyPage(() => import('./pages/Terms'));
const RefundPolicy = lazyPage(() => import('./pages/RefundPolicy'));
const NotFound = lazyPage(() => import('./pages/NotFound'));
const PlaceLanding = lazyPage(() => import('./pages/PlaceLanding'));
const SetPassword = lazyPage(() => import('./pages/SetPassword'));
const ListProperty = lazyPage(() => import('./pages/ListProperty'));
const HourlyCheckout = lazyPage(() => import('./pages/HourlyCheckout'));
import AccountGuard from './components/auth/AccountGuard';
import SignInNudge from './components/SignInNudge';
import SiteNotice from './components/SiteNotice';

// LAYOUTS (LAZY)
const MasterLayout = lazyPage(() => import('./layouts/MasterLayout'));
const ExtranetLayout = lazyPage(() => import('./layouts/ExtranetLayout'));

// Zivo Master Admin Pages (LAZY)
const AdminDashboard = lazyPage(() => import('./admin/pages/Dashboard')); // live figures (the old Executive Dashboard was sample data)
const Properties = lazyPage(() => import('./admin/pages/Properties'));
const PropertyReview = lazyPage(() => import('./admin/pages/PropertyReview'));
const PropertyWizard = lazyPage(() => import('./admin/pages/PropertyWizard'));
const Configuration = lazyPage(() => import('./admin/pages/Configuration'));
const InventoryPricing = lazyPage(() => import('./admin/pages/InventoryPricing'));
const Agreements = lazyPage(() => import('./admin/pages/Agreements'));
const AdminBookings = lazyPage(() => import('./admin/pages/Bookings'));
const ChannelManager = lazyPage(() => import('./admin/pages/ChannelManager'));
const Users = lazyPage(() => import('./admin/pages/Users'));
const Reports = lazyPage(() => import('./admin/pages/Reports'));
const PlatformSettings = lazyPage(() => import('./admin/pages/Settings'));
const SystemControlCenter = lazyPage(() => import('./admin/pages/SystemControlCenter'));
const PricingRMS = lazyPage(() => import('./admin/pages/PricingRMS'));
const AdminPromotions = lazyPage(() => import('./admin/pages/Promotions'));
const ReviewModeration = lazyPage(() => import('./admin/pages/ReviewModeration'));
const AdminLoyalty = lazyPage(() => import('./admin/pages/Loyalty'));
const ExtranetWallet = lazyPage(() => import('./extranet/pages/ExtranetWallet'));
const ExtranetMembership = lazyPage(() => import('./extranet/pages/ExtranetMembership'));
const AdminMembership = lazyPage(() => import('./admin/pages/Membership'));
const FinanceLedger = lazyPage(() => import('./admin/pages/FinanceLedger'));
const FinancePayouts = lazyPage(() => import('./admin/pages/FinancePayouts'));
const FinanceDocuments = lazyPage(() => import('./admin/pages/FinanceDocuments'));
const FinanceSettings = lazyPage(() => import('./admin/pages/FinanceSettings'));
const FraudRiskCenter = lazyPage(() => import('./admin/pages/FraudRiskCenter'));
const OperatorDecisionCenter = lazyPage(() => import('./admin/pages/OperatorDecisionCenter'));
const SessionExplorer = lazyPage(() => import('./admin/pages/SessionExplorer'));
const SystemHealth = lazyPage(() => import('./admin/pages/SystemHealth'));
const LiveOpsCommandCenter = lazyPage(() => import('./admin/pages/LiveOpsCommandCenter'));

// Master Intelligence Pages (LAZY)
const DemandForecasting = lazyPage(() => import('./admin/pages/DemandForecasting'));
const WalletControl = lazyPage(() => import('./admin/pages/WalletControl'));

// Hotel Extranet Pages (LAZY)
const ExtranetDashboard = lazyPage(() => import('./extranet/pages/ExtranetDashboard'));
const ExtranetInventory = lazyPage(() => import('./extranet/pages/ExtranetInventory'));
const ExtranetDynamicPricing = lazyPage(() => import('./extranet/pages/ExtranetDynamicPricing'));
const ExtranetFinance = lazyPage(() => import('./extranet/pages/ExtranetFinance'));
const ExtranetPerformance = lazyPage(() => import('./extranet/pages/ExtranetPerformance'));
const ExtranetLogin = lazyPage(() => import('./extranet/pages/ExtranetLogin'));
const ExtranetProperty = lazyPage(() => import('./extranet/pages/ExtranetProperty'));
const ContentScores = lazyPage(() => import('./admin/pages/ContentScores'));
const SetupChecklist = lazyPage(() => import('./admin/pages/SetupChecklist'));
const DocumentSettings = lazyPage(() => import('./admin/pages/DocumentSettings'));
const ExtranetContentScore = lazyPage(() => import('./extranet/pages/ExtranetContentScore'));
const ExtranetRooms = lazyPage(() => import('./extranet/pages/ExtranetRooms'));
const ExtranetBookings = lazyPage(() => import('./extranet/pages/ExtranetBookings'));
const ExtranetReviews = lazyPage(() => import('./extranet/pages/ExtranetReviews'));
const ExtranetPromotions = lazyPage(() => import('./extranet/pages/ExtranetPromotions'));
const ExtranetSettings = lazyPage(() => import('./extranet/pages/ExtranetSettings'));
const PropertyOnboarding = lazyPage(() => import('./extranet/pages/PropertyOnboarding'));
const ExtranetHourly = lazyPage(() => import('./extranet/pages/ExtranetHourly'));
const ExtranetTeam = lazyPage(() => import('./extranet/pages/ExtranetTeam'));
const AdminStaff = lazyPage(() => import('./admin/pages/Staff'));
const AdminSeo = lazyPage(() => import('./admin/pages/Seo'));
const AdminGoogleHotels = lazyPage(() => import('./admin/pages/GoogleHotels'));
const AdminHourly = lazyPage(() => import('./admin/pages/Hourly'));

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
        <SiteNotice />
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
              <Route path="setup" element={<SetupChecklist />} />
              <Route path="documents" element={<DocumentSettings />} />
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
              <Route path="system-health" element={<SystemHealth />} />
              <Route path="settings" element={<Navigate to="/admin/system-health" replace />} />
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
