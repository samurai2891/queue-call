/**
 * 営業時間判定ユーティリティ
 * サーバー・クライアント両方で使用可能
 */

export interface DaySchedule {
  isOpen: boolean;
  openTime: string;  // HH:mm
  closeTime: string; // HH:mm
}

export interface BusinessHoursConfig {
  enabled?: boolean;
  timezone?: string;
  override?: boolean;  // 営業時間外受付許可（スタッフが手動でON/OFF）
  schedule?: {
    [dayOfWeek: string]: DaySchedule;
  };
}

/** デフォルトのスケジュール（全日 09:00-21:00） */
export function getDefaultSchedule(): { [key: string]: DaySchedule } {
  const schedule: { [key: string]: DaySchedule } = {};
  for (let i = 0; i <= 6; i++) {
    schedule[String(i)] = {
      isOpen: true,
      openTime: "09:00",
      closeTime: "21:00",
    };
  }
  return schedule;
}

/**
 * 指定タイムゾーンでの現在時刻を取得
 */
function getNowInTimezone(timezone: string, now?: Date): { dayOfWeek: number; hours: number; minutes: number } {
  const date = now ?? new Date();
  // Intl.DateTimeFormatを使ってタイムゾーン変換
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayStr = parts.find(p => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);

  const dayMap: { [key: string]: number } = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    dayOfWeek: dayMap[weekdayStr] ?? 0,
    hours: hour === 24 ? 0 : hour, // 24:00 → 0:00
    minutes: minute,
  };
}

/**
 * HH:mm形式の時刻を分に変換
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 営業時間内かどうかを判定
 * @returns { isOpen: boolean, todaySchedule: DaySchedule | null, reason: string }
 */
export function checkBusinessHours(
  config: BusinessHoursConfig | undefined,
  now?: Date
): {
  isOpen: boolean;
  todaySchedule: DaySchedule | null;
  reason: "disabled" | "no_schedule" | "closed_day" | "before_open" | "after_close" | "open";
} {
  // 営業時間制御が無効の場合は常にオープン
  if (!config?.enabled) {
    return { isOpen: true, todaySchedule: null, reason: "disabled" };
  }

  const timezone = config.timezone || "Asia/Tokyo";
  const schedule = config.schedule;

  if (!schedule) {
    return { isOpen: true, todaySchedule: null, reason: "no_schedule" };
  }

  const { dayOfWeek, hours, minutes } = getNowInTimezone(timezone, now);
  const daySchedule = schedule[String(dayOfWeek)];

  if (!daySchedule) {
    return { isOpen: true, todaySchedule: null, reason: "no_schedule" };
  }

  if (!daySchedule.isOpen) {
    return { isOpen: false, todaySchedule: daySchedule, reason: "closed_day" };
  }

  const currentMinutes = hours * 60 + minutes;
  const openMinutes = timeToMinutes(daySchedule.openTime);
  const closeMinutes = timeToMinutes(daySchedule.closeTime);

  // 日跨ぎ対応（例: 22:00-02:00）
  if (closeMinutes <= openMinutes) {
    // 日跨ぎの場合: openTime以降 OR closeTime以前ならオープン
    if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) {
      return { isOpen: true, todaySchedule: daySchedule, reason: "open" };
    } else {
      return { isOpen: false, todaySchedule: daySchedule, reason: "before_open" };
    }
  }

  if (currentMinutes < openMinutes) {
    return { isOpen: false, todaySchedule: daySchedule, reason: "before_open" };
  }

  if (currentMinutes >= closeMinutes) {
    return { isOpen: false, todaySchedule: daySchedule, reason: "after_close" };
  }

  return { isOpen: true, todaySchedule: daySchedule, reason: "open" };
}

/**
 * 本日の営業時間を文字列で取得（例: "09:00 - 21:00"）
 */
export function getTodayBusinessHoursText(
  config: BusinessHoursConfig | undefined,
  now?: Date
): string | null {
  if (!config?.enabled || !config.schedule) return null;

  const timezone = config.timezone || "Asia/Tokyo";
  const { dayOfWeek } = getNowInTimezone(timezone, now);
  const daySchedule = config.schedule[String(dayOfWeek)];

  if (!daySchedule || !daySchedule.isOpen) return null;

  return `${daySchedule.openTime} - ${daySchedule.closeTime}`;
}

/**
 * 曜日名を取得（ロケール対応）
 */
export function getDayName(dayOfWeek: number, locale: string = "ja"): string {
  const dayNames: { [locale: string]: string[] } = {
    ja: ["日", "月", "火", "水", "木", "金", "土"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ko: ["일", "월", "화", "수", "목", "금", "토"],
    "zh-Hans": ["日", "一", "二", "三", "四", "五", "六"],
    "zh-Hant": ["日", "一", "二", "三", "四", "五", "六"],
  };
  const names = dayNames[locale] || dayNames["ja"];
  return names[dayOfWeek] ?? "";
}
