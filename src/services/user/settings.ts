export interface AppSettings {
  minimalHome: boolean;
  autoNext: boolean;
  debugMode: boolean;
  theme: 'dark' | 'light' | 'amoled';
  hostControlsOnly: boolean;
  autoJoinParty: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  minimalHome: false,
  autoNext: true,
  debugMode: false,
  theme: 'dark',
  hostControlsOnly: false,
  autoJoinParty: false,
};

const STORAGE_KEY = 'watchmovie_settings_v1';

export class SettingsService {
  private static settings: AppSettings | null = null;

  static getAll(): AppSettings {
    if (this.settings) return this.settings;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } else {
        // Migration from old keys
        this.settings = {
          minimalHome: localStorage.getItem('settings_minimal_home') === 'true',
          autoNext: localStorage.getItem('settings_auto_next') !== 'false',
          debugMode: localStorage.getItem('settings_debug_mode') === 'true',
          theme: 'dark',
          hostControlsOnly: false,
          autoJoinParty: false,
        };
        this.save();
      }
    } catch (e) {
      console.error('Failed to load settings', e);
      this.settings = DEFAULT_SETTINGS;
    }

    return this.settings!;
  }

  static get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.getAll()[key];
  }

  static set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const settings = this.getAll();
    settings[key] = value;
    this.save();
    
    if (key === 'theme') {
      this.applyTheme(value as any);
    }

    // Notify app of changes
    window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { key, value } }));
  }

  static applyTheme(theme: AppSettings['theme']): void {
    const root = document.documentElement;
    const body = document.body;
    
    if (theme === 'amoled') {
      body.style.backgroundColor = '#000000';
      root.style.setProperty('--bg-primary', '#000000');
    } else if (theme === 'light') {
      body.style.backgroundColor = '#ffffff';
      root.style.setProperty('--bg-primary', '#ffffff');
    } else {
      body.style.backgroundColor = '#0a0a0a';
      root.style.setProperty('--bg-primary', '#0a0a0a');
    }
    
    body.setAttribute('data-theme', theme);
  }

  private static save(): void {
    if (!this.settings) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }

  static reset(): void {
    this.settings = DEFAULT_SETTINGS;
    this.save();
  }
}

