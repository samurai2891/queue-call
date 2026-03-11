import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./contexts/LocaleContext";
import Home from "./pages/Home";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load store pages
const StoreTop = lazy(() => import("./pages/store/StoreTop"));
const JoinQueue = lazy(() => import("./pages/store/JoinQueue"));
const Ticket = lazy(() => import("./pages/store/Ticket"));
const Notifications = lazy(() => import("./pages/store/Notifications"));
const Checkin = lazy(() => import("./pages/store/Checkin"));

const Menu = lazy(() => import("./pages/store/Menu"));

// Kiosk: Admin (management) and Display (customer-facing)
const KioskAdmin = lazy(() => import("./pages/store/KioskAdmin"));
const KioskDisplay = lazy(() => import("./pages/store/KioskDisplay"));

// Board: Admin (management) and Display (customer-facing)
const BoardAdmin = lazy(() => import("./pages/store/BoardAdmin"));
const BoardDisplay = lazy(() => import("./pages/store/BoardDisplay"));
const Reservation = lazy(() => import("./pages/store/Reservation"));
const ReservationCheck = lazy(() => import("./pages/store/ReservationCheck"));
const ReservationManagement = lazy(() => import("./pages/store/ReservationManagement"));

const Staff = lazy(() => import("./pages/store/Staff"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const SmsHistory = lazy(() => import("./pages/admin/SmsHistory"));
const SmsTransactions = lazy(() => import("./pages/admin/SmsTransactions"));
const SmsAnalytics = lazy(() => import("./pages/admin/SmsAnalytics"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const InternalAdminOverview = lazy(() => import("./pages/internalAdmin/Overview"));
const InternalAdminUsers = lazy(() => import("./pages/internalAdmin/Users"));
const InternalAdminStores = lazy(() => import("./pages/internalAdmin/Stores"));
const InternalAdminTickets = lazy(() => import("./pages/internalAdmin/Tickets"));
const InternalAdminRevenue = lazy(() => import("./pages/internalAdmin/Revenue"));
const InternalAdminSystem = lazy(() => import("./pages/internalAdmin/System"));
const InternalAdminTestAccounts = lazy(() => import("./pages/internalAdmin/TestAccounts"));

// Legal pages
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        {/* Home */}
        <Route path="/" component={Home} />
        
        {/* Store Customer Pages */}
        <Route path="/s/:storeSlug" component={StoreTop} />
        <Route path="/s/:storeSlug/join" component={JoinQueue} />
        <Route path="/s/:storeSlug/ticket/:token" component={Ticket} />
        <Route path="/s/:storeSlug/ticket/:token/notifications" component={Notifications} />
        <Route path="/s/:storeSlug/checkin" component={Checkin} />

        <Route path="/s/:storeSlug/menu" component={Menu} />
        
        {/* Kiosk: Admin (management) and Display (customer-facing with access key) */}
        <Route path="/s/:storeSlug/kiosk" component={KioskAdmin} />
        <Route path="/s/:storeSlug/kiosk/display" component={KioskDisplay} />
        
        {/* Board: Admin (management) and Display (customer-facing with access key) */}
        <Route path="/s/:storeSlug/board" component={BoardAdmin} />
        <Route path="/s/:storeSlug/board/display" component={BoardDisplay} />
        
        {/* Reservation */}
        <Route path="/s/:storeSlug/reservation" component={Reservation} />
        <Route path="/s/:storeSlug/reservation/check" component={ReservationCheck} />
        <Route path="/s/:storeSlug/reservations" component={ReservationManagement} />
        
        {/* Store Staff */}
        <Route path="/s/:storeSlug/staff" component={Staff} />
        
        {/* Admin Settings */}
        <Route path="/admin/settings" component={Settings} />
        <Route path="/admin/settings/:section" component={Settings} />
        <Route path="/admin/sms-history" component={SmsHistory} />
        <Route path="/admin/sms-transactions" component={SmsTransactions} />
        <Route path="/admin/sms-analytics" component={SmsAnalytics} />
        <Route path="/admin/dashboard" component={Dashboard} />

        {/* Internal Admin */}
        <Route path="/internal-admin" component={InternalAdminOverview} />
        <Route path="/internal-admin/users" component={InternalAdminUsers} />
        <Route path="/internal-admin/stores" component={InternalAdminStores} />
        <Route path="/internal-admin/tickets" component={InternalAdminTickets} />
        <Route path="/internal-admin/revenue" component={InternalAdminRevenue} />
        <Route path="/internal-admin/system" component={InternalAdminSystem} />
        <Route path="/internal-admin/test-accounts" component={InternalAdminTestAccounts} />
        
        {/* Legal Pages */}
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        
        {/* 404 */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <LocaleProvider>
            <OfflineIndicator />
            <Router />
          </LocaleProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
