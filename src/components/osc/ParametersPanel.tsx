// Every avatar parameter VRChat has mentioned, live, with controls.
//
// The old page could only send a parameter you already knew the name of. VRChat
// announces them as they change, so the list builds itself — and once a
// parameter's type is known, it can be driven from here.

import { useMemo, useState } from 'react';
import { Sliders, Search, RotateCcw, Send } from 'lucide-react';
import { useOSCStore } from '../../stores/oscStore';

const PREFIX = '/avatar/parameters/';

/** VRChat's own parameters, which every avatar has and nobody chose. */
const BUILT_IN = new Set([
  'GestureLeft', 'GestureRight', 'GestureLeftWeight', 'GestureRightWeight',
  'Viseme', 'Voice', 'MuteSelf', 'AFK', 'Earmuffs', 'InStation', 'Seated',
  'Grounded', 'Upright', 'AngularY', 'VelocityX', 'VelocityY', 'VelocityZ',
  'VelocityMagnitude', 'IsLocal', 'ScaleModified', 'ScaleFactor',
  'ScaleFactorInverse', 'EyeHeightAsMeters', 'EyeHeightAsPercent', 'TrackingType',
  'VRMode', 'IsOnFriendsList', 'AvatarVersion',
]);

type Filter = 'all' | 'avatar' | 'builtin';

export default function ParametersPanel({ connected }: { connected: boolean }) {
  const { parameters, send, clearParameters } = useOSCStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(parameters)
      .map(([address, value]) => ({ address, name: address.slice(PREFIX.length), value }))
      .filter(r => {
        if (filter === 'builtin' && !BUILT_IN.has(r.name)) return false;
        if (filter === 'avatar' && BUILT_IN.has(r.name)) return false;
        return !q || r.name.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parameters, query, filter]);

  const set = (address: string, value: number | boolean) =>
    send(address, [typeof value === 'boolean'
      ? { type: value ? 'T' : 'F', value }
      : Number.isInteger(value) ? { type: 'i', value } : { type: 'f', value }]);

  return (
    <div className="glass-panel-solid p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sliders size={15} className="text-accent-400" /> Avatar parameters
          <span className="text-[10px] text-surface-500 font-normal">
            {Object.keys(parameters).length} seen
          </span>
        </h2>
        <button onClick={clearParameters} className="btn-ghost text-xs inline-flex items-center gap-1.5">
          <RotateCcw size={12} /> Forget list
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-surface-600" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="input-field w-full pl-7 text-xs"
          />
        </div>
        {(['all', 'avatar', 'builtin'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
              filter === f ? 'border-accent-500 bg-accent-500/10 text-accent-300' : 'border-surface-700 text-surface-400'
            }`}
          >
            {f === 'all' ? 'All' : f === 'avatar' ? "This avatar's" : 'Built-in'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-surface-500 py-6 text-center">
          {Object.keys(parameters).length === 0
            ? 'Nothing yet — VRChat sends a parameter when it changes. Make a gesture, or mute and unmute.'
            : 'Nothing matches that filter.'}
        </p>
      ) : (
        <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
          {rows.map(row => (
            <ParamRow key={row.address} {...row} connected={connected} onSet={set} builtIn={BUILT_IN.has(row.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamRow({ address, name, value, connected, onSet, builtIn }: {
  address: string; name: string; value: unknown; connected: boolean; builtIn: boolean;
  onSet: (address: string, value: number | boolean) => void;
}) {
  const isBool = typeof value === 'boolean';
  const isNumber = typeof value === 'number';
  const isFloat = isNumber && !Number.isInteger(value);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-900/50 border border-surface-800">
      <span className="text-xs font-mono truncate flex-1" title={address}>
        {name}
        {builtIn && <span className="text-[9px] text-surface-600 ml-1.5">built-in</span>}
      </span>

      <span className="text-xs tabular-nums text-accent-300 w-16 text-right">
        {isBool ? (value ? 'true' : 'false') : isFloat ? (value as number).toFixed(2) : String(value)}
      </span>

      {/* Only offer a control when the type is actually known — guessing would
          send an int where a float belongs and silently do nothing. */}
      {isBool && (
        <button
          onClick={() => onSet(address, !value)}
          disabled={!connected}
          className="text-[10px] px-2 py-0.5 rounded border border-surface-700 hover:border-accent-500 disabled:opacity-40"
        >
          toggle
        </button>
      )}
      {isFloat && (
        <input
          type="range" min={-1} max={1} step={0.01}
          value={value as number}
          onChange={e => onSet(address, Number(e.target.value))}
          disabled={!connected}
          className="w-24 accent-accent-500 disabled:opacity-40"
        />
      )}
      {isNumber && !isFloat && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSet(address, (value as number) - 1)}
            disabled={!connected}
            className="text-[10px] w-5 h-5 rounded border border-surface-700 hover:border-accent-500 disabled:opacity-40"
          >−</button>
          <button
            onClick={() => onSet(address, (value as number) + 1)}
            disabled={!connected}
            className="text-[10px] w-5 h-5 rounded border border-surface-700 hover:border-accent-500 disabled:opacity-40"
          >+</button>
        </div>
      )}
    </div>
  );
}
