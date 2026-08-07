// src/services/download.ts
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  // Get all completed downloads from storage
  getDownloads: async (): Promise<DownloadItem[]> => {
    try {
      const stored = await AsyncStorage.getItem(DOWNLOAD_STORAGE_KEY);
      if (!stored) return [];
      const list: DownloadItem[] = JSON.parse(stored);
      
      // Verify files actually exist on disk (clean up broken logs)
      const verifiedList: DownloadItem[] = [];
      for (const item of list) {
        const fileInfo = await FileSystem.getInfoAsync(item.filePath);
        if (fileInfo.exists) {
          verifiedList.push({
            ...item,
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

  // Check if a specific media source is already downloaded
  checkDownloadStatus: async (tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number, dub = 'Original'): Promise<{ downloaded: boolean; filePath: string }> => {
    const list = await downloadManager.getDownloads();
    const itemId = getDownloadItemId(tmdbId, type, season, episode, dub);
    const found = list.find(item => item.id === itemId);
    if (found) {
      return { downloaded: true, filePath: found.filePath };
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

    // Create the download resumable object
    const downloadResumable = FileSystem.createDownloadResumable(
      streamUrl,
      destinationPath,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://fmoviesunblocked.net/',
          'Origin': 'https://fmoviesunblocked.net',
        }
      },
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress(isNaN(progress) ? 0 : progress);
      }
    );

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
      return newItem;
    } catch (error) {
      console.error('Download error:', error);
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
      await FileSystem.deleteAsync(item.filePath, { idempotent: true });

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
