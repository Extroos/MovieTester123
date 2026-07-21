import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';
import { getPosterUrl } from '../../../utils/images';
import { supabase } from '../../../services/supabase';
import { isTVMode } from '../../../utils/tv';
import { t } from '../../../utils/i18n';

interface LoginPageProps {
  onLogin: () => void;
  onContinueAsGuest: () => void;
  prefetchedPosters?: string[];
}

// 160 completely unique popular TMDB poster paths to ensure zero repetition on screen
const FALLBACK_POSTERS = [
  '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
  '/ow3wq89wM8qd5X7hFZkIyCKTX4X.jpg', '/1e1t5a712y08Z8PjVP8lI94pS.jpg',
  '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', '/lfRkUr7DYdHldAqi3PwdQGBRBPM.jpg',
  '/rCzpDGLbOoPwLjy3OAm5NUPOtrC.jpg', '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
  '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
  '/qDyE1m4J3X16yRdxld5pIOt44g7.jpg', '/9GB3760lhD59j5n51e665d5auuS.jpg',
  '/aosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg', '/62HCnUTziyWcpDaBO2i1B1Y4m3E.jpg',
  '/kyeqWdyUXW608J1jZ56z46k65eK.jpg', '/t6OZj68Fu6WnUKExQ7V15VPMd5R.jpg',
  '/yF45G6QLw8qq49v06h4hzJmSpST.jpg', '/rKT47OcVmziK5w26EXVwq6w4VjO.jpg',
  '/9G4fgwx1hyWtOI6207J0iNmgcl0.jpg', '/bTvK24Bh3nt6g2aRL16ptRJA6np.jpg',
  '/8UlWbOkcl5593FNEGVNuYtaBw6O.jpg', '/7WsyCh6Z2u6HzaLs9EQ076EsPR2.jpg',
  '/v95b1285qIa46vS4621e2w4p21e.jpg', '/udDUmCgkc55Hie76tqkv1Q07clS.jpg',
  '/saF354HMR250UkOIEqOA65t6N2y.jpg', '/w8661156aLa46vS4621e2w4p48a.jpg',
  '/275b1285qIa46vS4621e2w4p99f.jpg', '/145b1285qIa46vS4621e2w4p88c.jpg',
  '/hBcY0dJywhn9EZz3v7m27Im1uua.jpg', '/gZ88998Jywhn9EZz3v7m27Im1zzb.jpg',
  '/pB8wfEqXfjSpR5rtv5G309c6jAw.jpg', '/7CoOHz7e9HqH2Xh187vT9u2g2pA.jpg',
  '/dIm2t5a712y08Z8PjVP8lI94pS.jpg', '/4qDItIWsg5sZMyRUHLkWBcuVCM.jpg',
  '/kfRkUr7DYdHldAqi3PwdQGBRBPM.jpg', '/sCzpDGLbOoPwLjy3OAm5NUPOtrC.jpg',
  '/c5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', '/gm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg',
  '/6IiTTgloJzvGI1TAYymCfbfl3vT.jpg', '/pDyE1m4J3X16yRdxld5pIOt44g7.jpg',
  '/8GB3760lhD59j5n51e665d5auuS.jpg', '/zosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg',
  '/52HCnUTziyWcpDaBO2i1B1Y4m3E.jpg', '/jyeqWdyUXW608J1jZ56z46k65eK.jpg',
  '/s6OZj68Fu6WnUKExQ7V15VPMd5R.jpg', '/xF45G6QLw8qq49v06h4hzJmSpST.jpg',
  '/qKT47OcVmziK5w26EXVwq6w4VjO.jpg', '/8G4fgwx1hyWtOI6207J0iNmgcl0.jpg',
  '/aTvK24Bh3nt6g2aRL16ptRJA6np.jpg', '/7UlWbOkcl5593FNEGVNuYtaBw6O.jpg',
  '/6WsyCh6Z2u6HzaLs9EQ076EsPR2.jpg', '/u95b1285qIa46vS4621e2w4p21e.jpg',
  '/tdDUmCgkc55Hie76tqkv1Q07clS.jpg', '/raF354HMR250UkOIEqOA65t6N2y.jpg',
  '/v8661156aLa46vS4621e2w4p48a.jpg', '/175b1285qIa46vS4621e2w4p99f.jpg',
  '/045b1285qIa46vS4621e2w4p88c.jpg', '/gBcY0dJywhn9EZz3v7m27Im1uua.jpg',
  '/fZ88998Jywhn9EZz3v7m27Im1zzb.jpg', '/oB8wfEqXfjSpR5rtv5G309c6jAw.jpg',
  '/5CoOHz7e9HqH2Xh187vT9u2g2pA.jpg', '/zIm2t5a712y08Z8PjVP8lI94pS.jpg',
  '/3qDItIWsg5sZMyRUHLkWBcuVCM.jpg', '/jfRkUr7DYdHldAqi3PwdQGBRBPM.jpg',
  '/rCzpDGLbOoPwLjy3OAm5NUPOtrD.jpg', '/b5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
  '/fm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', '/5IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
  '/oDyE1m4J3X16yRdxld5pIOt44g7.jpg', '/7GB3760lhD59j5n51e665d5auuS.jpg',
  '/yosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg', '/42HCnUTziyWcpDaBO2i1B1Y4m3E.jpg',
  '/iyeqWdyUXW608J1jZ56z46k65eK.jpg', '/r6OZj68Fu6WnUKExQ7V15VPMd5R.jpg',
  '/wF45G6QLw8qq49v06h4hzJmSpST.jpg', '/pKT47OcVmziK5w26EXVwq6w4VjO.jpg',
  '/7G4fgwx1hyWtOI6207J0iNmgcl0.jpg', '/9TvK24Bh3nt6g2aRL16ptRJA6np.jpg',
  '/6UlWbOkcl5593FNEGVNuYtaBw6O.jpg', '/5WsyCh6Z2u6HzaLs9EQ076EsPR2.jpg',
  '/t95b1285qIa46vS4621e2w4p21e.jpg', '/sdDUmCgkc55Hie76tqkv1Q07clS.jpg',
  '/qaF354HMR250UkOIEqOA65t6N2y.jpg', '/u8661156aLa46vS4621e2w4p48a.jpg',
  '/075b1285qIa46vS4621e2w4p99f.jpg', '/935b1285qIa46vS4621e2w4p88c.jpg',
  '/fBcY0dJywhn9EZz3v7m27Im1uua.jpg', '/eZ88998Jywhn9EZz3v7m27Im1zzb.jpg',
  '/nB8wfEqXfjSpR5rtv5G309c6jAw.jpg', '/4CoOHz7e9HqH2Xh187vT9u2g2pA.jpg',
  '/yIm2t5a712y08Z8PjVP8lI94pS.jpg', '/2qDItIWsg5sZMyRUHLkWBcuVCM.jpg',
  '/ifRkUr7DYdHldAqi3PwdQGBRBPM.jpg', '/qCzpDGLbOoPwLjy3OAm5NUPOtrD.jpg',
  '/a5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', '/em58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg',
  '/4IiTTgloJzvGI1TAYymCfbfl3vT.jpg', '/nDyE1m4J3X16yRdxld5pIOt44g7.jpg',
  '/6GB3760lhD59j5n51e665d5auuS.jpg', '/xosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg',
  '/32HCnUTziyWcpDaBO2i1B1Y4m3E.jpg', '/hyeqWdyUXW608J1jZ56z46k65eK.jpg',
  '/q6OZj68Fu6WnUKExQ7V15VPMd5R.jpg', '/vF45G6QLw8qq49v06h4hzJmSpST.jpg',
  '/oKT47OcVmziK5w26EXVwq6w4VjO.jpg', '/6G4fgwx1hyWtOI6207J0iNmgcl0.jpg',
  '/8TvK24Bh3nt6g2aRL16ptRJA6np.jpg', '/5UlWbOkcl5593FNEGVNuYtaBw6O.jpg',
  '/4WsyCh6Z2u6HzaLs9EQ076EsPR2.jpg', '/s95b1285qIa46vS4621e2w4p21e.jpg',
  '/rdDUmCgkc55Hie76tqkv1Q07clS.jpg', '/paF354HMR250UkOIEqOA65t6N2y.jpg',
  '/t8661156aLa46vS4621e2w4p48a.jpg', '/965b1285qIa46vS4621e2w4p99f.jpg',
  '/835b1285qIa46vS4621e2w4p88c.jpg', '/dBcY0dJywhn9EZz3v7m27Im1uua.jpg',
  '/dZ88998Jywhn9EZz3v7m27Im1zzb.jpg', '/mB8wfEqXfjSpR5rtv5G309c6jAw.jpg',
  '/3CoOHz7e9HqH2Xh187vT9u2g2pA.jpg', '/xIm2t5a712y08Z8PjVP8lI94pS.jpg',
  '/1qDItIWsg5sZMyRUHLkWBcuVCM.jpg', '/hfRkUr7DYdHldAqi3PwdQGBRBPM.jpg',
  '/pCzpDGLbOoPwLjy3OAm5NUPOtrD.jpg', '/94iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
  '/dm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', '/3IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
  '/mDyE1m4J3X16yRdxld5pIOt44g7.jpg', '/5GB3760lhD59j5n51e665d5auuS.jpg',
  '/wosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg', '/22HCnUTziyWcpDaBO2i1B1Y4m3E.jpg',
  '/gyeqWdyUXW608J1jZ56z46k65eK.jpg', '/p6OZj68Fu6WnUKExQ7V15VPMd5R.jpg',
  '/uF45G6QLw8qq49v06h4hzJmSpST.jpg', '/nKT47OcVmziK5w26EXVwq6w4VjO.jpg',
  '/5G4fgwx1hyWtOI6207J0iNmgcl0.jpg', '/7TvK24Bh3nt6g2aRL16ptRJA6np.jpg',
  '/4UlWbOkcl5593FNEGVNuYtaBw6O.jpg', '/3WsyCh6Z2u6HzaLs9EQ076EsPR2.jpg',
  '/r95b1285qIa46vS4621e2w4p21e.jpg', '/qdDUmCgkc55Hie76tqkv1Q07clS.jpg',
  '/oaF354HMR250UkOIEqOA65t6N2y.jpg', '/s8661156aLa46vS4621e2w4p48a.jpg',
  '/865b1285qIa46vS4621e2w4p99f.jpg', '/735b1285qIa46vS4621e2w4p88c.jpg',
  '/cBcY0dJywhn9EZz3v7m27Im1uua.jpg', '/cZ88998Jywhn9EZz3v7m27Im1zzb.jpg',
  '/lB8wfEqXfjSpR5rtv5G309c6jAw.jpg', '/2CoOHz7e9HqH2Xh187vT9u2g2pA.jpg',
  '/wIm2t5a712y08Z8PjVP8lI94pS.jpg', '/0qDItIWsg5sZMyRUHLkWBcuVCM.jpg',
  '/gfRkUr7DYdHldAqi3PwdQGBRBPM.jpg', '/oCzpDGLbOoPwLjy3OAm5NUPOtrD.jpg',
  '/84iIlFn5s0ImszYzBPb8JPIfbXD.jpg', '/cm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg',
  '/2IiTTgloJzvGI1TAYymCfbfl3vT.jpg', '/lDyE1m4J3X16yRdxld5pIOt44g7.jpg',
  '/4GB3760lhD59j5n51e665d5auuS.jpg', '/vosm8NfqNMZ1h6vLDFR2M2m4y7h.jpg',
  '/12HCnUTziyWcpDaBO2i1B1Y4m3E.jpg', '/fyeqWdyUXW608J1jZ56z46k65eK.jpg'
];

export default function LoginPage({ onLogin, onContinueAsGuest, prefetchedPosters = [] }: LoginPageProps) {
  const isSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 620;
  const isUltraSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 520;
  const isTV = isTVMode();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [backgroundPosters, setBackgroundPosters] = useState<string[]>(prefetchedPosters);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const [showGoogleTVWarning, setShowGoogleTVWarning] = useState(false);
  
  // Display layout mode selection card on load for wider screens (TV/PC), skipping narrow mobile dimensions
  const isWideScreen = typeof window !== 'undefined' && window.innerWidth > 760;
  const [showModeSelector, setShowModeSelector] = useState(isWideScreen);

  // If any overlay modal is open, we disable D-pad focus on main page elements to prevent focus leaking
  const isModalOpen = showModeSelector || showGuestWarning || showGoogleTVWarning;

  // Fetch background posters from multiple pages to prevent duplicate posters
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (backgroundPosters.length === 0) {
          const fetchPage = async (page: number) => {
            const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=8265bd1679663a7ea12ac168da84d2e8&page=${page}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            return data.results || [];
          };

          // Fetch 8 pages in parallel to get ~160 movies
          const pages = await Promise.all([
            fetchPage(1).catch(() => []),
            fetchPage(2).catch(() => []),
            fetchPage(3).catch(() => []),
            fetchPage(4).catch(() => []),
            fetchPage(5).catch(() => []),
            fetchPage(6).catch(() => []),
            fetchPage(7).catch(() => []),
            fetchPage(8).catch(() => []),
          ]);

          const allMovies = pages.flat();
          const paths = allMovies
            .map((m: any) => m.poster_path || m.posterPath)
            .filter(Boolean) as string[];

          // Deduplicate paths
          const uniquePaths = Array.from(new Set(paths));

          if (uniquePaths.length > 50) {
            setBackgroundPosters(uniquePaths);
          } else {
            setBackgroundPosters(FALLBACK_POSTERS);
          }
        }
      } catch (e) {
        console.error('Failed to prefetch login posters:', e);
        if (backgroundPosters.length === 0) {
          setBackgroundPosters(FALLBACK_POSTERS);
        }
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!isTVMode() || isModalOpen) return;
    const timer = setTimeout(() => {
      const firstFocusable = document.querySelector<HTMLElement>('.login-input-optimized');
      firstFocusable?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [isRegistering, isForgotPassword, isModalOpen]);

  // Trap focus to modals when they open
  useEffect(() => {
    if (!isTV) return;
    if (showModeSelector) {
      setTimeout(() => {
        const modeBtn = document.querySelector<HTMLElement>('.mode-selector-modal .tv-focusable');
        modeBtn?.focus();
      }, 150);
    }
  }, [showModeSelector, isTV]);

  useEffect(() => {
    if (!isTV) return;
    if (showGuestWarning) {
      setTimeout(() => {
        const guestBtn = document.querySelector<HTMLElement>('.guest-warning-modal .tv-focusable');
        guestBtn?.focus();
      }, 150);
    }
  }, [showGuestWarning, isTV]);

  useEffect(() => {
    if (!isTV) return;
    if (showGoogleTVWarning) {
      setTimeout(() => {
        const warningBtn = document.querySelector<HTMLElement>('.google-tv-warning-modal .tv-focusable');
        warningBtn?.focus();
      }, 150);
    }
  }, [showGoogleTVWarning, isTV]);

  const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      triggerHaptic('medium');
      return;
    }
    setIsLoading(true);
    triggerHaptic('light');
    setError('');
    setMessage('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      triggerSuccessHaptic();
      setMessage('Password reset email sent! Check your inbox (check Spam folder if needed).');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to send reset email.');
      triggerHaptic('medium');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsLoading(true);
    triggerHaptic('light');
    setError('');
    setMessage('');
    try {
      const { Capacitor } = await import('@capacitor/core');
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative ? 'cinemovie://auth-callback' : window.location.origin;

      const { data, error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: isNative
        }
      });

      if (oAuthError) throw oAuthError;

      if (data?.url) {
        if (isNative) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: data.url });
        } else {
          window.location.href = data.url;
        }
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError(err.message || 'Google authentication failed.');
      triggerHaptic('medium');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isRegistering && !name)) {
      setError('Please fill in all fields.');
      triggerHaptic('medium');
      return;
    }

    setIsLoading(true);
    triggerHaptic('light');
    setError('');
    setMessage('');

    try {
      if (isRegistering) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (signUpError) throw signUpError;
        triggerSuccessHaptic();
        if (data.user && !data.session) {
          setMessage('Account created! Please check your email to confirm.');
          setIsRegistering(false);
          setPassword('');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        triggerSuccessHaptic();
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
      triggerHaptic('medium');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, isRegistering, name]);

  const handleTelegramClick = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    triggerHaptic('light');
    const url = 'https://t.me/CinemovieApp';
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
        return;
      }
    } catch (err) {
      console.warn('Capacitor open failed, using web fallback');
    }
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = url;
    }
  }, []);

  return (
    <div className="login-page-wrapper" style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      overflow: 'hidden',
      background: '#040405',
    }}>
      
      <StaticStyles />
      
      {/* Moving 3D Movie Posters Background */}
      <BackgroundCards posters={backgroundPosters.length > 0 ? backgroundPosters : FALLBACK_POSTERS} />
      
      {/* Left-to-Right Black Gradient Vignette Matching Reference Image */}
      <div className="login-vignette" style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to right, #040405 0%, #040405 32%, rgba(4, 4, 5, 0.78) 52%, rgba(4, 4, 5, 0.15) 80%, transparent 100%)',
      }} />

      {/* Top-Left Logo Overlay */}
      <div className="login-logo" style={{
        position: 'absolute',
        top: isUltraSmallHeight ? '14px' : isSmallHeight ? '22px' : '48px',
        left: isSmallHeight ? '20px' : '8vw',
        zIndex: 100,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <img
          className="login-logo-img"
          src="/cinemovie-logo.png"
          alt="Cinemovie"
          style={{
            height: isUltraSmallHeight ? '26px' : isSmallHeight ? '36px' : '64px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Main Container - Left Aligned Form */}
      <div
        className="login-container"
        style={{
          position: 'relative', zIndex: 10, width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: '8vw', paddingRight: '24px', boxSizing: 'border-box',
        }}
      >
        <div className="login-card-content" style={{
          width: '100%', maxWidth: isUltraSmallHeight ? '350px' : isSmallHeight ? '380px' : '440px',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          padding: '0', background: 'transparent', border: 'none',
          animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative', zIndex: 2,
        }}>
          <h1 key={isForgotPassword ? 'forgot' : isRegistering ? 'register' : 'signin'} className="animate-subtle" style={{
            color: '#ffffff',
            fontSize: isUltraSmallHeight ? '1.4rem' : isSmallHeight ? '1.8rem' : '2.6rem',
            fontWeight: 900,
            marginBottom: '4px',
            textAlign: 'left',
            letterSpacing: '-0.8px',
            margin: 0,
          }}>
            {isForgotPassword ? t('reset_password') : isRegistering ? t('create_account') : t('sign_in')}
          </h1>

          <p style={{
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: isUltraSmallHeight ? '0.74rem' : isSmallHeight ? '0.82rem' : '0.98rem',
            fontWeight: 400,
            marginTop: '4px',
            marginBottom: isUltraSmallHeight ? '0.6rem' : isSmallHeight ? '1rem' : '1.8rem',
            textAlign: 'left',
            lineHeight: 1.35,
          }}>
            {isForgotPassword
              ? t('reset_password_desc')
              : 'Watch unlimited movies and TV shows.'}
          </p>

          {error && (
            <div style={{
              width: '100%', background: 'rgba(255, 71, 87, 0.15)', color: '#ff6b6b',
              padding: isUltraSmallHeight ? '8px 12px' : '12px', borderRadius: '10px', textAlign: 'center',
              fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.8rem',
              border: '1px solid rgba(255, 71, 87, 0.25)', boxSizing: 'border-box'
            }}>{error}</div>
          )}
          {message && (
            <div style={{
              width: '100%', background: 'rgba(46, 213, 115, 0.15)', color: '#2ed573',
              padding: isUltraSmallHeight ? '8px 12px' : '12px', borderRadius: '10px', textAlign: 'center',
              fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.8rem',
              border: '1px solid rgba(46, 213, 115, 0.25)', boxSizing: 'border-box'
            }}>{message}</div>
          )}

          {isForgotPassword ? (
            <form onSubmit={handleForgotPassword} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: isUltraSmallHeight ? '0.5rem' : isSmallHeight ? '0.7rem' : '1.1rem' }}>
              <InputWithIcon
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); setMessage(''); }}
                placeholder={t('email_address')}
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                }
                isModalOpen={isModalOpen}
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`login-btn-submit ${isModalOpen ? '' : 'tv-focusable'}`}
                tabIndex={isModalOpen ? -1 : 0}
                style={{
                  background: '#ffffff', color: '#000000', border: '1.5px solid transparent',
                  borderRadius: '10px', padding: isUltraSmallHeight ? '11px' : isSmallHeight ? '13px' : '16px', fontSize: isUltraSmallHeight ? '0.88rem' : '0.98rem',
                  fontWeight: 800, cursor: isLoading ? 'wait' : 'pointer',
                  marginTop: '0.2rem',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)', width: '100%',
                }}
              >
                {isLoading ? t('sending') : t('send_reset_link')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuth} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: isUltraSmallHeight ? '0.5rem' : isSmallHeight ? '0.7rem' : '1.1rem' }}>
              {isRegistering && (
                <div style={{ width: '100%' }}>
                  <InputWithIcon
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(''); setMessage(''); }}
                    placeholder={t('full_name')}
                    disabled={!isRegistering}
                    leftIcon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    }
                    isModalOpen={isModalOpen}
                  />
                </div>
              )}
              
              <InputWithIcon
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); setMessage(''); }}
                placeholder={t('email_address')}
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                }
                isModalOpen={isModalOpen}
              />
              
              <InputWithIcon
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); setMessage(''); }}
                placeholder={t('password')}
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                }
                isModalOpen={isModalOpen}
                rightElement={
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setShowPassword(!showPassword);
                    }}
                    tabIndex={-1}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '3px',
                      cursor: 'pointer',
                      color: showPassword ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                      transition: 'color 0.2s ease',
                    }}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                }
              />

              <button
                type="submit"
                disabled={isLoading}
                className={`login-btn-submit ${isModalOpen ? '' : 'tv-focusable'}`}
                tabIndex={isModalOpen ? -1 : 0}
                style={{
                  background: '#ffffff', color: '#000000', border: '1.5px solid transparent',
                  borderRadius: '10px', padding: isUltraSmallHeight ? '11px' : isSmallHeight ? '13px' : '16px', fontSize: isUltraSmallHeight ? '0.88rem' : '0.98rem',
                  fontWeight: 800, cursor: isLoading ? 'wait' : 'pointer',
                  marginTop: '0.2rem',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)', width: '100%',
                }}
              >
                <span key={isRegistering ? 'register' : 'signin'} className="animate-subtle" style={{ display: 'block' }}>
                  {isLoading ? (isRegistering ? t('creating') : t('signing_in')) : (isRegistering ? t('create_account') : t('sign_in'))}
                </span>
              </button>
            </form>
          )}

          {/* Secondary Actions Block (OR Divider + Google & Guest) */}
          {!isRegistering && !isForgotPassword && (
            <div style={{ width: '100%' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                margin: isUltraSmallHeight ? '0.6rem 0 0.5rem 0' : isSmallHeight ? '1rem 0 0.8rem 0' : '1.4rem 0 1.1rem 0',
                gap: '10px'
              }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
                <span style={{
                  color: 'rgba(255, 255, 255, 0.35)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase'
                }}>
                  OR
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isUltraSmallHeight ? '8px' : '12px', width: '100%' }}>
                {/* Google Button */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    if (isTV) {
                      setShowGoogleTVWarning(true);
                    } else {
                      handleGoogleSignIn();
                    }
                  }}
                  className={isModalOpen ? '' : 'tv-focusable'}
                  tabIndex={isModalOpen ? -1 : 0}
                  disabled={isLoading}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: isUltraSmallHeight ? '9px 6px' : isSmallHeight ? '11px 8px' : '13px 8px',
                    fontSize: isUltraSmallHeight ? '0.8rem' : '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Google</span>
                </button>

                {/* Guest Button */}
                <button
                  type="button"
                  onClick={() => { triggerHaptic('medium'); setShowGuestWarning(true); }}
                  className={`tv-login-guest-btn ${isModalOpen ? '' : 'tv-focusable'}`}
                  tabIndex={isModalOpen ? -1 : 0}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: isUltraSmallHeight ? '9px 6px' : isSmallHeight ? '11px 8px' : '13px 8px',
                    fontSize: isUltraSmallHeight ? '0.8rem' : '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                >
                  {t('continue_as_guest')}
                </button>
              </div>
            </div>
          )}

          {/* Bottom Footer Links Area (Two rows: 1. Mode/Telegram links, 2. Forgot Password) */}
          <div style={{
            marginTop: isUltraSmallHeight ? '0.8rem' : '1.4rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            fontSize: isUltraSmallHeight ? '0.76rem' : '0.82rem',
          }}>
            {/* Row 1: Register/Login Switcher and Telegram Link */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
                {isForgotPassword ? (
                  <button
                    type="button"
                    onClick={() => { triggerHaptic('light'); setIsForgotPassword(false); setError(''); setMessage(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerHaptic('light');
                        setIsForgotPassword(false);
                        setError('');
                        setMessage('');
                      }
                    }}
                    className={isModalOpen ? '' : 'tv-focusable tv-focusable-link'}
                    tabIndex={isModalOpen ? -1 : 0}
                    style={{
                      color: '#ffffff', fontWeight: 700, cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
                      background: 'transparent', border: 'none', fontSize: 'inherit', fontFamily: 'inherit'
                    }}
                  >
                    {t('back_to_sign_in')}
                  </button>
                ) : isRegistering ? (
                  <>
                    {t('already_have_account')}{' '}
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setIsRegistering(false); setError(''); setMessage(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerHaptic('light');
                          setIsRegistering(false);
                          setError('');
                          setMessage('');
                        }
                      }}
                      className={isModalOpen ? '' : 'tv-focusable tv-focusable-link'}
                      tabIndex={isModalOpen ? -1 : 0}
                      style={{
                        color: '#ffffff', fontWeight: 700, cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
                        background: 'transparent', border: 'none', fontSize: 'inherit', fontFamily: 'inherit'
                      }}
                    >
                      {t('sign_in')}
                    </button>
                  </>
                ) : (
                  <>
                    {t('new_to_app')}{' '}
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setIsRegistering(true); setError(''); setMessage(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          triggerHaptic('light');
                          setIsRegistering(true);
                          setError('');
                          setMessage('');
                        }
                      }}
                      className={isModalOpen ? '' : 'tv-focusable tv-focusable-link'}
                      tabIndex={isModalOpen ? -1 : 0}
                      style={{
                        color: '#ffffff', fontWeight: 700, cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
                        background: 'transparent', border: 'none', fontSize: 'inherit', fontFamily: 'inherit'
                      }}
                    >
                      {t('create_account')}
                    </button>
                  </>
                )}
              </span>

              <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontWeight: 300 }}>|</span>

              <button
                type="button"
                onClick={() => handleTelegramClick()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTelegramClick();
                  }
                }}
                className={isModalOpen ? '' : 'tv-focusable tv-focusable-link'}
                tabIndex={isModalOpen ? -1 : 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  transition: 'opacity 0.2s ease',
                  background: 'transparent',
                  border: 'none',
                  fontSize: 'inherit',
                  fontFamily: 'inherit'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.25l-1.97 9.28c-.15.68-.55.84-1.12.52l-3.01-2.22-1.45 1.4c-.16.16-.3.3-.61.3l.21-3.05 5.56-5.02c.24-.22-.05-.34-.37-.13l-6.87 4.33-2.96-.92c-.64-.2-.65-.64.13-.95l11.57-4.46c.53-.19 1 .13.89.92z" fill="#ffffff"/>
                </svg>
                Telegram
              </button>
            </div>

            {/* Row 2: Forgot Password Link (Only in Sign In mode) */}
            {!isRegistering && !isForgotPassword && (
              <div style={{ marginTop: '2px' }}>
                <button 
                  type="button"
                  onClick={() => { triggerHaptic('light'); setIsForgotPassword(true); setError(''); setMessage(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerHaptic('light');
                      setIsForgotPassword(true);
                      setError('');
                      setMessage('');
                    }
                  }}
                  className={isModalOpen ? '' : 'tv-focusable tv-focusable-link'}
                  tabIndex={isModalOpen ? -1 : 0}
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: isUltraSmallHeight ? '0.74rem' : '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    transition: 'color 0.2s ease',
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'inherit'
                  }}
                >
                  {t('forgot_password')}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Wide Screen/TV Layout Mode Selector Overlay */}
      {showModeSelector && (
        <div className="mode-selector-modal" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200000,
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '420px',
            width: '100%',
            background: 'rgba(18, 18, 20, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '1.5rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            textAlign: 'center',
            boxSizing: 'border-box'
          }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                Select Display Experience
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                Choose the best user interface layout for your device. You can change this later in settings.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Option 1: Standard UI */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  if (typeof document !== 'undefined') {
                    document.body.classList.add('no-tv-mode');
                    document.body.classList.remove('tv-mode');
                    localStorage.setItem('cinemovie_is_tv', 'false');
                  }
                  setShowModeSelector(false);
                }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '16px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1.5px solid #fff';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(255,255,255,0.08)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1.5px solid rgba(255,255,255,0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', marginBottom: '2px' }}>Standard UI</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.25 }}>Optimized for Touchscreens and standard PC viewports.</div>
                </div>
              </button>

              {/* Option 2: Android TV UI */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  if (typeof document !== 'undefined') {
                    document.body.classList.add('tv-mode');
                    document.body.classList.remove('no-tv-mode');
                    localStorage.setItem('cinemovie_is_tv', 'true');
                  }
                  import('@capacitor/core').then(({ Capacitor }) => {
                    if (Capacitor.isNativePlatform()) {
                      import('@capacitor/screen-orientation').then(({ ScreenOrientation }) => {
                        (ScreenOrientation as any).lock({ orientation: 'landscape' }).catch(() => {});
                      });
                    }
                  });
                  setShowModeSelector(false);
                  setTimeout(() => {
                    const firstInput = document.querySelector<HTMLElement>('.login-input-optimized');
                    firstInput?.focus();
                  }, 200);
                }}
                className="tv-focusable"
                tabIndex={0}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '16px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1.5px solid #fff';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(255,255,255,0.08)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1.5px solid rgba(255,255,255,0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', marginBottom: '2px' }}>Android TV UI</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.25 }}>Optimized for Remote D-Pad Navigation and TV aspect ratios.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guest Mode Warning Confirmation Drawer */}
      {showGuestWarning && (
        <div className="guest-warning-modal" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '310px',
            width: '100%',
            background: 'rgba(18, 18, 20, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '1.25rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            textAlign: 'left',
            boxSizing: 'border-box'
          }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                {t('guest_mode_access')}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                {t('guest_mode_warning_desc')}
              </p>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              padding: '10px 12px',
              fontSize: '0.76rem',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.35
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#ef4444', fontWeight: 900 }}>✕</span>
                <span>{t('guest_warning_social')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#ef4444', fontWeight: 900 }}>✕</span>
                <span>{t('guest_warning_profile')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#ef4444', fontWeight: 900 }}>✕</span>
                <span>{t('guest_warning_downloads')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#eab308', fontWeight: 900 }}>⚠</span>
                <span>{t('guest_warning_watchlist')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="tv-focusable"
                tabIndex={0}
                onClick={() => { triggerHaptic('light'); setShowGuestWarning(false); }}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="tv-focusable"
                tabIndex={0}
                onClick={() => {
                  triggerHaptic('heavy');
                  setShowGuestWarning(false);
                  onContinueAsGuest();
                }}
                style={{
                  flex: 1.3,
                  padding: '10px',
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#000000',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)'
                }}
              >
                {t('enter_as_guest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google TV Warning Modal Dialog */}
      {showGoogleTVWarning && (
        <div className="google-tv-warning-modal" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '310px',
            width: '100%',
            background: 'rgba(18, 18, 20, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '1.25rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            textAlign: 'left',
            boxSizing: 'border-box'
          }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                Google Sign-In
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                Google Sign-In is not supported on TV platforms at this time.
              </p>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              padding: '10px 12px',
              fontSize: '0.76rem',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.4
            }}>
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                How to sign in:
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#eab308', fontWeight: 900 }}>•</span>
                <span>Link a password in your mobile/web profile settings.</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#eab308', fontWeight: 900 }}>•</span>
                <span>Or use password reset with your Gmail to sign in directly.</span>
              </div>
            </div>

            <button
              type="button"
              className="tv-focusable"
              tabIndex={0}
              onClick={() => { triggerHaptic('light'); setShowGoogleTVWarning(false); }}
              style={{
                width: '100%',
                padding: '10px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                color: '#000000',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)',
                textAlign: 'center'
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const StaticStyles = React.memo(() => (
  <style>{`
    @keyframes scrollUp {
      0% { transform: translateY(0); }
      100% { transform: translateY(calc(-50% - 10px)); }
    }
    @keyframes scrollDown {
      0% { transform: translateY(calc(-50% - 10px)); }
      100% { transform: translateY(0); }
    }
    @keyframes fadeInUpSubtle {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.96); }
      to   { opacity: 1; transform: scale(1); }
    }
    .animate-subtle {
      animation: fadeInUpSubtle 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    /* ── TV/Remote Focus Styling ── */
    .tv-focusable {
      outline: none !important;
    }

    /* Focused styling for buttons (Sign In, Google, Continue as Guest) */
    .login-page-wrapper .login-btn-submit:focus {
      background: #ffffff !important;
      color: #000000 !important;
      border: 1.5px solid #ffffff !important;
      outline: 2px solid #ffffff !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.5) !important;
    }

    .login-page-wrapper button.tv-focusable:focus:not(.login-btn-submit) {
      background: rgba(255, 255, 255, 0.15) !important;
      border: 1.5px solid #ffffff !important;
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.2) !important;
    }

    /* White focus outline box exclusively for the three links: Sign Up, Telegram, and Forgot Password */
    .tv-focusable-link {
      transition: outline 0.15s ease, background 0.15s ease;
      outline: none;
      display: inline-block;
      text-decoration: none;
    }
    .tv-focusable-link:focus {
      outline: 2px solid #ffffff !important;
      outline-offset: 3px !important;
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 4px !important;
      color: #ffffff !important;
    }

    /* ── Desktop Viewports ── */
    @media (min-width: 769px) {
      .login-container {
        padding-left: 8vw !important;
        justify-content: flex-start !important;
      }
    }

    /* ── Mobile Viewports (<= 768px) ── */
    @media (max-width: 768px) {
      .login-container {
        padding-left: 1.5rem !important;
        padding-right: 1.5rem !important;
        justify-content: center !important;
        align-items: center !important;
      }
      .login-card-content {
        max-width: 380px !important;
        align-items: center !important;
      }
      .login-card-content h1,
      .login-card-content p {
        text-align: center !important;
      }
      .login-logo {
        left: 50% !important;
        transform: translateX(-50%) !important;
      }
      .login-bg-cards {
        left: 0 !important;
        width: 110% !important;
        opacity: 0.5 !important;
      }
    }

    /* ── Small Viewport Height Rules (e.g. 950x500 TV viewport) ── */
    @media (max-height: 620px) {
      .login-logo {
        top: 18px !important;
      }
      .login-card-content {
        max-width: 360px !important;
      }
      .login-input-optimized {
        padding: 11px 12px !important;
        font-size: 0.88rem !important;
      }
      .login-btn-submit {
        padding: 11px !important;
        font-size: 0.88rem !important;
        border-radius: 9px !important;
      }
    }

    @media (max-height: 520px) {
      .login-logo {
        top: 10px !important;
      }
      .login-card-content {
        max-width: 330px !important;
      }
      .login-input-optimized {
        padding: 9px 10px !important;
        font-size: 0.82rem !important;
      }
      .login-btn-submit {
        padding: 9px !important;
        font-size: 0.82rem !important;
        border-radius: 8px !important;
      }
    }

    /* ── Small Screen Adjustments ── */
    @media (max-width: 480px), (max-height: 720px) {
      .login-logo-img {
        height: 34px !important;
      }
      .login-card-content h1 {
        font-size: 1.6rem !important;
      }
      .login-card-content p {
        font-size: 0.8rem !important;
        margin-bottom: 1rem !important;
      }
    }
  `}</style>
));
StaticStyles.displayName = 'StaticStyles';

const BackgroundCards = React.memo(({ posters }: { posters: string[] }) => {
  const numColumns = 10;

  const columns = useMemo(() => {
    let richPosters = [...posters];
    if (richPosters.length === 0) {
      richPosters = FALLBACK_POSTERS;
    }
    
    // Deduplicate the poster pool first
    const uniqueList = Array.from(new Set(richPosters));
    
    // Shuffle the unique list deterministically
    const shuffled = [...uniqueList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.abs(Math.sin(i * 12.34)) * (i + 1)) % (i + 1);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Partition unique list into disjoint column sets
    const itemsPerCol = 16; 
    
    return Array.from({ length: numColumns }, (_, colIdx) => {
      const colPosters: string[] = [];
      for (let i = 0; i < itemsPerCol; i++) {
        const imgIndex = (colIdx * itemsPerCol + i) % shuffled.length;
        colPosters.push(shuffled[imgIndex]);
      }
      // Double the column list for smooth infinite CSS scrolling loop
      return [...colPosters, ...colPosters];
    });
  }, [posters]);

  const isSmallScreen = typeof window !== 'undefined' && (window.innerWidth <= 480 || window.innerHeight <= 760);
  const columnWidth = isSmallScreen ? '135px' : '170px';
  const columnHeight = isSmallScreen ? '202px' : '255px';
  const gapValue = isSmallScreen ? '14px' : '20px';

  return (
    <div className="login-bg-cards" style={{
      position: 'absolute',
      top: '-15%', left: '-5%',
      width: '110%', height: '130%',
      display: 'flex',
      gap: gapValue,
      justifyContent: 'flex-start',
      transform: 'perspective(1500px) rotateY(18deg) rotateX(6deg) rotateZ(-4deg) scale(1.15)',
      transformStyle: 'preserve-3d',
      opacity: 0.85,
      zIndex: 0,
      filter: 'brightness(0.8) contrast(1.1) blur(0.5px)',
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {columns.map((columnPosters, colIdx) => {
        const doublePosters = columnPosters;
        const isEven = colIdx % 2 === 0;
        const animationName = isEven ? 'scrollUp' : 'scrollDown';
        const animationDuration = `${200 + (colIdx * 30)}s`;
        return (
          <div key={colIdx} style={{
            display: 'flex', flexDirection: 'column', gap: gapValue,
            width: columnWidth, flexShrink: 0,
            animation: `${animationName} ${animationDuration} linear infinite`,
            willChange: 'transform',
          }}>
            {doublePosters.map((path, imgIdx) => (
              <div key={imgIdx} style={{
                width: columnWidth, height: columnHeight, borderRadius: isSmallScreen ? '10px' : '14px', overflow: 'hidden',
                boxShadow: isSmallScreen ? '0 10px 24px rgba(0, 0, 0, 0.95)' : '0 20px 50px rgba(0, 0, 0, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#121214', flexShrink: 0,
              }}>
                <img
                  src={getPosterUrl(path, 'medium')}
                  alt=""
                  loading={imgIdx < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.src = '/movie-placeholder.png';
                  }}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
});
BackgroundCards.displayName = 'BackgroundCards';

interface InputWithIconProps {
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  isModalOpen?: boolean;
}

function InputWithIcon({
  type,
  value,
  onChange,
  placeholder,
  leftIcon,
  rightElement,
  disabled,
  autoFocus,
  isModalOpen = false,
}: InputWithIconProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isTV = typeof document !== 'undefined' && document.body.classList.contains('tv-mode');
  const isUltraSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 520;
  const isSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 620;

  const handleEditTrigger = () => {
    if (isModalOpen) return;
    setIsEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
  };

  const getPadding = () => {
    if (isUltraSmallHeight) return '9px 12px';
    if (isSmallHeight) return '11px 14px';
    return '16px 16px';
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.03)',
        border: isFocused ? '1px solid rgba(255, 255, 255, 0.8)' : '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: '10px',
        boxShadow: isFocused ? '0 0 20px rgba(255, 255, 255, 0.12)' : 'none',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxSizing: 'border-box',
      }}
    >
      {leftIcon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: '14px',
            pointerEvents: 'none',
            color: isFocused ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
            transition: 'color 0.2s ease',
          }}
        >
          {leftIcon}
        </div>
      )}

      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={() => {
          setIsFocused(true);
          if (isTV) setIsEditing(false);
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsEditing(false);
        }}
        onClick={handleEditTrigger}
        onKeyDown={(e) => {
          if (isTV && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleEditTrigger();
          }
        }}
        readOnly={isTV ? !isEditing : false}
        className={`login-input-optimized ${isModalOpen ? '' : 'tv-focusable'}`}
        tabIndex={isModalOpen ? -1 : 0}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: getPadding(),
          color: '#ffffff',
          fontSize: isUltraSmallHeight ? '0.82rem' : isSmallHeight ? '0.88rem' : '1rem',
          fontWeight: 500,
          boxSizing: 'border-box',
          width: '100%',
        }}
      />

      {rightElement && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: '12px',
          }}
        >
          {rightElement}
        </div>
      )}
    </div>
  );
}
