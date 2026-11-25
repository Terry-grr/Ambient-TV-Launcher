import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {defineConfig} from 'vite';

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (net.isIPv4(lower)) {
    return isPrivateOrReservedIpv4(lower);
  }
  if (net.isIPv6(lower)) {
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrReservedIpv4(lower.slice(7));
    }
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true;
    }
    if (lower.startsWith('ff')) return true;
    return false;
  }
  return true;
}

async function assertSafePublicHttpsUrl(rawUrl: string): Promise<URL> {
  if (!rawUrl || rawUrl.length > 1024) {
    throw new Error('Invalid URL length');
  }
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('Only default HTTPS port 443 is allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    net.isIP(host) !== 0
  ) {
    throw new Error('Direct IPs and local hostnames are blocked');
  }
  const records = await dns.lookup(host, {all: true});
  if (!records || records.length === 0) {
    throw new Error('Host lookup failed');
  }
  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error('Blocked private or reserved host IP');
    }
  }
  return parsed;
}

async function fetchSafeXmlWithRedirects(
  initialUrl: string,
  timeoutMs = 8500,
  maxBytes = 2 * 1024 * 1024
): Promise<{status: number; xml: string}> {
  let currentUrl = (await assertSafePublicHttpsUrl(initialUrl)).toString();

  for (let hop = 0; hop < 3; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept:
            'application/xml, application/rss+xml, application/atom+xml, application/cap+xml, text/xml',
          'User-Agent': 'AmbientTVLauncher/1.0',
        },
      });

      if (
        upstream.status >= 300 &&
        upstream.status < 400 &&
        upstream.headers.get('location')
      ) {
        const nextLocation = new URL(
          upstream.headers.get('location') || '',
          currentUrl
        ).toString();
        currentUrl = (await assertSafePublicHttpsUrl(nextLocation)).toString();
        continue;
      }

      if (!upstream.ok) {
        return {status: upstream.status, xml: ''};
      }

      const contentLengthHeader = upstream.headers.get('content-length');
      if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
        throw new Error('Feed exceeds 2 MB size cap');
      }

      const reader = upstream.body?.getReader();
      if (!reader) {
        const text = await upstream.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
          throw new Error('Feed exceeds 2 MB size cap');
        }
        return {status: 200, xml: text};
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            throw new Error('Feed exceeds 2 MB size cap');
          }
          chunks.push(value);
        }
      }
      const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return {status: 200, xml: combined.toString('utf8')};
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Too many redirects');
}

function createCapProxyPlugin() {
  const safeAlertIdRegex = /^[A-Za-z0-9._:-]+$/;
  const attachMiddleware = (middlewares: {
    use: (
      route: string,
      handler: (
        req: {url?: string},
        res: {
          statusCode: number;
          setHeader: (name: string, value: string) => void;
          end: (body?: string) => void;
        }
      ) => void
    ) => void;
  }) => {
    middlewares.use('/api/metservice-cap', async (req, res) => {
      try {
        const parsed = new URL(req.url || '/', 'http://localhost');
        const target = parsed.searchParams.get('target') || 'rss';
        let upstreamUrl: string | null = null;
        if (target === 'rss') {
          upstreamUrl = 'https://alerts.metservice.com/cap/rss';
        } else if (target === 'alert') {
          const id = (parsed.searchParams.get('id') || '').trim();
          if (id && safeAlertIdRegex.test(id)) {
            upstreamUrl = `https://alerts.metservice.com/cap/alert?id=${encodeURIComponent(id)}`;
          }
        }
        if (!upstreamUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({error: 'Invalid MetService CAP target'}));
          return;
        }
        const {status, xml} = await fetchSafeXmlWithRedirects(upstreamUrl, 6000);
        if (status !== 200) {
          res.statusCode = status;
          res.end('MetService upstream error');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'max-age=120');
        res.end(xml);
      } catch {
        res.statusCode = 502;
        res.end('Unable to reach MetService CAP feed');
      }
    });

    middlewares.use('/api/cap-proxy', async (req, res) => {
      try {
        const parsed = new URL(req.url || '/', 'http://localhost');
        const targetUrl = (parsed.searchParams.get('url') || '').trim();
        await assertSafePublicHttpsUrl(targetUrl);
        const {status, xml} = await fetchSafeXmlWithRedirects(targetUrl, 8500);
        if (status !== 200) {
          res.statusCode = status;
          res.end('Upstream CAP feed error');
          return;
        }
        if (!xml.trimStart().startsWith('<')) {
          res.statusCode = 415;
          res.end('Expected XML CAP/RSS/Atom response');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'max-age=120');
        res.end(xml);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CAP proxy error';
        res.statusCode = /blocked|invalid|only|credentials/i.test(message) ? 400 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({error: message}));
      }
    });
  };

  return {
    name: 'cap-xml-proxy',
    configureServer(server: {middlewares: Parameters<typeof attachMiddleware>[0]}) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server: {middlewares: Parameters<typeof attachMiddleware>[0]}) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      createCapProxyPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          const distAttachments = path.resolve(distDir, 'assets/aistudio');
          if (fs.existsSync(distAttachments)) {
            fs.rmSync(distAttachments, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
