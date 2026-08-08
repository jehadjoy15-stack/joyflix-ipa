// src/services/discordRpc.ts

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const IMAGE_PROXY_URL = 'https://metrolist-discord-rpc-api.fullerbread2032.workers.dev/image';
const DEFAULT_APP_ID = '1529969999278637217'; // Joyflix/Metrolist App ID

class DiscordRpcService {
  private socket: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private heartbeatTimer: any = null;
  private sequenceNumber = 0;
  private isConnected = false;
  private isIdentified = false;
  private currentToken: string | null = null;
  private resolvedImagesCache: Record<string, string> = {};

  // Connect and start RPC session
  public async connect(token: string): Promise<void> {
    if (this.isConnected && this.currentToken === token) return;
    
    await this.disconnect();
    this.currentToken = token;
    this.isIdentified = false;

    try {
      console.log('DiscordRPC: Connecting to gateway...');
      this.socket = new WebSocket(GATEWAY_URL);
      this.isConnected = true;

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleMessage(payload);
        } catch (e) {
          console.error('DiscordRPC: Error parsing socket message:', e);
        }
      };

      this.socket.onerror = (err) => {
        console.error('DiscordRPC: WebSocket Error:', err);
        this.handleDisconnect();
      };

      this.socket.onclose = () => {
        console.log('DiscordRPC: WebSocket Closed');
        this.handleDisconnect();
      };
    } catch (e) {
      console.error('DiscordRPC: Connection failed:', e);
      this.handleDisconnect();
    }
  }

  // Disconnect RPC
  public async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.sequenceNumber = 0;
    this.isIdentified = false;
    this.isConnected = false;

    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN) {
          await this.stopActivity();
          this.socket.close();
        }
      } catch (e) {
        console.error('DiscordRPC: Error closing socket:', e);
      }
      this.socket = null;
    }
  }

  private handleDisconnect() {
    this.stopHeartbeat();
    this.sequenceNumber = 0;
    this.isIdentified = false;
    this.isConnected = false;
    this.socket = null;
  }

  private handleMessage(payload: any) {
    const op = payload.op ?? -1;
    const s = payload.s;
    if (s !== undefined && s !== null) {
      this.sequenceNumber = s;
    }

    switch (op) {
      case 10: // HELLO
        if (payload.d) {
          this.heartbeatInterval = payload.d.heartbeat_interval;
          console.log(`DiscordRPC: Received HELLO, heartbeat_interval=${this.heartbeatInterval} ms`);
          this.startHeartbeat();
          this.sendIdentify();
        }
        break;
      case 1: // Heartbeat request
        this.sendHeartbeat();
        break;
      case 9: // Invalid Session
        console.log('DiscordRPC: Invalid Session, re-identifying after delay...');
        setTimeout(() => {
          this.sendIdentify();
        }, 500);
        break;
      case 11: // Heartbeat ACK
        // Heartbeat acknowledged by server
        break;
      case 0: // DISPATCH event
        if (payload.t === 'READY') {
          this.isIdentified = true;
          console.log('DiscordRPC: Successfully identified on Discord!');
        }
        break;
      default:
        break;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    if (!this.heartbeatInterval) return;

    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatInterval = null;
  }

  private sendHeartbeat() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    console.log(`DiscordRPC: Sending Heartbeat, sequence=${this.sequenceNumber}`);
    this.sendPayload(1, this.sequenceNumber === 0 ? null : this.sequenceNumber);
  }

  private sendIdentify() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.currentToken) return;
    console.log('DiscordRPC: Sending Identify...');
    
    const payload = {
      token: this.currentToken,
      capabilities: 16381,
      properties: {
        $os: 'android',
        $browser: 'Discord Android',
        $device: 'Kizzy'
      },
      presence: {
        status: 'online',
        since: 0,
        activities: [],
        afk: false
      }
    };

    this.sendPayload(2, payload);
  }

  // Resolves cover image URL using Discord image assets proxy
  private async resolveImage(url: string): Promise<string | null> {
    if (!url) return null;
    if (this.resolvedImagesCache[url]) {
      return this.resolvedImagesCache[url];
    }

    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`${IMAGE_PROXY_URL}?url=${encodedUrl}`, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json();
        const resolvedId: string = data.id;
        if (resolvedId) {
          const formattedId = resolvedId.startsWith('mp:') ? resolvedId : `mp:${resolvedId}`;
          this.resolvedImagesCache[url] = formattedId;
          return formattedId;
        }
      }
    } catch (e) {
      console.error('DiscordRPC: Image resolve error:', e);
    }
    return null;
  }

  // Update Discord activity status
  public async updatePresence(params: {
    title: string;
    details: string; // Season, episode, or year info
    coverUrl?: string;
    tmdbId?: number;
    type?: 'movie' | 'tv';
    season?: number;
    episode?: number;
  }): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.currentToken) {
      console.log('DiscordRPC: Cannot update presence, not connected.');
      return;
    }

    // Wait until identified (gateway ready) to send presence updates (retry up to 5s)
    let retries = 0;
    while (!this.isIdentified && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      retries++;
    }

    if (!this.isIdentified) {
      console.log('DiscordRPC: Cannot update presence, failed to identify in time.');
      return;
    }

    let largeImageId: string | null = null;
    if (params.coverUrl) {
      largeImageId = await this.resolveImage(params.coverUrl);
    }

    const startTime = Date.now();
    let watchUrl = `https://joyflix.fun/watch/${params.type || 'movie'}/${params.tmdbId || ''}`;
    if (params.type === 'tv') {
      watchUrl = `https://joyflix.fun/watch/tv/${params.tmdbId || ''}/${params.season || 1}/${params.episode || 1}`;
    }

    const payload = {
      status: 'online',
      since: null,
      activities: [
        {
          name: 'JoyFlix',
          type: 3, // 3 = WATCHING
          details: params.title.length > 120 ? `${params.title.substring(0, 117)}...` : params.title,
          state: params.details.length > 120 ? `${params.details.substring(0, 117)}...` : params.details,
          application_id: DEFAULT_APP_ID,
          assets: {
            large_image: largeImageId || 'mp:975822369150000000', // default cover fallback
            large_text: 'JoyFlix',
          },
          timestamps: {
            start: startTime
          },
          buttons: ['Watch Video'],
          metadata: {
            button_urls: [watchUrl]
          }
        }
      ],
      afk: false
    };

    console.log(`DiscordRPC: Updating presence to: Watching ${params.title}`);
    this.sendPayload(3, payload);
  }

  // Clear/Stop presence activity
  public async stopActivity(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    console.log('DiscordRPC: Stopping presence activity');
    const payload = {
      status: 'online',
      since: null,
      activities: [],
      afk: false
    };
    this.sendPayload(3, payload);
  }

  // Send a raw payload to gateway
  private sendPayload(op: number, d: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify({ op, d }));
    } catch (e) {
      console.error('DiscordRPC: Error sending payload:', e);
    }
  }
}

export const discordRpc = new DiscordRpcService();
