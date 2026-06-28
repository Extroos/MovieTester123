import { Haptics, ImpactStyle } from '@capacitor/haptics';

import { SettingsService } from '../services/settings';

// Cache UA detection once at module load — avoids re-running regex on every tap
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const triggerHaptic = async (style?: 'light' | 'medium' | 'heavy') => {
  try {
    if (!IS_MOBILE) return;
    if (!SettingsService.get('hapticsEnabled')) return;

    const configuredIntensity = SettingsService.get('hapticsIntensity') || 'medium';
    const targetStyle = style || configuredIntensity;

    let impactStyle = ImpactStyle.Light;
    if (targetStyle === 'medium') impactStyle = ImpactStyle.Medium;
    if (targetStyle === 'heavy') impactStyle = ImpactStyle.Heavy;

    await Haptics.impact({ style: impactStyle });
  } catch (e) {
    console.warn('Haptics failed', e);
  }
};

export const triggerSelectionHaptic = async () => {
  try {
    if (!IS_MOBILE) return;
    if (!SettingsService.get('hapticsEnabled')) return;
    await Haptics.selectionStart();
  } catch (e) {
    console.warn('Selection haptic failed', e);
  }
};

export const triggerSuccessHaptic = async () => {
    try {
      if (!IS_MOBILE) return;
      if (!SettingsService.get('hapticsEnabled')) return;
      await Haptics.notification({ type: 'SUCCESS' as any });
    } catch (e) {
      console.warn('Success haptic failed', e);
    }
};

