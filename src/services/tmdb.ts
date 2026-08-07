// src/services/tmdb.ts

// REPLACE WITH YOUR TMDB READ ACCESS TOKEN (JWT) OR API KEY
// You can get this from https://www.themoviedb.org/settings/api
export const TMDB_API_KEY = '5f49615a995e8657ec41d3d63b65287f'; // Placeholder/Default Key
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function fetchFromTMDB(endpoint: string, params: Record<string, string> = {}) {
  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    ...params,
  }).toString();

  const url = `${TMDB_BASE_URL}${endpoint}?${queryParams}`;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) {
      throw new Error(`TMDB HTTP Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(id);
    console.error(`TMDB fetch failed for endpoint ${endpoint}:`, error);
    throw error;
  }
}

export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  media_type?: 'movie' | 'tv';
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  air_date: string;
}

export const tmdb = {
  getTrending: async (type: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'day'): Promise<TMDBItem[]> => {
    try {
      const data = await fetchFromTMDB(`/trending/${type}/${timeWindow}`);
      return data.results || [];
    } catch {
      return getFallbackItems();
    }
  },

  getPopular: async (type: 'movie' | 'tv' = 'movie'): Promise<TMDBItem[]> => {
    try {
      const data = await fetchFromTMDB(`/${type}/popular`);
      return data.results || [];
    } catch {
      return getFallbackItems();
    }
  },

  getTopRated: async (type: 'movie' | 'tv' = 'movie'): Promise<TMDBItem[]> => {
    try {
      const data = await fetchFromTMDB(`/${type}/top_rated`);
      return data.results || [];
    } catch {
      return getFallbackItems();
    }
  },

  getAnime: async (): Promise<TMDBItem[]> => {
    try {
      const data = await fetchFromTMDB('/discover/tv', {
        with_genres: '16', // Animation
        with_original_language: 'ja', // Japanese
        sort_by: 'popularity.desc',
      });
      return (data.results || []).map((item: any) => ({ ...item, media_type: 'tv' }));
    } catch {
      return getFallbackAnime();
    }
  },

  search: async (query: string): Promise<TMDBItem[]> => {
    if (!query.trim()) return [];
    try {
      const data = await fetchFromTMDB('/search/multi', { query });
      return (data.results || []).filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
    } catch {
      return getFallbackItems().filter(item => 
        (item.title || item.name || '').toLowerCase().includes(query.toLowerCase())
      );
    }
  },

  getDetails: async (type: 'movie' | 'tv', id: string | number): Promise<any> => {
    try {
      return await fetchFromTMDB(`/${type}/${id}`);
    } catch {
      const allFallbacks = [...getFallbackItems(), ...getFallbackAnime()];
      const found = allFallbacks.find(item => item.id.toString() === id.toString());
      if (found) return found;
      return {
        id: Number(id),
        title: type === 'movie' ? 'Offline Movie File' : 'Offline TV Show',
        overview: 'Playback from local or scraped source details.',
        poster_path: '',
        backdrop_path: '',
        vote_average: 8.0,
      };
    }
  },

  getCredits: async (type: 'movie' | 'tv', id: string | number): Promise<CastMember[]> => {
    try {
      const data = await fetchFromTMDB(`/${type}/${id}/credits`);
      return data.cast || [];
    } catch {
      return [
        { id: 1, name: 'Lead Actor', character: 'Protagonist', profile_path: null },
        { id: 2, name: 'Supporting Actress', character: 'Deuteragonist', profile_path: null },
      ];
    }
  },

  getRecommendations: async (type: 'movie' | 'tv', id: string | number): Promise<TMDBItem[]> => {
    try {
      const data = await fetchFromTMDB(`/${type}/${id}/recommendations`);
      return data.results || [];
    } catch {
      return getFallbackItems();
    }
  },

  getEpisodes: async (tvId: string | number, seasonNumber: number | string): Promise<Episode[]> => {
    try {
      const data = await fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`);
      return data.episodes || [];
    } catch {
      return Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Episode ${i + 1}`,
        overview: `This is the overview description for Episode ${i + 1} of this season.`,
        episode_number: i + 1,
        season_number: Number(seasonNumber),
        still_path: null,
        air_date: '2026-08-07',
      }));
    }
  },
};

// Fallback Mock Data for stable offline testing or unconfigured API
function getFallbackItems(): TMDBItem[] {
  return [
    {
      id: 1022789,
      title: 'Inside Out 2',
      overview: 'Teenager Riley\'s mind headquarters is undergoing a sudden demolition to make room for something entirely unexpected: new Emotions!',
      poster_path: '/vpnVM9B6NMmFJao6KFbOkxSafeK.jpg',
      backdrop_path: '/stKG87n2jCS0e9LguV1Cg51bggy.jpg',
      media_type: 'movie',
      vote_average: 8.4,
      release_date: '2024-06-12',
    },
    {
      id: 823464,
      title: 'Godzilla x Kong: The New Empire',
      overview: 'Following their explosive showdown, Godzilla and Kong must reunite against a colossal undiscovered threat hidden within our world.',
      poster_path: '/z1p34436EUITnABm6ya6H3897UI.jpg',
      backdrop_path: '/xOMo8j3j030w8ak2LEwCIf65goY.jpg',
      media_type: 'movie',
      vote_average: 7.2,
      release_date: '2024-03-27',
    },
    {
      id: 93405,
      name: 'Squid Game',
      overview: 'Hundreds of cash-strapped players accept a strange invitation to compete in children\'s games. Inside, a tempting prize awaits — with deadly high stakes.',
      poster_path: '/dDlEmu3EZ0Pgg9JS23WbkOL6w5C.jpg',
      backdrop_path: '/5D42Dq69T46Wd228Wv4a4n62cv0.jpg',
      media_type: 'tv',
      vote_average: 7.8,
      first_air_date: '2021-09-17',
    },
  ];
}

function getFallbackAnime(): TMDBItem[] {
  return [
    {
      id: 319644,
      name: 'Demon Slayer: Kimetsu no Yaiba',
      overview: 'It is the Taisho Period in Japan. Tanjiro, a kindhearted boy who sells charcoal for a living, finds his family slaughtered by a demon.',
      poster_path: '/xU7vUBV34jcyP4ZB8zIF3o5jFq7.jpg',
      backdrop_path: '/nTvM0mhxh7chRLPvfgLtygcH0zs.jpg',
      media_type: 'tv',
      vote_average: 8.7,
      first_air_date: '2019-04-06',
    },
    {
      id: 46261,
      name: 'Naruto Shippuden',
      overview: 'Naruto Uzumaki wants to be the best ninja in the land. He\'s done well so far, but with the Akatsuki threat looming, he must train harder than ever.',
      poster_path: '/kvNPH0VLeCLeftR36t4A19K1585.jpg',
      backdrop_path: '/sW14FshhS4P3B1K9s59K0s9D79K.jpg',
      media_type: 'tv',
      vote_average: 8.6,
      first_air_date: '2007-02-15',
    },
  ];
}
