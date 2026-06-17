import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyUIScale } from './lib/ui-scale';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { applyAccent } from './lib/accent';
import { watchVisualViewport } from './lib/viewport';
import { readyCrypto } from './lib/account-crypto';

// restore the saved text-size scale + theme + accent before first paint (no flash)
applyUIScale();
applyTheme();
watchSystemTheme();
applyAccent();
// track the visible viewport so the keyboard doesn't push the header off-screen
watchVisualViewport();

// initialize libsodium before first paint so any key decode (getKeys) the app
// does at startup runs against a ready WASM module — not strictly required for
// the boot screen (which uses a sodium-free key presence check) but keeps the
// first conversation open / login unwrap race-free
void readyCrypto();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
