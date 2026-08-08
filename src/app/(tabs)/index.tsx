// src/app/(tabs)/index.tsx
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

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Content states
  const [heroItem, setHeroItem] = useState<TMDBItem | null>(null);
  const [trending, setTrending] = useState<TMDBItem[]>([]);
  const [popular, setPopular] = useState<TMDBItem[]>([]);
  const [topRated, setTopRated] = useState<TMDBItem[]>([]);
  
  // User lists
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);

  const loadData = async () => {
    try {
      // Fetch TMDB sections in parallel
      const [trendingData, popularData, topRatedData] = await Promise.all([
        tmdb.getTrending('all'),
        tmdb.getPopular('movie'),
        tmdb.getTopRated('movie'),
      ]);

      setTrending(trendingData);
      setPopular(popularData);
      setTopRated(topRatedData);

      // Select first item with backdrop as hero banner
      if (trendingData.length > 0) {
        const withBackdrop = trendingData.filter(item => item.backdrop_path);
        setHeroItem(withBackdrop[Math.floor(Math.random() * Math.min(withBackdrop.length, 5))] || trendingData[0]);
      }
    } catch (e) {
      console.error('Home load error:', e);
    }
  };

  const loadUserState = async () => {
    try {
      // Watchlist
      const listStored = await AsyncStorage.getItem('@joyflix_watchlist');
      if (listStored) {
        setWatchlist(JSON.parse(listStored));
      } else {
        setWatchlist([]);
      }

      // Continue watching
      const cwStored = await AsyncStorage.getItem('@joyflix_continue_watching');
      if (cwStored) {
        setContinueWatching(JSON.parse(cwStored));
      } else {
        setContinueWatching([]);
      }
    } catch (e) {
      console.error('Failed to load user state:', e);
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

  // Re-run whenever screen gains focus
  useEffect(() => {
    const loadStateOnFocus = () => {
      loadUserState();
    };
    // Re-check user state every 3 seconds to keep sync
    const interval = setInterval(loadStateOnFocus, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleWatchlist = async (id: number) => {
    try {
      let updated = [...watchlist];
      const isAlreadyIn = updated.some((item: any) => 
        item && typeof item === 'object' ? item.id === id : item === id
      );

      if (isAlreadyIn) {
        updated = updated.filter((item: any) => 
          item && typeof item === 'object' ? item.id !== id : item !== id
        );
      } else {
        const itemObj = heroItem && heroItem.id === id ? heroItem : null;
        if (itemObj) {
          updated.push({
            id: itemObj.id,
            type: itemObj.media_type || (itemObj.title ? 'movie' : 'tv'),
            title: itemObj.title || itemObj.name,
            poster_path: itemObj.poster_path,
          } as any);
        } else {
          updated.push(id as any);
        }
      }
      setWatchlist(updated);
      await AsyncStorage.setItem('@joyflix_watchlist', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePressItem = (item: TMDBItem) => {
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    router.push({
      pathname: '/watch',
      params: { tmdbId: item.id, type },
    });
  };



  const inWatchlist = heroItem
    ? watchlist.some((item: any) => (item && typeof item === 'object' ? item.id === heroItem.id : item === heroItem.id))
    : false;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a855f7" />
      }
    >
      {/* Header overlay */}
      <View style={styles.header}>
        <Image
          source={require('../../../assets/images/joyflix_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/(tabs)/settings')}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>J</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero Banner */}
      {heroItem && (
        <ImageBackground
          source={{ uri: `https://image.tmdb.org/t/p/w1280${heroItem.backdrop_path || heroItem.poster_path}` }}
          style={styles.hero}
        >
          <View style={styles.heroGradient}>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{heroItem.title || heroItem.name}</Text>
              <Text style={styles.heroDesc} numberOfLines={3}>
                {heroItem.overview}
              </Text>
              
              <View style={styles.heroButtons}>
                <TouchableOpacity
                  style={[styles.heroButton, styles.heroPlayButton]}
                  onPress={() => handlePressItem(heroItem)}
                >
                  <Play size={20} color="#000" fill="#000" />
                  <Text style={styles.playText}>Play</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.heroButton, styles.heroListButton]}
                  onPress={() => toggleWatchlist(heroItem.id)}
                >
                  {inWatchlist ? <Check size={20} color="#fff" /> : <Plus size={20} color="#fff" />}
                  <Text style={styles.listText}>My List</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ImageBackground>
      )}

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Continue Watching</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {continueWatching.map((item, idx) => (
              <TouchableOpacity
                key={`cw_${item.id}_${idx}`}
                style={styles.cwCard}
                onPress={() =>
                  router.push({
                    pathname: '/watch',
                    params: { tmdbId: item.tmdbId, type: item.type },
                  })
                }
              >
                <Image
                  source={{ uri: item.posterUrl || 'https://via.placeholder.com/150x220' }}
                  style={styles.cwImage}
                />
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${(item.currentTime / (item.duration || 1)) * 100}%` }]} />
                </View>
                <View style={styles.cwTitleBg}>
                  <Text style={styles.cwTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.type === 'tv' && (
                    <Text style={styles.cwSub} numberOfLines={1}>
                      S{item.season} E{item.episode}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>My List</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {watchlist.map((watchItem: any, idx) => {
              const isObj = watchItem && typeof watchItem === 'object';
              const itemId = isObj ? watchItem.id : watchItem;
              
              if (isObj) {
                const posterUrl = watchItem.poster_path
                  ? `https://image.tmdb.org/t/p/w300${watchItem.poster_path}`
                  : 'https://via.placeholder.com/300x450/1c1917/a855f7?text=No+Poster';
                
                return (
                  <TouchableOpacity
                    key={`wl_${itemId}_${idx}`}
                    style={styles.card}
                    onPress={() => 
                      router.push({
                        pathname: '/watch',
                        params: { tmdbId: itemId, type: watchItem.type },
                      })
                    }
                  >
                    <Image source={{ uri: posterUrl }} style={styles.cardImage} />
                  </TouchableOpacity>
                );
              }
              
              const matched = trending.find(t => t.id === itemId);
              if (!matched) return null;
              
              return (
                <TouchableOpacity
                  key={`wl_${itemId}_${idx}`}
                  style={styles.card}
                  onPress={() => handlePressItem(matched)}
                >
                  <Image
                    source={{ uri: `https://image.tmdb.org/t/p/w300${matched.poster_path}` }}
                    style={styles.cardImage}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Trending Row */}
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Trending Now</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
          {trending.map(item => (
            <TouchableOpacity key={`trend_${item.id}`} style={styles.card} onPress={() => handlePressItem(item)}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w300${item.poster_path}` }}
                style={styles.cardImage}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Popular Movies */}
      <View style={styles.row}>
        <Text style={styles.rowTitle}>Popular Movies</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
          {popular.map(item => (
            <TouchableOpacity key={`pop_${item.id}`} style={styles.card} onPress={() => handlePressItem(item)}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w300${item.poster_path}` }}
                style={styles.cardImage}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Top Rated Row */}
      <View style={[styles.row, { marginBottom: 40 }]}>
        <Text style={styles.rowTitle}>Top Rated</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
          {topRated.map(item => (
            <TouchableOpacity key={`top_${item.id}`} style={styles.card} onPress={() => handlePressItem(item)}>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  logo: {
    width: 100,
    height: 40,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileBtn: {
    marginLeft: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  hero: {
    width: '100%',
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
  cwCard: {
    marginRight: 12,
    width: 140,
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  cwImage: {
    width: '100%',
    height: 125,
    resizeMode: 'cover',
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#3f3f46',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#a855f7',
  },
  cwTitleBg: {
    padding: 6,
  },
  cwTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cwSub: {
    color: '#a1a1aa',
    fontSize: 9,
    marginTop: 1,
  },
});
