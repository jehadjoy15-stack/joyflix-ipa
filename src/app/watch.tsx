// src/app/watch.tsx
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
  FlatList,
  Modal,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Play, Download, Plus, Check, Star, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { tmdb, TMDBItem, CastMember, Episode } from '../services/tmdb';
import { tsunade, StreamSource, SubtitleSource } from '../services/scrapers/tsunade';
import { multimovies } from '../services/scrapers/multimovies';
import { subtitlecat } from '../services/scrapers/subtitlecat';
import { downloadManager, ActiveDownload } from '../services/download';

const { width } = Dimensions.get('window');

export default function WatchDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tmdbId = Number(params.tmdbId);
  const mediaType = params.type as 'movie' | 'tv';

  const [loading, setLoading] = useState(true);
  const [resolvingStream, setResolvingStream] = useState(false);
  
  // Media details
  const [details, setDetails] = useState<any>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [similar, setSimilar] = useState<TMDBItem[]>([]);
  
  // TV specific
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [selectedEpDetails, setSelectedEpDetails] = useState<Episode | null>(null);

  // Lists & Statuses
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [localPath, setLocalPath] = useState('');

  // Scraper results caching for current episode
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleSource[]>([]);
  const [showDubModal, setShowDubModal] = useState(false);
  const [dubSelectionAction, setDubSelectionAction] = useState<'play' | 'download'>('play');
  const [downloadProgress, setDownloadProgress] = useState<number>(-1);
  const [downloadProgressText, setDownloadProgressText] = useState<string>('');

  const requestStoragePermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 33) {
        const grantedStatus = await PermissionsAndroid.request(
          (PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_VIDEO,
          {
            title: 'Storage Permission Required',
            message: 'Joyflix needs access to write downloaded videos to your device.',
            buttonPositive: 'Grant',
            buttonNegative: 'Deny',
          }
        );
        return grantedStatus === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const grantedStatus = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Storage Permission Required',
            message: 'Joyflix needs access to write downloaded videos to your device.',
            buttonPositive: 'Grant',
            buttonNegative: 'Deny',
          }
        );
        return grantedStatus === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  useEffect(() => {
    const unsubscribe = downloadManager.subscribeActiveDownloads((active) => {
      const found = active.find(
        d => d.tmdbId === tmdbId &&
        d.type === mediaType &&
        (mediaType === 'tv' ? (d.season === selectedSeason && d.episode === selectedEpisode) : true)
      );
      if (found) {
        setDownloadProgress(found.progress >= 0 ? found.progress : 0.01);
        setDownloadProgressText(found.progressText);
      } else {
        setDownloadProgress(-1);
        setDownloadProgressText('');
      }
    });
    return () => unsubscribe();
  }, [tmdbId, mediaType, selectedSeason, selectedEpisode]);

  const init = async () => {
    setLoading(true);
    try {
      // 1. Fetch details
      const detailData = await tmdb.getDetails(mediaType, tmdbId);
      setDetails(detailData);

      // 2. Fetch credits
      const creditsData = await tmdb.getCredits(mediaType, tmdbId);
      setCast(creditsData.slice(0, 10));

      // 3. Fetch recommendations
      const recommendations = await tmdb.getRecommendations(mediaType, tmdbId);
      setSimilar(recommendations.slice(0, 9));

      // 4. If TV Show, map seasons and load season 1 episodes
      if (mediaType === 'tv') {
        const seasonsList = detailData.seasons || [];
        // Filter out season 0 (Specials) if there are others
        const validSeasons = seasonsList.filter((s: any) => s.season_number > 0);
        setSeasons(validSeasons.length > 0 ? validSeasons : seasonsList);
        setSelectedSeason(1);
        await loadEpisodesForSeason(1);
      }

      await checkDownloadStatus();
      await loadWatchlistState();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodesForSeason = async (seasonNum: number) => {
    try {
      const list = await tmdb.getEpisodes(tmdbId, seasonNum);
      setEpisodes(list);
      if (list.length > 0) {
        setSelectedEpisode(1);
        setSelectedEpDetails(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadWatchlistState = async () => {
    try {
      const stored = await AsyncStorage.getItem('@joyflix_watchlist');
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch {}
  };

  const checkDownloadStatus = async () => {
    // Check if downloaded
    const status = await downloadManager.checkDownloadStatus(
      tmdbId,
      mediaType,
      mediaType === 'tv' ? selectedSeason : undefined,
      mediaType === 'tv' ? selectedEpisode : undefined
    );
    setIsDownloaded(status.downloaded);
    setLocalPath(status.filePath);
  };

  useEffect(() => {
    init();
  }, [tmdbId]);

  useEffect(() => {
    checkDownloadStatus();
  }, [selectedSeason, selectedEpisode]);

  const toggleWatchlist = async () => {
    try {
      let updated = [...watchlist];
      const isAlreadyIn = updated.some((item: any) => 
        item && typeof item === 'object' ? item.id === tmdbId : item === tmdbId
      );

      if (isAlreadyIn) {
        updated = updated.filter((item: any) => 
          item && typeof item === 'object' ? item.id !== tmdbId : item !== tmdbId
        );
      } else {
        updated.push({
          id: tmdbId,
          type: mediaType,
          title: details.title || details.name,
          poster_path: details.poster_path,
        } as any);
      }
      setWatchlist(updated);
      await AsyncStorage.setItem('@joyflix_watchlist', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectEpisode = (ep: Episode) => {
    setSelectedEpisode(ep.episode_number);
    setSelectedEpDetails(ep);
  };

  const handleSelectSeason = async (seasonNum: number) => {
    setSelectedSeason(seasonNum);
    await loadEpisodesForSeason(seasonNum);
  };

  // Run scrapers to resolve streams
  const resolveStreams = async (): Promise<boolean> => {
    setResolvingStream(true);
    setStreams([]);
    setSubtitles([]);
    try {
      const title = details.title || details.name;

      // 1. Try Vercel API first
      console.log('Resolving via Vercel Stream API...');
      let vercelUrl = '';
      if (mediaType === 'movie') {
        vercelUrl = `https://joyembed.vercel.app/api/movie/${tmdbId}?key=joy2441139`;
      } else {
        vercelUrl = `https://joyembed.vercel.app/api/tv/${tmdbId}/${selectedSeason}/${selectedEpisode}?key=joy2441139`;
      }

      let vercelData: any = null;
      try {
        const vercelRes = await fetch(vercelUrl);
        if (vercelRes.ok) {
          vercelData = await vercelRes.json();
        }
      } catch (err) {
        console.warn('Vercel API failed, falling back to local scrapers:', err);
      }

      const resolvedStreams: StreamSource[] = [];
      const resolvedSubs: SubtitleSource[] = [];
      const seenSubUrls = new Set<string>();

      if (vercelData && vercelData.streams && vercelData.streams.length > 0) {
        console.log('Successfully resolved streams via Vercel API!');
        resolvedStreams.push(...vercelData.streams);
        if (vercelData.subtitles && vercelData.subtitles.length > 0) {
          vercelData.subtitles.forEach((sub: any) => {
            if (!seenSubUrls.has(sub.url)) {
              seenSubUrls.add(sub.url);
              resolvedSubs.push({ lang: sub.lang || 'Subtitle', url: sub.url });
            }
          });
        }
      } else {
        console.log('Vercel API returned no streams. Running local scrapers as fallback...');
        
        // Parallel execution of local scrapers
        console.log('Resolving Tsunade...');
        const tsunadePromise = tsunade.getStreamsByTmdb(
          tmdbId,
          mediaType,
          selectedSeason,
          selectedEpisode,
          title
        ).catch(err => {
          console.warn('Tsunade scraping failed:', err);
          return null;
        });

        console.log('Resolving MultiMovies...');
        const multiMoviesPromise = multimovies.getStreams({
          type: mediaType,
          tmdbId,
          title,
          season: selectedSeason,
          episode: selectedEpisode
        }).catch(err => {
          console.warn('MultiMovies scraping failed:', err);
          return [];
        });

        console.log('Resolving SubtitleCat...');
        const subCatPromise = subtitlecat.fetchSubtitles({
          type: mediaType,
          title,
          season: selectedSeason,
          episode: selectedEpisode
        }).catch(err => {
          console.warn('SubtitleCat scraping failed:', err);
          return [];
        });

        const [tsunadeRes, multiMoviesRes, subCatRes] = await Promise.all([
          tsunadePromise,
          multiMoviesPromise,
          subCatPromise
        ]);

        // Merge Tsunade streams
        if (tsunadeRes && tsunadeRes.streams) {
          resolvedStreams.push(...tsunadeRes.streams);
        }
        // Merge Tsunade subs
        if (tsunadeRes && tsunadeRes.subtitles) {
          tsunadeRes.subtitles.forEach(sub => {
            if (!seenSubUrls.has(sub.url)) {
              seenSubUrls.add(sub.url);
              resolvedSubs.push(sub);
            }
          });
        }

        // Merge MultiMovies streams
        if (multiMoviesRes && multiMoviesRes.length > 0) {
          resolvedStreams.push(...multiMoviesRes);
        }

        // Merge SubtitleCat subs
        if (subCatRes && subCatRes.length > 0) {
          subCatRes.forEach(sub => {
            if (!seenSubUrls.has(sub.url)) {
              seenSubUrls.add(sub.url);
              resolvedSubs.push(sub);
            }
          });
        }
      }

      setStreams(resolvedStreams);
      setSubtitles(resolvedSubs);

      if (resolvedStreams.length === 0) {
        Alert.alert('No Streams Found', 'Could not resolve any video streams for this item from any scrapers.');
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'An error occurred while resolving play links.');
      return false;
    } finally {
      setResolvingStream(false);
    }
  };

  const handlePlayClick = async () => {
    // If downloaded, play offline directly
    if (isDownloaded && localPath) {
      router.push({
        pathname: '/player',
        params: {
          offlinePath: localPath,
          title: details.title || details.name,
          season: mediaType === 'tv' ? selectedSeason : '',
          episode: mediaType === 'tv' ? selectedEpisode : '',
          type: mediaType,
          tmdbId,
          coverUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : undefined,
          overview: mediaType === 'tv' && selectedEpDetails?.overview ? selectedEpDetails.overview : (details.overview || ''),
          rating: details.vote_average ? String(details.vote_average.toFixed(1)) : '0.0',
        },
      });
      return;
    }

    const success = await resolveStreams();
    if (success) {
      setDubSelectionAction('play');
      setShowDubModal(true);
    }
  };

  const handleDownloadClick = async () => {
    if (isDownloaded) {
      Alert.alert('Downloaded', 'This episode/movie is already downloaded on your device.');
      return;
    }

    const isActive = downloadManager.activeDownloads.some(
      d => d.tmdbId === tmdbId && 
      d.type === mediaType && 
      (mediaType === 'tv' ? (d.season === selectedSeason && d.episode === selectedEpisode) : true)
    );
    if (isActive || downloadProgress >= 0) {
      Alert.alert('Downloading', 'Download is already in progress.');
      return;
    }

    const success = await resolveStreams();
    if (success) {
      setDubSelectionAction('download');
      setShowDubModal(true);
    }
  };

  const startDownloadItem = async (stream: StreamSource) => {
    setShowDubModal(false);

    // Request storage permission on Android
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Storage permission is required to save downloads.');
      return;
    }

    // Prevent duplicate downloads
    const isActive = downloadManager.activeDownloads.some(
      d => d.tmdbId === tmdbId && 
      d.type === mediaType && 
      (mediaType === 'tv' ? (d.season === selectedSeason && d.episode === selectedEpisode) : true)
    );
    if (isActive) {
      Alert.alert('Downloading', 'This movie/episode is already downloading in the background.');
      return;
    }

    setDownloadProgress(0);
    setDownloadProgressText('0%');

    const titleLabel = mediaType === 'tv'
      ? `${details.name} - S${String(selectedSeason).padStart(2, '0')}E${String(selectedEpisode).padStart(2, '0')}`
      : details.title;

    try {
      const result = await downloadManager.downloadVideo(
        stream.url,
        {
          tmdbId,
          title: titleLabel,
          type: mediaType,
          season: mediaType === 'tv' ? selectedSeason : undefined,
          episode: mediaType === 'tv' ? selectedEpisode : undefined,
          dub: stream.server,
          posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w300${details.poster_path}` : undefined,
        },
        (progress) => {
          // Progress is updated automatically by subscribeActiveDownloads
        }
      );

      Alert.alert('Download Completed', `"${result.title}" downloaded successfully for offline viewing.`);
      checkDownloadStatus();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        'Download Failed',
        e && e.message ? `Error: ${e.message}` : 'An error occurred during video download.'
      );
    } finally {
      setDownloadProgress(-1);
    }
  };

  // Helper to normalize and get language name
  const getStreamLanguage = (stream: StreamSource): string => {
    const lang = (stream.lang || stream.label || '').trim();
    if (lang) {
      const lower = lang.toLowerCase();
      if (lower.includes('hindi') || lower === 'hi' || lower === 'hin') return 'Hindi';
      if (lower.includes('bengali') || lower.includes('bangla') || lower === 'bn' || lower === 'ben') return 'Bengali';
      if (lower.includes('english') || lower === 'en' || lower === 'eng') return 'English';
      if (lower.includes('tamil') || lower === 'ta' || lower === 'tam') return 'Tamil';
      if (lower.includes('telugu') || lower === 'te' || lower === 'tel') return 'Telugu';
      if (lower.includes('original') || lower.includes('jp') || lower.includes('jap')) return 'Original';
      return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
    }
    
    const serverLower = (stream.server || '').toLowerCase();
    if (serverLower.includes('hindi')) return 'Hindi';
    if (serverLower.includes('bengali') || serverLower.includes('bangla')) return 'Bengali';
    if (serverLower.includes('english')) return 'English';
    if (serverLower.includes('tamil')) return 'Tamil';
    if (serverLower.includes('telugu')) return 'Telugu';
    if (serverLower.includes('original')) return 'Original';
    
    return 'Original';
  };

  // Helper to prioritize and select the best stream quality from list
  const selectBestStream = (langStreams: StreamSource[]): StreamSource => {
    const priority = ['1080p', '720p', 'Auto', '1080', '720'];
    for (const p of priority) {
      const match = langStreams.find(s => (s.quality || '').toLowerCase().includes(p.toLowerCase()));
      if (match) return match;
    }
    return langStreams[0];
  };

  const handleSelectLanguage = (lang: string) => {
    const filtered = streams.filter(stream => {
      if (dubSelectionAction === 'download') {
        const urlLower = stream.url.toLowerCase();
        const serverLower = stream.server.toLowerCase();
        return (
          urlLower.includes('.mp4') || 
          urlLower.includes('.mkv') || 
          serverLower.includes('moviebox')
        );
      }
      return true;
    });

    const langStreams = filtered.filter(s => getStreamLanguage(s) === lang);
    if (langStreams.length > 0) {
      const best = selectBestStream(langStreams);
      handleSelectDub(best);
    }
  };

  const handleSelectDub = (stream: StreamSource) => {
    setShowDubModal(false);
    if (dubSelectionAction === 'play') {
      // Find matching subtitles for player (e.g. English, Bengali)
      router.push({
        pathname: '/player',
        params: {
          streamUrl: stream.url,
          title: details.title || details.name,
          season: mediaType === 'tv' ? selectedSeason : '',
          episode: mediaType === 'tv' ? selectedEpisode : '',
          type: mediaType,
          tmdbId,
          dubName: stream.server,
          dubLang: stream.lang || stream.label || 'Original',
          coverUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : undefined,
          subtitles: JSON.stringify(subtitles),
          overview: mediaType === 'tv' && selectedEpDetails?.overview ? selectedEpDetails.overview : (details.overview || ''),
          rating: details.vote_average ? String(details.vote_average.toFixed(1)) : '0.0',
        },
      });
    } else {
      // Download selected dub
      startDownloadItem(stream);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
        <Text style={styles.loadingText}>Fetching Details...</Text>
      </View>
    );
  }

  const inList = watchlist.some((item: any) => (item && typeof item === 'object' ? item.id === tmdbId : item === tmdbId));
  const posterUrl = details.poster_path
    ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
    : 'https://via.placeholder.com/300x450/1c1917/a855f7?text=No+Poster';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Hero Backdrop */}
      <View style={styles.backdropContainer}>
        {details.backdrop_path ? (
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` }}
            style={styles.backdrop}
          />
        ) : (
          <View style={styles.backdropFallback} />
        )}
        <View style={styles.backdropOverlay} />
        
        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      {/* Info Details Section */}
      <View style={styles.detailsContent}>
        <View style={styles.metaRow}>
          <Image source={{ uri: posterUrl }} style={styles.poster} />
          
          <View style={styles.metaTextContainer}>
            <Text style={styles.title}>{details.title || details.name}</Text>
            
            <View style={styles.badgeRow}>
              <View style={styles.ratingBadge}>
                <Star color="#eab308" size={14} fill="#eab308" />
                <Text style={styles.ratingText}>
                  {details.vote_average ? details.vote_average.toFixed(1) : '0.0'}
                </Text>
              </View>
              
              <Text style={styles.metaText}>
                {mediaType === 'movie'
                  ? details.release_date?.split('-')[0]
                  : details.first_air_date?.split('-')[0]}
              </Text>

              {details.runtime && (
                <Text style={styles.metaText}>
                  {Math.floor(details.runtime / 60)}h {details.runtime % 60}m
                </Text>
              )}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.watchlistBtn}
                onPress={toggleWatchlist}
              >
                {inList ? <Check color="#a855f7" size={20} /> : <Plus color="#fff" size={20} />}
                <Text style={[styles.actionText, inList && { color: '#a855f7' }]}>My List</Text>
              </TouchableOpacity>

              {downloadProgress >= 0 ? (
                <View style={styles.downloadProgressBadge}>
                  <RefreshCw color="#a855f7" size={16} style={{ transform: [{ rotate: '45deg' }] }} />
                    <Text style={styles.downloadProgressText}>
                      {downloadProgressText}
                    </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={handleDownloadClick}
                >
                  <Download color={isDownloaded ? '#a855f7' : '#fff'} size={20} />
                  <Text style={[styles.actionText, isDownloaded && { color: '#a855f7' }]}>
                    {isDownloaded ? 'Offline' : 'Download'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Play Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayClick}
          disabled={resolvingStream}
        >
          {resolvingStream ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Play size={20} color="#000" fill="#000" />
              <Text style={styles.playButtonText}>
                {isDownloaded ? 'Play Offline' : 'Play Video'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Overview */}
        <Text style={styles.overviewTitle}>Overview</Text>
        <Text style={styles.overview}>
          {mediaType === 'tv' && selectedEpDetails?.overview
            ? selectedEpDetails.overview
            : details.overview || 'No overview description available.'}
        </Text>

        {/* Cast Section */}
        {cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Cast</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castScroll}>
              {cast.map(c => {
                const profileUrl = c.profile_path
                  ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
                  : 'https://via.placeholder.com/100x100/1c1917/a855f7?text=Actor';
                return (
                  <View key={`cast_${c.id}`} style={styles.castCard}>
                    <Image source={{ uri: profileUrl }} style={styles.castImage} />
                    <Text style={styles.castName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.castCharacter} numberOfLines={1}>
                      {c.character}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* TV Series / Anime Season & Episode selector */}
        {mediaType === 'tv' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Seasons & Episodes</Text>
            
            {/* Season selection row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonsScroll}>
              {seasons.map(s => {
                const isSelected = selectedSeason === s.season_number;
                return (
                  <TouchableOpacity
                    key={`season_${s.id}`}
                    style={[styles.seasonTab, isSelected && styles.activeSeasonTab]}
                    onPress={() => handleSelectSeason(s.season_number)}
                  >
                    <Text style={[styles.seasonTabText, isSelected && styles.activeSeasonTabText]}>
                      Season {s.season_number}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Episodes List */}
            <View style={styles.episodesList}>
              {episodes.map(ep => {
                const isSelected = selectedEpisode === ep.episode_number;
                const stillUrl = ep.still_path
                  ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                  : 'https://via.placeholder.com/300x170/1c1917/a855f7?text=Episode';
                return (
                  <TouchableOpacity
                    key={`ep_${ep.id}`}
                    style={[styles.episodeCard, isSelected && styles.selectedEpisodeCard]}
                    onPress={() => handleSelectEpisode(ep)}
                  >
                    <Image source={{ uri: stillUrl }} style={styles.episodeStill} />
                    <View style={styles.episodeInfo}>
                      <Text style={styles.episodeNum} numberOfLines={1}>
                        Episode {ep.episode_number}
                      </Text>
                      <Text style={styles.episodeTitle} numberOfLines={1}>
                        {ep.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Similar/More like this Section */}
        {similar.length > 0 && (
          <View style={[styles.section, { marginBottom: 30 }]}>
            <Text style={styles.sectionTitle}>More Like This</Text>
            <FlatList
              data={similar}
              keyExtractor={item => String(item.id)}
              numColumns={3}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.similarCard}
                  onPress={() =>
                    router.push({
                      pathname: '/watch',
                      params: { tmdbId: item.id, type: mediaType },
                    })
                  }
                >
                  <Image
                    source={{ uri: `https://image.tmdb.org/t/p/w185${item.poster_path}` }}
                    style={styles.similarImage}
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* DUB DUBBED SELECTION MODAL */}
      <Modal
        visible={showDubModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDubModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {dubSelectionAction === 'play' ? 'Select Audio Language' : 'Select Download Language'}
            </Text>
            <ScrollView style={styles.modalScroll}>
              {(() => {
                // Filter streams depending on action
                const activeStreams = streams.filter(stream => {
                  if (dubSelectionAction === 'download') {
                    const urlLower = (stream.url || '').toLowerCase();
                    const serverLower = (stream.server || '').toLowerCase();
                    return (
                      urlLower.includes('.mp4') || 
                      urlLower.includes('.mkv') || 
                      serverLower.includes('moviebox')
                    );
                  }
                  return true;
                });

                // Group streams by normalized language name
                const groupedStreams: { [lang: string]: StreamSource[] } = {};
                activeStreams.forEach((stream) => {
                  const lang = getStreamLanguage(stream);
                  if (!groupedStreams[lang]) {
                    groupedStreams[lang] = [];
                  }
                  groupedStreams[lang].push(stream);
                });

                const languages = Object.keys(groupedStreams);

                if (languages.length === 0) {
                  return (
                    <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 20 }}>
                      No available options for this selection.
                    </Text>
                  );
                }

                return languages.map((lang, idx) => {
                  const langStreams = groupedStreams[lang];
                  const bestStream = selectBestStream(langStreams);
                  return (
                    <TouchableOpacity
                      key={`lang_sel_${idx}`}
                      style={styles.modalItem}
                      onPress={() => {
                        handleSelectLanguage(lang);
                      }}
                    >
                      <Play color="#a855f7" size={16} style={{ marginRight: 10 }} />
                      <Text style={styles.modalItemText}>{lang}</Text>
                      <Text style={styles.modalItemSub}>({bestStream.quality})</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowDubModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    paddingBottom: 40,
  },
  backdropContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backdropFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#18181b',
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 9, 11, 0.55)',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 20,
  },
  detailsContent: {
    paddingHorizontal: 16,
    marginTop: -50,
  },
  metaRow: {
    flexDirection: 'row',
  },
  poster: {
    width: 100,
    height: 150,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#27272a',
    backgroundColor: '#18181b',
  },
  metaTextContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 10,
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  metaText: {
    color: '#71717a',
    fontSize: 13,
    marginRight: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadProgressText: {
    color: '#a855f7',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  playButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    height: 48,
  },
  playButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  overviewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 8,
  },
  overview: {
    color: '#d4d4d8',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  castScroll: {
    paddingRight: 16,
  },
  castCard: {
    width: 80,
    marginRight: 12,
    alignItems: 'center',
  },
  castImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#18181b',
  },
  castName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  castCharacter: {
    color: '#71717a',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },
  seasonsScroll: {
    paddingRight: 16,
    marginBottom: 12,
  },
  seasonTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 20,
    marginRight: 8,
  },
  activeSeasonTab: {
    backgroundColor: '#1e1b4b',
    borderColor: '#a855f7',
  },
  seasonTabText: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: '600',
  },
  activeSeasonTabText: {
    color: '#c084fc',
  },
  episodesList: {
    marginTop: 4,
  },
  episodeCard: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#1e1e24',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  selectedEpisodeCard: {
    borderColor: '#a855f7',
    backgroundColor: '#181224',
  },
  episodeStill: {
    width: 90,
    height: 55,
    borderRadius: 6,
    backgroundColor: '#18181b',
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  episodeNum: {
    color: '#a855f7',
    fontSize: 11,
    fontWeight: 'bold',
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  similarCard: {
    flex: 1,
    aspectRatio: 2/3,
    margin: 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  similarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    marginBottom: 12,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  modalItemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  modalItemSub: {
    color: '#71717a',
    fontSize: 12,
  },
  modalCloseBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderRadius: 8,
    marginTop: 8,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
