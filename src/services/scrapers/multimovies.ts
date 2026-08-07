// src/services/scrapers/multimovies.ts
import { StreamSource } from './tsunade';

const BASE_URL = 'https://rozgarlelo.modiplay.xyz';
const PROXY_BASE = 'https://cineverse.modiplay.xyz';
const CF_PROXY = 'https://multymovie.jehadjoy15.workers.dev/?url=';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders() {
  return {
    'User-Agent': randomUA(),
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function cfUrl(target: string) {
  return CF_PROXY + encodeURIComponent(target);
}

function embedUrl(meta: { type: 'movie' | 'tv'; tmdbId: number; season?: number; episode?: number }) {
  const typePath = meta.type === 'tv' ? 'tv' : 'movie';
  let url = `${BASE_URL}/embed/tmdb/${typePath}?id=${meta.tmdbId}`;
  if (meta.type === 'tv') {
    url += `&s=${meta.season || 1}&e=${meta.episode || 1}`;
  }
  return url;
}

interface ServerInfo {
  name: string;
  platform: string;
  code: string;
}

function extractServers(html: string): ServerInfo[] {
  const regex = /switchServer\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)',this\)/g;
  const servers: ServerInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const name = match[3];
    const platform = match[2];
    const code = match[4];
    if (!name || !platform || !code) continue;
    if (servers.some(s => s.platform === platform && s.code === code)) continue;
    servers.push({ name, platform, code });
  }
  return servers;
}

function extractStreamUrls(html: string) {
  const directMatch = html.match(/var directSrc\s*=\s*"([^"]+)"/);
  const relayMatch = html.match(/var src\s*=\s*"([^"]+)"/);
  let directUrl = directMatch ? directMatch[1] : null;
  let relayUrl = relayMatch ? relayMatch[1] : null;
  if (directUrl) directUrl = directUrl.replace(/\\\//g, '/');
  if (relayUrl) relayUrl = relayUrl.replace(/\\\//g, '/');
  if (relayUrl && relayUrl.startsWith('/')) {
    relayUrl = PROXY_BASE + relayUrl;
  }
  return { directUrl, relayUrl };
}

export const multimovies = {
  getStreams: async (meta: {
    type: 'movie' | 'tv';
    tmdbId: number;
    title: string;
    season?: number;
    episode?: number;
  }): Promise<StreamSource[]> => {
    const streams: StreamSource[] = [];
    const url = embedUrl(meta);
    const headers = buildHeaders();

    let embedHtml = '';
    try {
      const resp = await fetch(cfUrl(url), { headers, signal: AbortSignal.timeout(12000) });
      if (!resp.ok) return [];
      embedHtml = await resp.text();
    } catch (e) {
      console.warn('MultiMovies embed fetch error:', e);
      return [];
    }

    const servers = extractServers(embedHtml);
    if (servers.length === 0) return [];

    const proxyUrls = servers.map(s =>
      `${PROXY_BASE}/proxy.php?p=${encodeURIComponent(s.platform)}&c=${encodeURIComponent(s.code)}&title=${encodeURIComponent(meta.title || '')}&noredirect=1`
    );

    const proxyResults = await Promise.allSettled(
      proxyUrls.map(pUrl =>
        fetch(cfUrl(pUrl), { headers, signal: AbortSignal.timeout(15000) })
          .then(r => r.ok ? r.text() : null)
          .catch(() => null)
      )
    );

    for (let i = 0; i < proxyResults.length; i++) {
      const r = proxyResults[i];
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { relayUrl } = extractStreamUrls(r.value);
      if (!relayUrl || !relayUrl.startsWith('http')) continue;
      
      const wrappedUrl = CF_PROXY + encodeURIComponent(relayUrl) + 
        `&referer=${encodeURIComponent('https://rozgarlelo.modiplay.xyz/')}` + 
        `&origin=${encodeURIComponent('https://rozgarlelo.modiplay.xyz')}`;
        
      streams.push({
        server: `MultiMovies (${servers[i].name})`,
        quality: 'Auto',
        url: wrappedUrl,
        label: 'Original'
      });
    }

    return streams;
  }
};
