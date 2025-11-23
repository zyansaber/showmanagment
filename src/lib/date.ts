import { format, isValid, parse, parseISO } from 'date-fns';

const SUPPORTED_FORMATS = ['dd/MM/yyyy', 'd/M/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'd-M-yyyy'];

export const parseDateString = (value?: string | null): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalised = trimmed.toLowerCase();
  if (normalised === 'n/a' || normalised === 'na') return null;

  for (const formatString of SUPPORTED_FORMATS) {
    const parsed = parse(trimmed, formatString, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const isoParsed = parseISO(trimmed);
  if (isValid(isoParsed)) return isoParsed;

  const nativeParsed = new Date(trimmed);
  return isValid(nativeParsed) ? nativeParsed : null;
};

export const formatDisplayDate = (
  value?: string | Date | null,
  pattern = 'dd/MM/yyyy',
  fallback = 'N/A'
): string => {
  const parsed = typeof value === 'string' ? parseDateString(value) : value instanceof Date ? value : null;
  if (!parsed || !isValid(parsed)) return fallback;
  return format(parsed, pattern);
};

export const formatInputDate = (value?: string | null): string => {
  const parsed = parseDateString(value);
  return parsed && isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : '';
};

export const getDateTimestamp = (value?: string | null): number => {
  const parsed = parseDateString(value);
  return parsed && isValid(parsed) ? parsed.getTime() : Number.NaN;
};
