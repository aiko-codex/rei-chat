import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// human version (from package.json) + a unique-per-build id (the build time):
// the build id is what reliably tells two devices they're on different builds.
const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
);
const APP_VERSION: string = pkg.version || '0.0.0';
const BUILD_ID: string = new Date().toISOString();

// ── Release guard ──────────────────────────────────────────────────────────
// The update toast shows __APP_VERSION__ (= package.json version) and Settings →
// What's new reads CHANGELOG. These MUST stay in lockstep, or the toast announces
// a stale/wrong version (the classic "says 0.2.0 on every update" bug). This guard
// fails the build the moment they drift, with instructions on how to fix it.
function assertChangelogInSync(): void {
    const changelogPath = new URL('./src/lib/changelog.ts', import.meta.url);
    const src = readFileSync(changelogPath, 'utf-8');
    // grab the FIRST `version: '...'` after the CHANGELOG declaration (newest entry)
    const afterDecl = src.slice(src.indexOf('CHANGELOG'));
    const match = afterDecl.match(/version:\s*['"]([^'"]+)['"]/);
    const topVersion = match ? match[1] : null;
    if (topVersion !== APP_VERSION) {
        throw new Error(
            [
                '',
                '╳ RELEASE VERSION MISMATCH — build stopped on purpose.',
                '',
                `  package.json version : ${APP_VERSION}`,
                `  changelog top version: ${topVersion ?? '(none found)'}`,
                '',
                '  Every user-facing change must bump BOTH, in lockstep (see CLAUDE.md → Working Rules):',
                '    1. main-app/frontend/package.json  → "version"  (patch=fix, minor=feature)',
                '    2. src/lib/changelog.ts            → add a NEW top CHANGELOG entry with the same version',
                '',
                '  Why: the "Update available" toast reads package.json (__APP_VERSION__) and Settings →',
                '  What\'s new reads the changelog. If they disagree, the toast shows the wrong version.',
                '',
                `  Fix: set both to the same version (and add a changelog note for what changed).`,
                '',
            ].join('\n'),
        );
    }
}
assertChangelogInSync();

// base './' keeps the build deployable both on Vercel and as a plain
// dist/ folder under any Apache subpath.
export default defineConfig({
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'prompt',
            // custom SW (src/sw.ts) so we can add a Web Push handler while keeping
            // the Workbox precache (self.__WB_MANIFEST is injected into it)
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectManifest: {
                // app bundle is ~1.6MB; raise the precache size limit above the default 2MB
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            },
            includeAssets: [
                'favicon.svg',
                'favicon.ico',
                'favicon-16.png',
                'favicon-32.png',
                'apple-touch-icon.png',
            ],
            manifest: {
                name: 'rei-chat',
                short_name: 'rei',
                description: 'Private chat for two',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                orientation: 'portrait',
                start_url: './',
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'pwa-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        host: true,
    },
});
