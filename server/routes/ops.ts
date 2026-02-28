import type express from 'express';
import {
  handleAutoBannerJobsLatest,
  handleAutoBannerJobsTrigger,
  handleDebugSimulateNewUploads,
  handleIngestionJobsLatest,
  handleIngestionJobsTrigger,
  handleQueueHealth,
  handleSourcePagesAssetSweep,
} from '../handlers/opsHandlers';
import type { OpsRouteDeps } from '../contracts/api/ops';

export function registerOpsRoutes(app: express.Express, deps: OpsRouteDeps) {
  app.post('/api/ingestion/jobs/trigger', (req, res) => handleIngestionJobsTrigger(req, res, deps));

  app.get('/api/ingestion/jobs/latest', (req, res) => handleIngestionJobsLatest(req, res, deps));

  app.get('/api/ops/queue/health', (req, res) => handleQueueHealth(req, res, deps));

  app.post('/api/source-pages/assets/sweep', (req, res) => handleSourcePagesAssetSweep(req, res, deps));

  app.post('/api/auto-banner/jobs/trigger', (req, res) => handleAutoBannerJobsTrigger(req, res, deps));

  app.get('/api/auto-banner/jobs/latest', (req, res) => handleAutoBannerJobsLatest(req, res, deps));

  app.post('/api/debug/subscriptions/:id/simulate-new-uploads', (req, res) => handleDebugSimulateNewUploads(req, res, deps));
}
