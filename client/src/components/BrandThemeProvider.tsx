import { useEffect, useMemo } from 'react';

interface BrandColors {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

interface BrandThemeProviderProps {
  branding?: BrandColors;
  children: React.ReactNode;
}

/**
 * HEX色をOKLCH形式に変換する
 * CSS変数はOKLCH形式で定義されているため、ブランドカラーも同形式に変換する
 */
function hexToOklch(hex: string): string {
  // HEXをRGBに変換
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB → linear RGB
  const linearR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const linearG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const linearB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  // linear RGB → XYZ (D65)
  const x = 0.4124564 * linearR + 0.3575761 * linearG + 0.1804375 * linearB;
  const y = 0.2126729 * linearR + 0.7151522 * linearG + 0.0721750 * linearB;
  const z = 0.0193339 * linearR + 0.1191920 * linearG + 0.9503041 * linearB;

  // XYZ → LMS
  const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z;

  // LMS → LMS (cube root)
  const l3 = Math.cbrt(l_);
  const m3 = Math.cbrt(m_);
  const s3 = Math.cbrt(s_);

  // LMS → OKLab
  const L = 0.2104542553 * l3 + 0.7936177850 * m3 - 0.0040720468 * s3;
  const a = 1.9779984951 * l3 - 2.4285922050 * m3 + 0.4505937099 * s3;
  const bVal = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.8086757660 * s3;

  // OKLab → OKLCH
  const C = Math.sqrt(a * a + bVal * bVal);
  let H = Math.atan2(bVal, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

/**
 * ブランドカラーから前景色（テキスト色）を自動生成する
 * 明度に基づいて白か暗色かを決定
 */
function getForegroundColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // 相対輝度計算
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'oklch(0.2 0.02 250)' : 'oklch(0.98 0 0)';
}

/**
 * ブランドカラーの明度を調整してミュート版を生成
 */
function getMutedVersion(hex: string, lightness: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // 簡易的にHSLに変換して明度を調整
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const s = max === 0 ? 0 : (max - min) / max;

  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // 彩度を下げて明度を調整
  const newS = s * 0.15;
  const newR = hslToRgbComponent(h, newS, lightness);
  const newG = hslToRgbComponent(h + 1/3, newS, lightness);
  const newB = hslToRgbComponent(h + 2/3, newS, lightness);

  const hexResult = `#${Math.round(newR * 255).toString(16).padStart(2, '0')}${Math.round(newG * 255).toString(16).padStart(2, '0')}${Math.round(newB * 255).toString(16).padStart(2, '0')}`;
  return hexToOklch(hexResult);
}

function hslToRgbComponent(p: number, s: number, l: number): number {
  let t = p % 1;
  if (t < 0) t += 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q;
  if (t < 1/6) return p2 + (q - p2) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p2 + (q - p2) * (2/3 - t) * 6;
  return p2;
}

/**
 * 有効なHEXカラーコードかチェック
 */
export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/**
 * BrandThemeProvider
 * 店舗のブランドカラーをCSS変数として動的に注入するコンポーネント
 * ブランドカラーが未設定の場合はデフォルトのテーマカラーが使用される
 */
export function BrandThemeProvider({ branding, children }: BrandThemeProviderProps) {
  const cssVars = useMemo(() => {
    if (!branding) return null;

    const vars: Record<string, string> = {};

    if (branding.primaryColor && isValidHex(branding.primaryColor)) {
      const oklch = hexToOklch(branding.primaryColor);
      const fg = getForegroundColor(branding.primaryColor);
      vars['--primary'] = oklch;
      vars['--primary-foreground'] = fg;
      vars['--ring'] = oklch;
      vars['--sidebar-primary'] = oklch;
      vars['--sidebar-primary-foreground'] = fg;
    }

    if (branding.secondaryColor && isValidHex(branding.secondaryColor)) {
      const oklch = hexToOklch(branding.secondaryColor);
      const fg = getForegroundColor(branding.secondaryColor);
      vars['--secondary'] = getMutedVersion(branding.secondaryColor, 0.95);
      vars['--secondary-foreground'] = getForegroundColor('#f0f0f0');
      // ダークモード用にsidebar-accentも設定
      vars['--sidebar-accent'] = getMutedVersion(branding.secondaryColor, 0.94);
      vars['--sidebar-accent-foreground'] = getForegroundColor('#f0f0f0');
      // chart色にも反映
      vars['--chart-1'] = oklch;
      vars['--chart-2'] = hexToOklch(branding.secondaryColor);
    }

    if (branding.accentColor && isValidHex(branding.accentColor)) {
      const oklch = hexToOklch(branding.accentColor);
      const fg = getForegroundColor(branding.accentColor);
      vars['--accent'] = getMutedVersion(branding.accentColor, 0.94);
      vars['--accent-foreground'] = getForegroundColor('#f0f0f0');
    }

    return Object.keys(vars).length > 0 ? vars : null;
  }, [branding]);

  useEffect(() => {
    if (!cssVars) return;

    const root = document.documentElement;
    const previousValues: Record<string, string> = {};

    // 現在の値を保存してから上書き
    for (const [key, value] of Object.entries(cssVars)) {
      previousValues[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, value);
    }

    // クリーンアップ: 元の値に戻す
    return () => {
      for (const [key] of Object.entries(cssVars)) {
        if (previousValues[key]) {
          root.style.setProperty(key, previousValues[key]);
        } else {
          root.style.removeProperty(key);
        }
      }
    };
  }, [cssVars]);

  return <>{children}</>;
}

/**
 * プリセットカラーパレット
 */
export const BRAND_PRESETS = {
  default: {
    primaryColor: '#3366cc',
    secondaryColor: '#6699cc',
    accentColor: '#ff6633',
  },
  warm: {
    primaryColor: '#d4532b',
    secondaryColor: '#e8a44a',
    accentColor: '#c2185b',
  },
  cool: {
    primaryColor: '#1976d2',
    secondaryColor: '#42a5f5',
    accentColor: '#00bcd4',
  },
  nature: {
    primaryColor: '#2e7d32',
    secondaryColor: '#66bb6a',
    accentColor: '#ff8f00',
  },
  elegant: {
    primaryColor: '#37474f',
    secondaryColor: '#78909c',
    accentColor: '#c6a052',
  },
  vivid: {
    primaryColor: '#7b1fa2',
    secondaryColor: '#e91e63',
    accentColor: '#ff5722',
  },
} as const;

export type BrandPresetKey = keyof typeof BRAND_PRESETS;
