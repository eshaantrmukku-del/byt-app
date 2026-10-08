/**
 * Lists Gemini models visible to GEMINI_API_KEY. Never prints the key.
 * Usage: GEMINI_API_KEY=... npm run list-models
 */
async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY is not set.');
    process.exitCode = 1;
    return;
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${key}`);
  if (!response.ok) {
    console.error(`models.list failed (${response.status})`);
    process.exitCode = 1;
    return;
  }
  const json = (await response.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
  for (const model of json.models ?? []) {
    const methods = model.supportedGenerationMethods?.join(',') ?? '';
    if (!methods.includes('generateContent')) continue;
    console.log(`${model.name.replace(/^models\//, '')}\t${model.displayName ?? ''}`);
  }
}

void main();
