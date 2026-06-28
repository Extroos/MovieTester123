import React from 'react';

interface SettingRowProps {
  label: string;
  sub: string;
  isMobile: boolean;
  children: React.ReactNode;
  stackOnMobile?: boolean;
}

export function SettingRow({ label, sub, isMobile, children, stackOnMobile = false }: SettingRowProps) {
  const shouldStack = isMobile && stackOnMobile;

  return (
    <div 
      className="settings-row"
      style={{
        padding: isMobile ? '16px' : '20px 24px',
        display: 'flex',
        flexDirection: shouldStack ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: shouldStack ? 'stretch' : 'center',
        borderRadius: '16px',
        gap: shouldStack ? '12px' : '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        marginBottom: '12px',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1.05rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: isMobile ? '0.75rem' : '0.82rem', color: 'var(--text-secondary)', opacity: 0.7, fontWeight: 500, lineHeight: 1.3 }}>
          {sub}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: shouldStack ? 'stretch' : 'flex-end', alignItems: 'center', width: shouldStack ? '100%' : 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, isMobile }: { checked: boolean; onChange: () => void; isMobile?: boolean }) {
  const trackWidth = isMobile ? 44 : 52;
  const trackHeight = isMobile ? 24 : 28;
  const knobSize = isMobile ? 18 : 22;
  const padding = 2;

  return (
    <div 
      onClick={onChange}
      style={{
        width: `${trackWidth}px`,
        height: `${trackHeight}px`,
        background: checked ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.08)',
        borderRadius: '30px',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer',
        border: checked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: checked ? '0 0 16px rgba(16, 185, 129, 0.35)' : 'none'
      }}
    >
      <div style={{
        position: 'absolute',
        top: `${padding}px`,
        left: `${checked ? (trackWidth - knobSize - padding - 2) : padding}px`,
        width: `${knobSize}px`,
        height: `${knobSize}px`,
        background: '#ffffff',
        borderRadius: '50%',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
      </div>
    </div>
  );
}
