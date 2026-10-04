/**
 * Writes an Expo Go QR code PNG for the running dev server.
 *
 *   node scripts/expo-qr.cjs [out.png] [exp://url]
 *
 * Without a URL, asks Metro (localhost:8081) for its manifest and uses the
 * host it advertises (LAN IP or tunnel hostname).
 */
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const out = path.resolve(process.argv[2] || 'expo-dev-qr.png');
const port = process.env.METRO_PORT || '8081';

function lanAddress() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

async function urlFromMetro() {
  // In LAN mode Metro echoes the host it was asked on, so ask on the LAN address.
  const res = await fetch(`http://${lanAddress()}:${port}`, {
    headers: { Accept: 'application/expo+json,application/json', 'Expo-Platform': 'android' },
  });
  if (!res.ok) throw new Error(`Metro returned ${res.status}. Is the dev server running on port ${port}?`);
  const manifest = await res.json();
  const hostUri = manifest?.extra?.expoClient?.hostUri || manifest?.extra?.expoGo?.debuggerHost;
  if (!hostUri) throw new Error('Metro manifest has no hostUri.');
  return `exp://${hostUri}`;
}

(async () => {
  const url = process.argv[3] || (await urlFromMetro());
  await QRCode.toFile(out, url, { width: 640, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  console.log(`QR: ${out}`);
  console.log(`URL: ${url}`);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
