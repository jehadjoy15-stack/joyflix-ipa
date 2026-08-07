// src/services/scrapers/subtitlecat.ts
import { SubtitleSource } from './tsunade';

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[\s\.\-_]+/g, '').replace(/[^a-z0-9]/g, '');
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    throw new Error(`SubtitleCat HTTP Error: ${response.status}`);
  }
  return await response.text();
}

export const subtitlecat = {
  fetchSubtitles: async (meta: {
    type: 'movie' | 'tv';
    title: string;
    season?: number;
    episode?: number;
  }): Promise<SubtitleSource[]> => {
    const subsList: SubtitleSource[] = [];
    if (!meta || !meta.title) return subsList;

    const cleanTitle = normalizeTitle(meta.title);
    
    // Build queries list
    const queries: string[] = [];
    if (meta.type === 'tv') {
      const s = String(meta.season || 1).padStart(2, '0');
      const e = String(meta.episode || 1).padStart(2, '0');
      
      queries.push(`${meta.title} s${s}e${e}`);
      queries.push(`${meta.title} e${meta.episode}`);
      queries.push(`${meta.title} episode ${meta.episode}`);
      queries.push(`${meta.title} ${meta.episode}`);
    } else {
      queries.push(meta.title);
    }

    let matchedLink: string | null = null;

    for (const q of queries) {
      try {
        const searchUrl = `https://subtitlecat.com/index.php?search=${encodeURIComponent(q)}`;
        const searchHtml = await fetchHtml(searchUrl);
        if (!searchHtml.includes('<table')) continue;
        
        const regex = /<tr>\s*<td><a href="([^"]+)">([^<]+)<\/a>/g;
        let match: RegExpExecArray | null;
        
        while ((match = regex.exec(searchHtml)) !== null) {
          const linkHref = match[1];
          const linkText = match[2];
          const normLinkText = normalizeTitle(linkText);
          
          if (meta.type === 'tv') {
            const epRegex = new RegExp(`(?:^|[^0-9])(?:ep(?:isode)?|e|ep_)?0*${meta.episode}(?:$|[^0-9])`, 'i');
            const titleMatch = normLinkText.includes(cleanTitle);
            const epMatch = epRegex.test(linkText);
            
            if (titleMatch && epMatch) {
              matchedLink = linkHref;
              break;
            }
          } else {
            if (normLinkText.includes(cleanTitle)) {
              matchedLink = linkHref;
              break;
            }
          }
        }
        
        if (matchedLink) break;
      } catch (err) {
        console.warn('SubtitleCat Search warning:', err);
      }
    }

    if (!matchedLink) {
      return subsList;
    }

    try {
      const detailUrl = `https://subtitlecat.com/${matchedLink}`;
      const detailHtml = await fetchHtml(detailUrl);
      
      const blocks = detailHtml.split('<div class="sub-single"');
      
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i].split('</div>')[0];
        const langMatch = block.match(/<span>([^<]+)<\/span>/);
        const downloadMatch = block.match(/href="([^"]+)"[^>]*>Download<\/a>/);
        
        if (langMatch && downloadMatch) {
          const langName = langMatch[1].trim();
          const downloadHref = downloadMatch[1];
          
          const absoluteUrl = `https://subtitlecat.com${downloadHref}`;
          subsList.push({
            lang: `${langName} (SubtitleCat)`,
            url: absoluteUrl
          });
        }
      }
    } catch (err) {
      console.warn('SubtitleCat Detail warning:', err);
    }

    return subsList;
  }
};
