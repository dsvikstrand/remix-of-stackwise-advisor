import type express from 'express';
import {
  handleAnalyzeBlueprint,
  handleCredits,
  handleGenerateBanner,
  handleHealth,
} from '../handlers/coreHandlers';
import type { CoreRouteDeps } from '../contracts/api/core';

export function registerCoreRoutes(app: express.Express, deps: CoreRouteDeps) {
  app.get('/api/health', (req, res) => handleHealth(req, res, deps));

  app.get('/api/credits', deps.creditsReadLimiter, (req, res) => handleCredits(req, res, deps));

  app.post('/api/analyze-blueprint', (req, res) => handleAnalyzeBlueprint(req, res, deps));

  app.post('/api/generate-banner', (req, res) => handleGenerateBanner(req, res, deps));
}
