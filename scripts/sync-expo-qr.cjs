/**
 * Reads Metro's Expo manifest (while `npm run start:tunnel` is running) and writes QR PNGs.
 * Expo Go often labels bundle fetch failures as "failed to download the remote update".
 *
 * 1) Terminal A: npm run start:tunnel   (wait for "Tunnel ready")
 * 2) Terminal B: npm run qr
 *
 * If port 80 fails on your network, scan expo-dev-qr-tls.png (port 443) instead.
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const port =
  process.argv[2] || process.env.METRO_PORT || process.env.RCT_METRO_PORT || '19006';
const metroUrl = `http://127.0.0.1:${port}`;

async function fetchManifest() {
  const res = await fetch(metroUrl, {
    headers: {
      Accept: 'application/json',
      'Expo-Platform': 'android',
    },
  });
  if (!res.ok) {
    throw new Error(`Metro returned ${res.status} — is Expo running on port ${port}?`);
  }
  return res.json();
}

function deriveUrls(manifest) {
  const bundleHttp =
    typeof manifest?.launchAsset?.url === 'string' ? manifest.launchAsset.url : null;
  const bundleHttps =
    bundleHttp && bundleHttp.startsWith('http://')
      ? bundleHttp.replace(/^http:\/\//i, 'https://')
      : bundleHttp;

  const host = manifest?.extra?.expoGo?.debuggerHost;
  if (!host || typeof host !== 'string') {
    if (bundleHttp) {
      try {
        const u = new URL(bundleHttp);
        const p = u.port || (u.protocol === 'https:' ? 443 : 80);
        const primary = `exp://${u.hostname}:${p}`;
        return { primary, tls: null, bundleHttp, bundleHttps };
      } catch {
        return { primary: null, tls: null, bundleHttp, bundleHttps };
      }
    }
    return { primary: null, tls: null, bundleHttp, bundleHttps };
  }

  if (host.includes(':')) {
    return {
      primary: `exp://${host}`,
      tls: null,
      bundleHttp,
      bundleHttps,
    };
  }

  const tunnel =
    host.includes('exp.direct') || host.includes('exp.host') || host.includes('ngrok');
  if (tunnel) {
    return {
      primary: `exp://${host}:80`,
      tls: `exp://${host}:443`,
      bundleHttp,
      bundleHttps,
    };
  }

  return {
    primary: `exp://${host}:8081`,
    tls: null,
    bundleHttp,
    bundleHttps,
  };
}

function isReachableDevUrl(u) {
  return (
    u &&
    !u.includes('127.0.0.1') &&
    !u.includes('localhost')
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeQr(filePath, payload) {
  await QRCode.toFile(filePath, payload, {
    width: 520,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

async function main() {
  let manifest;
  let lastErr;
  let urls;
  for (let attempt = 1; attempt <= 90; attempt++) {
    try {
      manifest = await fetchManifest();
      urls = deriveUrls(manifest);
      if (isReachableDevUrl(urls.primary)) {
        break;
      }
      urls = null;
    } catch (e) {
      lastErr = e;
    }
    process.stdout.write(`Waiting for Metro + tunnel URL on ${metroUrl} (${attempt}/90)…\r`);
    await sleep(500);
  }
  if (!manifest || !urls || !isReachableDevUrl(urls.primary)) {
    console.error('\n', lastErr?.message || lastErr || '');
    console.error(
      `\nStart Expo first, then run this again:\n  npm run start:tunnel\n  # wait for "Tunnel ready"\n  npm run qr\n` +
        `\n(Uses port ${port}. If you changed the port, run: node scripts/sync-expo-qr.cjs <port>)\n`
    );
    process.exit(1);
  }

  const root = path.join(__dirname, '..');
  const out80 = path.join(root, 'expo-dev-qr.png');
  const outTls = path.join(root, 'expo-dev-qr-tls.png');
  const txt = path.join(root, 'expo-dev-url.txt');
  const bundleTxt = path.join(root, 'expo-bundle-url.txt');

  await writeQr(out80, urls.primary);

  let tlsNote = '';
  if (urls.tls) {
    await writeQr(outTls, urls.tls);
    tlsNote = `\nTLS_QR=expo-dev-qr-tls.png\nTLS_URL=${urls.tls}\n`;
  }

  const txtBody =
    `PRIMARY_URL=${urls.primary}\n` +
    (urls.tls ? `TLS_URL=${urls.tls}\n` : '') +
    `\nScan expo-dev-qr.png first (port 80).\n` +
    (urls.tls
      ? 'If Expo Go says it failed to download the update, scan expo-dev-qr-tls.png (port 443).\n'
      : '') +
    `\nYou can paste PRIMARY_URL (or TLS_URL) in Expo Go → Enter URL manually.\n` +
    tlsNote +
    `\nIf both fail: same Wi‑Fi as your Mac → npm run start:lan → npm run qr:lan\n` +
    `Allow Node / ngrok through your Mac firewall (often blocks tunnel).\n`;

  fs.writeFileSync(txt, txtBody, 'utf8');

  if (urls.bundleHttp) {
    fs.writeFileSync(
      bundleTxt,
      `BUNDLE_HTTP=${urls.bundleHttp}\n` +
        (urls.bundleHttps ? `BUNDLE_HTTPS=${urls.bundleHttps}\n` : ''),
      'utf8'
    );
  }

  console.log('\nWrote:', out80);
  if (urls.tls) console.log('Wrote:', outTls);
  console.log('Wrote:', txt);
  if (urls.bundleHttp) console.log('Wrote:', bundleTxt);
  console.log('\nPrimary Expo Go URL (port 80):', urls.primary);
  if (urls.tls) console.log('Alternate (port 443):       ', urls.tls);
  console.log('\nScan expo-dev-qr.png in Expo Go. If download fails, try expo-dev-qr-tls.png.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
