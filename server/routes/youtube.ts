import type express from 'express';
import { registerYouTubeRouteHandlers } from '../handlers/youtubeHandlers';
import type { YouTubeRouteDeps as YouTubeRouteHandlerDeps } from '../handlers/youtubeHandlers';

export type YouTubeRouteDeps = YouTubeRouteHandlerDeps;

export function registerYouTubeRoutes(app: express.Express, deps: YouTubeRouteDeps) {
  return registerYouTubeRouteHandlers(app, deps);
}
