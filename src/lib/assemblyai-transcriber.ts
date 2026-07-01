/**
 * AssemblyAI Transcription Service
 * Submits audio URLs to AssemblyAI and polls for the completed transcript.
 * Saves resulting utterances into the Transcript/TranscriptUtterance tables.
 */

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

function getApiKey(): string | null {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key || key.startsWith('your_')) return null;
  return key;
}

interface AssemblyUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: { text: string; start: number; end: number; confidence: number }[];
}

interface AssemblyTranscriptResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  utterances?: AssemblyUtterance[];
  error?: string;
  audio_duration?: number;
}

/**
 * Submit an audio URL to AssemblyAI and wait for transcription.
 * Returns the completed transcript with speaker-labeled utterances.
 */
export async function transcribeAudioUrl(audioUrl: string): Promise<AssemblyTranscriptResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[AssemblyAI] No API key configured — skipping transcription.');
    return null;
  }

  try {
    // Submit transcription job
    const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        speakers_expected: 2,
        language_detection: true,
      }),
    });

    if (!submitRes.ok) {
      console.error('[AssemblyAI] Submit failed:', submitRes.status, await submitRes.text());
      return null;
    }

    const { id } = await submitRes.json();
    console.log(`[AssemblyAI] Submitted transcript job: ${id}`);

    // Poll until complete (max 5 minutes)
    const maxWait = 300000;
    const interval = 5000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise(r => setTimeout(r, interval));
      elapsed += interval;

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
        headers: { Authorization: apiKey },
      });

      if (!pollRes.ok) continue;

      const data: AssemblyTranscriptResponse = await pollRes.json();

      if (data.status === 'completed') {
        console.log(`[AssemblyAI] Transcript complete for job: ${id}`);
        return data;
      }

      if (data.status === 'error') {
        console.error('[AssemblyAI] Transcription error:', data.error);
        return null;
      }

      console.log(`[AssemblyAI] Still processing (${elapsed / 1000}s elapsed)...`);
    }

    console.warn('[AssemblyAI] Transcription timed out after 5 minutes.');
    return null;
  } catch (err) {
    console.error('[AssemblyAI] Exception:', err);
    return null;
  }
}

/**
 * Save an AssemblyAI transcript to the database.
 * Creates or updates the Transcript record and its utterances.
 */
export async function saveTranscriptToDb(
  db: any,
  callId: string,
  tenantId: string,
  data: AssemblyTranscriptResponse
): Promise<void> {
  const utterances = data.utterances || [];

  // Build full text
  const fullText = utterances.map(u => `${u.speaker}: ${u.text}`).join('\n');

  // Simple talk ratio calculation
  const speakerTotals: Record<string, number> = {};
  utterances.forEach(u => {
    const dur = (u.end - u.start);
    speakerTotals[u.speaker] = (speakerTotals[u.speaker] || 0) + dur;
  });
  const totalDur = Object.values(speakerTotals).reduce((a, b) => a + b, 0);
  const speakers = Object.keys(speakerTotals).sort();
  const repDur = speakerTotals[speakers[0]] || 0;
  const repPct = totalDur > 0 ? Math.round((repDur / totalDur) * 100) : 50;

  // Upsert Transcript record
  await db.transcript.upsert({
    where: { callId },
    update: {
      fullText,
      talkRatio: { rep: repPct, customer: 100 - repPct },
      updatedAt: new Date(),
    },
    create: {
      callId,
      tenantid: tenantId,
      fullText,
      talkRatio: { rep: repPct, customer: 100 - repPct },
      summary: null,
      keyHighlights: [],
    },
  });

  // Get the transcript's ID
  const savedTranscript = await db.transcript.findUnique({ where: { callId } });
  if (!savedTranscript) return;

  // Delete old utterances and recreate
  await db.utterance.deleteMany({ where: { transcriptId: savedTranscript.id } });

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    await db.utterance.create({
      data: {
        transcriptId: savedTranscript.id,
        tenantid: tenantId,
        speaker: `Speaker ${u.speaker}`,
        text: u.text,
        startMs: u.start,
        endMs: u.end,
        confidence: u.confidence,
        sequenceIndex: i,
      },
    });
  }

  console.log(`[AssemblyAI] Saved ${utterances.length} utterances for call ${callId}`);
}
