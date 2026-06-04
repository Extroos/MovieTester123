import { GroceryList, FrequentItem } from '../../types';
import { STORAGE_KEY, STORAGE_FAVORITES_KEY, STORAGE_CUSTOM_ICONS_KEY, STORAGE_SETTINGS_KEY } from '../../constants';

export const loadLists = (): GroceryList[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load lists", e);
    return [];
  }
};

export const saveLists = (lists: GroceryList[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch (e) {
    console.error("Failed to save lists", e);
  }
};

export const loadFavorites = (): FrequentItem[] => {
  try {
    const data = localStorage.getItem(STORAGE_FAVORITES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load favorites", e);
    return [];
  }
};

export const saveFavorites = (items: FrequentItem[]): void => {
  try {
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save favorites", e);
  }
};

export const loadCustomIcons = (): string[] => {
  try {
    const data = localStorage.getItem(STORAGE_CUSTOM_ICONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load custom icons", e);
    return [];
  }
};

export const saveCustomIcons = (icons: string[]): void => {
  try {
    localStorage.setItem(STORAGE_CUSTOM_ICONS_KEY, JSON.stringify(icons));
  } catch (e) {
    console.error("Failed to save custom icons", e);
  }
};

export const loadSettings = (): { userName: string } => {
  try {
    const data = localStorage.getItem(STORAGE_SETTINGS_KEY);
    return data ? JSON.parse(data) : { userName: 'John Doe' };
  } catch (e) {
    console.error("Failed to load settings", e);
    return { userName: 'John Doe' };
  }
};

export const saveSettings = (settings: { userName: string }): void => {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings", e);
  }
};

