import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dbGet } from '@/lib/firebase';
import type { Show } from '@/types';

interface ShowSummary {
  id: string;
  name: string;
  location?: string;
  status?: Show['status'];
}

interface AssistantAction {
  id: string;
  title: string;
  description: string;
  requiresShow?: boolean;
  cta: string;
  getPath: (show?: ShowSummary) => string | null;
}

const assistantActions: AssistantAction[] = [
  {
    id: 'edit-show',
    title: 'Update show information',
    description: 'Change timing, site details, or status for a specific show.',
    requiresShow: true,
    cta: 'Open show workspace',
    getPath: (show) => (show ? `/show/${show.id}` : null),
  },
  {
    id: 'add-order',
    title: 'Add show orders',
    description: 'Capture new retail or transfer orders tied to a show.',
    requiresShow: true,
    cta: 'Jump to orders & sales',
    getPath: (show) => (show ? `/orders?showId=${encodeURIComponent(show.id)}` : null),
  },
  {
    id: 'process-templates',
    title: 'Modify process templates',
    description: 'Adjust tasks, stages, or responsibilities for future events.',
    cta: 'Edit process templates',
    getPath: () => '/process-templates',
  },
  {
    id: 'reports',
    title: 'Generate performance report',
    description: 'Build executive-ready summaries with KPIs and insights.',
    requiresShow: true,
    cta: 'Create report',
    getPath: (show) => (show ? `/show-report?showId=${encodeURIComponent(show.id)}` : null),
  },
  {
    id: 'powerbi',
    title: 'Open BI dashboards',
    description: 'Review live metrics, targets, and dealer performance.',
    cta: 'Launch BI reports',
    getPath: () => '/powerbi',
  },
  {
    id: 'calendar',
    title: 'Plan timeline & logistics',
    description: 'Navigate directly to the calendar to control milestones.',
    cta: 'View calendar',
    getPath: () => '/calendar',
  },
];

const formatLocation = (show: Show): string | undefined => {
  const city = show?.siteLocation?.suburb;
  const state = show?.siteLocation?.state;
  if (!city && !state) return undefined;
  return [city, state].filter(Boolean).join(', ');
};

const normaliseShows = (rawData: unknown): ShowSummary[] => {
  if (!rawData || typeof rawData !== 'object') return [];
  return Object.values(rawData as Record<string, Show>)
    .map((show) => ({
      id: show?.id || '',
      name: show?.name?.trim?.() || 'Unnamed show',
      location: formatLocation(show),
      status: show?.status,
    }))
    .filter((show) => Boolean(show.id && show.name))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const useShowDirectory = () => {
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadShows = async () => {
      try {
        setLoading(true);
        const data = await dbGet('shows');
        if (!mounted) return;
        setShows(normaliseShows(data));
      } catch (error) {
        console.error('Failed to load shows for assistant', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadShows();

    return () => {
      mounted = false;
    };
  }, []);

  return { shows, loading };
};

export function AIHelpAssistant() {
  const navigate = useNavigate();
  const { shows, loading } = useShowDirectory();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShow, setSelectedShow] = useState<ShowSummary | null>(null);

  const selectedAction = assistantActions.find((action) => action.id === selectedActionId);

  const filteredShows = useMemo(() => {
    if (!searchTerm.trim()) return shows.slice(0, 6);
    const query = searchTerm.toLowerCase();
    return shows
      .map((show) => {
        const nameScore = show.name.toLowerCase().includes(query) ? 1 : 0;
        const locationScore = show.location?.toLowerCase().includes(query) ? 0.5 : 0;
        return { show, score: nameScore + locationScore };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.show.name.localeCompare(b.show.name))
      .map((entry) => entry.show)
      .slice(0, 6);
  }, [searchTerm, shows]);

  const handleNavigate = (show?: ShowSummary) => {
    if (!selectedAction) return;
    const path = selectedAction.getPath(show);
    if (!path) return;
    navigate(path);
    setIsPanelOpen(false);
    setSelectedActionId(null);
    setSelectedShow(null);
    setSearchTerm('');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {isPanelOpen && (
        <div className="w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">ShowGuide AI</p>
              <p className="text-base font-semibold">How can I help?</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => setIsPanelOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-4 px-4 py-4 text-sm text-slate-600">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Smart actions
            </p>
            <div className="grid gap-3">
              {assistantActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setSelectedActionId(action.id);
                    if (!action.requiresShow) {
                      setSelectedShow(null);
                    }
                  }}
                  className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 ${
                    selectedActionId === action.id
                      ? 'border-slate-900 bg-slate-900/5'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{action.description}</p>
                </button>
              ))}
            </div>

            {selectedAction && selectedAction.requiresShow && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Choose show
                </p>
                <p className="text-sm text-slate-600">
                  Search by show name or location to continue.
                </p>
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Start typing…"
                      className="pl-9"
                    />
                  </div>
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                    {loading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading shows…
                      </div>
                    ) : filteredShows.length ? (
                      filteredShows.map((show) => (
                        <button
                          key={show.id}
                          type="button"
                          onClick={() => setSelectedShow(show)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                            selectedShow?.id === show.id
                              ? 'border-blue-500 bg-white text-blue-700 shadow'
                              : 'border-transparent bg-white/70 hover:border-blue-200'
                          }`}
                        >
                          <p className="font-medium text-slate-900">{show.name}</p>
                          <p className="text-xs text-slate-500">
                            {show.location || 'Location TBD'}
                            {show.status ? ` • ${show.status}` : ''}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No shows match that search.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedAction && (!selectedAction.requiresShow || selectedShow) && (
              <Button
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => handleNavigate(selectedShow ?? undefined)}
              >
                {selectedAction.cta}
              </Button>
            )}
          </div>
        </div>
      )}

      <Button
        className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-white shadow-xl"
        onClick={() => setIsPanelOpen((prev) => !prev)}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          {isPanelOpen ? <X className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className="flex flex-col items-start text-left">
          <span className="text-xs uppercase tracking-wide text-white/80">Assistant</span>
          <span className="text-sm font-semibold">Need help?</span>
        </div>
        {!isPanelOpen && <Sparkles className="h-4 w-4 text-white" />}
      </Button>
    </div>
  );
}

export default AIHelpAssistant;
