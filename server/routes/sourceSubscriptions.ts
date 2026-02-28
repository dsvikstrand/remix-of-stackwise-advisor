import type express from 'express';
import {
  handleCreateSourceSubscription,
  handleDeleteSourceSubscription,
  handleListSourceSubscriptions,
  handlePatchSourceSubscription,
  handleRefreshGenerate,
  handleRefreshScan,
  handleSyncSourceSubscription,
} from '../handlers/sourceSubscriptionsHandlers';

type SyncSubscriptionResult = any;
type RefreshScanCandidate = any;

export type SourceSubscriptionsRouteDeps = {
  getAuthedSupabaseClient: any;
  getServiceSupabaseClient: any;
  resolveYouTubeChannel: any;
  youtubeDataApiKey: string;
  fetchYouTubeChannelAssetMap: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  buildSourcePagePath: any;
  cleanupSubscriptionNoticeForChannel: any;
  refreshScanLimiter: express.RequestHandler;
  refreshGenerateLimiter: express.RequestHandler;
  RefreshSubscriptionsScanSchema: any;
  collectRefreshCandidatesForUser: any;
  RefreshSubscriptionsGenerateSchema: any;
  refreshGenerateMaxItems: number;
  recoverStaleIngestionJobs: any;
  getActiveManualRefreshJob: any;
  countQueueDepth: any;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
};

export function registerSourceSubscriptionsRoutes(app: express.Express, deps: SourceSubscriptionsRouteDeps) {
  app.post('/api/source-subscriptions', (req, res) => handleCreateSourceSubscription(req, res, deps));

  app.get('/api/source-subscriptions', (req, res) => handleListSourceSubscriptions(req, res, deps));

  app.post('/api/source-subscriptions/refresh-scan', deps.refreshScanLimiter, (req, res) => handleRefreshScan(req, res, deps));

  app.post('/api/source-subscriptions/refresh-generate', deps.refreshGenerateLimiter, (req, res) => handleRefreshGenerate(req, res, deps));

  app.patch('/api/source-subscriptions/:id', (req, res) => handlePatchSourceSubscription(req, res, deps));

  app.delete('/api/source-subscriptions/:id', (req, res) => handleDeleteSourceSubscription(req, res, deps));

  app.post('/api/source-subscriptions/:id/sync', (req, res) => handleSyncSourceSubscription(req, res, deps));
}
