/**
 * Voice room (Zustand): a Discord-style always-open audio room for the two of
 * us. No ringing — each person hops in whenever; presence is exchanged over
 * the data channel (`vc-join`/`vc-here`/`vc-leave`). Audio rides the same
 * WebRTC connection as chat. To avoid an open mic streaming before anyone's
 * listening, tracks are only added once BOTH of us are in the room.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import {
  addCallStream,
  isPeerConnected,
  sendVoiceFrame,
  stopCallTracks,
} from '@/lib/peer-service';
import { useCallStore } from './call-store';

interface VoiceRoomStore {
  joined: boolean;
  peerJoined: boolean;
  muted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** true once our tracks are on the connection (both present) */
  streaming: boolean;

  join: () => Promise<void>;
  leave: () => void;
  onPeerJoin: () => void;
  onPeerHere: () => void;
  onPeerLeave: () => void;
  setRemoteStream: (stream: MediaStream) => void;
  toggleMute: () => void;
}

export const useVoiceRoomStore = create<VoiceRoomStore>((set, get) => {
  /** add our mic to the connection once both of us are in the room */
  const streamIfBothPresent = () => {
    const { joined, peerJoined, localStream, streaming } = get();
    if (joined && peerJoined && localStream && !streaming) {
      addCallStream(localStream);
      set({ streaming: true });
    }
  };

  const teardown = () => {
    get().localStream?.getTracks().forEach((t) => t.stop());
    stopCallTracks();
  };

  return {
    joined: false,
    peerJoined: false,
    muted: false,
    localStream: null,
    remoteStream: null,
    streaming: false,

    join: async () => {
      if (get().joined) return;
      if (!isPeerConnected()) {
        toast('Not connected — the room opens when you’re linked up');
        return;
      }
      if (useCallStore.getState().state !== 'idle') {
        toast('Finish your call first');
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
      } catch {
        toast.error('Microphone unavailable');
        return;
      }
      set({ joined: true, localStream: stream, muted: false });
      sendVoiceFrame({ kind: 'vc-join' });
      streamIfBothPresent();
    },

    leave: () => {
      if (!get().joined) return;
      sendVoiceFrame({ kind: 'vc-leave' });
      teardown();
      set({ joined: false, streaming: false, localStream: null, remoteStream: null });
    },

    onPeerJoin: () => {
      set({ peerJoined: true });
      if (get().joined) sendVoiceFrame({ kind: 'vc-here' });
      streamIfBothPresent();
    },

    onPeerHere: () => {
      set({ peerJoined: true });
      streamIfBothPresent();
    },

    onPeerLeave: () => {
      set({ peerJoined: false, remoteStream: null });
    },

    setRemoteStream: (remoteStream) => set({ remoteStream }),

    toggleMute: () => {
      const next = !get().muted;
      get().localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
      set({ muted: next });
    },
  };
});
