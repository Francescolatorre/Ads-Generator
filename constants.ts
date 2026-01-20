
import { AdChannel } from './types';

export const CHANNELS: AdChannel[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    placements: [
      { id: 'insta-feed', name: 'Feed', aspectRatio: '1:1', description: 'Square feed post' },
      { id: 'insta-story', name: 'Story', aspectRatio: '9:16', description: 'Full-screen vertical story' },
      { id: 'insta-reel', name: 'Reels', aspectRatio: '9:16', description: 'Immersive video content' }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    placements: [
      { id: 'tiktok-feed', name: 'In-Feed Ad', aspectRatio: '9:16', description: 'Native vertical video' }
    ]
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: '👥',
    placements: [
      { id: 'fb-feed', name: 'Feed', aspectRatio: '1:1', description: 'Standard newsfeed post' },
      { id: 'fb-right', name: 'Right Column', aspectRatio: '16:9', description: 'Desktop side placement' }
    ]
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    icon: '🔍',
    placements: [
      { id: 'google-display', name: 'Display Banner', aspectRatio: '16:9', description: 'Wide display network asset' },
      { id: 'google-square', name: 'Square Display', aspectRatio: '1:1', description: 'Universal app/display asset' }
    ]
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    placements: [
      { id: 'li-post', name: 'Sponsored Content', aspectRatio: '1:1', description: 'Professional feed update' },
      { id: 'li-banner', name: 'Banner', aspectRatio: '16:9', description: 'Top page banner' }
    ]
  }
];

export const DEFAULT_BRIEFING = {
  style: 'Premium, clean, minimalist background',
  focus: 'Make the product stand out as the hero',
  tone: 'Professional and modern',
  cta: 'Shop Now'
};
