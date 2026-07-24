import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalAudioTrack, LocalTrackPublication, RemoteAudioTrack, Room, RoomEvent, Track } from 'livekit-client';

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseLiveKitRoomOptions {
  serverUrl: string;
  tokenUrl: string;
  roomName: string;
  role: 'caller' | 'receiver';
}

export function useLiveKitRoom({ serverUrl, tokenUrl, roomName, role }: UseLiveKitRoomOptions) {
  const roomRef = useRef<Room | null>(null);
  const subscribedAudioRef = useRef<RemoteAudioTrack | null>(null);
  const attachedAudioElRef = useRef<HTMLMediaElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [participants, setParticipants] = useState(0);

  // Audio device controls
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([]);
  const [selectedInput, setSelectedInput] = useState(localStorage.getItem('lk_mic_device') || '');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem('lk_speaker_device') || '');
  const [volume, setVolume] = useState(parseFloat(localStorage.getItem('lk_volume') || '1'));

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` })));
      setAudioOutputs(devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}` })));
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  const setInputDevice = useCallback(async (deviceId: string) => {
    setSelectedInput(deviceId);
    localStorage.setItem('lk_mic_device', deviceId);
    // Device change requires reconnect to take effect
  }, []);

  const setOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutput(deviceId);
    localStorage.setItem('lk_speaker_device', deviceId);
    // Apply to existing audio element if present
    const audioEls = document.querySelectorAll<HTMLAudioElement>('audio[lk-remote]');
    audioEls.forEach(async (el) => {
      try { await (el as any).setSinkId?.(deviceId); } catch {}
    });
  }, []);

  const changeVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    localStorage.setItem('lk_volume', String(clamped));
    const audioEls = document.querySelectorAll<HTMLAudioElement>('audio[lk-remote]');
    audioEls.forEach(el => { el.volume = clamped; });
  }, []);

  const connect = useCallback(async () => {
    if (roomRef.current?.state === 'connected') return;
    if (!roomName) {
      setError('No room name provided');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      // Fetch token from token server
      const tokenRes = await fetch(`${tokenUrl}?room=${encodeURIComponent(roomName)}&role=${role}`);
      if (!tokenRes.ok) throw new Error(`Token server returned ${tokenRes.status}`);
      const tokenData = await tokenRes.json();
      const token = tokenData?.token;
      if (!token) throw new Error('No token returned from server');

      const roomOpts: any = {
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          noiseSuppression: true,
          echoCancellation: true,
        },
      };

      // Apply selected audio input device
      if (selectedInput) {
        roomOpts.audioCaptureDefaults = {
          ...roomOpts.audioCaptureDefaults,
          deviceId: selectedInput,
        };
      }

      const room = new Room(roomOpts);

      const detachAudio = () => {
        try {
          if (subscribedAudioRef.current && attachedAudioElRef.current) {
            subscribedAudioRef.current.detach(attachedAudioElRef.current);
          }
        } catch {}
        try {
          attachedAudioElRef.current?.remove();
        } catch {}
        subscribedAudioRef.current = null;
        attachedAudioElRef.current = null;
      };

      room.on(RoomEvent.TrackSubscribed, (_track, publication) => {
        if (publication.kind !== Track.Kind.Audio) return;
        const audioTrack = _track as RemoteAudioTrack;

        // Attach a hidden <audio> element so the WebRTC receiver actually pulls
        // and decodes RTP frames. Without this, MediaRecorder on the raw track
        // gets silence and Whisper returns empty text.
        detachAudio();
        const el = audioTrack.attach();
        el.setAttribute('lk-remote', 'true');
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        el.style.display = 'none';
        document.body.appendChild(el);
        try { (el as HTMLAudioElement).volume = volume; } catch {}
        if (selectedOutput) {
          try { (el as any).setSinkId?.(selectedOutput); } catch {}
        }

        subscribedAudioRef.current = audioTrack;
        attachedAudioElRef.current = el;
        setRemoteAudioTrack(audioTrack.mediaStreamTrack);
      });

      room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
        if (publication.kind !== Track.Kind.Audio) return;
        detachAudio();
        setRemoteAudioTrack(null);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        setParticipants((p) => p + 1);
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        setParticipants((p) => Math.max(0, p - 1));
      });

      room.on(RoomEvent.Disconnected, () => {
        detachAudio();
        setConnected(false);
        setRemoteAudioTrack(null);
        setLocalAudioTrack(null);
        setParticipants(0);
      });

      const refreshLocalTrack = () => {
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone) as
          | LocalTrackPublication
          | undefined;
        const track = pub?.track as LocalAudioTrack | undefined;
        setLocalAudioTrack(track?.mediaStreamTrack ?? null);
      };

      room.on(RoomEvent.LocalTrackPublished, refreshLocalTrack);
      room.on(RoomEvent.LocalTrackUnpublished, () => setLocalAudioTrack(null));
      room.on(RoomEvent.TrackMuted, refreshLocalTrack);
      room.on(RoomEvent.TrackUnmuted, refreshLocalTrack);

      await room.connect(serverUrl, token);
      roomRef.current = room;
      setConnected(true);

      // Auto-mute local mic for admin (receiver) — they listen first, unmute to speak
      if (role === 'receiver') {
        setIsMuted(true);
      } else {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
        } catch {
          setIsMuted(true);
        }
      }
      // Pick up any track that was already published before our listener attached
      const initialPub = room.localParticipant.getTrackPublication(Track.Source.Microphone) as
        | LocalTrackPublication
        | undefined;
      const initialTrack = initialPub?.track as LocalAudioTrack | undefined;
      if (initialTrack) {
        setLocalAudioTrack(initialTrack.mediaStreamTrack);
      }
    } catch (err: any) {
      console.error('[LiveKit] Connection failed:', err);
      setError(err.message || 'Failed to connect to voice room');
    }

    setConnecting(false);
  }, [serverUrl, tokenUrl, roomName, role, selectedInput]);

  const disconnect = useCallback(() => {
    try {
      if (subscribedAudioRef.current && attachedAudioElRef.current) {
        subscribedAudioRef.current.detach(attachedAudioElRef.current);
      }
    } catch {}
    try { attachedAudioElRef.current?.remove(); } catch {}
    subscribedAudioRef.current = null;
    attachedAudioElRef.current = null;
    try {
      roomRef.current?.disconnect();
    } catch {}
    roomRef.current = null;
    setConnected(false);
    setRemoteAudioTrack(null);
    setLocalAudioTrack(null);
    setParticipants(0);
    setError(null);
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!next);
      setIsMuted(next);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone) as
        | LocalTrackPublication
        | undefined;
      const track = pub?.track as LocalAudioTrack | undefined;
      setLocalAudioTrack(track?.mediaStreamTrack ?? null);
    } catch (err) {
      console.error('[LiveKit] Mute toggle failed:', err);
    }
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { roomRef.current?.disconnect(); } catch {}
    };
  }, []);

  return {
    connected,
    connecting,
    error,
    remoteAudioTrack,
    localAudioTrack,
    isMuted,
    participants,
    connect,
    disconnect,
    toggleMute,
    audioInputs,
    audioOutputs,
    selectedInput,
    selectedOutput,
    volume,
    setInputDevice,
    setOutputDevice,
    changeVolume,
    refreshDevices,
  };
}
