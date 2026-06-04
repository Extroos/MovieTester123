import React from 'react';
import { motion } from 'framer-motion';
import { COLORS } from '../../constants';

export default function LoadingScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000', // Pure classic black
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px'
        }}
      >
        {/* Minimal Classic Logo */}
        <img
          src="/cinemovie-logo.png"
          alt="Cinemovie"
          style={{
            height: '240px',
            width: '100%',
            maxWidth: '280px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.8))'
          }}
        />

        {/* Elegant Minimal Spinner */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          style={{
            width: '24px',
            height: '24px',
            border: '2px solid rgba(255,255,255,0.1)',
            borderTop: `2px solid ${COLORS.primary}`,
            borderRadius: '50%'
          }}
        />
      </motion.div>

      {/* Subtle bottom text */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 1 }}
        style={{
          position: 'absolute',
          bottom: '40px',
          color: '#fff',
          fontSize: '0.75rem',
          letterSpacing: '1px',
          textTransform: 'uppercase'
        }}
      >
        Verified Experience
      </motion.div>
    </motion.div>
  );
}
