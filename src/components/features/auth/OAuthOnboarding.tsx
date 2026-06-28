import React, { useState } from 'react';
import { supabase } from '../../../utils/supabase';
import { triggerHaptic, triggerSuccessHaptic } from '../../../utils/haptics';

interface OAuthOnboardingProps {
  currentUser: any;
  onComplete: (updatedUser: any) => void;
  onCancel: () => void;
}

export default function OAuthOnboarding({ currentUser, onComplete, onCancel }: OAuthOnboardingProps) {
  const googleName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || '';
  const [name, setName] = useState(googleName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isPassFocused, setIsPassFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      triggerHaptic('medium');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      triggerHaptic('medium');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      triggerHaptic('medium');
      return;
    }

    setIsLoading(true);
    setError('');
    setMessage('');
    triggerHaptic('light');

    try {
      // Update password and store setup_completed: true in user_metadata
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: {
          full_name: name.trim(),
          setup_completed: true
        }
      });

      if (updateError) throw updateError;

      triggerSuccessHaptic();
      setMessage('Account linked successfully! Setting up your space...');
      
      setTimeout(() => {
        onComplete(data.user);
      }, 2000);
    } catch (err: any) {
      console.error('[OAuthOnboarding] Setup error:', err);
      setError(err.message || 'Failed to complete registration.');
      triggerHaptic('medium');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    triggerHaptic('medium');
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#040405',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      position: 'fixed',
      inset: 0,
      zIndex: 150000
    }}>
      {/* Logo */}
      <div style={{
        marginBottom: '1rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        maxWidth: '320px',
        height: '80px',
        position: 'relative',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        <img
          src="/cinemovie-logo.png"
          alt="Cinemovie"
          style={{
            height: '120px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 15px rgba(0,0,0,0.8))',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Onboarding Form Area */}
      <div style={{
        width: '100%',
        maxWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.5rem 0',
        animation: 'fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        boxSizing: 'border-box'
      }}>
        <h2 style={{
          color: '#ffffff',
          fontSize: '1.6rem',
          fontWeight: 800,
          marginBottom: '0.4rem',
          textAlign: 'left',
          letterSpacing: '-0.5px',
          margin: '0 0 4px 0'
        }}>
          Complete Registration
        </h2>
        
        <p style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '0.85rem',
          lineHeight: '1.45',
          margin: '0 0 16px 0',
          fontWeight: 500,
          textAlign: 'left'
        }}>
          Set a password and verify your name. You can use either Google sign-in or your password next time.
        </p>

        {error && (
          <div style={{
            width: '100%',
            background: 'rgba(255, 71, 87, 0.15)',
            color: '#ff6b6b',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '0.82rem',
            fontWeight: 600,
            marginBottom: '1.2rem',
            border: '1px solid rgba(255, 71, 87, 0.25)',
            boxSizing: 'border-box'
          }}>{error}</div>
        )}

        {message && (
          <div style={{
            width: '100%',
            background: 'rgba(46, 213, 115, 0.15)',
            color: '#2ed573',
            padding: '12px',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '0.82rem',
            fontWeight: 600,
            marginBottom: '1.2rem',
            border: '1px solid rgba(46, 213, 115, 0.25)',
            boxSizing: 'border-box'
          }}>{message}</div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onFocus={() => setIsNameFocused(true)}
            onBlur={() => setIsNameFocused(false)}
            disabled={isLoading || !!message}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '8px',
              border: isNameFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 500,
              outline: 'none',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: isNameFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
              boxSizing: 'border-box'
            }}
          />

          <input
            type="password"
            placeholder="Choose Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onFocus={() => setIsPassFocused(true)}
            onBlur={() => setIsPassFocused(false)}
            disabled={isLoading || !!message}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '8px',
              border: isPassFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 500,
              outline: 'none',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: isPassFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
              boxSizing: 'border-box'
            }}
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
            onFocus={() => setIsConfirmFocused(true)}
            onBlur={() => setIsConfirmFocused(false)}
            disabled={isLoading || !!message}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: '8px',
              border: isConfirmFocused ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 500,
              outline: 'none',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: isConfirmFocused ? '0 0 16px rgba(255, 255, 255, 0.15)' : 'none',
              boxSizing: 'border-box'
            }}
          />

          <button
            type="submit"
            disabled={isLoading || !!message}
            style={{
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '1.05rem',
              fontWeight: 800,
              cursor: (isLoading || !!message) ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 8px 24px rgba(255, 255, 255, 0.15)',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            {isLoading ? 'Completing Setup...' : 'Finish Registration'}
          </button>
        </form>

        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            marginTop: '1.2rem',
            textDecoration: 'underline',
            alignSelf: 'center',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
        >
          Cancel and Sign Out
        </button>
      </div>
    </div>
  );
}
