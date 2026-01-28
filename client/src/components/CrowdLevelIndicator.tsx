import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

type CrowdLevel = 'empty' | 'low' | 'moderate' | 'busy' | 'crowded';

interface CrowdLevelIndicatorProps {
  level: CrowdLevel;
  className?: string;
  showLabel?: boolean;
}

const crowdLevelConfig: Record<CrowdLevel, { color: string; bgColor: string; icon: string }> = {
  empty: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: '○',
  },
  low: {
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    icon: '◎',
  },
  moderate: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: '△',
  },
  busy: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: '▲',
  },
  crowded: {
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: '×',
  },
};

export function CrowdLevelIndicator({ level, className, showLabel = true }: CrowdLevelIndicatorProps) {
  const { t } = useLocale();
  const config = crowdLevelConfig[level];
  
  const labelKey = `store.crowdLevel.${level}` as const;
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('text-2xl', config.color)}>
        {config.icon}
      </span>
      {showLabel && (
        <span className={cn('font-semibold text-lg', config.color)}>
          {t(labelKey)}
        </span>
      )}
    </div>
  );
}

export function CrowdLevelBadge({ level, className }: { level: CrowdLevel; className?: string }) {
  const { t } = useLocale();
  const config = crowdLevelConfig[level];
  
  const labelKey = `store.crowdLevel.${level}` as const;
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
      config.bgColor,
      className
    )}>
      <span className={cn('text-sm', config.color)}>
        {config.icon}
      </span>
      <span className={cn('font-medium text-sm', config.color)}>
        {t(labelKey)}
      </span>
    </div>
  );
}
