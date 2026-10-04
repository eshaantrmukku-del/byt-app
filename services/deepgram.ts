/** Deepgram Aura-2 coach voice — clear, confident, good for coaching/chat */
const COACH_VOICE_MODEL = 'aura-2-thalia-en';

export function isDeepgramConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY);
}

/** Faster than char-by-char concat + btoa on the full buffer. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(parts.join(''));
}

export async function synthesizeCoachSpeech(
  text: string,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const apiKey = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('Deepgram API key is not configured');
  }

  const params = new URLSearchParams({
    model: COACH_VOICE_MODEL,
    encoding: 'mp3',
    // Slightly faster speech + smaller download
    speed: '1.15',
    bit_rate: '32000',
  });

  const response = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Deepgram TTS failed (${response.status})${detail ? `: ${detail.slice(0, 120)}` : ''}`);
  }

  return response.arrayBuffer();
}
