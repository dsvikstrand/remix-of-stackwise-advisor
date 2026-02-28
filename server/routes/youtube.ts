import type express from 'express';
import { registerYouTubeRouteHandlers } from '../handlers/youtubeHandlers';
import type { YouTubeRouteDeps } from '../contracts/api/youtube';

export function registerYouTubeRoutes(app: express.Express, deps: YouTubeRouteDeps) {
  return registerYouTubeRouteHandlers(app, deps);
}
