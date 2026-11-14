import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onRegisteredSW() {
        // Service worker active for offline cache and native OS notification gestures
      },
      onRegisterError() {
        // Non-fatal in restricted iframe environments
      },
    });
  } catch {
    // Ignore when SW registration is unsupported
  }
}

createRoot(document.getElementById('root')!).render(<App />);
