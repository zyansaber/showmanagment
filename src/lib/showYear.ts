export type ShowYear = 2026 | 2027;
const STORAGE_KEY = 'show-manager-year';

export function resolveShowYear(search: string, pathname: string, saved: string | null): ShowYear {
  const explicit = new URLSearchParams(search).get('year');
  if (explicit === '2026' || explicit === '2027') return Number(explicit) as ShowYear;
  // Old emailed links always refer to the original dataset.
  if (/^\/(team\/|ticket-confirm\/|ticket-approval\/|show-application-confirm\/|show-application-finance\/)/.test(pathname)) return 2026;
  return saved === '2027' ? 2027 : 2026;
}

function initialYear(): ShowYear {
  if (typeof window === 'undefined') return 2026;
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* URL still works. */ }
  return resolveShowYear(window.location.search, window.location.pathname, saved);
}

// Fixed for this document's lifetime: in-flight saves cannot change year mid-request.
// A full navigation on switching also clears every page's state and query cache.
export const activeYear = initialYear();
export const targetField = `target${activeYear}` as 'target2026' | 'target2027';
export const salesField = `sales${activeYear}` as 'sales2026' | 'sales2027';

export function withShowYear(url: string, year: ShowYear = activeYear): string {
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set('year', String(year));
  return parsed.href;
}

export function switchShowYear(year: ShowYear) {
  if (year === activeYear) return;
  try { window.localStorage.setItem(STORAGE_KEY, String(year)); } catch { /* URL still works. */ }
  const url = new URL(window.location.href);
  // Detail IDs belong to their original year; switch to the list instead.
  if (url.pathname.startsWith('/show/')) url.pathname = '/shows';
  window.location.assign(withShowYear(url.href, year));
}

// Accounts, reference lists and configuration remain shared. Operational records
// live in a separate tree in 2027; every legacy 2026 path stays exactly as it was.
const sharedRoots = new Set([
  'authAccounts', 'userAccounts', 'settings',
]);

export function yearPath(path: string, year: ShowYear = activeYear): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..') || clean.startsWith('years/')) {
    throw new Error('Use a relative business data path.');
  }
  const [root] = clean.split('/');
  if (year === 2026 || sharedRoots.has(root)) return clean;
  return `years/2027/${clean}`;
}
