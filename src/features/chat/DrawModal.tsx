import { useRef, useState } from 'react';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Eraser, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MediaAttachment } from '@/lib/types';

const COLORS = ['#1d1d1f', '#b03a6e', '#e0245e', '#f5a623', '#2ecc71', '#3498db', '#9b59b6', '#ffffff'];

interface DrawModalProps {
    open: boolean;
    onClose: () => void;
    onSend: (media: MediaAttachment, blob: Blob) => void;
}

export function DrawModal({ open, onClose, onSend }: DrawModalProps) {
    const canvasRef = useRef<ReactSketchCanvasRef>(null);
    const [color, setColor] = useState(COLORS[1]);
    const [erasing, setErasing] = useState(false);
    const [busy, setBusy] = useState(false);

    const setPen = (c: string) => {
        setColor(c);
        setErasing(false);
        canvasRef.current?.eraseMode(false);
    };

    const toggleErase = () => {
        const next = !erasing;
        setErasing(next);
        canvasRef.current?.eraseMode(next);
    };

    const send = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setBusy(true);
        try {
            // transparent png so the doodle reads like a sticker over any bg
            const dataUrl = await canvas.exportImage('png');
            const blob = await (await fetch(dataUrl)).blob();
            const media: MediaAttachment = {
                kind: 'image',
                url: URL.createObjectURL(blob),
                name: `drawing-${Date.now()}.png`,
                size: blob.size,
                mimeType: 'image/png',
                sticker: true,
            };
            onSend(media, blob);
            onClose();
        } catch {
            toast.error('Could not save the drawing');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-3 p-4">
                <DialogHeader>
                    <DialogTitle>Draw</DialogTitle>
                </DialogHeader>

                <div className="overflow-hidden rounded-xl border bg-white">
                    <ReactSketchCanvas
                        ref={canvasRef}
                        width="100%"
                        height="320px"
                        strokeWidth={4}
                        eraserWidth={18}
                        strokeColor={color}
                        canvasColor="transparent"
                        style={{ borderRadius: 12 }}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => setPen(c)}
                            aria-label={`Color ${c}`}
                            className={cn(
                                'size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition',
                                !erasing && color === c ? 'ring-foreground' : 'ring-transparent',
                            )}
                            style={{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #0002' : undefined }}
                        />
                    ))}
                    <div className="ml-auto flex items-center gap-1">
                        <Button variant={erasing ? 'secondary' : 'ghost'} size="icon" onClick={toggleErase} aria-label="Eraser">
                            <Eraser />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.undo()} aria-label="Undo">
                            <Undo2 />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.redo()} aria-label="Redo">
                            <Redo2 />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => canvasRef.current?.clearCanvas()} aria-label="Clear">
                            <RotateCcw />
                        </Button>
                    </div>
                </div>

                <Button onClick={send} disabled={busy} className="w-full rounded-full">
                    {busy ? 'Sending…' : 'Send drawing'}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
