type KeyHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: KeyHandler;
}

class KeyboardShortcutManager {
  private shortcuts: Shortcut[] = [];
  private enabled = true;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        target.blur();
        return;
      }
      return;
    }

    for (const shortcut of this.shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;

      if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }

  register(shortcut: Shortcut) {
    this.shortcuts.push(shortcut);
    return () => {
      this.shortcuts = this.shortcuts.filter(s => s !== shortcut);
    };
  }

  registerAll(shortcuts: Shortcut[]) {
    const unregisters = shortcuts.map(s => this.register(s));
    return () => unregisters.forEach(u => u());
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  getAll() {
    return [...this.shortcuts];
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.shortcuts = [];
  }
}

export const keyboardManager = new KeyboardShortcutManager();
export default keyboardManager;
