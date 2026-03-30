import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';

// Global error handler to catch unhandled errors
window.addEventListener('error', (e) => {
  console.error('[VRC Studio] Unhandled error:', e.error);
  const root = document.getElementById('root');
  if (root && !root.children.length) {
    root.innerHTML = `<div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;padding:2rem;text-align:center">
      <div style="font-size:1.25rem;font-weight:600;margin-bottom:0.5rem">Failed to load</div>
      <div style="font-size:0.8rem;color:#94a3b8;max-width:500px">${e.message}</div>
      <button onclick="localStorage.clear();location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#2563eb;color:#fff;border:none;border-radius:0.5rem;cursor:pointer">Clear data & reload</button>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[VRC Studio] Unhandled promise rejection:', e.reason);
});

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
