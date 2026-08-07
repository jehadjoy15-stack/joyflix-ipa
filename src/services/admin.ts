// src/services/admin.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// Configuration keys - update these with your Discord values
export const DISCORD_WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1520117806643937451/JwrpRklC9_41shy3lQ7RdDCl-NUNEboP0TdTRG9OOhOeMS7QwVCnjHyhk0EOkNtDImOl';
export const DISCORD_CONTROL_CHANNEL_ID = '123456789012345678'; // ID of Discord channel where you type !block and !maintenance
export const DISCORD_BOT_TOKEN = 'YOUR_READ_ONLY_DISCORD_BOT_TOKEN'; // Insert a bot token that has read access to the channel above

export interface AdminConfigState {
  blockedIPs: string[];
  maintenanceMode: boolean;
}

export const admin = {
  // Fetch client's public IP
  getClientIp: async (): Promise<string> => {
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return data.ip || 'Unknown IP';
    } catch (e) {
      console.warn('Failed to fetch public IP:', e);
      return 'Unknown IP';
    }
  },

  // Parse Discord channel history to compute block status and maintenance mode dynamically
  fetchRemoteConfig: async (): Promise<AdminConfigState> => {
    const defaultState: AdminConfigState = {
      blockedIPs: [],
      maintenanceMode: false,
    };

    if (!DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN === 'YOUR_READ_ONLY_DISCORD_BOT_TOKEN' || !DISCORD_CONTROL_CHANNEL_ID) {
      return defaultState;
    }

    try {
      const url = `https://discord.com/api/v9/channels/${DISCORD_CONTROL_CHANNEL_ID}/messages?limit=100`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Discord history: status ${response.status}`);
      }

      const messages = await response.json();
      if (!Array.isArray(messages)) return defaultState;

      // Messages are returned newest first. Reverse them to process chronologically.
      const chronologicalMessages = [...messages].reverse();

      const blockedSet = new Set<string>();
      let maintenance = false;

      for (const msg of chronologicalMessages) {
        const content = (msg.content || '').trim();
        if (!content.startsWith('!')) continue;

        // Parse commands (Case-insensitive check but keep args raw)
        const parts = content.split(/\s+/);
        const command = parts[0].toLowerCase();
        const arg = parts[1];

        if (command === '!block' && arg) {
          blockedSet.add(arg.trim());
        } else if (command === '!unblock' && arg) {
          blockedSet.delete(arg.trim());
        } else if (command === '!maintenance') {
          if (arg === 'on') {
            maintenance = true;
          } else if (arg === 'off') {
            maintenance = false;
          }
        }
      }

      return {
        blockedIPs: Array.from(blockedSet),
        maintenanceMode: maintenance,
      };
    } catch (e) {
      console.error('Error fetching admin config from Discord history:', e);
      return defaultState;
    }
  },

  // Check if client is allowed to play streams
  checkAccess: async (): Promise<{ allowed: boolean; reason: string }> => {
    try {
      const clientIp = await admin.getClientIp();
      const remoteConfig = await admin.fetchRemoteConfig();

      if (remoteConfig.blockedIPs.includes(clientIp)) {
        return {
          allowed: false,
          reason: 'Access Denied. Your IP address has been blocked.',
        };
      }

      if (remoteConfig.maintenanceMode) {
        return {
          allowed: false,
          reason: 'Server is currently undergoing maintenance. Please try again later.',
        };
      }

      return { allowed: true, reason: '' };
    } catch (e) {
      return { allowed: true, reason: '' }; // Fallback to allow if checks fail to avoid hard-locking users offline
    }
  },

  // Log play activity to Discord Webhook
  logPlayRequest: async (mediaInfo: {
    type: 'movie' | 'tv';
    tmdbId: number;
    title: string;
    season?: number;
    episode?: number;
    rating?: number;
    posterUrl?: string;
  }) => {
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes('1520117806643937451')) {
      // Don't flood default webhook if it is unmodified
      return;
    }

    try {
      const ip = await admin.getClientIp();
      
      // Parse device information
      const osName = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Web';
      const deviceModel = Device.modelName || 'Unknown Device';
      const deviceBrand = Device.brand || '';
      const deviceString = `${osName} (${deviceBrand} ${deviceModel})`.trim();

      const mediaTypeLabel = mediaInfo.type === 'movie' ? '🎬 Movie' : '📺 TV Show';
      const titleLabel = mediaInfo.type === 'tv' && mediaInfo.season && mediaInfo.episode
        ? `${mediaInfo.title} - S${String(mediaInfo.season).padStart(2, '0')}E${String(mediaInfo.episode).padStart(2, '0')}`
        : mediaInfo.title;

      const embed = {
        title: `👀 Play Request: ${mediaTypeLabel}`,
        color: 11032055, // #a855f7
        fields: [
          { name: '📺 Title', value: `**${titleLabel}**\nTMDB ID: \`${mediaInfo.tmdbId}\``, inline: false },
          { name: '🔌 Client Address', value: `IP: \`${ip}\`\nDevice: \`${deviceString}\``, inline: true },
          { name: '⭐ Rating', value: `\`${mediaInfo.rating ? mediaInfo.rating.toFixed(1) : 'N/A'} / 10\``, inline: true }
        ],
        timestamp: new Date().toISOString()
      };

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ embeds: [embed] }),
        signal: AbortSignal.timeout(5000)
      });
      console.log('Successfully logged play request to Discord Webhook');
    } catch (e) {
      console.error('Failed to log play request to Discord:', e);
    }
  }
};
