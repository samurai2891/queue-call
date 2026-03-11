/**
 * CSV Export Utility Functions
 * Provides functionality to export data to CSV format for Excel analysis
 */

/**
 * Convert array of objects to CSV string
 * @param data Array of objects to convert
 * @param headers Optional custom headers mapping { dataKey: displayName }
 * @returns CSV formatted string
 */
export function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers?: Record<string, string>
): string {
  if (data.length === 0) return '';

  // Get all keys from the first object
  const keys = Object.keys(data[0]);
  
  // Create header row
  const headerRow = keys.map(key => {
    const header = headers?.[key] || key;
    // Escape quotes and wrap in quotes if contains comma or quote
    return escapeCSVValue(header);
  }).join(',');

  // Create data rows
  const dataRows = data.map(row => {
    return keys.map(key => {
      const value = row[key];
      return escapeCSVValue(formatValue(value));
    }).join(',');
  }).join('\n');

  return `${headerRow}\n${dataRows}`;
}

/**
 * Escape CSV value (handle quotes and commas)
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format value for CSV output
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // Round to 2 decimal places for floats
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

/**
 * Download CSV file
 * @param csvContent CSV string content
 * @param filename Filename without extension
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export data to CSV and trigger download
 * @param data Array of objects to export
 * @param filename Filename without extension
 * @param headers Optional custom headers mapping
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  headers?: Record<string, string>
): void {
  const csvContent = arrayToCSV(data, headers);
  downloadCSV(csvContent, filename);
}

/**
 * Generate filename with date
 * @param prefix Filename prefix
 * @param storeName Store name to include
 * @returns Formatted filename
 */
export function generateFilename(prefix: string, storeName?: string): string {
  const date = new Date().toISOString().split('T')[0];
  const sanitizedStoreName = storeName?.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_') || '';
  return sanitizedStoreName 
    ? `${prefix}_${sanitizedStoreName}_${date}`
    : `${prefix}_${date}`;
}
