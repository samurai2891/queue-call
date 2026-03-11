import { ReactNode } from 'react';
import { StoreNavigation } from './StoreNavigation';
import { cn } from '@/lib/utils';

interface StoreLayoutProps {
  storeSlug: string;
  storeName?: string;
  children: ReactNode;
  className?: string;
}

export function StoreLayout({ storeSlug, storeName, children, className }: StoreLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <StoreNavigation storeSlug={storeSlug} storeName={storeName} />
      
      {/* Main content area */}
      <main
        className={cn(
          // PC: offset for sidebar (collapsed: 64px, expanded: 224px)
          'md:ml-16 lg:ml-56',
          // Mobile: offset for bottom nav
          'pb-16 md:pb-0',
          // Transition for smooth sidebar toggle
          'transition-all duration-300',
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}

export default StoreLayout;
