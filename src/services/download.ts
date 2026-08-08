// src/services/download.ts
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export function resolveLocalPath(savedPath: string): string {
  if (!savedPath) return '';
  if (Platform.OS === 'ios') {
    const filename = savedPath.split('/').pop();
    if (filename) {
      return `${FileSystem.documentDirectory}${filename}`;
    }
  }
  return savedPath;
}

export interface DownloadItem {
  id: string; // Unique ID: e.g. "movie_123" or "tv_123_1_1"
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  dub: string;
  filePath: string;
  posterUrl?: string;
  downloadedAt: string;
  fileSize?: number;
}

export interface ActiveDownload {
  id: string;
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  dub: string;
  progress: number;
  progressText: string;
}

const DOWNLOAD_STORAGE_KEY = '@joyflix_downloads';

// Helper to make a secure clean local file name
function getDownloadFilename(item: Omit<DownloadItem, 'id' | 'filePath' | 'downloadedAt'>): string {
  if (item.type === 'tv') {
    return `${item.type}_${item.tmdbId}_s${item.season || 1}_e${item.episode || 1}_${item.dub.replace(/[^a-zA-Z0-9]/g, '_')}.joyflix`;
  }
  return `${item.type}_${item.tmdbId}_${item.dub.replace(/[^a-zA-Z0-9]/g, '_')}.joyflix`;
}

// Helper to make unique item ID
export function getDownloadItemId(tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number, dub = 'Original'): string {
  const cleanDub = dub.replace(/[^a-zA-Z0-9]/g, '_');
  if (type === 'tv') {
    return `tv_${tmdbId}_s${season || 1}_e${episode || 1}_${cleanDub}`;
  }
  return `movie_${tmdbId}_${cleanDub}`;
}

export const downloadManager = {
  // In-memory active downloads list and listeners for reactive updates
  activeDownloads: [] as ActiveDownload[],
  listeners: [] as ((active: ActiveDownload[]) => void)[],

  subscribeActiveDownloads(listener: (active: ActiveDownload[]) => void) {
    this.listeners.push(listener);
    listener([...this.activeDownloads]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notifyListeners() {
    this.listeners.forEach(l => l([...this.activeDownloads]));
  },

  // Get all completed downloads from storage
  getDownloads: async (): Promise<DownloadItem[]> => {
    try {
      const stored = await AsyncStorage.getItem(DOWNLOAD_STORAGE_KEY);
      if (!stored) return [];
      const list: DownloadItem[] = JSON.parse(stored);
      
      // Verify files actually exist on disk (clean up broken logs)
      const verifiedList: DownloadItem[] = [];
      for (const item of list) {
        const resolvedPath = resolveLocalPath(item.filePath);
        const fileInfo = await FileSystem.getInfoAsync(resolvedPath);
        if (fileInfo.exists) {
          verifiedList.push({
            ...item,
            filePath: resolvedPath,
            fileSize: (fileInfo as any).size,
          });
        }
      }
      
      if (verifiedList.length !== list.length) {
        await AsyncStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(verifiedList));
      }
      
      return verifiedList;
    } catch (e) {
      console.error('Failed to read downloads:', e);
      return [];
    }
  },

  // Check if a specific media source is already downloaded (any dub)
  checkDownloadStatus: async (tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number): Promise<{ downloaded: boolean; filePath: string }> => {
    const list = await downloadManager.getDownloads();
    const found = list.find(item => 
      item.tmdbId === tmdbId && 
      item.type === type && 
      (type === 'tv' ? (item.season === season && item.episode === episode) : true)
    );
    if (found) {
      return { downloaded: true, filePath: resolveLocalPath(found.filePath) };
    }
    return { downloaded: false, filePath: '' };
  },

  // Start downloading a video stream file
  downloadVideo: async (
    streamUrl: string,
    meta: {
      tmdbId: number;
      title: string;
      type: 'movie' | 'tv';
      season?: number;
      episode?: number;
      dub: string;
      posterUrl?: string;
    },
    onProgress: (progress: number) => void
  ): Promise<DownloadItem> => {
    const filename = getDownloadFilename(meta);
    const destinationPath = `${(FileSystem as any).documentDirectory}${filename}`;
    const itemId = getDownloadItemId(meta.tmdbId, meta.type, meta.season, meta.episode, meta.dub);

    console.log(`Starting download for ${meta.title} to: ${destinationPath}`);

    // Create and insert into active list
    const activeItem: ActiveDownload = {
      id: itemId,
      tmdbId: meta.tmdbId,
      title: meta.title,
      type: meta.type,
      season: meta.season,
      episode: meta.episode,
      dub: meta.dub,
      progress: 0,
      progressText: '0%',
    };
    downloadManager.activeDownloads = downloadManager.activeDownloads.filter(d => d.id !== itemId);
    downloadManager.activeDownloads.push(activeItem);
    downloadManager.notifyListeners();

    // Create the download resumable object
    const downloadResumable = FileSystem.createDownloadResumable(
      streamUrl,
      destinationPath,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        }
      },
      (downloadProgress) => {
        const expected = downloadProgress.totalBytesExpectedToWrite;
        const progress = expected > 0
          ? downloadProgress.totalBytesWritten / expected
          : downloadProgress.totalBytesWritten;
        
        let progressText = '0%';
        if (expected > 0) {
          progressText = `${Math.round((downloadProgress.totalBytesWritten / expected) * 100)}%`;
        } else {
          progressText = `${(downloadProgress.totalBytesWritten / (1024 * 1024)).toFixed(1)} MB`;
        }

        // Update active downloads state
        const found = downloadManager.activeDownloads.find(d => d.id === itemId);
        if (found) {
          found.progress = progress;
          found.progressText = progressText;
          downloadManager.notifyListeners();
        }

        onProgress(isNaN(progress) ? 0 : progress);
      }
    );

    // Delete existing file if any to prevent write/lock conflicts
    try {
      const existingInfo = await FileSystem.getInfoAsync(destinationPath);
      if (existingInfo.exists) {
        console.log(`Cleaning up pre-existing file at: ${destinationPath}`);
        await FileSystem.deleteAsync(destinationPath, { idempotent: true });
      }
    } catch (err) {
      console.warn('Pre-cleanup failed:', err);
    }

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result || !result.uri) {
        throw new Error('Download failed: No output URI returned');
      }

      // Read file details to register it
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      const size = fileInfo.exists ? (fileInfo as any).size : 0;

      const newItem: DownloadItem = {
        id: itemId,
        tmdbId: meta.tmdbId,
        title: meta.title,
        type: meta.type,
        season: meta.season,
        episode: meta.episode,
        dub: meta.dub,
        filePath: result.uri,
        posterUrl: meta.posterUrl,
        downloadedAt: new Date().toISOString(),
        fileSize: size,
      };

      // Add to AsyncStorage list
      const currentList = await downloadManager.getDownloads();
      // Remove matching if any duplicates existed
      const filteredList = currentList.filter(item => item.id !== itemId);
      filteredList.push(newItem);

      await AsyncStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(filteredList));
      console.log(`Download finished & saved for item: ${itemId}`);
      
      // Clean up active download
      downloadManager.activeDownloads = downloadManager.activeDownloads.filter(d => d.id !== itemId);
      downloadManager.notifyListeners();

      return newItem;
    } catch (error) {
      console.error('Download error:', error);
      // Clean up active download
      downloadManager.activeDownloads = downloadManager.activeDownloads.filter(d => d.id !== itemId);
      downloadManager.notifyListeners();
      
      // Clean up failed file if it exists
      try {
        const fileInfo = await FileSystem.getInfoAsync(destinationPath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(destinationPath, { idempotent: true });
        }
      } catch {}
      throw error;
    }
  },

  // Delete a downloaded video file
  deleteDownload: async (id: string): Promise<boolean> => {
    try {
      const list = await downloadManager.getDownloads();
      const item = list.find(d => d.id === id);
      if (!item) return false;

      // Delete the file from the filesystem
      await FileSystem.deleteAsync(resolveLocalPath(item.filePath), { idempotent: true });

      // Remove from storage list
      const updatedList = list.filter(d => d.id !== id);
      await AsyncStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(updatedList));
      
      console.log(`Successfully deleted download item: ${id}`);
      return true;
    } catch (e) {
      console.error('Failed to delete download:', e);
      return false;
    }
  }
};
