// src/app/(tabs)/search.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { tmdb, TMDBItem, TMDB_API_KEY } from '../../services/tmdb';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 40) / 3;

// Popular Genres/Categories to show when search is empty
const GENRES = [
  { id: 28, name: 'Action', type: 'movie' },
  { id: 35, name: 'Comedy', type: 'movie' },
  { id: 27, name: 'Horror', type: 'movie' },
  { id: 10749, name: 'Romance', type: 'movie' },
  { id: 18, name: 'Drama', type: 'movie' },
  { id: 878, name: 'Sci-Fi', type: 'movie' },
  { id: 16, name: 'Anime', type: 'tv', genreId: 16, lang: 'ja' },
  { id: 999, name: 'Bangla', type: 'movie', lang: 'bn' },
  { id: 998, name: 'Hindi', type: 'movie', lang: 'hi' },
];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  
  const searchTimeoutRef = useRef<any>(null);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const searchResults = await tmdb.search(searchQuery);
      setResults(searchResults);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query) {
      setLoading(true);
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query);
      }, 500); // 500ms debounce
    } else {
      setResults([]);
      setLoading(false);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSelectedGenre(null);
  };

  const handleGenrePress = async (genre: typeof GENRES[0]) => {
    setLoading(true);
    setSelectedGenre(genre.name);
    setQuery('');
    try {
      // Fetch discover movies based on genre and language
      let endpoint = `/discover/${genre.type}`;
      const params: Record<string, string> = {
        sort_by: 'popularity.desc',
      };
      
      if (genre.genreId) {
        params.with_genres = String(genre.genreId);
      } else if (genre.id !== 999 && genre.id !== 998) {
        params.with_genres = String(genre.id);
      }

      if (genre.lang) {
        if (genre.id === 999) {
          // Bangla: discover with original_language bn or with Bengali country filters
          params.with_original_language = 'bn';
        } else if (genre.id === 998) {
          // Hindi
          params.with_original_language = 'hi';
        } else {
          params.with_original_language = genre.lang;
        }
      }

      // Safe TMDB query wrapped in fetch
      const queryParams = new URLSearchParams({
        api_key: TMDB_API_KEY,
        ...params,
      }).toString();

      const res = await fetch(`https://api.themoviedb.org/3${endpoint}?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePressItem = (item: TMDBItem) => {
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    router.push({
      pathname: '/watch',
      params: { tmdbId: item.id, type },
    });
  };

  return (
    <View style={styles.container}>
      {/* Search Input Container */}
      <View style={styles.searchBarContainer}>
        <SearchIcon color="#71717a" size={20} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search movies, TV shows, anime..."
          placeholderTextColor="#71717a"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <X color="#fff" size={18} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results Header */}
      {selectedGenre && !query && (
        <View style={styles.genreHeader}>
          <Text style={styles.genreHeaderText}>Category: {selectedGenre}</Text>
          <TouchableOpacity onPress={clearSearch} style={styles.clearGenreBtn}>
            <X color="#a855f7" size={16} />
          </TouchableOpacity>
        </View>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      )}

      {/* Main Results / Genres list */}
      {!loading && results.length === 0 && !query && !selectedGenre ? (
        <FlatList
          data={GENRES}
          keyExtractor={(item, index) => item?.id ? String(item.id) : String(index)}
          numColumns={2}
          contentContainerStyle={styles.genresList}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>Explore Categories & Languages</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.genreCard} onPress={() => handleGenrePress(item)}>
              <Text style={styles.genreText}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        !loading && (
          <FlatList
            data={results}
            keyExtractor={(item, index) => item?.id ? String(item.id) : String(index)}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => {
              const posterUrl = item.poster_path
                ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
                : 'https://via.placeholder.com/300x450/1c1917/a855f7?text=No+Poster';
              return (
                <TouchableOpacity style={styles.gridCard} onPress={() => handlePressItem(item)}>
                  <Image source={{ uri: posterUrl }} style={styles.gridImage} />
                  <Text style={styles.gridTitle} numberOfLines={1}>
                    {item.title || item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No results found for your query.</Text>
              </View>
            }
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    paddingTop: 50,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  clearButton: {
    padding: 4,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  genresList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  genreCard: {
    flex: 1,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    height: 60,
    margin: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  genreText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  genreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  genreHeaderText: {
    color: '#a855f7',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearGenreBtn: {
    padding: 4,
    backgroundColor: '#27272a',
    borderRadius: 12,
  },
  gridContainer: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 24,
  },
  gridCard: {
    width: COLUMN_WIDTH,
    marginHorizontal: 4,
    marginBottom: 16,
    backgroundColor: '#18181b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: COLUMN_WIDTH * 1.5,
    resizeMode: 'cover',
  },
  gridTitle: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '600',
    padding: 6,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 15,
  },
});
