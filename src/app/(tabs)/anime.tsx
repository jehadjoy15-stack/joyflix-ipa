// src/app/(tabs)/anime.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Info, Plus, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tmdb, TMDBItem } from '../../services/tmdb';

const { width } = Dimensions.get('window');
const HERO_HEIGHT = 450;

export default function AnimeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Anime sections
  const [heroAnime, setHeroAnime] = useState<TMDBItem | null>(null);
  const [trendingAnime, setTrendingAnime] = useState<TMDBItem[]>([]);
  const [popularAnime, setPopularAnime] = useState<TMDBItem[]>([]);
  
  const [watchlist, setWatchlist] = useState<number[]>([]);

  const loadData = async () => {
    try {
      // Fetch anime items
      const animeData = await tmdb.getAnime();
      
      setTrendingAnime(animeData.slice(0, 15));
      setPopularAnime(animeData.slice(15, 30));

      if (animeData.length > 0) {
        // Select an anime with a backdrop for the hero banner
        const withBackdrop = animeData.filter(item => item.backdrop_path);
        setHeroAnime(withBackdrop[Math.floor(Math.random() * Math.min(withBackdrop.length, 5))] || animeData[0]);
      }
    } catch (e) {
      console.error('Anime page load error:', e);
    }
  };

  const loadUserState = async () => {
    try {
      const listStored = await AsyncStorage.getItem('@joyflix_watchlist');
      if (listStored) {
        setWatchlist(JSON.parse(listStored));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const init = async () => {
    setLoading(true);
    await loadUserState();
    setLoading(false);
    loadData().catch(e => console.error(e));
  };

  useEffect(() => {
    init();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadUserState()]);
    setRefreshing(false);
  };

  const toggleWatchlist = async (id: number) => {
    try {
      let updated = [...watchlist];
      if (updated.includes(id)) {
        updated = updated.filter(item => item !== id);
      } else {
        updated.push(id);
      }
      setWatchlist(updated);
      await AsyncStorage.setItem('@joyflix_watchlist', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePressItem = (item: TMDBItem) => {
    router.push({
      pathname: '/watch',
      params: { tmdbId: item.id, type: 'tv' }, // Anime is fetched as TV series on TMDB
    });
  };



  const inWatchlist = heroAnime ? watchlist.includes(heroAnime.id) : false;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a855f7" />
      }
    >
      {/* Header Overlay */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>JoyFlix Anime</Text>
      </View>

      {/* Hero Banner */}
      {heroAnime && (
        <ImageBackground
          source={{ uri: `https://image.tmdb.org/t/p/w1280${heroAnime.backdrop_path || heroAnime.poster_path}` }}
          style={styles.hero}
        >
          <View style={styles.heroGradient}>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{heroAnime.name || heroAnime.title}</Text>
              <Text style={styles.heroDesc} numberOfLines={3}>
                {heroAnime.overview}
              </Text>
              
              <View style={styles.heroButtons}>
                <TouchableOpacity
                  style={[styles.heroButton, styles.heroPlayButton]}
                  onPress={() => handlePressItem(heroAnime)}
                >
                  <Play size={20} color="#000" fill="#000" />
                  <Text style={styles.playText}>Watch Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.heroButton, styles.heroListButton]}
                  onPress={() => toggleWatchlist(heroAnime.id)}
                >
                  {inWatchlist ? <Check size={20} color="#fff" /> : <Plus size={20} color="#fff" />}
                  <Text style={styles.listText}>My List</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ImageBackground>
      )}

      {/* Trending Anime Row */}
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Trending Anime</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
          {trendingAnime.map(item => (
            <TouchableOpacity key={`anime_trend_${item.id}`} style={styles.card} onPress={() => handlePressItem(item)}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w300${item.poster_path}` }}
                style={styles.cardImage}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Popular Anime Row */}
      <View style={[styles.row, { marginBottom: 40 }]}>
        <Text style={styles.rowTitle}>Popular Japanese Anime</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
          {popularAnime.map(item => (
            <TouchableOpacity key={`anime_pop_${item.id}`} style={styles.card} onPress={() => handlePressItem(item)}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w300${item.poster_path}` }}
                style={styles.cardImage}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090b',
  },
  loadingText: {
    color: '#a855f7',
    marginTop: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    position: 'absolute',
    top: 35,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  hero: {
    width: width,
    height: HERO_HEIGHT,
  },
  heroGradient: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.45)',
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: 'rgba(9, 9, 11, 0.65)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  heroDesc: {
    color: '#e4e4e7',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  heroButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginRight: 12,
  },
  heroPlayButton: {
    backgroundColor: '#fff',
    flex: 1,
  },
  playText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  heroListButton: {
    backgroundColor: '#27272a',
    flex: 1,
  },
  listText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  row: {
    marginTop: 24,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 16,
    marginBottom: 12,
  },
  rowScroll: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  card: {
    marginRight: 10,
    width: 110,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
});
