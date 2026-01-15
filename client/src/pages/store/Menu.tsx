import { useParams, useLocation } from 'wouter';
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale, LocaleProvider, SUPPORTED_LOCALES } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ArrowLeft, LayoutGrid, List, ImageIcon, Maximize2, Minimize2 } from 'lucide-react';
import type { Locale } from '@/contexts/LocaleContext';

type ViewMode = 'feed' | 'list';
type PhotoSize = 'large' | 'small';

function MenuContent() {
  const params = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();
  const { t, getField } = useLocale();
  
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const menuSettings = store?.settings?.menu;
  const defaultView = (menuSettings?.defaultView || 'feed') as ViewMode;
  const defaultPhotoSize = (menuSettings?.photoDefaultSize || 'large') as PhotoSize;
  const allowPhotoSizeToggle = menuSettings?.allowCustomerPhotoSizeToggle !== false;

  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [photoSize, setPhotoSize] = useState<PhotoSize>(defaultPhotoSize);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const { data: categories, isLoading: categoriesLoading } = trpc.menu.getCategories.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id }
  );

  const { data: items, isLoading: itemsLoading } = trpc.menu.getItems.useQuery(
    { storeId: store?.id || 0, categoryId: selectedCategory || undefined },
    { enabled: !!store?.id }
  );

  const { data: feedPosts, isLoading: feedLoading } = trpc.menu.getFeed.useQuery(
    { storeId: store?.id || 0 },
    { enabled: !!store?.id && viewMode === 'feed' }
  );

  const isLoading = categoriesLoading || itemsLoading || (viewMode === 'feed' && feedLoading);

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return '';
    return `¥${price.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 flex justify-between items-center">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-24" />
        </header>
        <main className="flex-1 container py-4">
          <Skeleton className="h-10 w-full mb-4" />
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="p-4 flex justify-between items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/s/${params.storeSlug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{t('menu.title')}</h1>
          <LanguageSwitcher />
        </div>

        {/* View Controls */}
        <div className="px-4 pb-3 flex items-center justify-between gap-2">
          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="feed">
                <LayoutGrid className="h-4 w-4 mr-1" />
                {t('menu.feed')}
              </TabsTrigger>
              <TabsTrigger value="list">
                <List className="h-4 w-4 mr-1" />
                {t('menu.list')}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Photo Size Toggle */}
          {allowPhotoSizeToggle && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPhotoSize(photoSize === 'large' ? 'small' : 'large')}
            >
              {photoSize === 'large' ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Category Tabs (for list view) */}
        {viewMode === 'list' && categories && categories.length > 0 && (
          <ScrollArea className="w-full">
            <div className="px-4 pb-3 flex gap-2">
              <Button
                variant={selectedCategory === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                {t('menu.category.all')}
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {getField(category, 'name')}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 container py-4">
        <p className="text-xs text-muted-foreground mb-4">{t('menu.translationNotice')}</p>
        {viewMode === 'feed' ? (

          // Feed View
          <div className="space-y-4">
            {feedPosts && feedPosts.length > 0 ? (
              feedPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden">
                  {/* Photo */}
                  {(photoSize === 'large' ? post.photoLargeUrl : post.photoSmallUrl || post.photoLargeUrl) && (
                    <div className={`relative ${photoSize === 'large' ? 'aspect-square' : 'aspect-video'}`}>
                      <img
                        src={photoSize === 'large' ? post.photoLargeUrl : (post.photoSmallUrl || post.photoLargeUrl)}
                        alt={getField(post, 'title') || ''}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-4">
                    {getField(post, 'title') && (
                      <h3 className="font-semibold text-lg">{getField(post, 'title')}</h3>
                    )}
                    {getField(post, 'caption') && (
                      <p className="text-muted-foreground mt-1">{getField(post, 'caption')}</p>
                    )}
                    {post.price && (
                      <p className="font-bold text-primary mt-2">{formatPrice(post.price)}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('menu.noItems')}</p>
              </div>
            )}
          </div>
        ) : (
          // List View
          <div className={`grid gap-4 ${photoSize === 'large' ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {items && items.length > 0 ? (
              items.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  {/* Photo */}
                  {(photoSize === 'large' ? item.photoLargeUrl : item.photoSmallUrl || item.photoLargeUrl) && (
                    <div className={`relative ${photoSize === 'large' ? 'aspect-video' : 'aspect-square'}`}>
                      <img
                        src={(photoSize === 'large' ? item.photoLargeUrl : (item.photoSmallUrl || item.photoLargeUrl)) || ''}
                        alt={getField(item, 'name')}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className={`${photoSize === 'large' ? 'p-4' : 'p-3'}`}>
                    <h3 className={`font-semibold ${photoSize === 'large' ? 'text-lg' : 'text-sm'}`}>
                      {getField(item, 'name')}
                    </h3>
                    {photoSize === 'large' && getField(item, 'desc') && (
                      <p className="text-muted-foreground text-sm mt-1 line-clamp-2">
                        {getField(item, 'desc')}
                      </p>
                    )}
                    <p className={`font-bold text-primary ${photoSize === 'large' ? 'mt-2' : 'mt-1 text-sm'}`}>
                      {formatPrice(item.price)}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('menu.noItems')}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Menu() {
  const params = useParams<{ storeSlug: string }>();
  const { data: store } = trpc.store.getBySlug.useQuery(
    { slug: params.storeSlug || '' },
    { enabled: !!params.storeSlug }
  );

  const supportedLocales = (store?.supportedLocales || SUPPORTED_LOCALES) as Locale[];
  const defaultLocale = (store?.defaultLocale || 'ja') as Locale;

  return (
    <LocaleProvider defaultLocale={defaultLocale} supportedLocales={supportedLocales}>
      <MenuContent />
    </LocaleProvider>
  );
}
