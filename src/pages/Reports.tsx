import { useState, useMemo, useEffect } from 'react';
import {
  Flag, MapPin, ClipboardList, ChevronRight, ChevronLeft,
  Check, AlertTriangle, Clock, Copy, ExternalLink, Trash2,
  Download, CheckCircle, XCircle, HelpCircle, FileText,
  ChevronDown, ChevronUp, Edit3, Globe, Users, LogIn, Search, MessageSquare, Send,
} from 'lucide-react';
import api from '../api/vrchat';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useReportStore } from '../stores/reportStore';
import { useAuthStore } from '../stores/authStore';
import {
  VIOLATION_CATEGORIES,
  PLAYER_CATEGORIES,
  GROUP_CATEGORIES,
  PLAYER_SCENARIOS,
  GROUP_SCENARIOS,
  getScenario,
  searchScenarios,
  generateReportText,
} from '../data/reportTemplates';
import ReportTargetPicker from '../components/ReportTargetPicker';
import { downloadCSV } from '../utils/dataExport';
import type { ViolationCategory, FiledReport, ReportStatus } from '../types/vrchat';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPORT_URL = 'https://help.vrchat.com/hc/en-us/requests/new?ticket_form_id=41536165070483';

function openReportUrl() {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(REPORT_URL);
  } else {
    window.open(REPORT_URL, '_blank');
  }
}

function instanceTypeBadge(type: string) {
  const styles: Record<string, string> = {
    public: 'bg-green-500/15 text-green-400',
    friends: 'bg-blue-500/15 text-blue-400',
    hidden: 'bg-yellow-500/15 text-yellow-400',
    private: 'bg-surface-700 text-surface-400',
    group: 'bg-purple-500/15 text-purple-400',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${styles[type] || styles.public}`}>
      {type}
    </span>
  );
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function groupByDay(entries: ReturnType<typeof useInstanceHistoryStore.getState>['history']) {
  const groups: Array<{ label: string; entries: typeof entries }> = [];
  const map = new Map<string, typeof entries>();
  for (const e of entries) {
    const d = new Date(e.joinedAt);
    const key = format(d, 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  for (const [key, list] of map) {
    const d = new Date(key);
    let label: string;
    if (isToday(d)) label = 'Today';
    else if (isYesterday(d)) label = 'Yesterday';
    else label = format(d, 'EEEE, d MMMM yyyy');
    groups.push({ label, entries: list });
  }
  return groups;
}

const statusConfig: Record<ReportStatus, { label: string; className: string; icon: React.ReactNode }> = {
  filed: {
    label: 'Submitted',
    className: 'bg-surface-700 text-surface-400',
    icon: <Clock size={12} />,
  },
  actioned: {
    label: 'Action taken',
    className: 'bg-green-500/20 text-green-400',
    icon: <CheckCircle size={12} />,
  },
  potential_action: {
    label: 'Possible action — confirm?',
    className: 'bg-amber-500/20 text-amber-400',
    icon: <HelpCircle size={12} />,
  },
  dismissed: {
    label: 'Dismissed',
    className: 'bg-surface-800 text-surface-600',
    icon: <XCircle size={12} />,
  },
};

// ─── My Visits Tab ────────────────────────────────────────────────────────────

function MyVisitsTab({ onReportFromInstance }: {
  onReportFromInstance: (worldId: string, worldName: string, instanceId: string) => void;
}) {
  const { history, currentInstance } = useInstanceHistoryStore();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [rejoining, setRejoining] = useState<string | null>(null);

  async function handleRejoin(worldId: string, instanceId: string, entryId: string) {
    if (!instanceId || rejoining) return;
    setRejoining(entryId);
    try {
      await api.selfInvite(worldId, instanceId);
    } catch {
      // Invite request still fires even if we can't confirm delivery
    } finally {
      setTimeout(() => setRejoining(null), 3000);
    }
  }

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return history;
    return history.filter(h => h.instanceType === typeFilter);
  }, [history, typeFilter]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  // Stats for today
  const todayEntries = history.filter(h => isToday(new Date(h.joinedAt)));
  const todayMs = todayEntries.reduce((acc, h) => {
    const left = h.leftAt || Date.now();
    return acc + (left - h.joinedAt);
  }, 0);
  const todaySessions = todayEntries.length;

  function exportCSV() {
    const rows = [
      'World ID,World Name,Instance Type,Instance ID,Joined At,Left At,Duration (min)',
      ...history.map(h => {
        const dur = h.leftAt ? Math.round((h.leftAt - h.joinedAt) / 60000) : '';
        return `${h.worldId},"${h.worldName.replace(/"/g, '""')}",${h.instanceType},${h.instanceId},${new Date(h.joinedAt).toISOString()},${h.leftAt ? new Date(h.leftAt).toISOString() : ''},${dur}`;
      }),
    ].join('\n');
    downloadCSV(rows, `vrcstudio-visits-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sessions today', value: todaySessions },
          { label: 'Time today', value: todayMs > 0 ? formatDuration(todayMs) : '—' },
          { label: 'Total visits', value: history.length },
        ].map(s => (
          <div key={s.label} className="glass-panel-solid p-3 text-center">
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs text-surface-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {['all', 'public', 'friends', 'group', 'hidden', 'private'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${typeFilter === t ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={exportCSV} className="btn-secondary text-xs flex items-center gap-1.5">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Current instance highlight */}
      {currentInstance && (
        <div className="glass-panel-solid border border-accent-500/30 bg-accent-500/5 p-3 rounded-xl flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{currentInstance.worldName || currentInstance.worldId}</div>
            <div className="text-xs text-surface-500 mt-0.5">
              {instanceTypeBadge(currentInstance.instanceType)} · In for {formatDuration(Date.now() - currentInstance.joinedAt)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="btn-secondary text-xs flex items-center gap-1"
              onClick={() => onReportFromInstance(
                currentInstance.worldId,
                currentInstance.worldName || currentInstance.worldId,
                currentInstance.instanceId,
              )}
            >
              <Flag size={12} /> Report
            </button>
            <button
              className="btn-primary text-xs flex items-center gap-1"
              onClick={() => handleRejoin(currentInstance.worldId, currentInstance.instanceId, 'current')}
              disabled={rejoining === 'current'}
              title="Send yourself a VRChat invite to this instance"
            >
              <LogIn size={12} />
              {rejoining === 'current' ? 'Sent!' : 'Rejoin'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-surface-500">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No visits recorded yet</p>
          <p className="text-xs mt-1">Join a VRChat world and your visits will appear here</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.label}>
              <div className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">{group.label}</div>
              <div className="space-y-2">
                {group.entries.map(entry => {
                  const duration = entry.leftAt
                    ? formatDuration(entry.leftAt - entry.joinedAt)
                    : formatDuration(Date.now() - entry.joinedAt);
                  return (
                    <div key={entry.id} className="glass-panel-solid p-3 flex gap-3 items-start">
                      {entry.worldImage ? (
                        <img
                          src={entry.worldImage}
                          alt=""
                          className="w-14 h-10 rounded-lg object-cover bg-surface-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                          <Globe size={16} className="text-surface-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{entry.worldName || entry.worldId}</span>
                          {instanceTypeBadge(entry.instanceType)}
                          {entry.groupId && (
                            <span className="text-[10px] font-mono text-purple-400/70 truncate max-w-[120px]" title={entry.groupId}>{entry.groupId}</span>
                          )}
                          {!entry.leftAt && <span className="text-[10px] text-green-400 font-semibold">● now</span>}
                        </div>
                        <div className="text-xs text-surface-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{format(new Date(entry.joinedAt), 'HH:mm')} → {entry.leftAt ? format(new Date(entry.leftAt), 'HH:mm') : 'now'}</span>
                          <span>·</span>
                          <span>{duration}</span>
                          {entry.instanceId && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[10px] truncate max-w-[100px]">{entry.instanceId}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {entry.instanceId && (
                          <button
                            className={`btn-ghost text-xs flex items-center gap-1 transition-colors ${
                              rejoining === entry.id
                                ? 'text-green-400'
                                : 'text-surface-500 hover:text-accent-300'
                            }`}
                            onClick={() => handleRejoin(entry.worldId, entry.instanceId, entry.id)}
                            disabled={!!rejoining}
                            title="Invite yourself back to this instance"
                          >
                            <LogIn size={12} />
                            <span className="text-[10px]">{rejoining === entry.id ? 'Sent!' : 'Rejoin'}</span>
                          </button>
                        )}
                        <button
                          className="btn-ghost text-xs flex items-center gap-1 text-surface-500 hover:text-surface-200"
                          onClick={() => onReportFromInstance(
                            entry.worldId,
                            entry.worldName || entry.worldId,
                            entry.instanceId,
                          )}
                          title="Report something that happened in this session"
                        >
                          <Flag size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Report Wizard ─────────────────────────────────────────────────────────────

interface WizardState {
  step: number;
  reportType: 'player' | 'group';
  targetId: string;
  targetName: string;
  targetImageUrl: string;
  violationCategory: ViolationCategory | '';
  violationSubtype: string;
  scenarioId: string;
  userStatement: string;
  hasEvidence: boolean;
  evidenceType: 'screenshot' | 'video' | 'both' | '';
  worldId: string;
  worldName: string;
  instanceId: string;
  incidentTime: number;
  witnesses: string;
  generatedText: string;
}

const INITIAL_WIZARD: WizardState = {
  step: 1,
  reportType: 'player',
  targetId: '',
  targetName: '',
  targetImageUrl: '',
  violationCategory: '',
  violationSubtype: '',
  scenarioId: '',
  userStatement: '',
  hasEvidence: false,
  evidenceType: '',
  worldId: '',
  worldName: '',
  instanceId: '',
  incidentTime: Date.now(),
  witnesses: '',
  generatedText: '',
};

function ReportWizardTab({ prefillInstance }: {
  prefillInstance?: { worldId: string; worldName: string; instanceId: string } | null;
}) {
  // Default the incident to the instance the user is in — that's where it
  // almost always happened, and it saves retyping a world name.
  const liveInstance = useInstanceHistoryStore.getState().currentInstance;
  const [w, setW] = useState<WizardState>({
    ...INITIAL_WIZARD,
    worldId: prefillInstance?.worldId || liveInstance?.worldId || '',
    worldName: prefillInstance?.worldName || liveInstance?.worldName || '',
    instanceId: prefillInstance?.instanceId || liveInstance?.instanceId || '',
    incidentTime: Date.now(),
  });
  const { addReport } = useReportStore();
  const [copied, setCopied] = useState(false);
  const [filed, setFiled] = useState(false);
  // Direct submission through VRChat's own moderation endpoint, as an
  // alternative to pasting into the help centre.
  const [submitting, setSubmitting] = useState(false);
  const [apiResult, setApiResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [liveCategories, setLiveCategories] = useState<Array<{ key: string; label: string }> | null>(null);

  // VRChat publishes its live report categories in /config. Ours are a
  // friendlier taxonomy; this maps onto whatever the API actually accepts.
  useEffect(() => {
    let cancelled = false;
    api.getConfig()
      .then(cfg => {
        if (cancelled) return;
        const opts = cfg?.reportOptions?.user ?? cfg?.reportOptions?.User;
        if (!opts || typeof opts !== 'object') return;
        const descriptions = cfg?.reportCategories ?? {};
        setLiveCategories(Object.keys(opts).map(key => ({
          key,
          label: (descriptions as any)?.[key]?.text ?? key.replace(/[_-]/g, ' '),
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [scenarioQuery, setScenarioQuery] = useState('');
  const [browseCategories, setBrowseCategories] = useState(false);

  const categories = w.reportType === 'player' ? PLAYER_CATEGORIES : GROUP_CATEGORIES;
  const scenarios = w.reportType === 'player' ? PLAYER_SCENARIOS : GROUP_SCENARIOS;
  const matchingScenarios = useMemo(
    () => searchScenarios(scenarios, scenarioQuery),
    [scenarios, scenarioQuery],
  );
  const pickedScenario = getScenario(w.scenarioId);
  const catDef = w.violationCategory ? VIOLATION_CATEGORIES[w.violationCategory] : null;

  function update(patch: Partial<WizardState>) {
    setW(prev => ({ ...prev, ...patch }));
  }

  function cleanSubtype(sub: string): string | undefined {
    if (!sub) return undefined;
    return sub.startsWith('custom:') ? sub.slice(7).trim() || undefined : sub;
  }

  function goNext() {
    if (w.step === 4) {
      // Generate boilerplate before showing preview
      const text = generateReportText({
        reportType: w.reportType,
        targetId: w.targetId,
        targetName: w.targetName,
        violationCategory: w.violationCategory as ViolationCategory,
        violationSubtype: cleanSubtype(w.violationSubtype),
        scenarioId: w.scenarioId || undefined,
        userStatement: w.userStatement || undefined,
        hasEvidence: w.hasEvidence,
        evidenceType: w.evidenceType || undefined,
        worldId: w.worldId || undefined,
        worldName: w.worldName || undefined,
        instanceId: w.instanceId || undefined,
        incidentTime: w.incidentTime,
        witnesses: w.witnesses || undefined,
      });
      update({ generatedText: text, step: 5 });
    } else {
      update({ step: w.step + 1 });
    }
  }

  function goBack() {
    update({ step: w.step - 1 });
  }

  function buildReport(): FiledReport {
    return {
      id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      reportType: w.reportType,
      targetId: w.targetId,
      targetName: w.targetName,
      targetImageUrl: w.targetImageUrl || undefined,
      violationCategory: w.violationCategory as ViolationCategory,
      violationSubtype: cleanSubtype(w.violationSubtype),
      scenarioId: w.scenarioId || undefined,
      userStatement: w.userStatement || undefined,
      hasEvidence: w.hasEvidence,
      evidenceType: w.evidenceType || undefined,
      worldId: w.worldId || undefined,
      worldName: w.worldName || undefined,
      instanceId: w.instanceId || undefined,
      incidentTime: w.incidentTime,
      reportTime: Date.now(),
      generatedText: w.generatedText,
      status: 'filed',
      witnesses: w.witnesses || undefined,
    };
  }

  function submitReport() {
    addReport(buildReport());
    setFiled(true);
    openReportUrl();
    update({ step: 6 });
  }

  /**
   * Send the report to VRChat directly. Only offered when we have the target's
   * id — the endpoint identifies content by id, not by display name.
   */
  async function submitViaApi() {
    if (!w.targetId || submitting) return;
    setSubmitting(true);
    setApiResult(null);
    try {
      // Prefer a live category whose name resembles ours; fall back to the
      // raw category key, which is what the endpoint documents.
      const ours = (w.violationCategory || 'other').toString();
      const match = liveCategories?.find(c =>
        c.key.toLowerCase() === ours.toLowerCase() ||
        c.label.toLowerCase().includes(ours.split('_')[0]),
      );
      await api.submitModerationReport({
        category: match?.key ?? ours,
        reason: w.generatedText.slice(0, 4000),
        contentType: w.reportType === 'group' ? 'group' : 'user',
        contentId: w.targetId,
      });
      const report: FiledReport = buildReport();
      addReport({ ...report, userNotes: 'Submitted directly through VRChat\'s API.' });
      setApiResult({ ok: true, message: 'Sent to VRChat. It will show up in your report history there.' });
      setFiled(true);
      update({ step: 6 });
    } catch (err) {
      setApiResult({
        ok: false,
        message: err instanceof Error
          ? `VRChat refused the report (${err.message}). The help-centre route below still works.`
          : 'VRChat refused the report. The help-centre route below still works.',
      });
    }
    setSubmitting(false);
  }

  function reset() {
    setW({ ...INITIAL_WIZARD, incidentTime: Date.now() });
    setFiled(false);
    setCopied(false);
  }

  function copyText() {
    navigator.clipboard.writeText(w.generatedText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canNext = () => {
    switch (w.step) {
      case 1: return true;
      case 2: return w.targetName.trim().length > 0;
      case 3: return w.violationCategory !== '';
      case 4: return true;
      case 5: return w.generatedText.trim().length > 0;
      default: return false;
    }
  };

  const stepLabels = ['Type', 'Who', 'What happened', 'Details', 'Review', 'Done'];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Progress */}
      {w.step < 6 && (
        <div className="flex items-center gap-1">
          {stepLabels.slice(0, 5).map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className={`flex items-center gap-1.5 ${i + 1 < w.step ? 'text-green-400' : i + 1 === w.step ? 'text-accent-400' : 'text-surface-600'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i + 1 < w.step ? 'bg-green-500/20' : i + 1 === w.step ? 'bg-accent-500/20' : 'bg-surface-800'}`}>
                  {i + 1 < w.step ? <Check size={10} /> : i + 1}
                </div>
                <span className="text-[11px] hidden sm:block">{label}</span>
              </div>
              {i < 4 && <div className="flex-1 h-px bg-surface-800 mx-1" />}
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Report type */}
      {w.step === 1 && (
        <div className="glass-panel-solid p-6 space-y-4">
          <h2 className="text-lg font-bold">What are you reporting?</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['player', 'group'] as const).map(type => (
              <button
                key={type}
                onClick={() => update({ reportType: type, violationCategory: '' })}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${w.reportType === type ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'}`}
              >
                {type === 'player' ? <Users size={24} className="mb-2 text-accent-400" /> : <Flag size={24} className="mb-2 text-accent-400" />}
                <div className="font-semibold capitalize">{type}</div>
                <div className="text-xs text-surface-500 mt-0.5">
                  {type === 'player' ? 'Report a specific VRChat user' : 'Report a VRChat group'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Who? */}
      {w.step === 2 && (
        <div className="glass-panel-solid p-6 space-y-4">
          <h2 className="text-lg font-bold">
            {w.reportType === 'player' ? 'Who are you reporting?' : 'Which group are you reporting?'}
          </h2>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">Display name</label>
            <input
              type="text"
              placeholder={w.reportType === 'player' ? 'Enter VRChat display name' : 'Enter group name'}
              value={w.targetName}
              onChange={e => update({ targetName: e.target.value })}
              className="input w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">
              {w.reportType === 'player' ? 'User ID (optional but recommended)' : 'Group ID (optional but recommended)'}
            </label>
            <input
              type="text"
              placeholder={w.reportType === 'player' ? 'usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'grp_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
              value={w.targetId}
              onChange={e => update({ targetId: e.target.value })}
              className="input w-full font-mono text-sm"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-surface-200 mb-2">Quick pick</div>
            <ReportTargetPicker
              reportType={w.reportType}
              selectedId={w.targetId}
              selectedName={w.targetName}
              onPick={opt => update({
                targetName: opt.name,
                targetId: opt.id,
                targetImageUrl: opt.imageUrl || '',
              })}
            />
          </div>
        </div>
      )}

      {/* Step 3: What happened — scenario presets, category as the fallback */}
      {w.step === 3 && (
        <div className="glass-panel-solid p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold">What happened?</h2>
            <p className="text-xs text-surface-500 mt-1">
              Pick whichever comes closest — it writes the first draft in plain English and
              you get to edit every word before anything is sent.
            </p>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              value={scenarioQuery}
              onChange={e => setScenarioQuery(e.target.value)}
              placeholder="Describe it — e.g. crasher, slurs, mic spam, followed me…"
              className="w-full bg-surface-900 text-sm pl-8 pr-3 py-2 rounded-lg border border-surface-700 focus:outline-none focus:border-accent-500 placeholder-surface-600"
            />
          </div>

          <div className="max-h-[22rem] overflow-y-auto space-y-1.5 pr-0.5">
            {matchingScenarios.length === 0 ? (
              <div className="text-center text-xs text-surface-500 py-6">
                Nothing matches "{scenarioQuery}". Try fewer words, or choose a category below.
              </div>
            ) : matchingScenarios.map(sc => {
              const def = VIOLATION_CATEGORIES[sc.category];
              const active = w.scenarioId === sc.id;
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    update({
                      scenarioId: sc.id,
                      violationCategory: sc.category,
                      violationSubtype: sc.subtype ?? '',
                    });
                    setBrowseCategories(false);
                  }}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-colors ${active ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{def.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-sm leading-snug">{sc.label}</div>
                      <div className="text-xs text-surface-500 mt-0.5">{sc.hint}</div>
                      <div className="text-[10px] text-surface-600 mt-1 uppercase tracking-wider">
                        Files as: {def.label}
                        {def.urgency === 'urgent' && <span className="text-amber-400 ml-1.5">· urgent</span>}
                      </div>
                    </div>
                    {active && <Check size={14} className="text-accent-400 flex-shrink-0 ml-auto mt-0.5" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Category fallback for anything the presets don't cover */}
          <div className="border-t border-surface-800 pt-3">
            <button
              onClick={() => setBrowseCategories(v => !v)}
              className="text-xs text-surface-400 hover:text-accent-300 flex items-center gap-1.5"
            >
              {browseCategories ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              None of these fit — pick a category myself
            </button>

            {browseCategories && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {categories.map(key => {
                  const def = VIOLATION_CATEGORIES[key];
                  const active = w.violationCategory === key && !w.scenarioId;
                  return (
                    <button
                      key={key}
                      onClick={() => update({ violationCategory: key, violationSubtype: '', scenarioId: '' })}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${active ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0">{def.emoji}</span>
                        <div>
                          <div className="font-semibold text-sm">{def.label}</div>
                          <div className="text-xs text-surface-500 mt-0.5">{def.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Details */}
      {w.step === 4 && (
        <div className="glass-panel-solid p-6 space-y-4">
          <h2 className="text-lg font-bold">Details</h2>

          {/* What they picked, with a way back */}
          {pickedScenario && (
            <div className="flex items-start gap-2 text-xs bg-surface-800/50 rounded-lg p-2.5">
              <span className="text-base leading-none">{VIOLATION_CATEGORIES[pickedScenario.category].emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-surface-200">{pickedScenario.label}</div>
                <div className="text-[10px] text-surface-500 mt-0.5">
                  Filing as {VIOLATION_CATEGORIES[pickedScenario.category].label}
                </div>
              </div>
              <button
                onClick={() => update({ step: 3 })}
                className="text-accent-400 hover:text-accent-300 flex-shrink-0"
              >
                Change
              </button>
            </div>
          )}

          {/* The reporter's own account — the part moderators actually read */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200 flex items-center gap-1.5">
              <MessageSquare size={12} className="text-accent-400" />
              {pickedScenario?.followUp
                ? pickedScenario.followUp.replace(/\{target\}/g, w.targetName || 'them')
                : 'What happened, in your own words?'}
            </label>
            <textarea
              value={w.userStatement}
              onChange={e => update({ userStatement: e.target.value })}
              placeholder="Optional, but a couple of specific sentences here does more than anything else in this form."
              className="w-full h-24 bg-surface-900 border border-surface-700 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-accent-500 placeholder-surface-600"
            />
          </div>

          {/* Subtype if applicable */}
          {catDef?.subtypes && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-surface-200">{catDef.subtypeLabel}</label>
              <div className="flex flex-wrap gap-2">
                {catDef.subtypes.map(sub => (
                  <button
                    key={sub}
                    onClick={() => update({ violationSubtype: sub })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${w.violationSubtype === sub ? 'border-accent-500 bg-accent-500/10 text-accent-300' : 'border-surface-700 hover:border-surface-600'}`}
                  >
                    {sub}
                  </button>
                ))}
                {catDef.subtypeAllowCustom && (
                  <button
                    onClick={() => update({ violationSubtype: 'custom:' })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${w.violationSubtype?.startsWith('custom:') ? 'border-accent-500 bg-accent-500/10 text-accent-300' : 'border-surface-700 hover:border-surface-600'}`}
                  >
                    Describe it myself
                  </button>
                )}
              </div>
              {w.violationSubtype?.startsWith('custom:') && (
                <input
                  type="text"
                  placeholder="Briefly describe the subtype..."
                  value={w.violationSubtype.slice(7)}
                  onChange={e => update({ violationSubtype: 'custom:' + e.target.value })}
                  className="input text-sm w-full mt-1"
                  autoFocus
                />
              )}
            </div>
          )}

          {/* When did it happen */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">When did this happen?</label>
            <input
              type="datetime-local"
              value={new Date(w.incidentTime - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={e => update({ incidentTime: new Date(e.target.value).getTime() })}
              className="input"
            />
          </div>

          {/* Instance context */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">World / instance (optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="World name"
                value={w.worldName}
                onChange={e => update({ worldName: e.target.value })}
                className="input text-sm"
              />
              <input
                type="text"
                placeholder="Instance ID"
                value={w.instanceId}
                onChange={e => update({ instanceId: e.target.value })}
                className="input text-sm font-mono"
              />
            </div>
          </div>

          {/* Evidence */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">Do you have evidence?</label>
            <div className="flex flex-wrap gap-2">
              {[
                { val: false, label: 'No evidence' },
                { val: true, label: 'Yes' },
              ].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => update({ hasEvidence: opt.val, evidenceType: opt.val ? w.evidenceType : '' })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${w.hasEvidence === opt.val ? 'border-accent-500 bg-accent-500/10 text-accent-300' : 'border-surface-700 hover:border-surface-600'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {w.hasEvidence && (
              <div className="flex flex-wrap gap-2 mt-1">
                {(['screenshot', 'video', 'both'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => update({ evidenceType: t })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${w.evidenceType === t ? 'border-accent-500 bg-accent-500/10 text-accent-300' : 'border-surface-700 hover:border-surface-600'}`}
                  >
                    {t === 'both' ? 'Both' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Witnesses */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-surface-200">Other people present? (optional — VRChat usernames)</label>
            <input
              type="text"
              placeholder="e.g. FriendName1, FriendName2"
              value={w.witnesses}
              onChange={e => update({ witnesses: e.target.value })}
              className="input text-sm"
            />
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {w.step === 5 && (
        <div className="glass-panel-solid p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-bold">Review your report</h2>
            <button onClick={copyText} className="btn-secondary text-xs flex items-center gap-1.5">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-surface-500">
            This is the text you'll paste into the VRChat help center. You can edit it before submitting.
          </p>
          <textarea
            value={w.generatedText}
            onChange={e => update({ generatedText: e.target.value })}
            className="w-full h-72 bg-surface-900 border border-surface-700 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:border-accent-500"
          />
          {/* Two ways out: VRChat's own endpoint, or the help centre. */}
          <div className="space-y-2">
            <div className="rounded-lg border border-surface-700 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <Send size={13} className="text-accent-400" /> Send to VRChat directly
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">
                    Files it through VRChat's moderation endpoint — no copying, no browser.
                    {!w.targetId && ' Needs the target\'s ID, which isn\'t filled in.'}
                  </p>
                </div>
                <button
                  onClick={submitViaApi}
                  disabled={!w.targetId || submitting}
                  className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40 flex-shrink-0"
                >
                  {submitting ? <Clock size={14} className="animate-spin" /> : <Send size={14} />}
                  {submitting ? 'Sending…' : 'Submit to VRChat'}
                </button>
              </div>
              {liveCategories && (
                <p className="text-[10px] text-surface-600">
                  Using VRChat's live category list ({liveCategories.length} categories from /config).
                </p>
              )}
              {apiResult && (
                <p className={`text-xs flex items-start gap-1.5 ${apiResult.ok ? 'text-green-400' : 'text-amber-400'}`}>
                  {apiResult.ok ? <CheckCircle size={13} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />}
                  <span>{apiResult.message}</span>
                </p>
              )}
            </div>

            <div className="text-xs text-surface-500 bg-surface-800/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                Or use the help centre: "Submit Report" saves this to your history and opens
                VRChat's form in your browser — paste the text above into it.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Step 6: Done */}
      {w.step === 6 && (
        <div className="glass-panel-solid p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-green-400" />
          </div>
          <h2 className="text-lg font-bold">Report filed</h2>
          <p className="text-sm text-surface-400">
            Your report has been saved to your history. The VRChat help center should have opened in your browser — paste your report text there to complete the submission.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={openReportUrl} className="btn-secondary flex items-center gap-2">
              <ExternalLink size={14} /> Open Help Center
            </button>
            <button onClick={reset} className="btn-primary flex items-center gap-2">
              <Flag size={14} /> File another report
            </button>
          </div>
        </div>
      )}

      {/* Nav buttons */}
      {w.step < 6 && (
        <div className="flex gap-3 justify-between">
          <button
            onClick={goBack}
            disabled={w.step === 1}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Back
          </button>
          {w.step < 5 ? (
            <button
              onClick={goNext}
              disabled={!canNext()}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={submitReport}
              className="btn-primary flex items-center gap-1.5 bg-green-600 hover:bg-green-500"
            >
              <ExternalLink size={16} /> Submit Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Report History Tab ────────────────────────────────────────────────────────

function ReportHistoryTab() {
  const { reports, updateStatus, updateUserNotes, deleteReport } = useReportStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<ViolationCategory | 'all'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterCategory !== 'all' && r.violationCategory !== filterCategory) return false;
      return true;
    });
  }, [reports, filterStatus, filterCategory]);

  function exportHistoryCSV() {
    const rows = [
      'Report ID,Type,Target Name,Target ID,Category,Status,Filed At,Actioned At',
      ...reports.map(r =>
        `${r.id},${r.reportType},"${r.targetName.replace(/"/g, '""')}",${r.targetId},${r.violationCategory},${r.status},${new Date(r.reportTime).toISOString()},${r.actionedAt ? new Date(r.actionedAt).toISOString() : ''}`
      ),
    ].join('\n');
    downloadCSV(rows, `vrcstudio-reports-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-surface-500">
        <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-semibold">No reports filed yet</p>
        <p className="text-xs mt-1">Reports you file will be tracked here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as ReportStatus | 'all')}
          className="input text-sm py-1.5"
        >
          <option value="all">All statuses</option>
          <option value="filed">Submitted</option>
          <option value="potential_action">Possible action</option>
          <option value="actioned">Actioned</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as ViolationCategory | 'all')}
          className="input text-sm py-1.5"
        >
          <option value="all">All categories</option>
          {(Object.keys(VIOLATION_CATEGORIES) as ViolationCategory[]).map(k => (
            <option key={k} value={k}>{VIOLATION_CATEGORIES[k].label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button onClick={exportHistoryCSV} className="btn-secondary text-xs flex items-center gap-1.5">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Report cards */}
      <div className="space-y-3">
        {filtered.map(report => {
          const cfg = statusConfig[report.status];
          const catDef = VIOLATION_CATEGORIES[report.violationCategory];
          const isExpanded = expandedId === report.id;

          return (
            <div key={report.id} className={`glass-panel-solid rounded-xl overflow-hidden border ${report.status === 'potential_action' ? 'border-amber-500/30' : report.status === 'actioned' ? 'border-green-500/20' : 'border-transparent'}`}>
              {/* Header */}
              <div className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 text-lg">
                  {catDef?.emoji || '🚩'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{report.targetName}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.className}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <div className="text-xs text-surface-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{catDef?.label}</span>
                    {report.violationSubtype && <><span>·</span><span>{report.violationSubtype}</span></>}
                    <span>·</span>
                    <span title={new Date(report.reportTime).toLocaleString()}>
                      {formatDistanceToNow(new Date(report.reportTime), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  className="btn-ghost p-1.5 flex-shrink-0"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Potential action banner */}
              {report.status === 'potential_action' && (
                <div className="mx-4 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-3">
                  <HelpCircle size={16} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 text-xs text-amber-300">
                    VRChat may have taken action on one of your reports. Was it this one?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(report.id, 'actioned', Date.now())}
                      className="text-xs px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => updateStatus(report.id, 'dismissed')}
                      className="text-xs px-2.5 py-1 rounded-lg bg-surface-800 text-surface-400 hover:bg-surface-700"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-surface-800/50 pt-3">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-surface-500">
                    {report.worldName && (
                      <div><span className="text-surface-400 font-semibold">World: </span>{report.worldName}</div>
                    )}
                    {report.targetId && (
                      <div className="font-mono truncate"><span className="text-surface-400 font-semibold not-italic">ID: </span>{report.targetId}</div>
                    )}
                    {report.hasEvidence && (
                      <div><span className="text-surface-400 font-semibold">Evidence: </span>{report.evidenceType || 'yes'}</div>
                    )}
                    {report.actionedAt && (
                      <div><span className="text-surface-400 font-semibold">Actioned: </span>{format(new Date(report.actionedAt), 'dd MMM yyyy')}</div>
                    )}
                  </div>

                  {/* Boilerplate text */}
                  <div>
                    <div className="text-xs font-semibold text-surface-400 mb-1.5 flex items-center gap-2">
                      <FileText size={12} /> Report text
                      <button
                        onClick={() => navigator.clipboard.writeText(report.generatedText).catch(() => {})}
                        className="ml-auto btn-ghost text-xs p-1 flex items-center gap-1"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    </div>
                    <pre className="text-xs text-surface-400 bg-surface-900 rounded-lg p-3 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                      {report.generatedText}
                    </pre>
                  </div>

                  {/* Notes */}
                  <div>
                    <div className="text-xs font-semibold text-surface-400 mb-1.5 flex items-center gap-2">
                      <Edit3 size={12} /> Your notes
                      {editingNotesId !== report.id && (
                        <button
                          onClick={() => { setEditingNotesId(report.id); setNotesInput(report.userNotes || ''); }}
                          className="ml-auto btn-ghost text-xs p-1"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingNotesId === report.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={notesInput}
                          onChange={e => setNotesInput(e.target.value)}
                          rows={3}
                          placeholder="Add private notes about this report..."
                          className="w-full bg-surface-900 border border-surface-700 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-accent-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { updateUserNotes(report.id, notesInput); setEditingNotesId(null); }}
                            className="btn-primary text-xs"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingNotesId(null)} className="btn-secondary text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-surface-500 italic">
                        {report.userNotes || 'No notes added.'}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {report.status === 'filed' && (
                      <button
                        onClick={() => updateStatus(report.id, 'actioned', Date.now())}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1"
                      >
                        <CheckCircle size={12} /> Mark as actioned
                      </button>
                    )}
                    {report.status !== 'dismissed' && (
                      <button
                        onClick={() => updateStatus(report.id, 'dismissed')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface-800 text-surface-400 hover:bg-surface-700 flex items-center gap-1"
                      >
                        <XCircle size={12} /> Dismiss
                      </button>
                    )}
                    <button
                      onClick={openReportUrl}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface-800 text-surface-400 hover:bg-surface-700 flex items-center gap-1"
                    >
                      <ExternalLink size={12} /> Open Help Center
                    </button>
                    {deleteConfirmId === report.id ? (
                      <div className="flex gap-1 ml-auto">
                        <button
                          onClick={() => { deleteReport(report.id); setDeleteConfirmId(null); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                        >
                          Confirm delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs px-2 py-1.5 rounded-lg bg-surface-800 text-surface-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(report.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-surface-800 text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 ml-auto flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'visits' | 'file' | 'history';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('visits');
  const [pendingInstance, setPendingInstance] = useState<{
    worldId: string; worldName: string; instanceId: string;
  } | null>(null);
  const { reports } = useReportStore();

  const potentialActions = reports.filter(r => r.status === 'potential_action').length;

  function handleReportFromInstance(worldId: string, worldName: string, instanceId: string) {
    setPendingInstance({ worldId, worldName, instanceId });
    setActiveTab('file');
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'visits', label: 'My Visits', icon: <MapPin size={15} /> },
    { key: 'file', label: 'File a Report', icon: <Flag size={15} /> },
    { key: 'history', label: 'Report History', icon: <ClipboardList size={15} />, badge: potentialActions || undefined },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">History & Reports</h1>
        <p className="text-sm text-surface-500 mt-1">Track your world visits and manage moderation reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900/60 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${activeTab === tab.key ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200'}`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge ? (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold flex items-center justify-center text-black">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'visits' && (
        <MyVisitsTab onReportFromInstance={handleReportFromInstance} />
      )}
      {activeTab === 'file' && (
        <ReportWizardTab prefillInstance={pendingInstance} />
      )}
      {activeTab === 'history' && (
        <ReportHistoryTab />
      )}
    </div>
  );
}
