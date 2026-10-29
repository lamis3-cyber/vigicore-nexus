import React from 'react'
import { Link } from 'react-router-dom'
import { tr } from '../i18n/translate.js';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      textAlign: 'center',
      padding: '24px',
      background: 'var(--bg, #00131f)',
      color: 'var(--white, #eaf6ff)',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 'clamp(48px, 8vw, 96px)',
        fontWeight: 700,
        color: 'var(--cyan, #00e5ff)',
        lineHeight: 1,
      }}>404</div>
      <p style={{ fontSize: '16px', color: 'rgba(200,230,245,.7)', maxWidth: '420px' }}>
        {tr("This page doesn't exist. It may have moved, or the link might be incorrect.")}
      </p>
      <Link to="/" style={{
        marginTop: '12px',
        padding: '12px 28px',
        borderRadius: '8px',
        border: '1px solid var(--cyan, #00e5ff)',
        color: 'var(--cyan, #00e5ff)',
        textDecoration: 'none',
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 600,
        letterSpacing: '.04em',
        transition: 'background .2s',
      }}>
        {tr("← Back to Home")}
      </Link>
    </div>
  )
}
