import { activeYear, switchShowYear } from '@/lib/showYear';

export default function ShowYearSwitch() {
  return (
    <div className="ml-3 flex shrink-0 items-center gap-2">
      <span className="hidden text-xs font-medium text-slate-500 sm:inline">Show year</span>
      <div role="group" aria-label="Show year" className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
        {([2026, 2027] as const).map((year) => (
          <button key={year} type="button" aria-pressed={activeYear === year}
            onClick={() => switchShowYear(year)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${activeYear === year ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
            {year}
          </button>
        ))}
      </div>
    </div>
  );
}
