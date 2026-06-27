import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
    Check,
    Gamepad2,
    Image as ImageIcon,
    MapPin,
    Mic,
    Pencil,
    Plus,
    SendHorizontal,
    Smile,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { VoiceRecorderModal } from './VoiceRecorderModal';
// lazy: keeps Tenor/leaflet/sketch-canvas out of the initial bundle — they only
// load when the user actually opens that picker
const GifStickerPicker = lazy(() =>
    import('./GifStickerPicker').then((m) => ({ default: m.GifStickerPicker })),
);
const DrawModal = lazy(() =>
    import('./DrawModal').then((m) => ({ default: m.DrawModal })),
);
const LocationModal = lazy(() =>
    import('./LocationModal').then((m) => ({ default: m.LocationModal })),
);
import { gifProviderEnabled } from '@/lib/giphy';
import { pickRandomWord } from '@/lib/game-words';
import type { MediaAttachment, Message } from '@/lib/types';

/** which attachment sheet is open (null = none) */
type AttachSheet = 'gif' | 'sticker' | 'draw' | 'location' | null;

function mediaKindFor(file: File): MediaAttachment['kind'] {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
}

function replySnippet(m: Message) {
    if (m.text) return m.text;
    switch (m.media?.kind) {
        case 'image':
            return 'Photo';
        case 'video':
            return 'Video';
        case 'voice':
            return 'Voice note';
        default:
            return m.media?.name ?? 'Message';
    }
}

interface ComposerProps {
    onSend: (text: string) => void;
    onSendMedia: (media: MediaAttachment, blob: Blob) => void;
    /** remote (Tenor) media — no blob, the url rides the message frame as-is */
    onSendRemoteMedia: (media: MediaAttachment) => void;
    /** start a live location share (omit to hide the option, e.g. unsupported channel) */
    onShareLiveLocation?: (durationMs: number, coords: { lat: number; lng: number }) => void;
    /** send a drawing that's part of a draw-and-guess game */
    onSendGame?: (media: MediaAttachment, blob: Blob, word: string) => void;
    /** typing feedback for the peer; throttling happens upstream */
    onTyping?: (typing: boolean) => void;
    replyTo: Message | null;
    replyToName?: string;
    onCancelReply: () => void;
    /** when set, the composer edits this message's text in place (Instagram-style) */
    editing?: { id: string; text: string } | null;
    onEditSubmit?: (text: string) => void;
    onCancelEdit?: () => void;
}

export function Composer({
    onSend,
    onSendMedia,
    onSendRemoteMedia,
    onShareLiveLocation,
    onSendGame,
    onTyping,
    replyTo,
    replyToName,
    onCancelReply,
    editing,
    onEditSubmit,
    onCancelEdit,
}: ComposerProps) {
    const [text, setText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);

    // voice note recording happens in a modal (tap to open, no hold gesture)
    const [voiceOpen, setVoiceOpen] = useState(false);
    // the "+" attachment menu + which picker sheet it opened
    const [attachOpen, setAttachOpen] = useState(false);
    const [sheet, setSheet] = useState<AttachSheet>(null);
    // game-mode: the secret word for the current draw-a-word session
    const [gameWord, setGameWord] = useState<string | null>(null);

    const openSheet = (s: Exclude<AttachSheet, null>) => {
        setAttachOpen(false);
        setSheet(s);
    };

    const openGameDraw = () => {
        setGameWord(pickRandomWord());
        setAttachOpen(false);
        setSheet('draw');
    };

    useEffect(() => {
        if (replyTo) textInputRef.current?.focus();
    }, [replyTo]);

    // entering edit mode loads the message text into the input and focuses it
    useEffect(() => {
        if (editing) {
            setText(editing.text);
            textInputRef.current?.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing?.id]);

    const cancelEdit = () => {
        setText('');
        onCancelEdit?.();
    };

    const submit = () => {
        const trimmed = text.trim();
        if (!trimmed) {
            if (editing) cancelEdit();
            return;
        }
        if (editing) {
            onEditSubmit?.(trimmed);
        } else {
            onSend(trimmed);
        }
        setText('');
        onTyping?.(false);
    };

    // media goes over the data channel eventually — cap what can even be queued
    const MAX_FILE_BYTES = 100_000_000; // 100 MB

    const pickFiles = (files: FileList | null) => {
        if (!files) return;
        for (const file of files) {
            if (file.size > MAX_FILE_BYTES) {
                toast.error(`${file.name} is too large (max 100 MB)`);
                continue;
            }
            onSendMedia(
                {
                    kind: mediaKindFor(file),
                    url: URL.createObjectURL(file),
                    name: file.name,
                    size: file.size,
                    mimeType: file.type || 'application/octet-stream',
                },
                file,
            );
        }
    };

    return (
        <footer
            className='border-t bg-background pb-[max(0.625rem,env(safe-area-inset-bottom))]'
            data-testid='composer'
        >
            <AnimatePresence>
                {editing ? (
                    <motion.div
                        key='editing'
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className='overflow-hidden'
                        data-testid='edit-preview'
                    >
                        <div className='mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs'>
                            <Pencil className='size-3.5 shrink-0 text-primary' />
                            <span className='shrink-0 font-semibold text-primary'>
                                Editing message
                            </span>
                            <span className='min-w-0 flex-1 truncate text-muted-foreground'>
                                {editing.text}
                            </span>
                            <button
                                onClick={cancelEdit}
                                aria-label='Cancel edit'
                                data-testid='cancel-edit-btn'
                                className='cursor-pointer p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4'
                            >
                                <X />
                            </button>
                        </div>
                    </motion.div>
                ) : replyTo ? (
                    <motion.div
                        key='replying'
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className='overflow-hidden'
                        data-testid='reply-preview'
                    >
                        <div className='mx-3 mt-2 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs'>
                            <span className='shrink-0 font-semibold text-primary'>
                                {replyToName}
                            </span>
                            <span className='min-w-0 flex-1 truncate text-muted-foreground'>
                                {replySnippet(replyTo)}
                            </span>
                            <button
                                onClick={onCancelReply}
                                aria-label='Cancel reply'
                                data-testid='cancel-reply-btn'
                                className='cursor-pointer p-1 text-muted-foreground hover:text-foreground [&_svg]:size-4'
                            >
                                <X />
                            </button>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <div className='flex items-center gap-2 px-3 py-2.5'>
                <input
                    ref={fileInputRef}
                    type='file'
                    multiple
                    className='hidden'
                    onChange={(e) => {
                        pickFiles(e.target.files);
                        e.target.value = '';
                    }}
                    data-testid='file-input'
                />

                <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant='ghost'
                            size='icon'
                            className='cursor-pointer'
                            aria-label='Attach'
                            data-testid='attach-btn'
                        >
                            <Plus />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align='start'
                        side='top'
                        className='w-48 rounded-2xl p-1.5'
                    >
                        <AttachRow
                            icon={<ImageIcon />}
                            label='Photo / Video'
                            onClick={() => {
                                setAttachOpen(false);
                                fileInputRef.current?.click();
                            }}
                            testid='attach-photo'
                        />
                        {gifProviderEnabled() && (
                            <>
                                <AttachRow
                                    icon={<GifGlyph />}
                                    label='GIFs'
                                    onClick={() => openSheet('gif')}
                                    testid='attach-gif'
                                />
                                <AttachRow
                                    icon={<Smile />}
                                    label='Stickers'
                                    onClick={() => openSheet('sticker')}
                                    testid='attach-sticker'
                                />
                            </>
                        )}
                        <AttachRow
                            icon={<Pencil />}
                            label='Draw'
                            onClick={() => openSheet('draw')}
                            testid='attach-draw'
                        />
                        {onSendGame && (
                            <AttachRow
                                icon={<Gamepad2 />}
                                label='Draw a word'
                                onClick={openGameDraw}
                                testid='attach-game'
                            />
                        )}
                        <AttachRow
                            icon={<MapPin />}
                            label='Location'
                            onClick={() => openSheet('location')}
                            testid='attach-location'
                        />
                    </PopoverContent>
                </Popover>
                <Input
                    ref={textInputRef}
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        if (!editing) onTyping?.(e.target.value.length > 0);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder='Message'
                    className='h-9 flex-1 rounded-full px-4'
                    data-testid='composer-input'
                />

                {editing ? (
                    <Button
                        size='icon'
                        className='cursor-pointer rounded-full'
                        onClick={submit}
                        aria-label='Save edit'
                        data-testid='edit-save-btn'
                    >
                        <Check />
                    </Button>
                ) : text.trim() ? (
                    <Button
                        size='icon'
                        className='cursor-pointer rounded-full'
                        onClick={submit}
                        aria-label='Send'
                        data-testid='send-btn'
                    >
                        <SendHorizontal />
                    </Button>
                ) : (
                    <Button
                        size='icon'
                        className='cursor-pointer rounded-full'
                        onClick={() => setVoiceOpen(true)}
                        aria-label='Record voice note'
                        data-testid='voice-record-btn'
                    >
                        <Mic />
                    </Button>
                )}
            </div>

            <VoiceRecorderModal
                open={voiceOpen}
                onClose={() => setVoiceOpen(false)}
                onSend={onSendMedia}
            />
            <Suspense fallback={null}>
                {(sheet === 'gif' || sheet === 'sticker') && (
                    <GifStickerPicker
                        open
                        sticker={sheet === 'sticker'}
                        onClose={() => setSheet(null)}
                        onPick={onSendRemoteMedia}
                    />
                )}
                {sheet === 'draw' && (
                    <DrawModal
                        open
                        onClose={() => { setSheet(null); setGameWord(null); }}
                        onSend={onSendMedia}
                        gameWord={gameWord ?? undefined}
                        onSendGame={onSendGame}
                    />
                )}
                {sheet === 'location' && (
                    <LocationModal
                        open
                        onClose={() => setSheet(null)}
                        onSend={onSendMedia}
                        onShareLive={onShareLiveLocation}
                    />
                )}
            </Suspense>
        </footer>
    );
}

/** a single row in the "+" attachment menu */
function AttachRow({
    icon,
    label,
    onClick,
    testid,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    testid: string;
}) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className='flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition active:bg-muted hover:bg-muted [&_svg]:size-[18px] [&_svg]:text-foreground/70'
        >
            {icon}
            {label}
        </button>
    );
}

/** a small "GIF" badge glyph (lucide has no gif icon) */
function GifGlyph() {
    return (
        <span className='flex h-[18px] w-[22px] items-center justify-center rounded border border-foreground/60 text-[8px] font-bold leading-none text-foreground/70'>
            GIF
        </span>
    );
}
