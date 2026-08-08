// src/app/(tabs)/mylist.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Film } from 'lucide-react-native';

interface WatchlistItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path?: string;
  posterUrl?: string; // Fallback if full URL was saved
}

export default function MyListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWatchlist = async () => {
    try {
      const stored = await AsyncStorage.getItem('@joyflix_watchlist');
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Filter out legacy simple numbers to ensure we only render items with metadata objects
        const objectItems = parsed.filter(
          (item: any) => item && typeof item === 'object' && item.id
        ) as WatchlistItem[];
        
        setWatchlist(objectItems);
      } else {
        setWatchlist([]);
      }
    } catch (e) {
      console.error('Failed to load watchlist:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
    // Keep list in sync by polling every 2.5s when active
    const timer = setInterval(loadWatchlist, 2500);
    return () => clearInterval(timer);
  }, []);

  const handlePressItem = (item: WatchlistItem) => {
    router.push({
      pathname: '/watch',
      params: { tmdbId: item.id, type: item.type },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top || 40 }]}>
      <Text style={styles.title}>My List</Text>
      
      {watchlist.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Film color="#71717a" size={64} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>Your list is empty</Text>
          <Text style={styles.emptySubText}>
            Content you save will appear here for quick access.
          </Text>
        </View>
      ) : (
        <FlatList
          data={watchlist}
          keyExtractor={(item) => `ml_${item.id}`}
          numColumns={3}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item }) => {
            const posterPath = item.poster_path || item.posterUrl;
            const posterUrl = posterPath
              ? (posterPath.startsWith('http') ? posterPath : `https://image.tmdb.org/t/p/w300${posterPath}`)
              : 'https://via.placeholder.com/300x450/1c1917/a855f7?text=No+Poster';

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handlePressItem(item)}
              >
                <Image source={{ uri: posterUrl }} style={styles.cardImage} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    paddingHorizontal: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubText: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  gridContainer: {
    paddingBottom: 24,
  },
  card: {
    flex: 1 / 3,
    margin: 4,
    height: 165,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  cardImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  cardTitle: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlign: 'center',
  },
});
