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
const ReservationManagement = lazy(() => import("./pages/store/ReservationManagement"));

const Staff = lazy(() => import("./pages/store/Staff"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const SmsHistory = lazy(() => import("./pages/admin/SmsHistory"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
        <Route path="/s/:storeSlug/reservations" component={ReservationManagement} />
        
        {/* Store Staff */}
        <Route path="/s/:storeSlug/staff" component={Staff} />
        
        {/* Admin Settings */}
        <Route path="/admin/settings" component={Settings} />
        <Route path="/admin/settings/:section" component={Settings} />
        <Route path="/admin/sms-history" component={SmsHistory} />
        <Route path="/admin/dashboard" component={Dashboard} />
        
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
      <ThemeProvider defaultTheme="light">
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
