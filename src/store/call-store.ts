/**
 * Call state (Zustand): 1:1 voice/video over the same WebRTC peer connection
 * as chat. Control (offer/accept/decline/end) rides the data channel; the
 * audio/video itself flows as RTP tracks (added on connect, removed on hang-up)
 * — true E2E over DTLS-SRTP, never touching the server.
 *
 * To avoid streaming a caller's mic before the callee accepts, tracks are
 * added on BOTH sides only once the call goes active.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import {
  addCallStream,
  isPeerConnected,
  sendCallFrame,
  stopCallTracks,
} from '@/lib/peer-service';

export type CallType = 'voice' | 'video';
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'active';

interface CallStore {
  state: CallState;
  type: CallType;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  /** epoch ms the call became active, for the duration timer */
  startedAt: number;

  /** caller: ring the peer */
  startCall: (type: CallType) => Promise<void>;
  /** callee: a call-offer arrived */
  receiveOffer: (type: CallType) => void;
  /** callee: pick up */
  accept: () => Promise<void>;
  /** callee: reject */
  decline: () => void;
  /** caller: peer picked up */
  remoteAccepted: () => void;
  /** caller: peer rejected */
  remoteDeclined: () => void;
  /** either side hangs up locally */
  end: () => void;
  /** peer hung up */
  remoteEnded: () => void;
  setRemoteStream: (stream: MediaStream) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

function getMedia(type: CallType): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: type === 'video' ? { facingMode: 'user' } : false,
  });
}

export const useCallStore = create<CallStore>((set, get) => {
  /** stop our mic/camera + tear our tracks out of the connection */
  const teardown = () => {
    get().localStream?.getTracks().forEach((t) => t.stop());
    stopCallTracks();
  };

  return {
    state: 'idle',
    type: 'voice',
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOff: false,
    startedAt: 0,

    startCall: async (type) => {
      if (get().state !== 'idle') return;
      if (!isPeerConnected()) {
        toast('Not connected — can’t call right now');
        return;
      }
      let stream: MediaStream;
      try {
        stream = await getMedia(type);
      } catch {
        toast.error(type === 'video' ? 'Camera/mic unavailable' : 'Microphone unavailable');
        return;
      }
      set({ state: 'outgoing', type, localStream: stream, muted: false, cameraOff: false });
      sendCallFrame({ kind: 'call-offer', callType: type });
    },

    receiveOffer: (type) => {
      if (get().state !== 'idle') {
        // already in/processing a call — auto-decline so the caller isn't left hanging
        sendCallFrame({ kind: 'call-decline' });
        return;
      }
      set({ state: 'incoming', type });
    },

    accept: async () => {
      if (get().state !== 'incoming') return;
      let stream: MediaStream;
      try {
        stream = await getMedia(get().type);
      } catch {
        toast.error('Mic/camera unavailable');
        get().decline();
        return;
      }
      set({ state: 'active', localStream: stream, startedAt: Date.now(), muted: false, cameraOff: false });
      addCallStream(stream);
      sendCallFrame({ kind: 'call-accept' });
    },

    decline: () => {
      sendCallFrame({ kind: 'call-decline' });
      set({ state: 'idle', remoteStream: null });
    },

    remoteAccepted: () => {
      if (get().state !== 'outgoing') return;
      const stream = get().localStream;
      if (stream) addCallStream(stream);
      set({ state: 'active', startedAt: Date.now() });
    },

    remoteDeclined: () => {
      if (get().state === 'idle') return;
      teardown();
      toast('Call declined');
      set({ state: 'idle', localStream: null, remoteStream: null });
    },

    end: () => {
      if (get().state === 'idle') return;
      sendCallFrame({ kind: 'call-end' });
      teardown();
      set({ state: 'idle', localStream: null, remoteStream: null });
    },

    remoteEnded: () => {
      if (get().state === 'idle') return;
      teardown();
      set({ state: 'idle', localStream: null, remoteStream: null });
    },

    setRemoteStream: (remoteStream) => set({ remoteStream }),

    toggleMute: () => {
      const next = !get().muted;
      get().localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
      set({ muted: next });
    },

    toggleCamera: () => {
      const next = !get().cameraOff;
      get().localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
      set({ cameraOff: next });
    },
  };
});
