import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 数値のカウントアップ/ダウンアニメーションを提供するカスタムフック
 * 
 * @param targetValue - アニメーションの目標値
 * @param options - アニメーション設定
 * @returns { displayValue, isAnimating, triggerAnimation }
 */
export function useAnimatedCounter(
  targetValue: number,
  options: {
    /** アニメーション時間（ms）。デフォルト: 1200 */
    duration?: number;
    /** アニメーションを自動で開始するかどうか。デフォルト: false */
    autoAnimate?: boolean;
    /** イージング関数。デフォルト: easeOutCubic */
    easing?: (t: number) => number;
  } = {}
) {
  const {
    duration = 1200,
    autoAnimate = false,
    easing = easeOutCubic,
  } = options;

  const [displayValue, setDisplayValue] = useState(targetValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const previousValueRef = useRef(targetValue);
  const hasInitializedRef = useRef(false);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const animate = useCallback((from: number, to: number) => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    if (from === to) {
      setDisplayValue(to);
      return;
    }

    setIsAnimating(true);
    const startTime = performance.now();

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);

      const currentValue = Math.round(from + (to - from) * easedProgress);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(to);
        setIsAnimating(false);
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  }, [duration, easing]);

  // autoAnimateモード: targetValueが変わったらアニメーション
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      previousValueRef.current = targetValue;
      setDisplayValue(targetValue);
      return;
    }

    if (autoAnimate && targetValue !== previousValueRef.current) {
      animate(previousValueRef.current, targetValue);
      previousValueRef.current = targetValue;
    } else if (!autoAnimate) {
      // autoAnimateがfalseの場合、前の値を追跡するだけ
      previousValueRef.current = targetValue;
    }
  }, [targetValue, autoAnimate, animate]);

  // 手動トリガー: 指定した開始値からtargetValueまでアニメーション
  const triggerAnimation = useCallback((fromValue?: number) => {
    const from = fromValue ?? previousValueRef.current;
    animate(from, targetValue);
    previousValueRef.current = targetValue;
  }, [targetValue, animate]);

  return { displayValue, isAnimating, triggerAnimation };
}

/** easeOutCubic: 最初は速く、最後はゆっくり */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
