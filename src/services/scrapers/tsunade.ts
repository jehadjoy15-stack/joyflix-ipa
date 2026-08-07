// src/services/scrapers/tsunade.ts
import CryptoJS from 'crypto-js';

const API_PROXY = 'https://moviebox.jehadjoy.dev/?url=';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = '70e72ab91e1180976a71072fbcf313db'; // Scraping API Key from original engine

const HOSTS = [
  { host: 'h5.aoneroom.com', apiHost: 'h5-api.aoneroom.com' },
  { host: 'h5.inmoviebox.com', apiHost: 'h5-api.aoneroom.com' }
];

const SECRET_KEY_DEFAULT = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";
const SECRET_KEY_ALT = "Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA";

export interface StreamSource {
  server: string;
  quality: string;
  url: string;
  label: string;
}

export interface SubtitleSource {
  lang: string;
  url: string;
}

export interface TsunadeResult {
  server: string;
  tmdbId: number;
  title: string;
  totalStreams: number;
  totalSubtitles: number;
  streams: StreamSource[];
  subtitles: SubtitleSource[];
}

class TsunadeEngine {
  private bearerToken = '';
  private activeHostIndex = 0;
  private userAgent = '';
  private clientInfo = '';

  constructor() {
    this.initClientInfo();
  }

  private initClientInfo() {
    const androidVersions = [
      { version: "9", build: "PQ3A.190605.03081104" },
      { version: "10", build: "QP1A.191005.007.A3" },
      { version: "11", build: "RP1A.200720.011" },
      { version: "12", build: "S1B.220414.015" },
      { version: "13", build: "TQ2A.230405.003" }
    ];
    const redmiDevices = [
      { model: "23078RKD5C", brand: "Redmi" },
      { model: "2201117TY", brand: "Redmi" },
      { model: "2201117TG", brand: "Redmi" },
      { model: "22101316G", brand: "Redmi" },
      { model: "21121210G", brand: "Redmi" },
      { model: "M2012K11AG", brand: "Redmi" },
      { model: "M2007J20CG", brand: "Redmi" }
    ];
    const versionCodes = [50020042, 50020043, 50020044, 50020045, 50020046];
    
    const android = androidVersions[Math.floor(Math.random() * androidVersions.length)];
    const device = redmiDevices[Math.floor(Math.random() * redmiDevices.length)];
    const versionCode = versionCodes[Math.floor(Math.random() * versionCodes.length)];
    
    // Generate random hex deviceId
    let deviceId = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < 32; i++) {
      deviceId += chars[Math.floor(Math.random() * 16)];
    }

    // Generate random UUID gaid
    const gaid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    this.userAgent = `com.community.oneroom/${versionCode} (Linux; U; Android ${android.version}; en_US; ${device.model}; Build/${android.build}; Cronet/135.0.7012.3)`;
    
    this.clientInfo = JSON.stringify({
      package_name: "com.community.oneroom",
      version_name: "3.0.03.0529.03",
      version_code: versionCode,
      os: "android",
      os_version: android.version,
      install_ch: "ps",
      device_id: deviceId,
      install_store: "ps",
      gaid: gaid,
      brand: device.brand,
      model: device.model,
      system_language: "en",
      net: "NETWORK_WIFI",
      region: "US",
      timezone: "Asia/Kolkata",
      sp_code: "40401",
      "X-Play-Mode": "2"
    });
  }

  private get currentHost() {
    return HOSTS[this.activeHostIndex];
  }

  private generateXClientToken(ts: number): string {
    const tsStr = String(ts);
    const reversedTs = tsStr.split('').reverse().join('');
    const hashVal = CryptoJS.MD5(reversedTs).toString(CryptoJS.enc.Hex);
    return `${tsStr},${hashVal}`;
  }

  private sortedQueryString(urlStr: string): string {
    try {
      const urlObj = new URL(urlStr);
      const searchParams = urlObj.searchParams;
      const keys = Array.from(searchParams.keys()).sort();
      if (keys.length === 0) return '';
      const parts: string[] = [];
      for (const key of keys) {
        const values = searchParams.getAll(key);
        for (const val of values) {
          parts.push(`${key}=${val}`);
        }
      }
      return parts.join('&');
    } catch {
      return '';
    }
  }

  private buildCanonicalString(
    method: string,
    accept: string | null,
    contentType: string | null,
    urlStr: string,
    body: string | null,
    timestampMs: number
  ): string {
    let path = '';
    try {
      const urlObj = new URL(urlStr);
      path = urlObj.pathname || '';
    } catch {}

    const query = this.sortedQueryString(urlStr);
    const canonicalUrl = query ? `${path}?${query}` : path;

    let bodyHash = '';
    let bodyLength = '';
    if (body !== null && body !== undefined) {
      const bodyBytes = CryptoJS.enc.Utf8.parse(body);
      // Roughly simulate slicing the first 102400 bytes
      const truncated = body.substring(0, 102400);
      bodyHash = CryptoJS.MD5(truncated).toString(CryptoJS.enc.Hex);
      bodyLength = String(CryptoJS.enc.Utf8.parse(body).sigBytes);
    }

    return [
      method.toUpperCase(),
      accept || '',
      contentType || '',
      bodyLength,
      String(timestampMs),
      bodyHash,
      canonicalUrl
    ].join('\n');
  }

  private generateXTrSignature(
    method: string,
    accept: string | null,
    contentType: string | null,
    urlStr: string,
    body: string | null = null,
    useAltKey = false,
    timestampMs: number | null = null
  ): string {
    const ts = timestampMs !== null ? timestampMs : Date.now();
    const canonical = this.buildCanonicalString(method, accept, contentType, urlStr, body, ts);
    const secretB64 = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
    const secretBytes = CryptoJS.enc.Base64.parse(secretB64);
    const mac = CryptoJS.HmacMD5(canonical, secretBytes);
    const sigB64 = CryptoJS.enc.Base64.stringify(mac);
    return `${ts}|2|${sigB64}`;
  }

  private buildSignedHeaders(method: string, urlStr: string, body: string | null = null, extra: Record<string, string> = {}) {
    const ts = Date.now();
    const accept = "application/json";
    const contentType = "application/json";
    const h: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Accept": accept,
      "Content-Type": contentType,
      "Connection": "keep-alive",
      "X-Client-Token": this.generateXClientToken(ts),
      "x-tr-signature": this.generateXTrSignature(method, accept, contentType, urlStr, body, false, ts),
      "X-Client-Info": this.clientInfo,
      "X-Client-Status": "0",
      ...extra
    };
    if (this.bearerToken) {
      h["Authorization"] = `Bearer ${this.bearerToken}`;
    }
    return h;
  }

  private async resolveTmdbMetadata(tmdbId: number | string, type = 'movie') {
    try {
      const endpoint = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
      const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_API_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('Metadata fetch failed');
      const data = await res.json();
      const title = data?.title || data?.name || null;
      const dateStr = data?.release_date || data?.first_air_date || '';
      const year = dateStr ? parseInt(dateStr.split('-')[0]) : null;
      return { title, year };
    } catch {
      return { title: null, year: null };
    }
  }

  private async initSession(): Promise<boolean> {
    const url = `https://${this.currentHost.apiHost}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`;
    const headers = this.buildSignedHeaders("GET", url);
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      const userHeader = res.headers.get('x-user');
      if (userHeader) {
        const userObj = JSON.parse(userHeader);
        if (userObj.token) {
          this.bearerToken = userObj.token;
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error('Session init error:', e);
      return false;
    }
  }

  public async search(keyword: string, subjectType = 0): Promise<any[]> {
    if (!this.bearerToken) {
      const ok = await this.initSession();
      if (!ok) return [];
    }
    try {
      const url = `https://${this.currentHost.apiHost}/wefeed-h5api-bff/subject/search`;
      const searchBody = JSON.stringify({ keyword, page: 1, perPage: 50, subjectType });
      const headers = this.buildSignedHeaders("POST", url, searchBody);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: searchBody,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (data && data.code === 0 && data.data) {
        return data.data.items || [];
      }
    } catch (e) {
      console.error('Search failed:', e);
    }
    return [];
  }

  public async playInfo(subjectId: string | number, detailPath: string, season = 0, episode = 0): Promise<any> {
    if (!this.bearerToken) {
      const ok = await this.initSession();
      if (!ok) return null;
    }
    try {
      const url = `https://${this.currentHost.host}/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=${season}&ep=${episode}`;
      const headers = this.buildSignedHeaders("GET", url, null, {
        'Referer': `https://${this.currentHost.host}/movies/${detailPath}`
      });
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.code === 0 && data.data) {
        return data.data;
      }
    } catch (e) {
      console.error('PlayInfo failed:', e);
    }
    return null;
  }

  public async getStreamsByTmdb(
    tmdbId: string | number,
    type: 'movie' | 'tv' = 'movie',
    season = 1,
    episode = 1,
    providedTitle: string | null = null
  ): Promise<TsunadeResult> {
    let title = providedTitle;
    let targetYear: number | null = null;

    const meta = await this.resolveTmdbMetadata(tmdbId, type);
    if (!title) {
      title = meta.title;
    }
    targetYear = meta.year;

    if (!title) {
      throw new Error(`Could not resolve TMDB title for TMDB ID: ${tmdbId}`);
    }

    const targetType = type === 'movie' ? 1 : 2;
    
    // Major dubbed versions lookup (Hindi, Russian, Tagalog, English, Bengali, etc.)
    const languages = [
      'English', 'Eng', 'Bengali', 'Bangla', 'Hindi', 'Tamil', 'Telugu', 
      'Russian', 'Tagalog', 'Spanish', 'French', 'Portuguese'
    ];
    
    const searchQueries = [
      this.search(title, targetType),
      ...languages.map(lang => this.search(`${title} ${lang}`, targetType))
    ];
    
    const searchResults = await Promise.allSettled(searchQueries);
    const items: any[] = [];
    const seenSubjectIds = new Set<string | number>();
    
    searchResults.forEach(res => {
      if (res.status === 'fulfilled' && res.value) {
        res.value.forEach(item => {
          if (!seenSubjectIds.has(item.subjectId)) {
            seenSubjectIds.add(item.subjectId);
            items.push(item);
          }
        });
      }
    });

    if (items.length === 0) {
      throw new Error(`Content not found on Tsunade Server for title: ${title}`);
    }

    const stripSeasonMarkers = (t: string) => {
      return t
        .replace(/\bs\d+(\s*-\s*s\d+)?\b/g, '')
        .replace(/\bseason\s*\d+(\s*-\s*\d+)?\b/g, '')
        .replace(/\bparts?\s*\d+(\s*-\s*\d+)?\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const cleanTargetTitle = stripSeasonMarkers(title.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase());
    const normalize = (t: string) => stripSeasonMarkers(t.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase());

    // Filter candidate items
    let candidateItems = items.filter(item => {
      if (item.subjectType !== targetType) return false;
      if (normalize(item.title) !== cleanTargetTitle) return false;
      if (targetYear && item.year) {
        const itemYear = parseInt(item.year);
        if (Math.abs(itemYear - targetYear) > 1) return false;
      }
      return true;
    });

    if (candidateItems.length === 0) {
      candidateItems = items.filter(item => {
        if (item.subjectType !== targetType) return false;
        return normalize(item.title) === cleanTargetTitle;
      });
    }

    if (candidateItems.length === 0) {
      candidateItems = items.filter(item => {
        if (item.subjectType !== targetType) return false;
        const normItem = normalize(item.title);
        return normItem.includes(cleanTargetTitle) || cleanTargetTitle.includes(normItem);
      });
    }

    if (candidateItems.length === 0) {
      throw new Error(`Content not found on Tsunade Server for title: ${title}`);
    }

    // Sort: Preferred languages first
    candidateItems.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      
      const hasABracket = aTitle.includes('[') || aTitle.includes('(');
      const hasBBracket = bTitle.includes('[') || bTitle.includes('(');
      
      if (!hasABracket && hasBBracket) return -1;
      if (hasABracket && !hasBBracket) return 1;
      
      const priorityLangs = ['bengali', 'bangla', 'english', 'hindi', 'original'];
      
      let aIndex = priorityLangs.findIndex(lang => aTitle.includes(lang));
      let bIndex = priorityLangs.findIndex(lang => bTitle.includes(lang));
      
      if (aIndex === -1) aIndex = 99;
      if (bIndex === -1) bIndex = 99;
      
      return aIndex - bIndex;
    });

    const streams: StreamSource[] = [];
    const subtitles: SubtitleSource[] = [];
    const seenSubUrls = new Set<string>();

    const itemsToQuery = candidateItems.slice(0, 10); // Query top 10 candidates to avoid API rate limits

    const queryPromises = itemsToQuery.map(async (item) => {
      const dubMatch = item.title.match(/\[(.*?)\]/);
      const dubLabel = dubMatch ? dubMatch[1] : 'Original';

      try {
        const playData = await this.playInfo(item.subjectId, item.detailPath, type === 'tv' ? season : 0, type === 'tv' ? episode : 0);
        if (playData && playData.streams) {
          playData.streams.forEach((stream: any) => {
            if (stream.url && stream.url.startsWith('http') && !stream.url.includes('Search-')) {
              const quality = stream.resolutions ? `${stream.resolutions}p` : 'Auto';
              // Wrap stream.url in moviebox proxy
              const wrappedUrl = `${API_PROXY}${encodeURIComponent(stream.url)}&referer=${encodeURIComponent('https://fmoviesunblocked.net/')}&origin=${encodeURIComponent('https://fmoviesunblocked.net')}`;
              streams.push({
                server: dubLabel === 'Original' ? 'Tsunade (Original)' : `Tsunade (${dubLabel})`,
                quality,
                url: wrappedUrl,
                label: dubLabel === 'Original' ? 'Original' : dubLabel
              });
            }
          });
        }

        if (playData && playData.subtitles) {
          playData.subtitles.forEach((sub: any) => {
            if (sub.url && !seenSubUrls.has(sub.url)) {
              seenSubUrls.add(sub.url);
              subtitles.push({
                lang: sub.lanName || sub.language || 'English',
                url: sub.url
              });
            }
          });
        }
      } catch (err) {
        console.error('Failed playInfo query for candidate:', item.title, err);
      }
    });

    await Promise.allSettled(queryPromises);

    return {
      server: 'Tsunade',
      tmdbId: Number(tmdbId),
      title: title || 'JoyFlix Media',
      totalStreams: streams.length,
      totalSubtitles: subtitles.length,
      streams,
      subtitles
    };
  }
}

export const tsunade = new TsunadeEngine();
