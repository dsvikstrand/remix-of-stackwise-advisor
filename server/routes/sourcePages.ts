import type express from 'express';
import { registerSourcePagesRouteHandlers } from '../handlers/sourcePagesHandlers';
import type { SourcePagesRouteDeps as SourcePagesRouteHandlerDeps } from '../handlers/sourcePagesHandlers';

export type SourcePagesRouteDeps = SourcePagesRouteHandlerDeps;

export function registerSourcePagesRoutes(app: express.Express, deps: SourcePagesRouteDeps) {
  return registerSourcePagesRouteHandlers(app, deps);
}
