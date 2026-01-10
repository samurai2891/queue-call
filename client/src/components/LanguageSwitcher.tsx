import { useLocale, LOCALE_NAMES, Locale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'buttons' | 'grid';
  showLabel?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

export function LanguageSwitcher({ 
  variant = 'dropdown', 
  showLabel = false,
  size = 'default' 
}: LanguageSwitcherProps) {
  const { locale, setLocale, supportedLocales } = useLocale();

  if (variant === 'buttons') {
    return (
      <div className="flex gap-2 flex-wrap">
        {supportedLocales.map((loc) => (
          <Button
            key={loc}
            variant={locale === loc ? 'default' : 'outline'}
            size={size}
            onClick={() => setLocale(loc)}
          >
            {LOCALE_NAMES[loc]}
          </Button>
        ))}
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {supportedLocales.map((loc) => (
          <Button
            key={loc}
            variant={locale === loc ? 'default' : 'outline'}
            size="lg"
            className="h-16 text-lg"
            onClick={() => setLocale(loc)}
          >
            {LOCALE_NAMES[loc]}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size}>
          <Globe className="h-4 w-4" />
          {showLabel && <span className="ml-2">{LOCALE_NAMES[locale]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLocales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => setLocale(loc)}
            className={locale === loc ? 'bg-accent' : ''}
          >
            {LOCALE_NAMES[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
