import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Cache UA detection once at module load — avoids re-running regex on every tap
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const triggerHaptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    if (!IS_MOBILE) return;

    let impactStyle = ImpactStyle.Light;
    if (style === 'medium') impactStyle = ImpactStyle.Medium;
    if (style === 'heavy') impactStyle = ImpactStyle.Heavy;

    await Haptics.impact({ style: impactStyle });
  } catch (e) {
    console.warn('Haptics failed', e);
  }
};

export const triggerSelectionHaptic = async () => {
  try {
    if (!IS_MOBILE) return;
    await Haptics.selectionStart();
  } catch (e) {
    console.warn('Selection haptic failed', e);
  }
};

export const triggerSuccessHaptic = async () => {
    try {
      if (!IS_MOBILE) return;
      await Haptics.notification({ type: 'SUCCESS' as any });
    } catch (e) {
      console.warn('Success haptic failed', e);
    }
};

