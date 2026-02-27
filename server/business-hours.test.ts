import { describe, it, expect } from 'vitest';
import { checkBusinessHours, getTodayBusinessHoursText, getDefaultSchedule, getDayName } from '../shared/businessHours';
import type { BusinessHoursConfig } from '../shared/businessHours';

describe('Business Hours', () => {
  describe('checkBusinessHours', () => {
    it('should return open when config is undefined', () => {
      const result = checkBusinessHours(undefined);
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe('disabled');
    });

    it('should return open when enabled is false', () => {
      const config: BusinessHoursConfig = { enabled: false };
      const result = checkBusinessHours(config);
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe('disabled');
    });

    it('should return open when no schedule is set', () => {
      const config: BusinessHoursConfig = { enabled: true, timezone: 'Asia/Tokyo' };
      const result = checkBusinessHours(config);
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe('no_schedule');
    });

    it('should return closed when today is a closed day', () => {
      // Create a date that falls on a known day
      const testDate = new Date('2026-02-28T10:00:00Z'); // Saturday in UTC
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'UTC',
        schedule: {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '6': { isOpen: false, openTime: '09:00', closeTime: '21:00' }, // Saturday closed
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe('closed_day');
    });

    it('should return open during business hours', () => {
      const testDate = new Date('2026-02-27T03:00:00Z'); // Friday 12:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '6': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe('open');
    });

    it('should return closed before opening time', () => {
      const testDate = new Date('2026-02-26T22:00:00Z'); // Friday 07:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '6': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe('before_open');
    });

    it('should return closed after closing time', () => {
      const testDate = new Date('2026-02-27T13:00:00Z'); // Friday 22:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '1': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '2': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '3': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '4': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
          '6': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe('after_close');
    });

    it('should handle overnight business hours (e.g., 22:00-02:00)', () => {
      // 23:00 JST should be open for 22:00-02:00
      const testDate = new Date('2026-02-27T14:00:00Z'); // Friday 23:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '5': { isOpen: true, openTime: '22:00', closeTime: '02:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe('open');
    });

    it('should include todaySchedule in result', () => {
      const testDate = new Date('2026-02-27T03:00:00Z'); // Friday 12:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '5': { isOpen: true, openTime: '10:00', closeTime: '20:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      expect(result.todaySchedule).toEqual({ isOpen: true, openTime: '10:00', closeTime: '20:00' });
    });
  });

  describe('getTodayBusinessHoursText', () => {
    it('should return null when config is undefined', () => {
      expect(getTodayBusinessHoursText(undefined)).toBeNull();
    });

    it('should return null when not enabled', () => {
      const config: BusinessHoursConfig = { enabled: false };
      expect(getTodayBusinessHoursText(config)).toBeNull();
    });

    it('should return null when today is closed', () => {
      const testDate = new Date('2026-02-28T10:00:00Z'); // Saturday UTC
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'UTC',
        schedule: {
          '6': { isOpen: false, openTime: '09:00', closeTime: '21:00' },
        },
      };
      expect(getTodayBusinessHoursText(config, testDate)).toBeNull();
    });

    it('should return formatted hours text', () => {
      const testDate = new Date('2026-02-27T03:00:00Z'); // Friday 12:00 JST
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        schedule: {
          '5': { isOpen: true, openTime: '10:00', closeTime: '22:00' },
        },
      };
      expect(getTodayBusinessHoursText(config, testDate)).toBe('10:00 - 22:00');
    });
  });

  describe('getDefaultSchedule', () => {
    it('should return schedule for all 7 days', () => {
      const schedule = getDefaultSchedule();
      expect(Object.keys(schedule)).toHaveLength(7);
      for (let i = 0; i <= 6; i++) {
        expect(schedule[String(i)]).toEqual({
          isOpen: true,
          openTime: '09:00',
          closeTime: '21:00',
        });
      }
    });
  });

  describe('getDayName', () => {
    it('should return Japanese day names', () => {
      expect(getDayName(0, 'ja')).toBe('日');
      expect(getDayName(1, 'ja')).toBe('月');
      expect(getDayName(6, 'ja')).toBe('土');
    });

    it('should return English day names', () => {
      expect(getDayName(0, 'en')).toBe('Sun');
      expect(getDayName(1, 'en')).toBe('Mon');
      expect(getDayName(6, 'en')).toBe('Sat');
    });

    it('should return Korean day names', () => {
      expect(getDayName(0, 'ko')).toBe('일');
      expect(getDayName(1, 'ko')).toBe('월');
    });

    it('should return Chinese day names', () => {
      expect(getDayName(0, 'zh-Hans')).toBe('日');
      expect(getDayName(1, 'zh-Hans')).toBe('一');
    });

    it('should fallback to Japanese for unknown locale', () => {
      expect(getDayName(0, 'fr')).toBe('日');
    });
  });

  describe('Business Hours Override', () => {
    it('override flag should not affect checkBusinessHours (it is checked at API level)', () => {
      // checkBusinessHours does not check override; it only checks time-based rules
      // The override is handled at the API layer in routers.ts
      const testDate = new Date('2026-02-27T13:00:00Z'); // Friday 22:00 JST (after close)
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        override: true, // override is set but checkBusinessHours ignores it
        schedule: {
          '5': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      };
      const result = checkBusinessHours(config, testDate);
      // checkBusinessHours still returns closed because it only checks time
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe('after_close');
    });

    it('override flag should be part of BusinessHoursConfig type', () => {
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
        override: false,
        schedule: {
          '0': { isOpen: true, openTime: '09:00', closeTime: '21:00' },
        },
      };
      expect(config.override).toBe(false);
    });

    it('override defaults to undefined when not set', () => {
      const config: BusinessHoursConfig = {
        enabled: true,
        timezone: 'Asia/Tokyo',
      };
      expect(config.override).toBeUndefined();
    });
  });
});
