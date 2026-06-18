declare module 'leaflet-image' {
    import type { Map as LeafletMap } from 'leaflet';
    /** Render a Leaflet map (incl. tiles) to a canvas. Tiles must be CORS-enabled. */
    export default function leafletImage(
        map: LeafletMap,
        callback: (err: Error | null, canvas: HTMLCanvasElement) => void,
    ): void;
}
