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
        padding: isMobile ? '12px 14px' : '1.5vh 1.4vw',
        display: 'flex',
        flexDirection: shouldStack ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: shouldStack ? 'stretch' : 'center',
        borderRadius: '10px',
        gap: shouldStack ? '10px' : '12px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        marginBottom: '1vh',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontWeight: 800, fontSize: isMobile ? '0.88rem' : 'clamp(0.85rem, 2.2vh, 1rem)', marginBottom: '0.4vh', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        <div style={{ fontSize: isMobile ? '0.7rem' : 'clamp(0.7rem, 1.8vh, 0.82rem)', color: 'rgba(255, 255, 255, 0.4)', fontWeight: 500, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: shouldStack ? 'stretch' : 'flex-end', alignItems: 'center', width: shouldStack ? '100%' : 'auto', flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, isMobile }: { checked: boolean; onChange: () => void; isMobile?: boolean }) {
  const trackWidth = isMobile ? 38 : 46;
  const trackHeight = isMobile ? 20 : 24;
  const knobSize = isMobile ? 16 : 20;
  const padding = 2;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange();
    }
  };

  return (
    <div 
      onClick={onChange}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="tv-focusable"
      style={{
        width: `${trackWidth}px`,
        height: `${trackHeight}px`,
        background: checked ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.08)',
        borderRadius: '30px',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'pointer',
        border: checked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: checked ? '0 0 16px rgba(16, 185, 129, 0.35)' : 'none',
        outline: 'none',
        flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute',
        top: `${padding}px`,
        left: `${checked ? (trackWidth - knobSize - padding) : padding}px`,
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
