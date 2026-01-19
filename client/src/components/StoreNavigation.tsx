import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Home,
  Users,
  Tablet,
  Monitor,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface StoreNavigationProps {
  storeSlug: string;
  storeName?: string;
}

type NavLabelKey = 'nav.storeTop' | 'nav.staff' | 'nav.kiosk' | 'nav.board' | 'nav.settings';

interface NavItem {
  id: string;
  labelKey: NavLabelKey;
  icon: React.ReactNode;
  href: string;
  matchPattern: RegExp;
}

const SIDEBAR_COLLAPSED_KEY = 'store-sidebar-collapsed';

export function StoreNavigation({ storeSlug, storeName }: StoreNavigationProps) {
  const { t } = useLocale();
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    }
    return false;
  });

  const navItems: NavItem[] = [
    {
      id: 'store-top',
      labelKey: 'nav.storeTop',
      icon: <Home className="h-5 w-5" />,
      href: `/s/${storeSlug}`,
      matchPattern: new RegExp(`^/s/${storeSlug}$`),
    },
    {
      id: 'staff',
      labelKey: 'nav.staff',
      icon: <Users className="h-5 w-5" />,
      href: `/s/${storeSlug}/staff`,
      matchPattern: new RegExp(`^/s/${storeSlug}/staff`),
    },
    {
      id: 'kiosk',
      labelKey: 'nav.kiosk',
      icon: <Tablet className="h-5 w-5" />,
      href: `/s/${storeSlug}/kiosk`,
      matchPattern: new RegExp(`^/s/${storeSlug}/kiosk(?!/display)`),
    },
    {
      id: 'board',
      labelKey: 'nav.board',
      icon: <Monitor className="h-5 w-5" />,
      href: `/s/${storeSlug}/board`,
      matchPattern: new RegExp(`^/s/${storeSlug}/board(?!/display)`),
    },
    {
      id: 'settings',
      labelKey: 'nav.settings',
      icon: <Settings className="h-5 w-5" />,
      href: '/admin/settings',
      matchPattern: /^\/admin\/settings/,
    },
  ];

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) {
        setIsCollapsed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isActive = (item: NavItem) => item.matchPattern.test(location);

  return (
    <>
      {/* PC Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen bg-card border-r border-border transition-all duration-300 ease-in-out fixed left-0 top-0 z-40',
          isCollapsed ? 'w-16' : 'w-56'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center h-14 border-b border-border px-3',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}>
          {!isCollapsed && (
            <span className="font-semibold text-sm truncate">
              {storeName || t('nav.storeTop')}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const content = (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  active && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                  isCollapsed && 'justify-center px-0'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                {!isCollapsed && (
                  <span className="text-sm font-medium truncate">
                    {t(item.labelKey)}
                  </span>
                )}
              </Link>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.id} delayDuration={0}>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {t(item.labelKey)}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return content;
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-pb">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors',
                  'hover:bg-accent/50',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                <span className="text-[10px] mt-0.5 font-medium truncate max-w-[60px]">
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default StoreNavigation;
