import React from 'react';
import ReactDOM from 'react-dom/client';
// HashRouter, not BrowserRouter: the app is a static site with no server, so there's
// nothing to rewrite a deep-link refresh (e.g. /projects/5) back to index.html. Keeping
// the route in the URL fragment (#/projects/5) sidesteps that entirely, on any static host.
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Required (alongside manifest.json) for Chrome on Android to offer a real "Install app"
// prompt instead of a plain bookmark shortcut. Still only takes effect over HTTPS or on
// localhost — Chrome won't install a PWA served over a plain http:// LAN address.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Non-fatal: app works fine without it, just falls back to a plain shortcut.
    });
  });
}
