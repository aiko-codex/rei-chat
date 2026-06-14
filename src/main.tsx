import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyUIScale } from './lib/ui-scale';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { applyAccent } from './lib/accent';

// restore the saved text-size scale + theme + accent before first paint (no flash)
applyUIScale();
applyTheme();
watchSystemTheme();
applyAccent();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
