import { useEffect, useState, type ReactNode } from 'react';

/**
 * P2-11: ページ遷移アニメーション用ラッパー
 * フェードイン + スライドアップのアニメーションを提供
 */

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
  /** アニメーションの種類 */
  variant?: 'fade-up' | 'fade' | 'slide-up' | 'zoom-fade';
  /** アニメーション遅延 (ms) */
  delay?: number;
}

export function AnimatedPage({ 
  children, 
  className = '', 
  variant = 'fade-up',
  delay = 0 
}: AnimatedPageProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const baseClasses = 'transition-all ease-out';
  
  const variantClasses: Record<string, { hidden: string; visible: string; duration: string }> = {
    'fade-up': {
      hidden: 'opacity-0 translate-y-4',
      visible: 'opacity-100 translate-y-0',
      duration: 'duration-500',
    },
    'fade': {
      hidden: 'opacity-0',
      visible: 'opacity-100',
      duration: 'duration-400',
    },
    'slide-up': {
      hidden: 'opacity-0 translate-y-8',
      visible: 'opacity-100 translate-y-0',
      duration: 'duration-600',
    },
    'zoom-fade': {
      hidden: 'opacity-0 scale-95',
      visible: 'opacity-100 scale-100',
      duration: 'duration-400',
    },
  };

  const v = variantClasses[variant] || variantClasses['fade-up'];

  return (
    <div className={`${baseClasses} ${v.duration} ${isVisible ? v.visible : v.hidden} ${className}`}>
      {children}
    </div>
  );
}

/**
 * リスト内の各アイテムにスタガードアニメーションを適用
 */
interface StaggeredListProps {
  children: ReactNode[];
  className?: string;
  /** 各アイテム間の遅延 (ms) */
  staggerDelay?: number;
  /** 初期遅延 (ms) */
  initialDelay?: number;
}

export function StaggeredList({ 
  children, 
  className = '',
  staggerDelay = 50,
  initialDelay = 100 
}: StaggeredListProps) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <AnimatedPage 
          key={index} 
          variant="fade-up" 
          delay={initialDelay + index * staggerDelay}
        >
          {child}
        </AnimatedPage>
      ))}
    </div>
  );
}

/**
 * カード表示用のアニメーション
 * ホバー時のスケールアップとシャドウ変化を含む
 */
interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** ホバーエフェクトを有効にするか */
  hoverEffect?: boolean;
}

export function AnimatedCard({ 
  children, 
  className = '', 
  delay = 0,
  hoverEffect = true 
}: AnimatedCardProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const hoverClasses = hoverEffect 
    ? 'hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md' 
    : '';

  return (
    <div 
      className={`
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'}
        ${hoverClasses}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
