import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import leafletImage from 'leaflet-image';
import 'leaflet/dist/leaflet.css';
import { motion } from 'motion/react';
import { MapPin, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { LIVE_LOCATION_DURATIONS } from '@/lib/live-location';
import type { MediaAttachment } from '@/lib/types';

interface LocationModalProps {
    open: boolean;
    onClose: () => void;
    onSend: (media: MediaAttachment, blob: Blob) => void;
    /** start a live location share for the given duration (0 = until stopped) */
    onShareLive?: (durationMs: number, coords: { lat: number; lng: number }) => void;
}

export function LocationModal({ open, onClose, onSend, onShareLive }: LocationModalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [status, setStatus] = useState<'locating' | 'ready' | 'error'>('locating');
    const [busy, setBusy] = useState(false);
    const [durationSheet, setDurationSheet] = useState(false);

    // ask for the device location when opened
    useEffect(() => {
        if (!open) return;
        setStatus('locating');
        setCoords(null);
        if (!('geolocation' in navigator)) {
            setStatus('error');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setStatus('ready');
            },
            () => setStatus('error'),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }, [open]);

    // build the leaflet map once we have coords + the container is mounted
    useEffect(() => {
        if (!open || !coords || !containerRef.current) return;
        const map = L.map(containerRef.current, {
            center: [coords.lat, coords.lng],
            zoom: 15,
            zoomControl: false,
            attributionControl: false,
            dragging: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            crossOrigin: true,
            maxZoom: 19,
        }).addTo(map);
        L.marker([coords.lat, coords.lng]).addTo(map);
        mapRef.current = map;
        // leaflet needs a size recalc after the dialog finishes animating in
        const t = setTimeout(() => map.invalidateSize(), 200);
        return () => {
            clearTimeout(t);
            map.remove();
            mapRef.current = null;
        };
    }, [open, coords]);

    const send = async () => {
        const map = mapRef.current;
        if (!map || !coords) return;
        setBusy(true);
        // use the map's current center (the user may have panned to fine-tune)
        const c = map.getCenter();
        const picked = { lat: c.lat, lng: c.lng };
        leafletImage(map, (err, canvas) => {
            if (err) {
                setBusy(false);
                toast.error('Could not capture the map');
                return;
            }
            canvas.toBlob((blob) => {
                setBusy(false);
                if (!blob) {
                    toast.error('Could not capture the map');
                    return;
                }
                onSend(
                    {
                        kind: 'image',
                        url: URL.createObjectURL(blob),
                        name: `location-${Date.now()}.png`,
                        size: blob.size,
                        mimeType: 'image/png',
                        coords: picked,
                    },
                    blob,
                );
                onClose();
            }, 'image/png');
        });
    };

    const pickDuration = (ms: number) => {
        if (!coords || !onShareLive) return;
        // share from the map's current center (the user may have panned to fine-tune)
        const c = mapRef.current?.getCenter();
        onShareLive(ms, c ? { lat: c.lat, lng: c.lng } : coords);
        setDurationSheet(false);
        onClose();
        toast.success('Sharing your live location');
    };

    return (
        <>
        <Dialog open={open && !durationSheet} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-3 p-4">
                <DialogHeader>
                    <DialogTitle>Share location</DialogTitle>
                </DialogHeader>

                {status === 'error' ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        Couldn’t get your location. Allow location access for this app
                        and try again.
                    </p>
                ) : status === 'locating' ? (
                    <div className="flex h-64 items-center justify-center rounded-xl bg-muted">
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="size-4 animate-pulse" /> Finding you…
                        </p>
                    </div>
                ) : (
                    <>
                        <div
                            ref={containerRef}
                            className="h-64 w-full overflow-hidden rounded-xl border"
                            data-testid="location-map"
                        />
                        <p className="text-center text-[11px] text-muted-foreground">
                            Pan to adjust · sent as an end-to-end encrypted snapshot
                        </p>
                        <motion.div whileTap={{ scale: 0.98 }}>
                            <Button onClick={send} disabled={busy} className="w-full cursor-pointer rounded-full">
                                {busy ? 'Sending…' : 'Send this location'}
                            </Button>
                        </motion.div>
                        {onShareLive && (
                            <motion.div whileTap={{ scale: 0.98 }}>
                                <Button
                                    variant="outline"
                                    onClick={() => setDurationSheet(true)}
                                    disabled={busy}
                                    className="w-full cursor-pointer rounded-full"
                                    data-testid="share-live-location-btn"
                                >
                                    <Navigation className="size-4" /> Share live location
                                </Button>
                            </motion.div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>

        <Drawer open={durationSheet} onOpenChange={setDurationSheet}>
            <DrawerContent data-testid="live-location-duration-sheet">
                <DrawerHeader className="pb-1">
                    <DrawerTitle className="text-base">Share live location for…</DrawerTitle>
                </DrawerHeader>
                <div className="flex flex-col gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
                    {LIVE_LOCATION_DURATIONS.map((d) => (
                        <motion.button
                            key={d.label}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => pickDuration(d.ms)}
                            data-testid={`live-duration-${d.ms}`}
                            className="flex h-12 cursor-pointer items-center justify-between rounded-xl border px-4 text-sm font-medium hover:bg-muted"
                        >
                            {d.label}
                        </motion.button>
                    ))}
                    <p className="px-1 pt-1 text-center text-[11px] text-muted-foreground">
                        Updates while the app is open · stop anytime from the chat
                    </p>
                </div>
            </DrawerContent>
        </Drawer>
        </>
    );
}
