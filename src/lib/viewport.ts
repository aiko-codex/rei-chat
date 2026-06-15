/**
 * Keep the app sized to the *visible* viewport when the on-screen keyboard
 * opens. In an installed PWA the layout viewport does NOT shrink for the
 * keyboard, so `height:100%` stays full-screen and the browser scrolls the
 * whole #root up to reveal the focused composer input — dragging the sticky
 * header off the top. Android/Chrome handle this via the viewport
 * `interactive-widget=resizes-content` hint (in index.html); iOS Safari ignores
 * it, so we drive an `--app-h` CSS var from the visualViewport API there too.
 *
 * Idempotent + cheap: writes the same value the layout viewport already has on
 * platforms that resize, so it's safe to run everywhere.
 */
export function watchVisualViewport(): void {
    const vv = window.visualViewport;
    if (!vv) return; // very old browsers: CSS falls back to 100%

    const root = document.documentElement;
    const apply = () => {
        // height = visible area above the keyboard; offsetTop = how far iOS has
        // scrolled the page up. Tracking both keeps #root exactly over the
        // visible viewport, so the header never scrolls away.
        root.style.setProperty('--app-h', `${vv.height}px`);
        root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };

    apply();
    vv.addEventListener('resize', apply);
    // the keyboard can also shift the visual viewport without a resize (iOS)
    vv.addEventListener('scroll', apply);
}
