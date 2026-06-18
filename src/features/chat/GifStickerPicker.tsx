import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Grid } from '@giphy/react-components';
import type { IGif } from '@giphy/js-types';
import { Search, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { gf } from '@/lib/giphy';
import type { MediaAttachment } from '@/lib/types';

interface GifStickerPickerProps {
    open: boolean;
    /** sticker mode = transparent assets, rendered frameless */
    sticker: boolean;
    onClose: () => void;
    onPick: (media: MediaAttachment) => void;
}

export function GifStickerPicker({
    open,
    sticker,
    onClose,
    onPick,
}: GifStickerPickerProps) {
    const [query, setQuery] = useState('');
    // debounced query actually fed to the Grid (avoids a fetch per keystroke)
    const [debounced, setDebounced] = useState('');
    const [width, setWidth] = useState(360);
    const gridWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setDebounced('');
        }
    }, [open, sticker]);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // the Grid needs an explicit pixel width — measure the dialog body
    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const w = gridWrapRef.current?.clientWidth;
            if (w) setWidth(w);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [open]);

    // SDK fetcher: trending when empty, search otherwise; stickers vs gifs
    const fetchGifs = (offset: number) => {
        const type = sticker ? 'stickers' : 'gifs';
        return debounced
            ? gf.search(debounced, { offset, limit: 24, type })
            : gf.trending({ offset, limit: 24, type });
    };

    const pick = (gif: IGif) => {
        const img = gif.images.fixed_width ?? gif.images.original;
        onPick({
            kind: 'image',
            url: img.url,
            name: `${sticker ? 'sticker' : 'gif'}-${gif.id}.gif`,
            size: 0,
            mimeType: 'image/gif',
            remote: true,
            sticker: sticker || undefined,
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-3 p-4">
                <DialogHeader>
                    <DialogTitle>{sticker ? 'Stickers' : 'GIFs'}</DialogTitle>
                </DialogHeader>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Search ${sticker ? 'Giphy stickers' : 'Giphy GIFs'}`}
                        className="h-10 rounded-full pl-9 pr-9"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Clear"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>

                <div
                    ref={gridWrapRef}
                    className="h-[55vh] overflow-y-auto"
                    data-testid="giphy-grid"
                >
                    {open && width > 0 && (
                        <Grid
                            // re-mount (re-fetch from offset 0) when the query or
                            // gif/sticker mode changes
                            key={`${sticker ? 's' : 'g'}:${debounced}`}
                            width={width}
                            columns={3}
                            gutter={6}
                            fetchGifs={fetchGifs}
                            onGifClick={(gif, e) => {
                                e.preventDefault();
                                pick(gif);
                            }}
                            noLink
                            hideAttribution
                            backgroundColor="transparent"
                        />
                    )}
                </div>

                <p className="text-center text-[11px] text-muted-foreground">
                    Powered by GIPHY · public GIFs, not your private media
                </p>
            </DialogContent>
        </Dialog>
    );
}
