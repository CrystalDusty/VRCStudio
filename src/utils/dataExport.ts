const DATA_VERSION = 1;

export interface ExportData {
  version: number;
  exportedAt: string;
  app: string;
  data: {
    friendNotes?: Record<string, any>;
    statusPresets?: any[];
    friendLog?: any[];
    settings?: any;
    theme?: any;
    gameLogPath?: string;
    accounts?: any[];
  };
}

export function exportAllData(): ExportData {
  const data: ExportData = {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'VRC Studio',
    data: {},
  };

  const keys: Record<string, string> = {
    friendNotes: 'vrcstudio_friend_notes',
    statusPresets: 'vrcstudio_status_presets',
    friendLog: 'vrcstudio_friend_log',
    settings: 'vrcstudio_settings',
    theme: 'vrcstudio_theme',
    gameLogPath: 'vrcstudio_logpath',
  };

  for (const [key, storageKey] of Object.entries(keys)) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        (data.data as any)[key] = JSON.parse(raw);
      }
    } catch {}
  }

  return data;
}

export function downloadExport(data: ExportData) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vrcstudio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importData(jsonString: string): { success: boolean; message: string } {
  try {
    const data: ExportData = JSON.parse(jsonString);

    if (!data.version || !data.app || data.app !== 'VRC Studio') {
      return { success: false, message: 'Invalid backup file format' };
    }

    const keyMap: Record<string, string> = {
      friendNotes: 'vrcstudio_friend_notes',
      statusPresets: 'vrcstudio_status_presets',
      friendLog: 'vrcstudio_friend_log',
      settings: 'vrcstudio_settings',
      theme: 'vrcstudio_theme',
      gameLogPath: 'vrcstudio_logpath',
    };

    let importedCount = 0;

    for (const [key, storageKey] of Object.entries(keyMap)) {
      const value = (data.data as any)[key];
      if (value !== undefined) {
        localStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value));
        importedCount++;
      }
    }

    return {
      success: true,
      message: `Successfully imported ${importedCount} data sections from backup dated ${data.exportedAt}`,
    };
  } catch (err) {
    return { success: false, message: 'Failed to parse backup file' };
  }
}

export function exportFriendsList(friends: Array<{ id: string; displayName: string; status: string }>): string {
  const csv = [
    'User ID,Display Name,Status',
    ...friends.map(f => `${f.id},"${f.displayName.replace(/"/g, '""')}",${f.status}`),
  ].join('\n');
  return csv;
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
