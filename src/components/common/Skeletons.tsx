import React from 'react';

export function MovieCardSkeleton() {
  return (
    <div style={{
      minWidth: '160px',
      width: '160px',
      flexShrink: 0,
    }}>
      <div 
        className="skeleton-shimmer"
        style={{
          position: 'relative',
          paddingBottom: '150%',
          borderRadius: '8px',
          overflow: 'hidden',
        }} 
      />
      <div 
        className="skeleton-shimmer"
        style={{
          marginTop: '0.625rem',
          height: '2.1rem',
          borderRadius: '4px',
        }} 
      />
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div 
      className="skeleton-shimmer"
      style={{
        width: '100%',
        height: '60vh',
        maxHeight: '600px',
        minHeight: '400px',
        marginBottom: '1rem',
      }} 
    />
  );
}

export function ContentRowSkeleton() {
  return (
    <div style={{ padding: '1.5rem 0' }}>
      {/* Title skeleton */}
      <div 
        className="skeleton-shimmer"
        style={{
          width: '150px',
          height: '24px',
          borderRadius: '4px',
          marginBottom: '1rem',
          marginLeft: '4%',
        }} 
      />

      {/* Cards skeleton */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        paddingLeft: '4%',
        paddingRight: '4%',
      }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <MovieCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

