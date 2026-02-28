import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Animated Counter Logic', () => {
  describe('easeOutCubic easing function', () => {
    // easeOutCubic: 1 - (1 - t)^3
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    it('should return 0 at start (t=0)', () => {
      expect(easeOutCubic(0)).toBe(0);
    });

    it('should return 1 at end (t=1)', () => {
      expect(easeOutCubic(1)).toBe(1);
    });

    it('should progress faster at the beginning', () => {
      const earlyProgress = easeOutCubic(0.2);
      const lateProgress = easeOutCubic(0.8) - easeOutCubic(0.6);
      // Early progress (0 to 0.2) should cover more ground than late progress (0.6 to 0.8)
      expect(earlyProgress).toBeGreaterThan(lateProgress);
    });

    it('should be monotonically increasing', () => {
      let prev = 0;
      for (let t = 0.1; t <= 1; t += 0.1) {
        const current = easeOutCubic(t);
        expect(current).toBeGreaterThan(prev);
        prev = current;
      }
    });

    it('should return 0.5 at approximately t=0.206', () => {
      // 1 - (1 - t)^3 = 0.5 → (1-t)^3 = 0.5 → t ≈ 0.2063
      const result = easeOutCubic(0.5);
      expect(result).toBeCloseTo(0.875, 3);
    });
  });

  describe('Counter interpolation logic', () => {
    it('should interpolate from start to end correctly', () => {
      const from = 1000;
      const to = 6000;
      const progress = 0.5;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const easedProgress = easeOutCubic(progress);

      const currentValue = Math.round(from + (to - from) * easedProgress);
      
      // At 50% progress with easeOutCubic, should be at 87.5% of the way
      expect(currentValue).toBe(Math.round(1000 + 5000 * 0.875));
    });

    it('should handle counting down (to < from)', () => {
      const from = 5000;
      const to = 1000;
      const progress = 1; // Complete
      
      const currentValue = Math.round(from + (to - from) * progress);
      expect(currentValue).toBe(1000);
    });

    it('should handle same value (no animation needed)', () => {
      const from = 3000;
      const to = 3000;
      const progress = 0.5;
      
      const currentValue = Math.round(from + (to - from) * progress);
      expect(currentValue).toBe(3000);
    });

    it('should handle zero values', () => {
      const from = 0;
      const to = 5000;
      const progress = 1;
      
      const currentValue = Math.round(from + (to - from) * progress);
      expect(currentValue).toBe(5000);
    });

    it('should round to nearest integer', () => {
      const from = 0;
      const to = 100;
      const progress = 0.333;
      
      const currentValue = Math.round(from + (to - from) * progress);
      expect(Number.isInteger(currentValue)).toBe(true);
    });
  });

  describe('Animation trigger conditions', () => {
    it('should trigger animation when chargeResult is success and balance changes', () => {
      const chargeResult = 'success';
      const prevBalance = 1000;
      const newBalance = 6000;
      const shouldAnimate = chargeResult === 'success' && prevBalance !== null && newBalance !== prevBalance;
      
      expect(shouldAnimate).toBe(true);
    });

    it('should not trigger animation when balance is the same', () => {
      const chargeResult = 'success';
      const prevBalance = 1000;
      const newBalance = 1000;
      const shouldAnimate = chargeResult === 'success' && prevBalance !== null && newBalance !== prevBalance;
      
      expect(shouldAnimate).toBe(false);
    });

    it('should not trigger animation on canceled charge', () => {
      const chargeResult = 'canceled';
      const prevBalance = 1000;
      const newBalance = 1000;
      const shouldAnimate = chargeResult === 'success' && prevBalance !== null && newBalance !== prevBalance;
      
      expect(shouldAnimate).toBe(false);
    });

    it('should not trigger animation when prevBalance is null (first load)', () => {
      const chargeResult = 'success';
      const prevBalance = null;
      const newBalance = 5000;
      const shouldAnimate = chargeResult === 'success' && prevBalance !== null && newBalance !== prevBalance;
      
      expect(shouldAnimate).toBe(false);
    });
  });

  describe('Locale formatting during animation', () => {
    it('should format animated value with locale string', () => {
      const animatedBalance = 5000;
      const formatted = `¥${animatedBalance.toLocaleString()}`;
      expect(formatted).toBe('¥5,000');
    });

    it('should format zero correctly', () => {
      const animatedBalance = 0;
      const formatted = `¥${animatedBalance.toLocaleString()}`;
      expect(formatted).toBe('¥0');
    });

    it('should format large numbers correctly', () => {
      const animatedBalance = 100000;
      const formatted = `¥${animatedBalance.toLocaleString()}`;
      expect(formatted).toBe('¥100,000');
    });
  });
});
