import type express from 'express';
import { registerSourcePagesRouteHandlers } from '../handlers/sourcePagesHandlers';
import type { SourcePagesRouteDeps } from '../contracts/api/sourcePages';

export function registerSourcePagesRoutes(app: express.Express, deps: SourcePagesRouteDeps) {
  return registerSourcePagesRouteHandlers(app, deps);
}
