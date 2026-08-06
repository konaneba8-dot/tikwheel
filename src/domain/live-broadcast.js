import crypto from 'node:crypto';
import { BROADCAST_STATUSES } from './statuses.js';

export const STREAM_PLATFORMS = Object.freeze({
  TIKTOK: {
    id: 'tiktok',
    label: 'TikTok LIVE',
    requiresApi: 'official_api',
    status: 'ready',
    aspectRatio: '9:16',
    maxBitrate: 6000,
  },
  FACEBOOK: {
    id: 'facebook',
    label: 'Facebook Live',
    requiresApi: 'official_api',
    status: 'ready',
    aspectRatio: '16:9',
    maxBitrate: 4000,
  },
  YOUTUBE: {
    id: 'youtube',
    label: 'YouTube Live',
    requiresApi: 'official_api',
    status: 'ready',
    aspectRatio: '16:9',
    maxBitrate: 6000,
  },
  INSTAGRAM: {
    id: 'instagram',
    label: 'Instagram Live',
    requiresApi: 'official_api',
    status: 'limited',
    aspectRatio: '9:16',
    maxBitrate: 4000,
  },
  TWITCH: {
    id: 'twitch',
    label: 'Twitch',
    requiresApi: 'rtmp',
    status: 'ready',
    aspectRatio: '16:9',
    maxBitrate: 6000,
  },
});

export function createBroadcast(input) {
  const platforms = Array.isArray(input.platforms)
    ? input.platforms
    : String(input.platforms || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

  if (!platforms.length) {
    throw new Error('Select at least one supported streaming platform');
  }

  const invalidPlatforms = platforms.filter((p) => !STREAM_PLATFORMS[p.toUpperCase()]);
  if (invalidPlatforms.length) {
    throw new Error(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
  }

  const scheduledFor = new Date(input.scheduledFor || new Date().toISOString());
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new Error('A valid broadcast date and time are required');
  }

  return {
    id: `live_${crypto.randomUUID()}`,
    title: String(input.title || 'TikWheel Live Draw').trim() || 'TikWheel Live Draw',
    description: String(input.description || 'Live wheel draw and viewer interaction').trim() || 'Live wheel draw and viewer interaction',
    roundId: String(input.roundId || '').trim(),
    platforms,
    status: BROADCAST_STATUSES.SCHEDULED,
    viewerCount: 0,
    connectedPlatforms: [],
    durationSeconds: 0,
    startAt: null,
    endAt: null,
    scheduledFor: scheduledFor.toISOString(),
    streamKey: `tikwheel_${crypto.randomUUID().slice(0, 8)}`,
    rtmpUrl: null,
    errorLog: null,
    reconnectionStatus: 'stable',
    logEntries: [
      {
        id: `log_${crypto.randomUUID()}`,
        status: 'scheduled',
        message: 'Broadcast configured and queued for approval',
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function startBroadcast(broadcast) {
  if (broadcast.status === BROADCAST_STATUSES.LIVE) {
    throw new Error('Broadcast is already live');
  }

  broadcast.status = BROADCAST_STATUSES.LIVE;
  broadcast.startAt = broadcast.startAt || new Date().toISOString();
  broadcast.endAt = null;
  broadcast.connectedPlatforms = broadcast.platforms.map((platform) => ({
    platform,
    status: 'connected',
    viewers: 125 + Math.floor(Math.random() * 400),
    bitrate: STREAM_PLATFORMS[platform.toUpperCase()]?.maxBitrate || 4000,
  }));
  broadcast.viewerCount = broadcast.connectedPlatforms.reduce((total, item) => total + Number(item.viewers || 0), 0);
  broadcast.errorLog = null;
  broadcast.reconnectionStatus = 'stable';
  broadcast.rtmpUrl = `rtmp://stream.tikwheel.local/live/${broadcast.streamKey}`;
  
  const logEntry = {
    id: `log_${crypto.randomUUID()}`,
    status: 'live',
    message: `Broadcast started on ${broadcast.platforms.join(', ')}`,
    createdAt: new Date().toISOString(),
  };
  broadcast.logEntries = [logEntry, ...broadcast.logEntries].slice(0, 12);
  broadcast.updatedAt = new Date().toISOString();

  return broadcast;
}

export function stopBroadcast(broadcast) {
  if (broadcast.status !== BROADCAST_STATUSES.LIVE) {
    throw new Error('Broadcast is not currently live');
  }

  const nowIso = new Date().toISOString();
  broadcast.status = BROADCAST_STATUSES.STOPPED;
  broadcast.endAt = nowIso;
  broadcast.connectedPlatforms = [];
  broadcast.viewerCount = 0;
  broadcast.durationSeconds = Math.max(
    1,
    Math.round((new Date(nowIso).getTime() - new Date(broadcast.startAt || nowIso).getTime()) / 1000),
  );
  broadcast.reconnectionStatus = 'offline';
  broadcast.rtmpUrl = null;

  const logEntry = {
    id: `log_${crypto.randomUUID()}`,
    status: 'stopped',
    message: 'Broadcast stopped successfully',
    createdAt: nowIso,
  };
  broadcast.logEntries = [logEntry, ...broadcast.logEntries].slice(0, 12);
  broadcast.updatedAt = nowIso;

  return broadcast;
}

export function simulateBroadcastError(broadcast) {
  const nowIso = new Date().toISOString();
  broadcast.status = BROADCAST_STATUSES.ERROR;
  broadcast.errorLog = 'Platform connector disconnected. Retrying in the background.';
  broadcast.reconnectionStatus = 'retrying';
  broadcast.connectedPlatforms = broadcast.connectedPlatforms.map((p) => ({
    ...p,
    status: 'disconnected',
  }));

  const logEntry = {
    id: `log_${crypto.randomUUID()}`,
    status: 'error',
    message: broadcast.errorLog,
    createdAt: nowIso,
  };
  broadcast.logEntries = [logEntry, ...broadcast.logEntries].slice(0, 12);
  broadcast.updatedAt = nowIso;

  return broadcast;
}

export function updateBroadcastViewers(broadcast) {
  if (broadcast.status !== BROADCAST_STATUSES.LIVE) {
    return broadcast;
  }

  broadcast.connectedPlatforms = broadcast.connectedPlatforms.map((platform) => ({
    ...platform,
    viewers: Math.max(0, platform.viewers + Math.floor(Math.random() * 20) - 10),
  }));
  broadcast.viewerCount = broadcast.connectedPlatforms.reduce((total, item) => total + Number(item.viewers || 0), 0);
  broadcast.updatedAt = new Date().toISOString();

  return broadcast;
}

export function getBroadcastStreamConfig(broadcast) {
  const portraitPlatforms = broadcast.platforms.filter((p) => 
    STREAM_PLATFORMS[p.toUpperCase()]?.aspectRatio === '9:16'
  );
  const landscapePlatforms = broadcast.platforms.filter((p) => 
    STREAM_PLATFORMS[p.toUpperCase()]?.aspectRatio === '16:9'
  );

  return {
    id: broadcast.id,
    title: broadcast.title,
    streamKey: broadcast.streamKey,
    rtmpUrl: broadcast.rtmpUrl,
    status: broadcast.status,
    aspectRatio: portraitPlatforms.length > landscapePlatforms.length ? '9:16' : '16:9',
    platforms: broadcast.platforms.map((p) => ({
      id: p,
      label: STREAM_PLATFORMS[p.toUpperCase()]?.label || p,
      aspectRatio: STREAM_PLATFORMS[p.toUpperCase()]?.aspectRatio || '16:9',
      maxBitrate: STREAM_PLATFORMS[p.toUpperCase()]?.maxBitrate || 4000,
    })),
  };
}

export function validateBroadcastPlatforms(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('At least one platform is required');
  }

  const validPlatforms = Object.keys(STREAM_PLATFORMS).map((key) => key.toLowerCase());
  const invalidPlatforms = platforms.filter((p) => !validPlatforms.includes(p.toLowerCase()));

  if (invalidPlatforms.length > 0) {
    throw new Error(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
  }

  return true;
}

export function getSupportedPlatforms() {
  return Object.values(STREAM_PLATFORMS).map((platform) => ({
    id: platform.id,
    label: platform.label,
    status: platform.status,
    aspectRatio: platform.aspectRatio,
    requiresApi: platform.requiresApi,
  }));
}
