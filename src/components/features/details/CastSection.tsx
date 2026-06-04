import React from 'react';
import { getProfileUrl } from '../../../services/tmdb';
import { triggerHaptic } from '../../../utils/haptics';
import { Cast } from '../../../types';

interface CastSectionProps {
  cast: Cast[];
  onActorClick?: (personId: number) => void;
}

export default function CastSection({ cast, onActorClick }: CastSectionProps) {
  if (!cast || cast.length === 0) return null;

  return (
    <div style={{ marginBottom: '3rem' }}>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', color: '#e5e5e5' }}>Cast</h3>
      <div style={{ 
         display: 'flex', 
         flexWrap: 'nowrap', 
         gap: '20px',
         overflowX: 'auto',
         touchAction: 'pan-x pan-y',
         paddingBottom: '1rem',
         WebkitOverflowScrolling: 'touch',
         scrollbarWidth: 'none',
         msOverflowStyle: 'none',
      }}>
         {cast.slice(0, 20).map(person => (
           <div 
              key={person.id} 
              onClick={() => {
                triggerHaptic('light');
                onActorClick?.(person.id);
              }}
              style={{ 
                textAlign: 'center', 
                width: '100px',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
               <div style={{
                   width: '100%',
                   aspectRatio: '1/1',
                   borderRadius: '20px',
                   overflow: 'hidden',
                   background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
                   border: '1px solid rgba(255, 255, 255, 0.08)',
                   marginBottom: '10px',
                   boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0,0,0,0.4)',
                   transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.transform = 'scale(1.06)';
                 e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                 e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 12px 30px rgba(0,0,0,0.6)';
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.transform = 'scale(1)';
                 e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                 e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0,0,0,0.4)';
               }}
               >
                   {person.profilePath ? (
                     <img 
                       src={getProfileUrl(person.profilePath)}
                       alt={person.name}
                       loading="lazy"
                       style={{
                         width: '100%',
                         height: '100%',
                         objectFit: 'cover',
                       }}
                     />
                   ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '20px',
                      }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                   )}
               </div>
               <div style={{ 
                   fontSize: '0.85rem', 
                   fontWeight: 800, 
                   color: '#fff', 
                   lineHeight: 1.2,
                   overflow: 'hidden', 
                   textOverflow: 'ellipsis', 
                   whiteSpace: 'nowrap', 
                   marginBottom: '2px',
               }}>
                 {person.name}
               </div>
               <div style={{
                   fontSize: '0.75rem',
                   color: 'rgba(255,255,255,0.4)',
                   overflow: 'hidden',
                   textOverflow: 'ellipsis',
                   whiteSpace: 'nowrap'
               }}>
                 {person.character}
               </div>
           </div>
         ))}
      </div>
    </div>
  );
}
