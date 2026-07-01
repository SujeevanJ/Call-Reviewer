'use client';

import { useState, useEffect } from 'react';
import { ASSEMBLYAI_KEY_CHANGED_EVENT } from '@calls/lib/assemblyai-key.storage';
import {
  resolveAssemblyAudioUrls,
  submitTranscription,
  pollTranscript,
  parseAssemblyResult,
  type AssemblyInsights,
} from '@calls/services/assemblyai.service';

type Status = 'idle' | 'loading-audio' | 'submitting' | 'processing' | 'completed' | 'error';

export interface UseAssemblyAIResult {
  playbackUrl: string | null;
  assemblySourceUrl: string | null;
  status: Status;
  insights: AssemblyInsights | null;
  error: string | null;
}

const SESSION_KEY = (sessionId: string) => `assemblyai_insights_${sessionId}`;

export function useAssemblyAI(sessionId: string): UseAssemblyAIResult {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [assemblySourceUrl, setAssemblySourceUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [insights, setInsights] = useState<AssemblyInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyVersion, setKeyVersion] = useState(0);

  useEffect(() => {
    const onKeyChange = () => setKeyVersion((v) => v + 1);
    window.addEventListener(ASSEMBLYAI_KEY_CHANGED_EVENT, onKeyChange);
    return () => window.removeEventListener(ASSEMBLYAI_KEY_CHANGED_EVENT, onKeyChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAudio() {
      setStatus('loading-audio');
      setError(null);
      try {
        const urls = await resolveAssemblyAudioUrls(sessionId);
        if (cancelled) return;
        setPlaybackUrl(urls.playbackUrl);
        setAssemblySourceUrl(urls.assemblySourceUrl);
        setStatus('completed');
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(message);
          setStatus('error');
        }
      }
    }

    if (sessionId) loadAudio();
    return () => {
      cancelled = true;
    };
  }, [sessionId, keyVersion]);

  return { playbackUrl, assemblySourceUrl, status, insights, error };
}
