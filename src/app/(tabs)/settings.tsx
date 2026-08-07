// src/app/(tabs)/settings.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LogIn, LogOut, Trash2, Play, Download, HardDrive } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadManager, DownloadItem } from '../../services/download';

export default function SettingsScreen() {
  const router = useRouter();
  const [discordToken, setDiscordToken] = useState<string | null>(null);
  const [discordProfile, setDiscordProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [rpcEnabled, setRpcEnabled] = useState(true);
  
  // Downloads list
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);

  const loadSettings = async () => {
    try {
      // Load Discord token
      const token = await AsyncStorage.getItem('@joyflix_discord_token');
      setDiscordToken(token);

      // Load RPC setting
      const rpcVal = await AsyncStorage.getItem('@joyflix_discord_rpc_enabled');
      if (rpcVal !== null) {
        setRpcEnabled(rpcVal === 'true');
      }

      if (token) {
        fetchDiscordProfile(token);
      } else {
        setDiscordProfile(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDiscordProfile = async (token: string) => {
    setProfileLoading(true);
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { Authorization: token },
      });
      if (response.ok) {
        const data = await response.json();
        setDiscordProfile(data);
      } else {
        // Token expired/invalid, clear it
        logoutDiscord();
      }
    } catch (e) {
      console.error('Failed to fetch Discord profile:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const logoutDiscord = async () => {
    try {
      await AsyncStorage.removeItem('@joyflix_discord_token');
      setDiscordToken(null);
      setDiscordProfile(null);
      Alert.alert('Logged Out', 'Successfully logged out of Discord.');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleRpc = async (val: boolean) => {
    setRpcEnabled(val);
    try {
      await AsyncStorage.setItem('@joyflix_discord_rpc_enabled', String(val));
    } catch (e) {
      console.error(e);
    }
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

  useEffect(() => {
    loadSettings();
    loadDownloads();
  }, []);

  // Poll for settings changes (when user comes back from login modal)
  useEffect(() => {
    const checkState = () => {
      AsyncStorage.getItem('@joyflix_discord_token').then((token) => {
        if (token && token !== discordToken) {
          setDiscordToken(token);
          fetchDiscordProfile(token);
        }
      });
      loadDownloads();
    };
    const interval = setInterval(checkState, 3000);
    return () => clearInterval(interval);
  }, [discordToken]);

  const handleDeleteDownload = (id: string, title: string) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${title}" offline file?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await downloadManager.deleteDownload(id);
            if (success) {
              loadDownloads();
            } else {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.headerTitle}>Settings</Text>

      {/* SECTION: Discord Integration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discord Integration</Text>
        
        {profileLoading ? (
          <ActivityIndicator size="small" color="#a855f7" style={{ marginVertical: 20 }} />
        ) : discordProfile ? (
          <View style={styles.discordProfileCard}>
            <View style={styles.profileRow}>
              <Image
                source={{
                  uri: discordProfile.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png`
                    : 'https://cdn.discordapp.com/embed/avatars/0.png',
                }}
                style={styles.discordAvatar}
              />
              <View style={styles.profileDetails}>
                <Text style={styles.discordName}>
                  {discordProfile.global_name || discordProfile.username}
                </Text>
                <Text style={styles.discordTag}>@{discordProfile.username}</Text>
              </View>
              <TouchableOpacity onPress={logoutDiscord} style={styles.logoutBtn}>
                <LogOut color="#ef4444" size={20} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text style={styles.switchLabel}>Discord Activity Status</Text>
                <Text style={styles.switchDesc}>Display what you watch on your Discord profile.</Text>
              </View>
              <Switch
                value={rpcEnabled}
                onValueChange={toggleRpc}
                trackColor={{ false: '#3f3f46', true: '#a855f7' }}
                thumbColor={rpcEnabled ? '#fff' : '#a1a1aa'}
              />
            </View>
          </View>
        ) : (
          <View style={styles.discordLoginCard}>
            <Text style={styles.loginDesc}>
              Link your Discord account to share your watching activity as your Discord custom status!
            </Text>
            <TouchableOpacity
              style={styles.discordLoginBtn}
              onPress={() => router.push('/discord-login')}
            >
              <LogIn color="#fff" size={20} />
              <Text style={styles.discordLoginText}>LOG IN WITH DISCORD</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

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
  discordLoginCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  loginDesc: {
    color: '#a1a1aa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  discordLoginBtn: {
    backgroundColor: '#5865F2', // Discord Blue
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  discordLoginText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  discordProfileCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    padding: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    paddingBottom: 14,
  },
  discordAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileDetails: {
    flex: 1,
    marginLeft: 12,
  },
  discordName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  discordTag: {
    color: '#71717a',
    fontSize: 13,
  },
  logoutBtn: {
    padding: 8,
    backgroundColor: '#27272a',
    borderRadius: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  switchDesc: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
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
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  downloadSize: {
    color: '#a855f7',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  downloadActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playOfflineBtn: {
    backgroundColor: '#a855f7',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#71717a',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
