import React, { useState, useEffect, useCallback } from 'react';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';
import { getTrending, getMovieVideos, getBackdropUrl } from '../../../services/tmdb';
import { getPosterUrl } from '../../../utils/images';
import { supabase } from '../../../services/supabase';
import { isTVMode } from '../../../utils/tv';
import { t } from '../../../utils/i18n';

interface LoginPageProps {
  onLogin: () => void;
  onContinueAsGuest: () => void;
  prefetchedPosters?: string[];
}

const FALLBACK_POSTERS = [
    '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    '/ow3wq89wM8qd5X7hFZkIyCKTX4X.jpg',
    '/1e1t5a712y08Z8PjVP8lI94pS.jpg',
    '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
    '/lfRkUr7DYdHldAqi3PwdQGBRBPM.jpg',
    '/rCzpDGLbOoPwLjy3OAm5NUPOtrC.jpg',
    '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg',
    '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
];

export default function LoginPage({ onLogin, onContinueAsGuest, prefetchedPosters = [] }: LoginPageProps) {
  const isSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 760;
  const isSmallWidth = typeof window !== 'undefined' && window.innerWidth <= 380;
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [backgroundPosters, setBackgroundPosters] = useState<string[]>(prefetchedPosters);
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  
  const [mountTrailer, setMountTrailer] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerMovie, setTrailerMovie] = useState<any>(null);

  // Consolidated background posters and movie trailer prefetch effect
  useEffect(() => {
    const fetchData = async () => {
      try {
        const movies = await getTrending('week');
        if (movies && movies.length > 0) {
          // Set background posters if not already prefetched
          if (backgroundPosters.length === 0) {
            const paths = movies.map(m => m.posterPath).filter(Boolean) as string[];
            setBackgroundPosters([...paths, ...paths, ...paths, ...paths]);
          }

          // Pick random movie trailer
          const validMovies = movies.filter(m => m.backdropPath && m.overview);
          const pool = validMovies.length > 0 ? validMovies : movies;
          const randomMovie = pool[Math.floor(Math.random() * pool.length)];
          setTrailerMovie(randomMovie);
          
          const videos = await getMovieVideos(randomMovie.id);
          if (videos && videos.length > 0) {
            const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') || 
                            videos.find(v => v.site === 'YouTube');
            if (trailer) {
              setTrailerKey(trailer.key);
            }
          }
        } else if (backgroundPosters.length === 0) {
          setBackgroundPosters(FALLBACK_POSTERS);
        }
      } catch (e) {
        console.error('Failed to prefetch login details:', e);
        if (backgroundPosters.length === 0) {
          setBackgroundPosters(FALLBACK_POSTERS);
        }
      }
    };
    fetchData();
  }, []);

  // Delay YouTube iframe loading to prevent startup layout jank
  useEffect(() => {
    if (trailerKey) {
      const timer = setTimeout(() => {
        setMountTrailer(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [trailerKey]);

  useEffect(() => {
    if (!isTVMode()) return;
    const timer = setTimeout(() => {
      const firstFocusable = document.querySelector<HTMLElement>('.login-input-optimized');
      firstFocusable?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [isRegistering, isForgotPassword]);

  // Memoized action handlers to avoid component construction overhead and trigger lags on tap
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
      setMessage('Password reset email sent! Check your inbox (check Spam folder and click "Looks safe" / "Not Spam" if needed).');
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

      console.log("[LoginPage] Google OAuth using redirect URL:", redirectTo);

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

  const handleTelegramClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
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
      console.warn('Capacitor check failed, using web fallback');
    }
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = url;
    }
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      overflow: 'hidden',
      background: 'var(--bg-primary, #040405)',
    }}>
      
      <StaticStyles />
      
      <BackgroundCards posters={backgroundPosters.length > 0 ? backgroundPosters : FALLBACK_POSTERS} />
      
      {/* Vignette Overlay fading from left-to-right into OLED Black */}
      <div className="login-vignette" style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(to right, rgba(var(--bg-primary-rgb, 10,10,10),0.1) 0%, rgba(var(--bg-primary-rgb, 10,10,10),0.5) 40%, var(--bg-primary, #040405) 85%)',
      }} />

      {/* Top-Left Logo Overlay */}
      <div className="login-logo" style={{
        position: 'absolute',
        top: isSmallHeight ? '12px' : '24px',
        left: isSmallHeight ? '16px' : '24px',
        zIndex: 100,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <img
          className="login-logo-img"
          src="/cinemovie-logo.png"
          alt="Cinemovie"
          style={{
            height: isSmallHeight ? '70px' : '90px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Main Container: Split Widescreen Row */}
      <div
        className="login-container"
        style={{
          position: 'relative', zIndex: 10, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', paddingLeft: '8%', paddingRight: '8%',
        }}
      >
        {/* Left Side: Logo and Sign-In Card */}
        <div className="login-left-side" style={{
          width: '100%', maxWidth: '440px',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        }}>
          {/* Premium Netflix-style Black Login Card */}
          <div className="login-card-content" style={{
            width: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: isSmallHeight ? '1.25rem 1rem' : '2rem 1.5rem',
            borderRadius: '16px',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            marginTop: '0px',
            position: 'relative',
            zIndex: 2,
          }}>
            <h2 key={isForgotPassword ? 'forgot' : isRegistering ? 'register' : 'signin'} className="animate-subtle" style={{
              color: '#ffffff',
              fontSize: '2rem',
              fontWeight: 800,
              marginBottom: isSmallHeight ? '1.5rem' : '2.2rem',
              textAlign: 'left',
              letterSpacing: '-0.5px'
            }}>
              {isForgotPassword ? t('reset_password') : isRegistering ? t('create_account') : t('sign_in')}
            </h2>

            {error && (
              <div style={{
                width: '100%', background: 'rgba(255, 71, 87, 0.15)', color: '#ff6b6b',
                padding: '14px', borderRadius: '8px', textAlign: 'center',
                fontSize: '0.88rem', fontWeight: 600, marginBottom: '1.5rem',
                border: '1px solid rgba(255, 71, 87, 0.25)',
              }}>{error}</div>
            )}
            {message && (
              <div style={{
                width: '100%', background: 'rgba(46, 213, 115, 0.15)', color: '#2ed573',
                padding: '14px', borderRadius: '8px', textAlign: 'center',
                fontSize: '0.88rem', fontWeight: 600, marginBottom: '1.5rem',
                border: '1px solid rgba(46, 213, 115, 0.25)',
              }}>{message}</div>
            )}

            {isForgotPassword ? (
              <form onSubmit={handleForgotPassword} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: isSmallHeight ? '0.8rem' : '1.2rem' }}>
                <GlassInput
                  type="email" value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError(''); setMessage(''); }}
                  placeholder={t('email_address')}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="login-btn-submit tv-focusable"
                  tabIndex={0}
                  style={{
                    background: '#ffffff', color: '#000000', border: 'none',
                    borderRadius: '8px', padding: isSmallHeight ? '14px' : '16px', fontSize: '1.1rem',
                    fontWeight: 800, cursor: isLoading ? 'wait' : 'pointer',
                    marginTop: '1rem',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)', width: '100%',
                  }}
                >
                  {isLoading ? t('sending') : t('send_reset_link')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAuth} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: isSmallHeight ? '0.8rem' : '1.2rem' }}>
                <div className={`form-field-transition ${isRegistering ? 'show' : ''}`} style={{ width: '100%' }}>
                  <div style={{ paddingBottom: isSmallHeight ? '0.8rem' : '1.2rem' }}>
                    <GlassInput
                      type="text" value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setError(''); setMessage(''); }}
                      placeholder={t('full_name')}
                      disabled={!isRegistering}
                    />
                  </div>
                </div>
                <GlassInput
                  type="email" value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError(''); setMessage(''); }}
                  placeholder={t('email_address')}
                />
                <GlassInput
                  type="password" value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError(''); setMessage(''); }}
                  placeholder={t('password')}
                />

                {!isRegistering && (
                  <span 
                    onClick={() => { triggerHaptic('light'); setIsForgotPassword(true); setError(''); setMessage(''); }}
                    style={{
                      color: 'rgba(255,255,255,0.45)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      alignSelf: 'flex-end',
                      marginTop: '-4px',
                      textDecoration: 'underline'
                    }}
                  >
                    {t('forgot_password')}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="login-btn-submit tv-focusable"
                  tabIndex={0}
                  style={{
                    background: '#ffffff', color: '#000000', border: 'none',
                    borderRadius: '8px', padding: isSmallHeight ? '14px' : '16px', fontSize: '1.1rem',
                    fontWeight: 800, cursor: isLoading ? 'wait' : 'pointer',
                    marginTop: '0.5rem',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)', width: '100%',
                  }}
                >
                  <span key={isRegistering ? 'register' : 'signin'} className="animate-subtle" style={{ display: 'block' }}>
                    {isLoading ? (isRegistering ? t('creating') : t('signing_in')) : (isRegistering ? t('create_account') : t('sign_in'))}
                  </span>
                </button>
              </form>
            )}

            {/* Secondary Actions Block (Google & Guest) */}
            {!isRegistering && !isForgotPassword && (
              <div className="login-secondary-actions" style={{
                marginTop: '1.25rem',
                display: 'flex',
                gap: '10px',
                width: '100%'
              }}>
                {/* Google Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: isSmallHeight ? '14px 8px' : '12px 8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
                  className="tv-login-guest-btn tv-focusable"
                  tabIndex={0}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    padding: isSmallHeight ? '14px 8px' : '12px 8px',
                    borderRadius: '8px',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                >
                  {t('continue_as_guest')}
                </button>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span 
                  onClick={() => {
                    triggerHaptic('light');
                    if (isForgotPassword) {
                      setIsForgotPassword(false);
                    } else {
                      setIsRegistering(!isRegistering);
                    }
                    setError('');
                    setMessage('');
                  }}
                  className="tv-focusable"
                  tabIndex={0}
                  style={{ color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', fontSize: '0.82rem', transition: 'all 0.2s ease', display: 'inline-block' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'}
                >
                  {isForgotPassword ? t('back_to_sign_in') : isRegistering ? t('already_have_account') : t('new_to_app')}
                </span>

                <a
                  href="https://t.me/CinemovieApp"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleTelegramClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    color: '#0088cc',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.52-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.88 7.97-3.45 3.79-1.63 4.57-1.91 5.09-1.92.11 0 .37.03.54.17.14.12.18.28.2.43-.02.07-.02.13-.02.2z"/>
                  </svg>
                  {t('join_telegram')}
                </a>
              </div>
            </div>
          </div>
        </div>

        <PreviewPanel trailerKey={trailerKey} trailerMovie={trailerMovie} mountTrailer={mountTrailer} />
      </div>

      {/* Guest Mode Warning Confirmation Drawer */}
      {showGuestWarning && (
        <div style={{
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
                <span>{t('guest_warning_stats')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#eab308', fontWeight: 900 }}>⚠</span>
                <span>{t('guest_warning_watchlist')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
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
                  cursor: 'pointer'
                }}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
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
                  boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)'
                }}
              >
                {t('enter_as_guest')}
              </button>
            </div>
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
    @keyframes slideUpPanel {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-subtle {
      animation: fadeInUpSubtle 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .form-field-transition {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    }
    .form-field-transition.show {
      max-height: 80px;
      opacity: 1;
    }
    .tv-focusable {
      transition: transform 0.1s ease;
    }


    /* ── Desktop / Tablet (>768px) ── */
    @media (min-width: 769px) {
      .login-container {
        display: flex !important;
      }
    }

    /* ── Mobile (<= 768px) ── */
    @media (max-width: 768px) {
      .login-container {
        flex-direction: column !important;
        padding-left: 1.5rem !important;
        padding-right: 1.5rem !important;
        justify-content: center !important;
        align-items: center !important;
        display: flex !important;
      }
      .login-left-side {
        width: 100% !important;
        max-width: 360px !important;
        align-items: center !important;
      }
      .login-logo {
        margin-bottom: 0.5rem !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        height: auto !important;
        position: relative !important;
      }
      .login-logo-img {
        height: 75px !important;
        margin-left: 0 !important;
        position: static !important;
        pointer-events: none !important;
        user-select: none !important;
      }
      .login-card-content {
        padding: 0 !important;
        margin-top: 0 !important;
        width: 100% !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        backdrop-filter: none !important;
        WebkitBackdrop-filter: none !important;
        border: none !important;
      }
      .login-card-content h2 {
        font-size: 1.6rem !important;
        margin-bottom: 1.5rem !important;
        text-align: center !important;
      }
      .login-preview-panel {
        display: none !important;
      }
      .login-bg-cards {
        display: flex !important;
        width: 100% !important;
        left: 0 !important;
        opacity: 0.25 !important;
        transform: rotate(-3deg) scale(1.02) !important;
      }
      .login-vignette {
        background: radial-gradient(circle at center, rgba(4, 4, 5, 0.4) 0%, #040405 95%) !important;
      }
    }

    /* ── Mobile Short / Narrow Screens (e.g. 360x750 baseline) ── */
    @media (max-width: 400px), (max-height: 760px) {
      .login-logo-img {
        height: 48px !important;
      }
      .login-card-content h2 {
        font-size: 1.15rem !important;
        margin-bottom: 0.6rem !important;
        text-align: center !important;
      }
      .login-card-content input {
        padding: 9px 12px !important;
        font-size: 0.8rem !important;
      }
      .login-card-content form {
        gap: 0.55rem !important;
      }
      .login-btn-submit {
        padding: 9px !important;
        font-size: 0.85rem !important;
        margin-top: 0.15rem !important;
      }
      
      /* Make Google Sign-in and Continue as Guest buttons and text very compact */
      .login-card-content button[type="button"],
      .tv-login-guest-btn {
        padding: 9px 6px !important;
        font-size: 0.76rem !important;
      }
      .login-card-content button[type="button"] span,
      .tv-login-guest-btn span {
        font-size: 0.76rem !important;
      }
      .login-card-content button[type="button"] svg {
        width: 14px !important;
        height: 14px !important;
      }

      /* Forgot password and toggle/Telegram links */
      .login-card-content span[onClick],
      .login-card-content span.tv-focusable {
        font-size: 0.74rem !important;
      }

      /* Stack links and social blocks closer together */
      .login-card-content div[style*="marginTop: '1.5rem'"],
      .login-card-content div[style*="marginTop: '2rem'"] {
        margin-top: 0.65rem !important;
        gap: 0.4rem !important;
      }
      
      /* Adjust Telegram link height & padding */
      .login-card-content a[href*="t.me"] {
        font-size: 0.74rem !important;
        gap: 3px !important;
      }
      .login-card-content a[href*="t.me"] svg {
        width: 12px !important;
        height: 12px !important;
      }
    }
  `}</style>
));
StaticStyles.displayName = 'StaticStyles';


const BackgroundCards = React.memo(({ posters }: { posters: string[] }) => {
  const numColumns = 4;
  // Cap at 60 posters (was 180+) — enough for seamless looping across 4 columns.
  // Each column gets 15 posters × 2 (doubled for infinite scroll) = 30 DOM nodes per column.
  let richPosters = [...posters];
  while (richPosters.length < 60) {
    richPosters = [...richPosters, ...posters];
  }
  const finalPosters = richPosters.slice(0, 60);
  const columns = Array.from({ length: numColumns }, (_, colIdx) =>
    finalPosters.filter((_, imgIdx) => imgIdx % numColumns === colIdx)
  );

  return (
    <div className="login-bg-cards" style={{
      position: 'absolute',
      top: '-15%', left: '2%',
      width: '65%', height: '130%',
      display: 'flex',
      gap: '20px',
      justifyContent: 'flex-start',
      transform: 'rotate(-6deg) scale(1.05)',
      opacity: 0.75,
      zIndex: 0,
      filter: 'brightness(0.55) contrast(1.15) blur(1px)',
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {columns.map((columnPosters, colIdx) => {
        const doublePosters = [...columnPosters, ...columnPosters];
        const isEven = colIdx % 2 === 0;
        const animationName = isEven ? 'scrollUp' : 'scrollDown';
        const animationDuration = `${80 + (colIdx * 12)}s`;
        return (
          <div key={colIdx} style={{
            display: 'flex', flexDirection: 'column', gap: '20px',
            width: '170px', flexShrink: 0,
            animation: `${animationName} ${animationDuration} linear infinite`,
            // GPU-composited animation — no layout/paint cost
            willChange: 'transform',
          }}>
            {doublePosters.map((path, imgIdx) => (
              <div key={imgIdx} style={{
                width: '170px', height: '255px', borderRadius: '14px', overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#121214', flexShrink: 0,
              }}>
                <img
                  src={getPosterUrl(path, 'medium')}
                  alt=""
                  // First 2 imgs per column (above-fold) load eagerly; rest are lazy.
                  // This prevents 100+ network requests from firing simultaneously.
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

const PreviewPanel = React.memo(({ trailerKey, trailerMovie, mountTrailer }: { trailerKey: string; trailerMovie: any; mountTrailer: boolean }) => {
  return (
    <div className="login-preview-panel" style={{
      flex: 1,
      maxWidth: '560px',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      marginLeft: '4rem',
      animation: 'fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
    }}>
      {/* YouTube Video Frame */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95)',
        background: '#0a0a0c',
      }}>
        {trailerKey && mountTrailer ? (
          <iframe
            title="Movie Preview"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&rel=0&modestbranding=1&iv_load_policy=3&showinfo=0&disablekb=1`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            allow="autoplay; encrypted-media"
          />
        ) : trailerMovie?.backdropPath ? (
          <img
            src={getBackdropUrl(trailerMovie.backdropPath, 'large')}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '30px', height: '30px', border: '3px solid #333', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>

      {/* Movie Metadata Details */}
      {trailerMovie && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 900,
              padding: '4px 10px',
              borderRadius: '6px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              {t('trending_preview')}
            </span>
            {trailerMovie.releaseDate && (
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem', fontWeight: 600 }}>
                {new Date(trailerMovie.releaseDate).getFullYear()}
              </span>
            )}
          </div>
          <h3 style={{
            color: '#ffffff',
            fontSize: '1.6rem',
            fontWeight: 900,
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            {trailerMovie.title}
          </h3>
          <p style={{
            color: 'rgba(255, 255, 255, 0.65)',
            fontSize: '0.95rem',
            lineHeight: '1.5',
            margin: 0,
          }}>
            {trailerMovie.overview && trailerMovie.overview.length > 180
              ? `${trailerMovie.overview.slice(0, 180)}...`
              : trailerMovie.overview}
          </p>
        </div>
      )}
    </div>
  );
});
PreviewPanel.displayName = 'PreviewPanel';


function GlassInput({ type, value, onChange, placeholder, ...props }: any) {
  const [isFocused, setIsFocused] = useState(false);
  const isSmallHeight = typeof window !== 'undefined' && window.innerHeight <= 760;
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="login-input-optimized tv-focusable"
      tabIndex={0}
      style={{
        width: '100%',
        padding: isSmallHeight ? '14px 18px' : '16px 20px',
        borderRadius: '8px',
        border: isFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(255, 255, 255, 0.03)',
        color: '#ffffff',
        fontSize: '1rem',
        fontWeight: 500,
        outline: 'none',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: isFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
      }}
      {...props}
    />
  );
}
