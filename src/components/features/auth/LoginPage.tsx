import React, { useState, useEffect } from 'react';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';
import { getTrending } from '../../../services/tmdb';
import { getPosterUrl } from '../../../utils/images';
import { supabase } from '../../../services/supabase';

interface LoginPageProps {
  onLogin: () => void;
  prefetchedPosters?: string[];
}

// Fallback high-quality posters if API fails
const FALLBACK_POSTERS = [
    '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', // Shawshank
    '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // Godfather
    '/ow3wq89wM8qd5X7hFZkIyCKTX4X.jpg', // 12 Angry Men
    '/1e1t5a712y08Z8PjVP8lI94pS.jpg', // Godfather II
    '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', // Spirited Away
    '/lfRkUr7DYdHldAqi3PwdQGBRBPM.jpg', // Schindler's List
    '/rCzpDGLbOoPwLjy3OAm5NUPOtrC.jpg', // LOTR Two Towers
    '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', // Pulp Fiction
    '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', // LOTR Return of King
    '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite
];

export default function LoginPage({ onLogin, prefetchedPosters = [] }: LoginPageProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // Success message
  const [backgroundPosters, setBackgroundPosters] = useState<string[]>(prefetchedPosters);

  // Fetch dynamic posters on mount if not already prefetched
  useEffect(() => {
    if (backgroundPosters.length > 0) return;
    const fetchPosters = async () => {
        try {
            const movies = await getTrending('week');
            if (movies && movies.length > 0) {
                // Get poster paths
                const paths = movies.map(m => m.posterPath).filter(Boolean) as string[];
                // Duplicate to fill grid
                setBackgroundPosters([...paths, ...paths, ...paths, ...paths]);
            } else {
                setBackgroundPosters(FALLBACK_POSTERS);
            }
        } catch (e) {
            setBackgroundPosters(FALLBACK_POSTERS);
        }
    };
    fetchPosters();
  }, [backgroundPosters]);

  const handleAuth = async (e: React.FormEvent) => {
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
            // Cloud Sign Up
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name } // Save name to cloud profile
                }
            });
            if (signUpError) throw signUpError;
            
            triggerSuccessHaptic();
            
            // Check if session exists. If not, email confirmation is likely required.
            if (data.user && !data.session) {
                setMessage('Account created! Please check your email to confirm.');
                setIsRegistering(false); // Switch to login view
                setPassword(''); // Clear password for security
            } 
            // If session exists, App.tsx listener handles the login
        } else {
            // Cloud Sign In
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (signInError) throw signInError;
            
            triggerSuccessHaptic();
        }
    } catch (err: any) {
        console.error('Auth error:', err);
        setError(err.message || 'Authentication failed');
        triggerHaptic('medium'); // Error haptic
    } finally {
        setIsLoading(false);
    }
  };

  // Determine which list to use (fallback if state is empty yet)
  const displayPosters = backgroundPosters.length > 0 ? backgroundPosters : FALLBACK_POSTERS;
  
  // Guarantee a very rich pool of posters (at least 180 items) so columns never run short or look cut off
  let richPosters = [...displayPosters];
  while (richPosters.length < 180) {
    richPosters = [...richPosters, ...displayPosters];
  }
  const finalPosters = richPosters;

  // Segment the posters into columns for infinite scrolling
  const numColumns = 6;
  const columns = Array.from({ length: numColumns }, (_, colIdx) => 
    finalPosters.filter((_, imgIdx) => imgIdx % numColumns === colIdx)
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      background: '#040405',
    }}>
      
      {/* Viewport specific responsive override styles */}
      <style>{`
        @keyframes scrollUp {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(-50% - 8px)); }
        }
        @keyframes scrollDown {
          0% { transform: translateY(calc(-50% - 8px)); }
          100% { transform: translateY(0); }
        }
        @media (max-width: 400px), (max-height: 800px) {
          .login-container {
            padding: 1rem 1rem !important;
          }
          .login-logo {
            margin-top: -45px !important;
            margin-bottom: 0px !important;
          }
          .login-logo img {
            height: 290px !important;
          }
          .login-subtitle {
            font-size: 0.82rem !important;
            margin-top: -70px !important;
            margin-bottom: 1.2rem !important;
            text-align: center !important;
          }
          .login-card {
            padding: 24px 18px !important;
            border-radius: 20px !important;
            box-shadow: 0 16px 50px rgba(0, 0, 0, 0.7) !important;
          }
          .login-form {
            gap: 0.9rem !important;
          }
          .login-input {
            padding: 12px 16px !important;
            font-size: 0.88rem !important;
            border-radius: 12px !important;
          }
          .login-btn-submit {
            padding: 12px !important;
            font-size: 0.9rem !important;
            border-radius: 12px !important;
            margin-top: 0.3rem !important;
          }
          .login-toggle {
            margin-top: 1.2rem !important;
          }
          .login-toggle p {
            font-size: 0.78rem !important;
            margin-bottom: 6px !important;
          }
          .login-toggle button {
            padding: 8px 18px !important;
            font-size: 0.78rem !important;
            border-radius: 10px !important;
          }
        }
      `}</style>
      
      {/* 1. Tilted Premium Poster Grid Background with infinite opposing scroll columns */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '-15%',
        width: '130%',
        height: '130%',
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        transform: 'rotate(-10deg) scale(1.05)', 
        opacity: 0.75, 
        zIndex: 0,
        filter: 'brightness(0.38) blur(1.5px)', 
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        {columns.map((columnPosters, colIdx) => {
          // Double up posters to make infinite scroll wrapping seamless
          const doublePosters = [...columnPosters, ...columnPosters];
          const isEven = colIdx % 2 === 0;
          const animationName = isEven ? 'scrollUp' : 'scrollDown';
          // Staggered duration speeds to create a slow, premium cinematic parallax effect
          const animationDuration = `${90 + (colIdx * 15)}s`;
          
          return (
            <div 
              key={colIdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                width: '150px',
                flexShrink: 0,
                animation: `${animationName} ${animationDuration} linear infinite`,
              }}
            >
              {doublePosters.map((path, imgIdx) => (
                <div
                  key={imgIdx}
                  style={{
                    width: '150px',
                    height: '225px',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: '#121214',
                    flexShrink: 0,
                  }}
                >
                  <img 
                    src={getPosterUrl(path, 'medium')} 
                    alt=""
                    style={{
                      width: '150px',
                      height: '225px',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '0';
                    }} 
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      
      {/* Dark Gradient Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: 'radial-gradient(circle at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)', 
      }} />

      {/* 2. Floating Content */}
      <div 
        className="login-container"
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '2rem 1.5rem',
        }}
      >
        <div style={{
          width: '100%',
          maxWidth: '380px',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: 'env(safe-area-inset-bottom, 20px)',
        }}>
          
          {/* Logo container with overlapping subtitle inside its bottom transparent boundary */}
          <div
            className="login-logo"
            style={{ 
              marginTop: '-75px',
              marginBottom: '-10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <img
              src="/cinemovie-logo.png"
              alt="Cinemovie"
              style={{
                height: '460px',
                width: '100%',
                maxWidth: '500px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))'
              }}
            />
            <p 
              className="login-subtitle"
              style={{ 
                color: 'rgba(255, 255, 255, 0.7)', 
                marginTop: '-115px', /* Overlaps the bottom transparent area of the logo image */
                marginBottom: '1.5rem', 
                fontSize: '0.95rem', 
                fontWeight: 500,
                letterSpacing: '0.5px',
                textAlign: 'center',
                position: 'relative',
                zIndex: 2
              }}
            >
                {isRegistering ? 'Create your profile to start streaming.' : 'Stream your favorite movies and shows.'}
            </p>
          </div>

          {/* Borderless content layout wrapper */}
          <div 
            className="login-card-content"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
              {/* Error */}
              {error && (
                  <div style={{
                      width: '100%',
                      background: 'rgba(255, 71, 87, 0.15)',
                      color: '#ff6b6b',
                      padding: '12px',
                      borderRadius: '12px',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      marginBottom: '1.5rem',
                      border: '1px solid rgba(255, 71, 87, 0.25)',
                  }}>
                      {error}
                  </div>
              )}

              {/* Success Message */}
              {message && (
                  <div style={{
                      width: '100%',
                      background: 'rgba(46, 213, 115, 0.15)',
                      color: '#2ed573',
                      padding: '12px',
                      borderRadius: '12px',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      marginBottom: '1.5rem',
                      border: '1px solid rgba(46, 213, 115, 0.25)',
                  }}>
                      {message}
                  </div>
              )}

              {/* Form */}
              <form 
                onSubmit={handleAuth} 
                className="login-form"
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}
              >
                  
                  {isRegistering && (
                      <div style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                          <GlassInput
                              type="text"
                              value={name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setError(''); setMessage(''); }}
                              placeholder="Full Name"
                          />
                      </div>
                  )}

                  <GlassInput
                      type="email"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError(''); setMessage(''); }}
                      placeholder="Email Address"
                  />

                  <GlassInput
                      type="password"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError(''); setMessage(''); }}
                      placeholder="Password"
                  />

                  {!isRegistering && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-0.4rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
                              Forgot Password?
                          </span>
                      </div>
                  )}

                  <button
                      type="submit"
                      disabled={isLoading}
                      className="login-btn-submit"
                      style={{
                          background: '#ffffff',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '16px', 
                          padding: '16px',
                          fontSize: '1rem',
                          fontWeight: 700,
                          cursor: isLoading ? 'wait' : 'pointer',
                          marginTop: '0.6rem',
                          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
                          width: '100%',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.transform = 'scale(1.01)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.transform = 'scale(1)'; }}
                      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                  >
                      {isLoading ? (isRegistering ? 'Creating...' : 'Signing In...') : (isRegistering ? 'Create Account' : 'Sign In')}
                  </button>
              </form>
              
              {/* Toggle Mode */}
              <div className="login-toggle" style={{ marginTop: '2rem', textAlign: 'center' }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 10px 0', fontWeight: 500 }}>
                      {isRegistering ? 'Already have an account?' : 'New to Cinemovie?'}

                  </p>
                  <button 
                      onClick={() => { triggerHaptic('light'); setIsRegistering(!isRegistering); setError(''); setMessage(''); }}
                      style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          padding: '10px 22px',
                          cursor: 'pointer',
                          borderRadius: '14px',
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  >
                      {isRegistering ? 'Sign In' : 'Create Account'}
                  </button>
              </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function GlassInput({ type, value, onChange, placeholder, ...props }: any) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="login-input"
      style={{
        width: '100%',
        padding: '16px 20px',
        borderRadius: '16px',
        border: isFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#fff',
        fontSize: '1rem',
        fontWeight: 500,
        outline: 'none',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: isFocused ? '0 0 12px rgba(255, 255, 255, 0.25)' : 'none',
      }}
      {...props}
    />
  );
}
