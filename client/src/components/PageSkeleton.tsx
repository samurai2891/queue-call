import { Skeleton } from '@/components/ui/skeleton';

/**
 * L-008: スケルトンローディングの一貫性
 * 各ページで統一されたローディング表示を提供するコンポーネント
 */

interface PageSkeletonProps {
  variant?: 'default' | 'card' | 'list' | 'form';
}

/**
 * ページ全体のスケルトンローディング
 * ヘッダー + メインコンテンツの標準レイアウト
 */
export function PageSkeleton({ variant = 'default' }: PageSkeletonProps) {
  return (
    <div className="min-h-screen flex flex-col" role="status" aria-label="Loading...">
      {/* ヘッダー */}
      <header className="p-4 flex justify-between items-center">
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </header>
      
      {/* メインコンテンツ */}
      <main className="flex-1 container flex flex-col items-center justify-center gap-8 py-8">
        {variant === 'default' && <DefaultSkeleton />}
        {variant === 'card' && <CardSkeleton />}
        {variant === 'list' && <ListSkeleton />}
        {variant === 'form' && <FormSkeleton />}
      </main>
      
      {/* スクリーンリーダー用の非表示テキスト */}
      <span className="sr-only">Loading content, please wait...</span>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="w-full max-w-md space-y-4">
      <Skeleton className="h-12 w-3/4 mx-auto" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="flex gap-4">
        <Skeleton className="h-14 flex-1 rounded-md" />
        <Skeleton className="h-14 flex-1 rounded-md" />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="w-full max-w-md">
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="w-full max-w-md space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="w-full max-w-md space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  );
}

/**
 * インラインのスケルトンローディング
 * カード内やセクション内で使用
 */
export function InlineSkeleton({ 
  lines = 3,
  className = ''
}: { 
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading...">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className="h-4 w-full" 
          style={{ width: `${100 - (i * 15)}%` }}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * テーブル行のスケルトンローディング
 */
export function TableRowSkeleton({ 
  columns = 4,
  rows = 5 
}: { 
  columns?: number;
  rows?: number;
}) {
  return (
    <div role="status" aria-label="Loading table data...">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-3 border-b">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className="h-6 flex-1 rounded" 
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table data...</span>
    </div>
  );
}
