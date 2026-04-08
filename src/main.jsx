import React, { useState } from 'react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TestScene from './engine/TestScene.tsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: '#333', height: '100vh', whiteSpace: 'pre-wrap' }}>
          <h1>Something went wrong.</h1>
          <h2 style={{ color: '#ffaaaa' }}>{this.state.error && this.state.error.toString()}</h2>
          <pre style={{ fontSize: 12 }}>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  const [showTestScene, setShowTestScene] = useState(false);

  // Check if URL has ?test=3d parameter
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('test') === '3d') {
      setShowTestScene(true);
    }
  }, []);

  if (showTestScene) {
    return <TestScene onClose={() => setShowTestScene(false)} />;
  }

  return (
    <>
      <App />
      {/* Floating button to launch 3D test scene */}
      <button
        onClick={() => setShowTestScene(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9990,
          background: 'linear-gradient(135deg, #00d4ff, #0099bb)',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,212,255,0.3)',
          letterSpacing: 0.5,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Launch 3D Engine Test Scene"
      >
        ⬡ 3D Engine Test
      </button>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
