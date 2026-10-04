/**
 * LAN-only QR (same Wi‑Fi as your computer).
 * Run: npm run qr:lan
 * With Metro on the same port: npm run start:lan
 * For phones on a different network, use npm run start:tunnel then npm run qr instead.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

function getLanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = net.family;
      if ((family === 'IPv4' || family === 4) && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

async function main() {
  const port = process.argv[2] || process.env.EXPO_PORT || process.env.METRO_PORT || '19006';
  const ip = getLanIPv4();
  if (!ip) {
    console.error(
      'Could not find a LAN IPv4 address. Connect to Wi‑Fi/Ethernet and run again.'
    );
    process.exit(1);
  }

  const url = `exp://${ip}:${port}`;
  const out = path.join(__dirname, '..', 'expo-dev-qr.png');

  await QRCode.toFile(out, url, {
    width: 520,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  console.log('');
  console.log('Created:', out);
  console.log('URL:    ', url);
  console.log('');
  console.log('1. Open expo-dev-qr.png (full screen helps) and scan with Expo Go.');
  console.log('2. In a terminal, run one of:');
  console.log('     npm run start:lan     (same Wi‑Fi, port 19006)');
  console.log('     npm run start:tunnel  (then npm run qr for a phone-ready QR)');
  console.log('');
  console.log('If the LAN QR fails, always use npm run start:tunnel and Expo’s QR.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
