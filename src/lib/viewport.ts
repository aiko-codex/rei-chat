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
    // Defensive header pin: on iOS, focusing the composer makes WebKit scroll
    // an ancestor to bring the input into view — even our `overflow:hidden`
    // shell containers (#root and [data-testid="app-shell"]) are still
    // focus/script-scrollable on iOS. That drags the sticky header off the top
    // with no way to scroll it back. Those containers are already sized above
    // the keyboard (--app-h below), so they never legitimately need to scroll —
    // snap them back to 0 whenever iOS (or a focus) moves them. The message
    // list ([data-testid="message-list"]) is a *different* element and is left
    // free to scroll. Runs even without the visualViewport API.
    const isShell = (el: EventTarget | null): el is HTMLElement =>
        el instanceof HTMLElement &&
        (el.id === 'root' || el.dataset.testid === 'app-shell');

    const snapBack = (el: HTMLElement) => {
        if (el.scrollTop !== 0) el.scrollTop = 0;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };

    // The actual culprit on iOS standalone PWAs: focusing the composer makes
    // WebKit scroll the *document/window* to reveal the input, and in
    // standalone mode `position:fixed` moves WITH that scroll — so the fixed
    // header slides off the top (composer still ends up above the keyboard).
    // #root is already sized above the keyboard (--app-h), so the window never
    // legitimately needs to scroll — pin it back to 0.
    const lockWindow = () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
        const doc = document.scrollingElement as HTMLElement | null;
        if (doc) snapBack(doc);
    };

    // capture phase: `scroll` doesn't bubble, so capture catches it on any
    // element on the way down. Reset the shell containers and the document;
    // the message list ([data-testid="message-list"]) is left free to scroll.
    document.addEventListener(
        'scroll',
        (e) => {
            if (isShell(e.target)) snapBack(e.target);
            else if (e.target === document || e.target === document.scrollingElement) lockWindow();
        },
        true,
    );
    window.addEventListener('scroll', lockWindow, { passive: true });

    // a focus can scroll the page/container in one shot without a continuous
    // scroll event — reset everything after the focus settles (and later frames
    // to catch iOS's delayed scroll-to-input)
    document.addEventListener('focusin', () => {
        const reset = () => {
            const root = document.getElementById('root');
            const shell = document.querySelector<HTMLElement>('[data-testid="app-shell"]');
            if (root) snapBack(root);
            if (shell) snapBack(shell);
            lockWindow();
        };
        reset();
        requestAnimationFrame(reset);
        setTimeout(reset, 100);
        setTimeout(reset, 300);
        setTimeout(reset, 500);
    });

    const vv = window.visualViewport;
    if (!vv) return; // very old browsers: CSS falls back to 100%

    const root = document.documentElement;
    const apply = () => {
        // Only follow the visual viewport while the on-screen keyboard is
        // actually open. Otherwise mobile browsers fire `scroll` on every
        // page scroll (address-bar hide/show, rubber-band) with a transient
        // non-zero offsetTop — which would yank the whole fixed #root upward,
        // making every screen appear to "jump up" while scrolling.
        const keyboardOpen = window.innerHeight - vv.height > 150;
        if (keyboardOpen) {
            // height = visible area above the keyboard; offsetTop = how far iOS
            // has scrolled the page up. Tracking both keeps #root exactly over
            // the visible viewport, so the header never scrolls away.
            root.style.setProperty('--app-h', `${vv.height}px`);
            root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        } else {
            // keyboard closed → pin #root to the full layout viewport
            root.style.setProperty('--app-h', '100%');
            root.style.setProperty('--vv-top', '0px');
        }
    };

    apply();
    vv.addEventListener('resize', apply);
    // the keyboard can also shift the visual viewport without a resize (iOS)
    vv.addEventListener('scroll', apply);
}
