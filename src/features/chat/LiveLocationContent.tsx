import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { liveLocationStatus, timeLeftLabel } from '@/lib/live-location';
import type { Message } from '@/lib/types';

const LIVE_DOT_HTML =
  '<span class="relative flex size-4"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60"></span><span class="relative inline-flex size-4 rounded-full bg-primary ring-2 ring-white"></span></span>';

const ENDED_DOT_HTML =
  '<span class="relative inline-flex size-4 rounded-full bg-muted-foreground ring-2 ring-white"></span>';

interface LiveLocationContentProps {
  message: Message;
  isMine: boolean;
  onStop?: (message: Message) => void;
}

export function LiveLocationContent({ message, isMine, onStop }: LiveLocationContentProps) {
  const loc = message.liveLocation!;
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // re-render every 20s so the countdown + auto-ended state stay fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const status = liveLocationStatus(loc, now);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [loc.lat, loc.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      crossOrigin: true,
      maxZoom: 19,
    }).addTo(map);
    markerRef.current = L.marker([loc.lat, loc.lng], {
      icon: L.divIcon({ className: '', html: LIVE_DOT_HTML, iconSize: [16, 16] }),
    }).addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // map is built once; position updates are applied imperatively below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // move the marker + recenter as fresh positions arrive
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    markerRef.current.setLatLng([loc.lat, loc.lng]);
    mapRef.current.panTo([loc.lat, loc.lng], { animate: true, duration: 0.6 });
  }, [loc.lat, loc.lng]);

  // swap the marker glyph once the share ends (no more pulsing)
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setIcon(
      L.divIcon({ className: '', html: status === 'ended' ? ENDED_DOT_HTML : LIVE_DOT_HTML, iconSize: [16, 16] }),
    );
  }, [status]);

  const mapsUrl = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`;

  const statusLabel =
    status === 'ended' ? 'Live location ended' : status === 'paused' ? 'Paused — open the app to update' : timeLeftLabel(loc, now);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
      className="w-64 overflow-hidden rounded-2xl ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/15"
      data-testid={`live-location-${message.id}`}
    >
      <div ref={containerRef} className={cn('h-36 w-full', status === 'ended' && 'grayscale')} />
      <div className="flex items-center justify-between gap-2 bg-card px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          {status === 'active' && (
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="size-1.5 shrink-0 rounded-full bg-destructive"
            />
          )}
          <span className="truncate">{statusLabel}</span>
        </span>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-primary"
        >
          Open
        </a>
      </div>
      {isMine && status !== 'ended' && onStop && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStop(message)}
          className="h-9 w-full cursor-pointer rounded-none border-t text-xs text-destructive hover:text-destructive"
          data-testid={`stop-live-${message.id}`}
        >
          Stop sharing
        </Button>
      )}
    </motion.div>
  );
}
