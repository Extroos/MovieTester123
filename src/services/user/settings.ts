export interface AppSettings {
  minimalHome: boolean;
  autoNext: boolean;
  debugMode: boolean;
  theme: 'dark' | 'amoled';
  hostControlsOnly: boolean;
  autoJoinParty: boolean;
  hapticsEnabled: boolean;
  hapticsIntensity: 'light' | 'medium' | 'heavy';
  subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
  subtitleColor: string;
  subtitleBgOpacity: number;
  mirrorPriority: 'local' | 'online';
  appLanguage: 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'ru';
  preferredAudioLanguage: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  minimalHome: false,
  autoNext: true,
  debugMode: false,
  theme: 'dark',
  hostControlsOnly: false,
  autoJoinParty: false,
  hapticsEnabled: false,
  hapticsIntensity: 'medium',
  subtitleSize: 'medium',
  subtitleColor: '#ffffff',
  subtitleBgOpacity: 0.3,
  mirrorPriority: 'online',
  appLanguage: 'en',
  preferredAudioLanguage: 'English',
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
        if ((this.settings.theme as any) === 'light') {
          this.settings.theme = 'dark';
        }
      } else {
        // Migration from old keys
        this.settings = {
          ...DEFAULT_SETTINGS,
          minimalHome: localStorage.getItem('settings_minimal_home') === 'true',
          autoNext: localStorage.getItem('settings_auto_next') !== 'false',
          debugMode: localStorage.getItem('settings_debug_mode') === 'true',
          theme: 'dark',
          hapticsEnabled: localStorage.getItem('settings_haptics_enabled') === 'true',
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
    const body = document.body;
    body.setAttribute('data-theme', theme);
    body.style.removeProperty('background-color');
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

