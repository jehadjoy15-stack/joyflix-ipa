// src/app/player.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Modal,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ArrowLeft, Play, Pause, Settings, RotateCcw, Volume2, Sun, SkipForward } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';

import { admin } from '../services/admin';
import { parseSRT, SubtitleCue } from '../utils/srtParser';

const { width, height } = Dimensions.get('window');

export default function CustomVideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Params
  const streamUrl = params.streamUrl as string;
  const offlinePath = params.offlinePath as string;
  const title = params.title as string;
  const season = params.season as string;
  const episode = params.episode as string;
  const type = params.type as 'movie' | 'tv';
  const tmdbId = Number(params.tmdbId);
  const coverUrl = params.coverUrl as string;
  const subtitlesRaw = params.subtitles as string;
  const overview = params.overview as string || '';
  const rating = params.rating as string || '0.0';

  const isOffline = !!offlinePath;
  const playbackSource = isOffline ? offlinePath : streamUrl;

  // Lock orientation to LANDSCAPE when player mounts, and unlock on unmount
  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    lockOrientation();

    return () => {
      async function unlockOrientation() {
        await ScreenOrientation.unlockAsync();
      }
      unlockOrientation();
    };
  }, []);

  // Status & Access States
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(true);
  const [accessReason, setAccessReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Subtitles States
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState('');
  const [selectedSubUrl, setSelectedSubUrl] = useState<string | null>(null);
  const [availableSubs, setAvailableSubs] = useState<any[]>([]);

  // Subtitle styling preferences
  const [subSize, setSubSize] = useState(16);
  const [subColor, setSubColor] = useState('#ffffff');
  const [subBgOpacity, setSubBgOpacity] = useState(0.5);

  // Playback values
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekbarWidth, setSeekbarWidth] = useState(0);

  const handleSeekbarTouch = (evt: any) => {
    resetControlsTimeout();
    const touchX = evt.nativeEvent.locationX;
    if (seekbarWidth > 0 && duration > 0 && player) {
      const pct = Math.max(0, Math.min(1, touchX / seekbarWidth));
      const seekTime = pct * duration;
      player.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Controls Visibility
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<any>(null);
  const lastTap = useRef<number>(0);

  const resetControlsTimeout = () => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    // Only auto-hide controls if video is playing
    if (isPlaying) {
      controlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  const toggleControls = () => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) {
        resetControlsTimeout();
      }
      return next;
    });
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, []);

  // Gesture Controls (Swipes)
  const [brightness, setBrightness] = useState(1.0); // 1.0 = fully bright, 0.2 = dimmed (controlled via black overlay opacity)
  const [volume, setVolume] = useState(1.0); // 0.0 to 1.0
  const [hudType, setHudType] = useState<'volume' | 'brightness' | null>(null);
  const [hudValue, setHudValue] = useState(0);
  const hudTimeoutRef = useRef<any>(null);
  const initialBrightness = useRef(1.0);
  const initialVolume = useRef(1.0);

  // Settings UI
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Initialize expo-video player
  const player = useVideoPlayer(playbackSource ? { uri: playbackSource } : null, (playerInstance) => {
    playerInstance.loop = false;
    playerInstance.play();
  });

  // Track player values
  useEffect(() => {
    if (!player) return;
    
    setIsPlaying(player.playing);
    setVolume(player.volume);

    const interval = setInterval(() => {
      setCurrentTime(player.currentTime);
      setDuration(player.duration || 1);
      setIsPlaying(player.playing);

      // Save continue watching position periodically
      saveProgress(player.currentTime, player.duration || 0);

      // Synchronize subtitles
      if (subtitleCues.length > 0) {
        const time = player.currentTime;
        const activeCue = subtitleCues.find(c => time >= c.start && time <= c.end);
        setActiveSubtitle(activeCue ? activeCue.text : '');
      }
    }, 250);

    return () => clearInterval(interval);
  }, [player, subtitleCues]);

  useEffect(() => {
    resetControlsTimeout();
  }, [isPlaying]);

  const addToHistory = async () => {
    try {
      const historyStored = await AsyncStorage.getItem('@joyflix_watch_history');
      let list = historyStored ? JSON.parse(historyStored) : [];
      
      const id = `${type}_${tmdbId}`;
      
      // Filter out duplicate if it already exists
      list = list.filter((item: any) => item.id !== id);
      
      // Add to front of history list
      list.unshift({
        id,
        tmdbId,
        type,
        title,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        posterUrl: coverUrl,
        watchedAt: Date.now(),
      });
      
      // Keep top 50 items
      if (list.length > 50) {
        list = list.slice(0, 50);
      }
      
      await AsyncStorage.setItem('@joyflix_watch_history', JSON.stringify(list));
    } catch (e) {
      console.error('Failed to add to watch history:', e);
    }
  };

  // Check IP access and log request on startup
  useEffect(() => {
    const performAccessChecks = async () => {
      if (isOffline) {
        setAccessChecked(true);
        setLoading(false);
        return;
      }

      const access = await admin.checkAccess();
      setAccessAllowed(access.allowed);
      setAccessReason(access.reason);
      setAccessChecked(true);
      setLoading(false);

      if (access.allowed) {
        // Log request in background
        admin.logPlayRequest({
          type,
          tmdbId,
          title,
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        });

        // Save to Watch History
        addToHistory();
      }
    };

    performAccessChecks();
  }, []);

  // Parse available subtitles list
  useEffect(() => {
    if (subtitlesRaw) {
      try {
        const parsed = JSON.parse(subtitlesRaw);
        setAvailableSubs(parsed);
        if (parsed.length > 0) {
          // Auto select English or Bengali if available, otherwise first one
          const eng = parsed.find((s: any) => s.lang.toLowerCase().includes('eng'));
          const ben = parsed.find((s: any) => s.lang.toLowerCase().includes('beng') || s.lang.toLowerCase().includes('bang'));
          const autoSelect = ben || eng || parsed[0];
          
          handleSelectSubtitle(autoSelect.url);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [subtitlesRaw]);

  const handleSelectSubtitle = async (url: string) => {
    setSelectedSubUrl(url);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const cues = parseSRT(text);
        setSubtitleCues(cues);
      }
    } catch (e) {
      console.error('Failed to load subtitles:', e);
    }
  };

  const saveProgress = async (current: number, total: number) => {
    if (total <= 0) return;
    try {
      const cwStored = await AsyncStorage.getItem('@joyflix_continue_watching');
      let list = cwStored ? JSON.parse(cwStored) : [];
      
      const id = `${type}_${tmdbId}`;
      
      // Remove existing progress for same item if any
      list = list.filter((item: any) => item.id !== id);

      // Only save if played less than 95% of total duration (prevent keeping finished files)
      if (current / total < 0.95) {
        list.unshift({
          id,
          tmdbId,
          type,
          title,
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
          currentTime: current,
          duration: total,
          posterUrl: coverUrl,
          savedAt: new Date().toISOString(),
        });
        
        // Keep only top 8 continue watching items
        if (list.length > 8) {
          list = list.slice(0, 8);
        }
        await AsyncStorage.setItem('@joyflix_continue_watching', JSON.stringify(list));
      } else {
        await AsyncStorage.setItem('@joyflix_continue_watching', JSON.stringify(list));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Skip Intro function (skips forward 85 seconds)
  const skipIntro = () => {
    if (player) {
      player.currentTime = player.currentTime + 85;
    }
  };

  // Rewind 10 seconds
  const rewind = () => {
    if (player) {
      player.currentTime = Math.max(0, player.currentTime - 10);
    }
  };

  // Forward 10 seconds
  const forward = () => {
    if (player) {
      player.currentTime = Math.min(duration, player.currentTime + 10);
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Change playback speed
  const changeSpeed = (speed: number) => {
    if (player) {
      player.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  // Gesture Recognition (Swipe Left = Brightness, Swipe Right = Volume)
  const showHUD = (type: 'volume' | 'brightness', val: number) => {
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    setHudType(type);
    setHudValue(val);
    hudTimeoutRef.current = setTimeout(() => {
      setHudType(null);
    }, 1500); // Hide HUD after 1.5s
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        resetControlsTimeout();
        initialBrightness.current = brightness;
        initialVolume.current = volume;
      },
      onPanResponderMove: (evt, gestureState) => {
        resetControlsTimeout();
        const { x0, dy } = gestureState;
        const screenHalfX = width / 2;
        
        // Vertical swipe delta ratio relative to screen height
        const ratio = -dy / height; 

        if (x0 < screenHalfX) {
          // Left side: Brightness dimming (0.1 to 1.0)
          let newBrightness = initialBrightness.current + ratio * 1.0;
          newBrightness = Math.max(0.1, Math.min(1.0, newBrightness));
          setBrightness(newBrightness);
          showHUD('brightness', newBrightness);
        } else {
          // Right side: Volume (0.0 to 1.0)
          if (player) {
            let newVolume = initialVolume.current + ratio * 1.0;
            newVolume = Math.max(0.0, Math.min(1.0, newVolume));
            player.volume = newVolume;
            setVolume(newVolume);
            showHUD('volume', newVolume);
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx, dy, x0 } = gestureState;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          const now = Date.now();
          const DOUBLE_TAP_DELAY = 300;
          if (now - lastTap.current < DOUBLE_TAP_DELAY) {
            // Double tap!
            const screenHalfX = width / 2;
            if (x0 < screenHalfX) {
              rewind();
            } else {
              forward();
            }
          } else {
            // Single tap: toggle controls
            toggleControls();
          }
          lastTap.current = now;
        }
      }
    })
  ).current;

  // Format seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mStr}:${sStr}` : `${m}:${sStr}`;
  };

  if (!accessChecked || loading) {
    return (
      <View style={styles.blockContainer}>
        <ActivityIndicator size="large" color="#a855f7" />
        <Text style={styles.blockText}>Authenticating stream access...</Text>
      </View>
    );
  }

  // Display access blocked message if checked failed
  if (!accessAllowed) {
    return (
      <View style={styles.blockContainer}>
        <Text style={styles.blockIcon}>🚫</Text>
        <Text style={styles.blockTitle}>Access Denied</Text>
        <Text style={styles.blockReason}>{accessReason}</Text>
        <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.back()}>
          <Text style={styles.backHomeText}>Return to App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If online, use the premium sanae web player inside WebView
  if (!isOffline) {
    const dubParam = params.dubLang && params.dubLang !== 'Original' ? `&dub=${encodeURIComponent(params.dubLang as string)}` : '';
    const webPlayerUrl = type === 'movie'
      ? `https://sanae.joyflix.fun/?tmdb=${tmdbId}&type=movie${dubParam}`
      : `https://sanae.joyflix.fun/?tmdb=${tmdbId}&type=tv&season=${season}&episode=${episode}${dubParam}`;

    const injectedJS = `
      (function() {
        const title = ${JSON.stringify(params.title || 'JoyFlix')};
        const type = ${JSON.stringify(params.type || 'movie')};
        const coverUrl = ${JSON.stringify(params.coverUrl || '')};
        const detailText = type === 'tv' ? 'TV Show' : 'Movie';

        function updateMediaSession() {
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: title,
              artist: 'JoyFlix',
              album: detailText,
              artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/png' }] : []
            });
            
            // Wire play/pause actions
            const video = document.querySelector('video');
            if (video) {
              navigator.mediaSession.setActionHandler('play', () => video.play());
              navigator.mediaSession.setActionHandler('pause', () => video.pause());
            }
          }
        }

        updateMediaSession();
        document.addEventListener('play', updateMediaSession, true);
        document.addEventListener('playing', updateMediaSession, true);
        setInterval(updateMediaSession, 2000);
      })();
      true;
    `;

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden={true} />
        
        {/* Floating Back Button */}
        <TouchableOpacity 
          style={{ 
            position: 'absolute', 
            top: 20, 
            left: 20, 
            zIndex: 9999, 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            padding: 8, 
            borderRadius: 20 
          }} 
          onPress={() => router.back()}
        >
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>

        <WebView
          source={{ uri: webPlayerUrl }}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          backgroundColor="#000"
          injectedJavaScript={injectedJS}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      {/* Gesture Handler Overlay */}
      <View style={styles.videoWrapper} {...panResponder.panHandlers}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          allowsPictureInPicture={true}
          nativeControls={false}
        />
        
        {/* Software Dimming Brightness Overlay */}
        <View
          pointerEvents="none"
          style={[
            styles.dimOverlay,
            { backgroundColor: `rgba(0, 0, 0, ${1.0 - brightness})` }
          ]}
        />
      </View>

      {/* SWIPE GESTURE HUDS */}
      {hudType && (
        <View style={styles.hudOverlay}>
          <View style={styles.hudCard}>
            {hudType === 'volume' ? (
              <Volume2 color="#fff" size={24} />
            ) : (
              <Sun color="#fff" size={24} />
            )}
            <Text style={styles.hudValueText}>
              {Math.round(hudValue * 100)}%
            </Text>
          </View>
        </View>
      )}

      {/* STYLIZED SUBTITLE RENDERER OVERLAY */}
      {activeSubtitle.length > 0 && (
        <View style={styles.subtitlesContainer} pointerEvents="none">
          <View
            style={[
              styles.subtitlesTextBg,
              { backgroundColor: `rgba(0, 0, 0, ${subBgOpacity})` }
            ]}
          >
            <Text
              style={[
                styles.subtitlesText,
                { fontSize: subSize, color: subColor }
              ]}
            >
              {activeSubtitle}
            </Text>
          </View>
        </View>
      )}

      {/* CUSTOM PLAYER HUD / OVERLAY CONTROLS */}
      {showControls && (
        <>
          {/* Floating Back Button (Top Left) */}
          <TouchableOpacity 
            style={styles.floatingBackBtn} 
            onPress={() => router.back()}
          >
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>

          {/* PAUSE INFO OVERLAY (X-Ray/Netflix style overlay when video is paused) */}
          {!isPlaying && (
            <View style={styles.pauseInfoOverlay}>
              <Text style={styles.pauseTitle} numberOfLines={1}>
                {title}
              </Text>
              <View style={styles.pauseMetaRow}>
                {rating && rating !== '0.0' ? (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>⭐ {rating}</Text>
                  </View>
                ) : null}
                <Text style={styles.pauseMetaText}>
                  {season && episode ? `Season ${season} Episode ${episode}` : 'Movie'}
                </Text>
              </View>
              {overview ? (
                <Text style={styles.pauseDescription} numberOfLines={4}>
                  {overview}
                </Text>
              ) : null}
            </View>
          )}

          {/* Bottom Controls Overlay */}
          <View style={styles.bottomControlsContainer}>
            {/* 1. Time Label (Above seekbar, aligned right) */}
            <View style={styles.timeLabelWrapper}>
              <Text style={styles.timeLabel}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>

            {/* 2. Full-width Seekbar */}
            <TouchableOpacity 
              activeOpacity={1}
              style={styles.seekbarContainer}
              onLayout={(e) => setSeekbarWidth(e.nativeEvent.layout.width)}
              onPress={handleSeekbarTouch}
            >
              <View style={styles.seekbarTrack}>
                <View style={[styles.seekbarProgress, { width: `${(currentTime / duration) * 100}%` }]} />
                <View style={[styles.seekbarHandle, { left: `${(currentTime / duration) * 100}%` }]} />
              </View>
            </TouchableOpacity>

            {/* 3. Controls Buttons Row */}
            <View style={styles.controlsRow}>
              {/* Left Group */}
              <View style={styles.controlsGroupLeft}>
                <TouchableOpacity style={styles.bottomBtn} onPress={togglePlay}>
                  {isPlaying ? (
                    <Pause color="#fff" size={20} fill="#fff" />
                  ) : (
                    <Play color="#fff" size={20} fill="#fff" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.bottomBtn} onPress={rewind}>
                  <RotateCcw color="#fff" size={20} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.bottomBtn} onPress={forward}>
                  <RotateCcw color="#fff" size={20} style={{ transform: [{ scaleX: -1 }] }} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.bottomBtn}>
                  <Volume2 color="#fff" size={20} />
                </TouchableOpacity>
              </View>

              {/* Center Group: Title */}
              <View style={styles.controlsGroupCenter}>
                <Text style={styles.bottomTitleText} numberOfLines={1}>
                  {title} {season && episode ? `- S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : ''}
                </Text>
              </View>

              {/* Right Group */}
              <View style={styles.controlsGroupRight}>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => setShowSettingsModal(true)}>
                  <Settings color="#fff" size={20} />
                </TouchableOpacity>

                {/* Subtitle/CC button */}
                <TouchableOpacity style={styles.bottomBtn} onPress={() => setShowSettingsModal(true)}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>CC</Text>
                </TouchableOpacity>

                {/* Exit button */}
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.back()}>
                  <ArrowLeft color="#fff" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}

      {/* SETTINGS MENU DRAWER / MODAL */}
      <Modal
        visible={showSettingsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsSheet}>
            <Text style={styles.settingsSheetTitle}>Playback Settings</Text>
            
            <ScrollView style={styles.settingsScroll}>
              {/* Speed Controller */}
              <View style={styles.settingSection}>
                <Text style={styles.settingLabel}>Playback Speed</Text>
                <View style={styles.settingOptionRow}>
                  {[0.5, 1.0, 1.5, 2.0].map((s) => (
                    <TouchableOpacity
                      key={`speed_${s}`}
                      style={[styles.speedOptionBtn, playbackSpeed === s && styles.activeOptionBtn]}
                      onPress={() => changeSpeed(s)}
                    >
                      <Text style={[styles.optionText, playbackSpeed === s && styles.activeOptionText]}>
                        {s}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Subtitles Track Selection */}
              {availableSubs.length > 0 && (
                <View style={styles.settingSection}>
                  <Text style={styles.settingLabel}>Subtitle Tracks</Text>
                  <View style={styles.subtitleOptionsColumn}>
                    <TouchableOpacity
                      style={[styles.subOptionRow, selectedSubUrl === null && styles.activeSubRow]}
                      onPress={() => {
                        setSelectedSubUrl(null);
                        setSubtitleCues([]);
                        setActiveSubtitle('');
                      }}
                    >
                      <Text style={[styles.subRowText, selectedSubUrl === null && styles.activeOptionText]}>
                        Off
                      </Text>
                    </TouchableOpacity>
                    
                    {availableSubs.map((sub, idx) => {
                      const isSelected = selectedSubUrl === sub.url;
                      return (
                        <TouchableOpacity
                          key={`sub_track_${idx}`}
                          style={[styles.subOptionRow, isSelected && styles.activeSubRow]}
                          onPress={() => handleSelectSubtitle(sub.url)}
                        >
                          <Text style={[styles.subRowText, isSelected && styles.activeOptionText]}>
                            {sub.lang}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Subtitle Styling Preferences */}
              <View style={styles.settingSection}>
                <Text style={styles.settingLabel}>Subtitle Text Size</Text>
                <View style={styles.settingOptionRow}>
                  {[12, 16, 20, 24].map((size) => (
                    <TouchableOpacity
                      key={`size_${size}`}
                      style={[styles.speedOptionBtn, subSize === size && styles.activeOptionBtn]}
                      onPress={() => setSubSize(size)}
                    >
                      <Text style={[styles.optionText, subSize === size && styles.activeOptionText]}>
                        {size}px
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.settingSection}>
                <Text style={styles.settingLabel}>Subtitle Background Opacity</Text>
                <View style={styles.settingOptionRow}>
                  {[0.0, 0.3, 0.6, 0.9].map((opacity) => (
                    <TouchableOpacity
                      key={`opacity_${opacity}`}
                      style={[styles.speedOptionBtn, subBgOpacity === opacity && styles.activeOptionBtn]}
                      onPress={() => setSubBgOpacity(opacity)}
                    >
                      <Text style={[styles.optionText, subBgOpacity === opacity && styles.activeOptionText]}>
                        {Math.round(opacity * 100)}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.settingsCloseBtn}
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={styles.settingsCloseBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  pauseInfoOverlay: {
    position: 'absolute',
    left: 40,
    top: '25%',
    width: '45%',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.25)',
  },
  pauseTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  pauseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  ratingBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 10,
  },
  ratingText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pauseMetaText: {
    color: '#c084fc',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pauseDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    lineHeight: 18,
  },
  videoWrapper: {
    flex: 1,
    position: 'relative',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
  },
  blockContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blockText: {
    color: '#a855f7',
    fontSize: 15,
    marginTop: 12,
    fontWeight: 'bold',
  },
  blockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  blockTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  blockReason: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backHomeBtn: {
    backgroundColor: '#a855f7',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backHomeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  hudCard: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  hudValueText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
  subtitlesContainer: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  subtitlesTextBg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  subtitlesText: {
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: -1.5, height: 1.5 },
    textShadowRadius: 4,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  topControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  controlIcon: {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  videoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  videoSubTitle: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  centerControlPanel: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.85)',
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: '#c084fc',
  },
  rewindBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    position: 'relative',
  },
  skipSecText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    position: 'absolute',
    top: 22,
  },
  bottomControlPanel: {
    marginBottom: 10,
  },
  progressBarWrapper: {
    width: '100%',
  },
  timelineBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    width: '100%',
    marginBottom: 12,
  },
  bottomControlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  timeLabelWrapper: {
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  timeLabel: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '500',
  },
  seekbarContainer: {
    width: '100%',
    height: 14,
    justifyContent: 'center',
  },
  seekbarTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.5,
    position: 'relative',
  },
  seekbarProgress: {
    height: '100%',
    backgroundColor: '#a855f7',
    borderRadius: 1.5,
  },
  seekbarHandle: {
    position: 'absolute',
    top: -4,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#fff',
    marginLeft: -5.5,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  controlsGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '30%',
  },
  controlsGroupCenter: {
    width: '40%',
    alignItems: 'center',
  },
  controlsGroupRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '30%',
  },
  bottomBtn: {
    padding: 8,
    marginHorizontal: 4,
  },
  bottomTitleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  floatingBackBtn: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 22,
    zIndex: 99,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  settingsSheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  settingsScroll: {
    marginBottom: 12,
  },
  settingSection: {
    marginBottom: 20,
  },
  settingLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  settingOptionRow: {
    flexDirection: 'row',
  },
  speedOptionBtn: {
    flex: 1,
    backgroundColor: '#27272a',
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 6,
    alignItems: 'center',
  },
  activeOptionBtn: {
    backgroundColor: '#1e1b4b',
    borderWidth: 1,
    borderColor: '#a855f7',
  },
  optionText: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: 'bold',
  },
  activeOptionText: {
    color: '#c084fc',
  },
  subtitleOptionsColumn: {
    backgroundColor: '#121214',
    borderRadius: 8,
    overflow: 'hidden',
  },
  subOptionRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  activeSubRow: {
    backgroundColor: '#181224',
  },
  subRowText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  settingsCloseBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#a855f7',
    borderRadius: 8,
  },
  settingsCloseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
