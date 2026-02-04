import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createLLMClient } from './llm/client';
import type { InventoryRequest } from './llm/types';

const app = express();
const port = Number(process.env.PORT) || 8787;

app.set('trust proxy', true);

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*';

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 60;
const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});

app.use(limiter);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const line = [
      req.ip,
      req.method,
      req.originalUrl,
      res.statusCode,
      `${durationMs.toFixed(1)}ms`,
    ].join(' ');
    console.log(line);
  });
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/health') return next();

  if (!supabaseClient) {
    return res.status(500).json({ error: 'Auth not configured' });
  }

  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  supabaseClient.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return next();
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }));
});

const InventoryRequestSchema = z.object({
  keywords: z.string().min(1),
  title: z.string().optional(),
  customInstructions: z.string().optional(),
  preferredCategories: z.array(z.string()).optional(),
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/generate-inventory', async (req, res) => {
  const parsed = InventoryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const payload: InventoryRequest = parsed.data;

  try {
    const client = createLLMClient();
    const schema = await client.generateInventory(payload);
    return res.json(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`[agentic-backend] listening on :${port}`);
});
