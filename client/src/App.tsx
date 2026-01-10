import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load store pages
const StoreTop = lazy(() => import("./pages/store/StoreTop"));
const JoinQueue = lazy(() => import("./pages/store/JoinQueue"));
const Ticket = lazy(() => import("./pages/store/Ticket"));
const Checkin = lazy(() => import("./pages/store/Checkin"));
const Menu = lazy(() => import("./pages/store/Menu"));
const Kiosk = lazy(() => import("./pages/store/Kiosk"));
const Board = lazy(() => import("./pages/store/Board"));
const Staff = lazy(() => import("./pages/store/Staff"));
const Settings = lazy(() => import("./pages/admin/Settings"));

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
        <Route path="/s/:storeSlug/checkin" component={Checkin} />
        <Route path="/s/:storeSlug/menu" component={Menu} />
        
        {/* Store Kiosk & Board */}
        <Route path="/s/:storeSlug/kiosk" component={Kiosk} />
        <Route path="/s/:storeSlug/board" component={Board} />
        
        {/* Store Staff */}
        <Route path="/s/:storeSlug/staff" component={Staff} />
        
        {/* Admin Settings */}
        <Route path="/admin/settings" component={Settings} />
        <Route path="/admin/settings/:section" component={Settings} />
        
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
