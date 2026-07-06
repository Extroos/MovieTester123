import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeStreamingEngine } from '../../../../services/native/NativeStreamingEngine';

interface UsePlayerGesturesProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentTime: number;
  duration: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number | ((prev: number) => number)>>;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  castConnected: boolean;
  remotePlayerRef: React.RefObject<any>;
  remotePlayerControllerRef: React.RefObject<any>;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showControls: boolean;
  setShowControls: (show: boolean) => void;
  controlsTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
  resetControlsTimeout: () => void;
  toggleControlsVisibility: () => void;
  handleRewind: (e?: any) => void;
  handleForward: (e?: any) => void;
  toggleFullScreen: (e?: any) => void;
  hostControlsLocked?: boolean;
}

export function usePlayerGestures({
  videoRef,
  containerRef,
  currentTime,
  duration,
  setCurrentTime,
  playing,
  setPlaying,
  castConnected,
  remotePlayerRef,
  remotePlayerControllerRef,
  showSettings,
  setShowSettings,
  showControls,
  setShowControls,
  controlsTimeout,
  resetControlsTimeout,
  toggleControlsVisibility,
  handleRewind,
  handleForward,
  toggleFullScreen,
  hostControlsLocked = false
}: UsePlayerGesturesProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockIndicator, setShowUnlockIndicator] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(1);
  const [activeSlider, setActiveSlider] = useState<'brightness' | 'volume' | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'fit' | 'fill' | 'zoom'>('fit');
  const [zoomScale, setZoomScale] = useState(1.0);
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const [horizontalSeekTime, setHorizontalSeekTime] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [rippleLeft, setRippleLeft] = useState(false);
  const [rippleRight, setRippleRight] = useState(false);
  const [isHoldingSpeed, setIsHoldingSpeed] = useState(false);

  const isHoldingSpeedRef = useRef(false);
  const originalSpeedRef = useRef(1.0);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sliderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchTypeRef = useRef<'none' | 'tap' | 'swipe_x' | 'swipe_y' | 'pinch'>('none');
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startBrightnessRef = useRef(1);
  // FIX: startVolumeRef is now always set from videoRef.current.volume at touchstart
  // to prevent stale-closure bugs after server switches reset the video element's volume.
  const startVolumeRef = useRef(1);
  const startSeekTimeRef = useRef(0);
  const initialPinchDistRef = useRef(0);
  const initialScaleRef = useRef(1);
  const lastTapTimeRef = useRef(0);
  const lastTouchTimeRef = useRef<number>(0);

  // --- Consolidated ref mirrors (single effect instead of 12 individual ones) ---
  const isLockedRef = useRef(isLocked);
  const brightnessRef = useRef(brightness);
  const zoomScaleRef = useRef(zoomScale);
  const castConnectedRef = useRef(castConnected);
  const durationRef = useRef(duration);
  const horizontalSeekTimeRef = useRef<number | null>(null);
  const showSettingsRef = useRef(showSettings);
  const toggleControlsVisibilityRef = useRef(toggleControlsVisibility);
  const handleRewindRef = useRef(handleRewind);
  const handleForwardRef = useRef(handleForward);
  const toggleFullScreenRef = useRef(toggleFullScreen);
  const currentTimeRef = useRef(currentTime);
  const handleLockedScreenTapRef = useRef(handleLockedScreenTap);

  const originalBrightnessRef = useRef<number>(1.0);

  // Consolidated single effect for all ref mirrors — avoids 12 separate effect registrations
  useEffect(() => {
    isLockedRef.current = isLocked;
    brightnessRef.current = brightness;
    zoomScaleRef.current = zoomScale;
    castConnectedRef.current = castConnected;
    durationRef.current = duration;
    horizontalSeekTimeRef.current = horizontalSeekTime;
    showSettingsRef.current = showSettings;
    toggleControlsVisibilityRef.current = toggleControlsVisibility;
    handleRewindRef.current = handleRewind;
    handleForwardRef.current = handleForward;
    toggleFullScreenRef.current = toggleFullScreen;
    currentTimeRef.current = currentTime;
    handleLockedScreenTapRef.current = handleLockedScreenTap;
  });

  // Store original device brightness on mount, and restore it on unmount
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeStreamingEngine.getDeviceBrightness().then(res => {
        originalBrightnessRef.current = res.brightness;
      }).catch(() => {});
    }
    return () => {
      if (Capacitor.isNativePlatform()) {
        NativeStreamingEngine.setDeviceBrightness({ brightness: originalBrightnessRef.current }).catch(() => {});
      }
    };
  }, []);
  // No dependency array → runs after every render but as a single cheap sync (no cleanup, no scheduling overhead).

  // Sync volume display state from actual video element when src changes
  useEffect(() => {
    if (videoRef.current) {
      if (Capacitor.isNativePlatform()) {
        videoRef.current.volume = 1.0;
        NativeStreamingEngine.getDeviceVolume().then(res => {
          setVolume(res.volume);
        }).catch(() => {
          setVolume(1.0);
        });
      } else {
        setVolume(videoRef.current.volume);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  function handleLockedScreenTap(e: any) {
    e.stopPropagation();
    setShowUnlockIndicator(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      setShowUnlockIndicator(false);
    }, 3000);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getTouchDistance = (t1: Touch, t2: Touch) => {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    };

    // Cache state to prevent UI re-render lag and teleporting glitches
    let lastVolumeVal = startVolumeRef.current;
    let lastBrightnessVal = startBrightnessRef.current;

    const handleNativeTouchStart = async (e: TouchEvent) => {
      lastTouchTimeRef.current = Date.now();

      const target = e.target as HTMLElement;
      if (showSettingsRef.current || (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'BUTTON' || 
        target.tagName === 'SELECT' || 
        target.closest('button') || 
        target.closest('input') || 
        target.closest('select') ||
        target.closest('[data-scrubber]')
      ))) {
        return;
      }

      if (isLockedRef.current) {
        handleLockedScreenTapRef.current(e);
        return;
      }

      if (e.touches.length === 2) {
        touchTypeRef.current = 'pinch';
        initialPinchDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        initialScaleRef.current = zoomScaleRef.current;
        setShowZoomBadge(true);
        return;
      }

      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;

      // Query native system levels to keep UI fully in sync
      if (Capacitor.isNativePlatform()) {
        try {
          const volRes = await NativeStreamingEngine.getDeviceVolume();
          startVolumeRef.current = volRes.volume;
        } catch (_) {
          startVolumeRef.current = videoRef.current ? videoRef.current.volume : 1;
        }
        try {
          const briRes = await NativeStreamingEngine.getDeviceBrightness();
          startBrightnessRef.current = briRes.brightness;
        } catch (_) {
          startBrightnessRef.current = brightnessRef.current;
        }
      } else {
        startVolumeRef.current = videoRef.current ? videoRef.current.volume : 1;
        startBrightnessRef.current = brightnessRef.current;
      }

      lastVolumeVal = startVolumeRef.current;
      lastBrightnessVal = startBrightnessRef.current;
      
      touchTypeRef.current = 'tap';

      // Hold to speed up 2x on the right side of the screen (Mobile only, not TV mode)
      const isTV = typeof localStorage !== 'undefined' && localStorage.getItem('cinemovie_is_tv') === 'true';
      const containerWidth = container.clientWidth || window.innerWidth;
      const x = touch.clientX;
      const isRight = x > containerWidth * 0.6;
      if (!isTV && isRight && videoRef.current && playing) {
        if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = setTimeout(() => {
          if (touchTypeRef.current === 'tap' && videoRef.current) {
            originalSpeedRef.current = videoRef.current.playbackRate || 1.0;
            videoRef.current.playbackRate = 2.0;
            isHoldingSpeedRef.current = true;
            setIsHoldingSpeed(true);
            import('../../../../utils/haptics').then(m => m.triggerHaptic('medium'));
          }
        }, 450);
      }
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (showSettingsRef.current || (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'BUTTON' || 
        target.tagName === 'SELECT' || 
        target.closest('button') || 
        target.closest('input') || 
        target.closest('select') ||
        target.closest('[data-scrubber]')
      ))) {
        return;
      }

      if (isLockedRef.current) return;

      if (touchTypeRef.current === 'pinch' && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        if (initialPinchDistRef.current > 0) {
          const ratio = dist / initialPinchDistRef.current;
          const newScale = Math.max(1.0, Math.min(3.0, initialScaleRef.current * ratio));
          setZoomScale(newScale);
          setAspectRatio('zoom');
        }
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startXRef.current;
      const deltaY = startYRef.current - touch.clientY;

      const containerWidth = container.clientWidth || window.innerWidth;
      const containerHeight = container.clientHeight || window.innerHeight;

      if (touchTypeRef.current === 'tap') {
        if (Math.abs(deltaX) > 20 || Math.abs(deltaY) > 20) {
          if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
          }
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (hostControlsLocked) return;
            touchTypeRef.current = 'swipe_x';
            startSeekTimeRef.current = currentTimeRef.current;
            if (e.cancelable) e.preventDefault();
          } else {
            touchTypeRef.current = 'swipe_y';
            if (e.cancelable) e.preventDefault();
          }
        }
      }

      if (touchTypeRef.current === 'swipe_x') {
        if (e.cancelable) e.preventDefault();
        const sweepRange = 120;
        const seekOffset = (deltaX / containerWidth) * sweepRange;
        const targetTime = Math.max(0, Math.min(durationRef.current, startSeekTimeRef.current + seekOffset));
        setHorizontalSeekTime(targetTime);
      } 
      else if (touchTypeRef.current === 'swipe_y') {
        if (e.cancelable) e.preventDefault();
        const dragFraction = deltaY / (containerHeight * 0.6);
        const isLeft = startXRef.current < containerWidth / 2;

        if (isLeft) {
          const nextBrightness = Math.max(0.0, Math.min(1.0, startBrightnessRef.current + dragFraction));
          if (Math.abs(nextBrightness - lastBrightnessVal) >= 0.01) {
            lastBrightnessVal = nextBrightness;
            setBrightness(nextBrightness);
            if (Capacitor.isNativePlatform()) {
              NativeStreamingEngine.setDeviceBrightness({ brightness: nextBrightness }).catch(() => {});
            }
          }
          setActiveSlider('brightness');
        } else {
          const nextVolume = Math.max(0.0, Math.min(1.0, startVolumeRef.current + dragFraction));
          if (Math.abs(nextVolume - lastVolumeVal) >= 0.01) {
            lastVolumeVal = nextVolume;
            setVolume(nextVolume);
            if (videoRef.current) {
              videoRef.current.volume = Capacitor.isNativePlatform() ? 1.0 : nextVolume;
            }
            if (Capacitor.isNativePlatform()) {
              NativeStreamingEngine.setDeviceVolume({ volume: nextVolume }).catch(() => {});
            }
          }
          setActiveSlider('volume');
        }

        if (sliderTimeoutRef.current) clearTimeout(sliderTimeoutRef.current);
        sliderTimeoutRef.current = setTimeout(() => {
          setActiveSlider(null);
        }, 1500);
      }
    };

    const handleNativeTouchEnd = (e: TouchEvent) => {
      lastTouchTimeRef.current = Date.now();

      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (isHoldingSpeedRef.current) {
        if (videoRef.current) {
          videoRef.current.playbackRate = originalSpeedRef.current;
        }
        isHoldingSpeedRef.current = false;
        setIsHoldingSpeed(false);
        touchTypeRef.current = 'none';
        if (e.cancelable) e.preventDefault();
        return;
      }

      const target = e.target as HTMLElement;
      if (showSettingsRef.current || (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'BUTTON' || 
        target.tagName === 'SELECT' || 
        target.closest('button') || 
        target.closest('input') || 
        target.closest('select') ||
        target.closest('[data-scrubber]')
      ))) {
        touchTypeRef.current = 'none';
        return;
      }

      if (isLockedRef.current) return;

      // Prevent simulated mouse click events on touch devices for general gestures
      if (e.cancelable) e.preventDefault();

      if (touchTypeRef.current === 'pinch') {
        setTimeout(() => setShowZoomBadge(false), 1500);
        touchTypeRef.current = 'none';
        return;
      }

      if (touchTypeRef.current === 'swipe_x') {
        if (horizontalSeekTimeRef.current !== null) {
          if (castConnectedRef.current && remotePlayerControllerRef.current) {
            remotePlayerRef.current.currentTime = horizontalSeekTimeRef.current;
            remotePlayerControllerRef.current.seek();
          } else if (videoRef.current) {
            videoRef.current.currentTime = horizontalSeekTimeRef.current;
          }
          setCurrentTime(horizontalSeekTimeRef.current);
          setHorizontalSeekTime(null);
        }
        touchTypeRef.current = 'none';
        return;
      }

      if (touchTypeRef.current === 'swipe_y') {
        touchTypeRef.current = 'none';
        return;
      }

      if (touchTypeRef.current === 'tap') {
        const now = Date.now();
        const containerWidth = container.clientWidth || window.innerWidth;
        const x = startXRef.current;
        const isLeft = x < containerWidth * 0.4;
        const isRight = x > containerWidth * 0.6;

        if (now - lastTapTimeRef.current < 300) {
          if (isLeft) {
            handleRewindRef.current();
          } else if (isRight) {
            handleForwardRef.current();
          }
          lastTapTimeRef.current = 0;
        } else {
          lastTapTimeRef.current = now;
          setTimeout(() => {
            if (lastTapTimeRef.current === now) {
              toggleControlsVisibilityRef.current();
              lastTapTimeRef.current = 0;
            }
          }, 300);
        }
      }

      touchTypeRef.current = 'none';
    };

    container.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    container.addEventListener('touchend', handleNativeTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleNativeTouchStart);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      container.removeEventListener('touchend', handleNativeTouchEnd);
    };
  }, []);

  return {
    isLocked,
    setIsLocked,
    showUnlockIndicator,
    setShowUnlockIndicator,
    brightness,
    setBrightness,
    volume,
    setVolume,
    activeSlider,
    setActiveSlider,
    aspectRatio,
    setAspectRatio,
    zoomScale,
    setZoomScale,
    showZoomBadge,
    setShowZoomBadge,
    horizontalSeekTime,
    setHorizontalSeekTime,
    isFullscreen,
    setIsFullscreen,
    rippleLeft,
    setRippleLeft,
    rippleRight,
    setRippleRight,
    lastTouchTimeRef,
    handleLockedScreenTap,
    isHoldingSpeed
  };
}
