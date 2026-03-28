import { useState } from 'react';
import { Zap, Plus, Trash2, Check } from 'lucide-react';
import { useStatusPresetStore, StatusPreset } from '../stores/statusPresetStore';
import type { UserStatus } from '../types/vrchat';

const statusOptions: { value: UserStatus; label: string; color: string }[] = [
  { value: 'join me', label: 'Join Me', color: 'bg-status-joinme' },
  { value: 'active', label: 'Online', color: 'bg-status-online' },
  { value: 'ask me', label: 'Ask Me', color: 'bg-status-askme' },
  { value: 'busy', label: 'Busy', color: 'bg-status-busy' },
];

interface Props {
  onApply: (status: UserStatus, statusDescription: string) => void;
}

export default function StatusPresetPanel({ onApply }: Props) {
  const { presets, addPreset, removePreset } = useStatusPresetStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStatus, setNewStatus] = useState<UserStatus>('active');
  const [newDescription, setNewDescription] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const handleApply = (preset: StatusPreset) => {
    onApply(preset.status, preset.statusDescription);
    setAppliedId(preset.id);
    setTimeout(() => setAppliedId(null), 2000);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    addPreset({
      name: newName.trim(),
      status: newStatus,
      statusDescription: newDescription.trim(),
    });
    setNewName('');
    setNewDescription('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap size={12} /> Status Presets
        </h3>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-ghost text-xs">
          <Plus size={14} />
        </button>
      </div>

      {isAdding && (
        <div className="glass-panel p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Preset name"
            className="input-field text-sm"
            autoFocus
          />
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as UserStatus)}
            className="input-field text-sm"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Status description"
            className="input-field text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setIsAdding(false)} className="btn-secondary text-xs flex-1">Cancel</button>
            <button onClick={handleAdd} className="btn-primary text-xs flex-1">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {presets.map(preset => {
          const statusOpt = statusOptions.find(o => o.value === preset.status);
          return (
            <div
              key={preset.id}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-800/50 transition-colors group"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusOpt?.color || 'bg-surface-500'}`} />
              <button
                onClick={() => handleApply(preset)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-xs font-medium truncate">{preset.name}</div>
                {preset.statusDescription && (
                  <div className="text-[10px] text-surface-500 truncate">{preset.statusDescription}</div>
                )}
              </button>
              {appliedId === preset.id ? (
                <Check size={12} className="text-green-400 flex-shrink-0" />
              ) : (
                <button
                  onClick={() => removePreset(preset.id)}
                  className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
