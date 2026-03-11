import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Dark Mode Implementation', () => {
  const clientDir = join(__dirname, '..', 'client', 'src');

  it('should have ThemeToggle component', () => {
    const path = join(clientDir, 'components', 'ThemeToggle.tsx');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('useTheme');
    expect(content).toContain('toggleTheme');
    expect(content).toContain('Sun');
    expect(content).toContain('Moon');
  });

  it('should have ThemeProvider set to switchable in App.tsx', () => {
    const path = join(clientDir, 'App.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('switchable');
    expect(content).toContain('ThemeProvider');
  });

  it('should have dark mode CSS variables defined in index.css', () => {
    const path = join(clientDir, 'index.css');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('.dark {');
    // Check dark mode has key variables
    expect(content).toContain('--background:');
    expect(content).toContain('--foreground:');
    expect(content).toContain('--card:');
    expect(content).toContain('--success:');
    expect(content).toContain('--warning:');
    expect(content).toContain('--info:');
  });

  it('should have ThemeToggle in Home.tsx', () => {
    const path = join(clientDir, 'pages', 'Home.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('ThemeToggle');
    expect(content).toContain('@/components/ThemeToggle');
  });

  it('should have ThemeToggle in StoreTop.tsx', () => {
    const path = join(clientDir, 'pages', 'store', 'StoreTop.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('ThemeToggle');
  });

  it('should have ThemeToggle in JoinQueue.tsx', () => {
    const path = join(clientDir, 'pages', 'store', 'JoinQueue.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('ThemeToggle');
  });

  it('should have ThemeToggle in Ticket.tsx', () => {
    const path = join(clientDir, 'pages', 'store', 'Ticket.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('ThemeToggle');
  });

  it('should have ThemeToggle in DashboardLayout.tsx', () => {
    const path = join(clientDir, 'components', 'DashboardLayout.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('ThemeToggle');
  });

  it('should not have hardcoded bg-white or text-black in NotFound.tsx', () => {
    const path = join(clientDir, 'pages', 'NotFound.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toContain('bg-white');
    expect(content).not.toContain('text-slate-');
    expect(content).not.toContain('bg-blue-600');
  });

  it('should use semantic colors in ReservationCheck.tsx', () => {
    const path = join(clientDir, 'pages', 'store', 'ReservationCheck.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toContain('text-gray-600');
    expect(content).not.toContain('bg-gray-100');
    expect(content).toContain('text-muted-foreground');
  });

  it('should use semantic colors in ReservationManagement.tsx', () => {
    const path = join(clientDir, 'pages', 'store', 'ReservationManagement.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toContain('bg-gray-100');
    expect(content).not.toContain('text-gray-800');
    expect(content).toContain('text-muted-foreground');
  });

  it('should use semantic colors in ManusDialog.tsx', () => {
    const path = join(clientDir, 'components', 'ManusDialog.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toContain('#f8f8f7');
    expect(content).not.toContain('#34322d');
    expect(content).not.toContain('#1a1a19');
    expect(content).toContain('bg-card');
    expect(content).toContain('text-foreground');
  });

  it('should use semantic colors in OfflineIndicator.tsx', () => {
    const path = join(clientDir, 'components', 'OfflineIndicator.tsx');
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toContain('bg-green-500');
    expect(content).not.toContain('bg-amber-500');
    expect(content).toContain('bg-success');
    expect(content).toContain('bg-warning');
  });

  it('should have dark skeleton shimmer in index.css', () => {
    const path = join(clientDir, 'index.css');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('.dark .skeleton-shimmer');
  });
});
