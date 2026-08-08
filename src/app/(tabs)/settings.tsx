// src/app/(tabs)/settings.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Trash2, Play, Download, HardDrive, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadManager, DownloadItem, ActiveDownload } from '../../services/download';

export default function SettingsScreen() {
  const router = useRouter();
  
  // Watch history list
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Active downloads list
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);

  // Downloads list
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = downloadManager.subscribeActiveDownloads((active) => {
      setActiveDownloads(active);
    });
    return () => unsubscribe();
  }, []);

  const loadWatchHistory = async () => {
    setHistoryLoading(true);
    try {
      const historyStored = await AsyncStorage.getItem('@joyflix_watch_history');
      if (historyStored) {
        setHistory(JSON.parse(historyStored));
      } else {
        setHistory([]);
      }
    } catch (e) {
      console.error('Failed to load watch history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const clearWatchHistory = async () => {
    Alert.alert(
      'Clear Watch History',
      'Are you sure you want to clear your entire watch history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('@joyflix_watch_history');
              setHistory([]);
            } catch (e) {
              console.error(e);
            }
          },
        },
      ]
    );
  };

  const removeHistoryItem = async (id: string) => {
    try {
      const updated = history.filter((item) => item.id !== id);
      setHistory(updated);
      await AsyncStorage.setItem('@joyflix_watch_history', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayHistory = (item: any) => {
    router.push({
      pathname: '/watch',
      params: { tmdbId: item.tmdbId, type: item.type },
    });
  };

  const loadDownloads = async () => {
    setDownloadsLoading(true);
    try {
      const list = await downloadManager.getDownloads();
      setDownloads(list);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadsLoading(false);
    }
  };

  const handleDeleteDownload = async (id: string, title: string) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${title}" offline file?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadManager.deleteDownload(id);
              loadDownloads();
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to delete downloaded file.');
            }
          },
        },
      ]
    );
  };

  const handlePlayOffline = (item: DownloadItem) => {
    router.push({
      pathname: '/player',
      params: {
        offlinePath: item.filePath,
        title: item.title,
        season: item.season || '',
        episode: item.episode || '',
        type: item.type,
        tmdbId: item.tmdbId,
      },
    });
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
             date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    loadWatchHistory();
    loadDownloads();
  }, []);

  // Poll for downloads updates and watch history periodically
  useEffect(() => {
    const checkState = () => {
      loadDownloads();
      // Only silent reload watch history
      AsyncStorage.getItem('@joyflix_watch_history').then((stored) => {
        if (stored) {
          setHistory(JSON.parse(stored));
        } else {
          setHistory([]);
        }
      });
    };
    const interval = setInterval(checkState, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.headerTitle}>Settings</Text>

      {/* SECTION: Watch History */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Watch History</Text>
          {history.length > 0 && (
            <TouchableOpacity style={styles.clearHistoryBtn} onPress={clearWatchHistory}>
              <Trash2 color="#f87171" size={14} />
              <Text style={styles.clearHistoryText}>Clear History</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {historyLoading ? (
          <ActivityIndicator size="small" color="#a855f7" style={{ marginVertical: 20 }} />
        ) : history.length > 0 ? (
          <FlatList
            data={history}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.historyCard}>
                <Image
                  source={{ uri: item.posterUrl || 'https://via.placeholder.com/150x220' }}
                  style={styles.historyPoster}
                />
                <View style={styles.historyDetails}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.historySub}>
                    {item.type === 'tv' ? `S${item.season} E${item.episode} | ` : ''}
                    {item.type === 'tv' ? 'TV Show' : 'Movie'}
                  </Text>
                  <Text style={styles.historyTime}>{formatTime(item.watchedAt)}</Text>
                </View>
                <View style={styles.historyActions}>
                  <TouchableOpacity
                    style={styles.playHistoryBtn}
                    onPress={() => handlePlayHistory(item)}
                  >
                    <Play color="#fff" size={16} fill="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteHistoryBtn}
                    onPress={() => removeHistoryItem(item.id)}
                  >
                    <Trash2 color="#ef4444" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Clock color="#71717a" size={32} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>No watch history found.</Text>
            <Text style={styles.emptySubText}>
              Shows and movies you play will be recorded here so you can easily return to them.
            </Text>
          </View>
        )}
      </View>

      {/* SECTION: Active Downloads */}
      {activeDownloads.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Downloads</Text>
          <FlatList
            data={activeDownloads}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.historyCard}>
                <ActivityIndicator size="small" color="#a855f7" style={{ marginRight: 10 }} />
                <View style={styles.historyDetails}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.historySub}>
                    {item.type === 'tv' ? `S${item.season} E${item.episode} | ` : ''}
                    Downloading... ({item.progressText})
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* SECTION: Offline Downloads Manager */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Offline Downloads</Text>
          <View style={styles.storageIndicator}>
            <HardDrive color="#a855f7" size={16} />
            <Text style={styles.storageText}>{downloads.length} Files</Text>
          </View>
        </View>

        {downloadsLoading ? (
          <ActivityIndicator size="small" color="#a855f7" style={{ marginVertical: 20 }} />
        ) : downloads.length > 0 ? (
          <FlatList
            data={downloads}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.downloadCard}>
                <Image
                  source={{ uri: item.posterUrl || 'https://via.placeholder.com/150x220' }}
                  style={styles.downloadPoster}
                />
                <View style={styles.downloadDetails}>
                  <Text style={styles.downloadTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.downloadSub}>
                    {item.type === 'tv' ? `S${item.season} E${item.episode} | ` : ''}
                    {item.dub}
                  </Text>
                  <Text style={styles.downloadSize}>{formatBytes(item.fileSize)}</Text>
                </View>
                <View style={styles.downloadActions}>
                  <TouchableOpacity
                    style={styles.playOfflineBtn}
                    onPress={() => handlePlayOffline(item)}
                  >
                    <Play color="#fff" size={16} fill="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteOfflineBtn}
                    onPress={() => handleDeleteDownload(item.id, item.title)}
                  >
                    <Trash2 color="#ef4444" size={18} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyDownloadsCard}>
            <Download color="#71717a" size={32} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyText}>No offline downloads found.</Text>
            <Text style={styles.emptySubText}>
              Downloaded movies/shows will appear here for serverless offline playback.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  contentContainer: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  storageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  storageText: {
    color: '#c084fc',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  
  // Watch History Card styles
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  historyPoster: {
    width: 45,
    height: 65,
    borderRadius: 6,
    resizeMode: 'cover',
  },
  historyDetails: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  historyTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  historySub: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 4,
  },
  historyTime: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 4,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playHistoryBtn: {
    padding: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
    marginRight: 6,
  },
  deleteHistoryBtn: {
    padding: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  clearHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3f1a1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clearHistoryText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  emptyHistoryCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Offline Downloads styles
  downloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  downloadPoster: {
    width: 45,
    height: 65,
    borderRadius: 6,
    resizeMode: 'cover',
  },
  downloadDetails: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  downloadTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  downloadSub: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 4,
  },
  downloadSize: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 4,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playOfflineBtn: {
    padding: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
    marginRight: 6,
  },
  deleteOfflineBtn: {
    padding: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  emptyDownloadsCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#71717a',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
  },
});
