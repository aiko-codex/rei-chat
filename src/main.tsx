import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyUIScale } from './lib/ui-scale';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { applyAccent } from './lib/accent';
import { watchVisualViewport } from './lib/viewport';

// restore the saved text-size scale + theme + accent before first paint (no flash)
applyUIScale();
applyTheme();
watchSystemTheme();
applyAccent();
// track the visible viewport so the keyboard doesn't push the header off-screen
watchVisualViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
