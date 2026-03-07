import type express from 'express';
import {
  handleCreateSourceSubscription,
  handleDeleteSourceSubscription,
  handleListSourceSubscriptions,
  handlePatchSourceSubscription,
  handlePreviewPublicYouTubeSubscriptions,
  handleRefreshGenerate,
  handleRefreshScan,
  handleSyncSourceSubscription,
} from '../handlers/sourceSubscriptionsHandlers';
import type { SourceSubscriptionsRouteDeps } from '../contracts/api/sourceSubscriptions';

export function registerSourceSubscriptionsRoutes(app: express.Express, deps: SourceSubscriptionsRouteDeps) {
  app.post('/api/source-subscriptions', (req, res) => handleCreateSourceSubscription(req, res, deps));

  app.get('/api/source-subscriptions', (req, res) => handleListSourceSubscriptions(req, res, deps));

  app.post('/api/source-subscriptions/public-youtube-preview', deps.publicYouTubePreviewLimiter, (req, res) =>
    handlePreviewPublicYouTubeSubscriptions(req, res, deps));

  app.post('/api/source-subscriptions/refresh-scan', deps.refreshScanLimiter, (req, res) => handleRefreshScan(req, res, deps));

  app.post('/api/source-subscriptions/refresh-generate', deps.refreshGenerateLimiter, (req, res) => handleRefreshGenerate(req, res, deps));

  app.patch('/api/source-subscriptions/:id', (req, res) => handlePatchSourceSubscription(req, res, deps));

  app.delete('/api/source-subscriptions/:id', (req, res) => handleDeleteSourceSubscription(req, res, deps));

  app.post('/api/source-subscriptions/:id/sync', (req, res) => handleSyncSourceSubscription(req, res, deps));
}
