import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import net from "net";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { z } from "zod";

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { requestContextMiddleware } from "./requestContext";
import { serveStatic, setupVite } from "./vite";
import { handleSSE } from "../sse";
import { startAutoSkipJob } from "../jobs/autoSkip";
import { startCleanupSmsLogsJob } from "../jobs/cleanupSmsLogs";
import { startCleanupOldTicketsJob } from "../jobs/cleanupOldTickets";
import { startDailyResetJob } from "../jobs/dailyReset";
import { startWaitAlertJob } from "../jobs/waitAlert";

import { constructWebhookEvent, handleCheckoutCompleted } from "../stripe";
import { storageGet, storagePut } from "../storage";
import * as db from "../db";
import { sdk } from "./sdk";


function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

const buildTwilioSignature = (
  url: string,
  params: Record<string, string>,
  authToken: string
) => {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((accumulator, key) => `${accumulator}${key}${params[key]}`, url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
};

const isTwilioSignatureValid = (request: express.Request, authToken: string) => {
  const signatureHeader = request.headers["x-twilio-signature"];
  if (typeof signatureHeader !== "string") {
    return false;
  }

  const url = `${request.protocol}://${request.get("host")}${request.originalUrl}`;
  const rawParams = request.body && typeof request.body === "object" ? request.body : {};
  const params: Record<string, string> = {};

  for (const [entryKey, entryValue] of Object.entries(rawParams)) {
    const normalizedValue = Array.isArray(entryValue)
      ? entryValue.join("")
      : String(entryValue ?? "");
    params[entryKey] = normalizedValue;
  }

  const expectedSignature = buildTwilioSignature(url, params, authToken);
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const OUTPUT_IMAGE_EXTENSION = "webp";
const OUTPUT_IMAGE_MIME = "image/webp";
const WEBP_QUALITY = 80;

/** Image size presets per kind */
const IMAGE_SIZE_PRESETS: Record<string, { main: number; thumb?: number; original?: boolean }> = {
  logo:  { main: 256, thumb: 64, original: true },
  menu:  { main: 800, thumb: 200 },
  feed:  { main: 1200 },
};

async function optimizeImage(
  buffer: Buffer,
  maxDimension: number,
  quality: number = WEBP_QUALITY,
): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Only resize if larger than maxDimension
  if (width > maxDimension || height > maxDimension) {
    return image
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  }

  return image.webp({ quality }).toBuffer();
}
const uploadTokens = new Map<

  string,
  { key: string; mime: string; size: number; expiresAt: number }
>();

const presignSchema = z.object({
  mime: z.string().min(1),
  size: z.number().positive(),
  kind: z.string().min(1),
  storeId: z.number(),
});

function cleanupUploadTokens() {
  const now = Date.now();
  uploadTokens.forEach((value, token) => {
    if (value.expiresAt <= now) {
      uploadTokens.delete(token);
    }
  });
}

function normalizeKind(kind: string) {
  const normalized = kind.trim().toLowerCase();
  const allowedKinds = new Set(["menu", "menu-item", "feed", "feed-post", "logo"]);
  if (!allowedKinds.has(normalized)) {
    return null;
  }
  if (normalized === "menu-item") return "menu";
  if (normalized === "feed-post") return "feed";
  return normalized;
}

function buildMediaKey(storeId: number, kind: string, extension: string) {
  return `stores/${storeId}/${kind}/${Date.now()}-${nanoid(10)}.${extension}`;
}

function buildPublicUrl(key: string) {
  return `/api/media/file?key=${encodeURIComponent(key)}`;
}

function registerMediaRoutes(app: express.Express) {
  app.post("/api/media/presign", async (req, res) => {
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch (error) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = parsed.data;
    try {
      const store = await db.getStoreById(payload.storeId);
      if (!store || store.ownerId !== user.id) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      const mime = payload.mime.toLowerCase();
      const inputExtension = ALLOWED_MIME_TYPES.get(mime);
      if (!inputExtension) {
        res.status(400).json({ error: "Unsupported file type" });
        return;
      }

      if (payload.size > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: "File too large" });
        return;
      }

      const kind = normalizeKind(payload.kind);
      if (!kind) {
        res.status(400).json({ error: "Invalid kind" });
        return;
      }

      cleanupUploadTokens();
      const key = buildMediaKey(payload.storeId, kind, OUTPUT_IMAGE_EXTENSION);
      const token = nanoid(32);

      uploadTokens.set(token, {
        key,
        mime,
        size: payload.size,
        expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS,
      });

      res.json({
        uploadUrl: `/api/media/upload?token=${token}`,
        publicUrl: buildPublicUrl(key),
        key,
      });
    } catch (error) {
      console.error("[Media] Presign failed", error);
      res.status(500).json({ error: "Presign failed" });
    }
  });

  app.put(
    "/api/media/upload",
    express.raw({ type: "*/*", limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!token) {
        res.status(400).json({ error: "token is required" });
        return;
      }

      const uploadInfo = uploadTokens.get(token);
      if (!uploadInfo || uploadInfo.expiresAt <= Date.now()) {
        if (uploadInfo) {
          uploadTokens.delete(token);
        }
        res.status(403).json({ error: "Upload token expired" });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body)) {
        res.status(400).json({ error: "Invalid upload body" });
        return;
      }

      const contentType = (req.headers["content-type"] || uploadInfo.mime)
        .split(";")[0]
        .trim();
      if (contentType !== uploadInfo.mime) {
        res.status(415).json({ error: "Invalid content type" });
        return;
      }
      if (body.length > uploadInfo.size || body.length > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: "File too large" });
        return;
      }

      try {
        // Determine kind from key path (stores/{id}/{kind}/...)
        const keyParts = uploadInfo.key.split("/");
        const kind = keyParts.length >= 3 ? keyParts[2] : "feed";
        const preset = IMAGE_SIZE_PRESETS[kind] || { main: 1200 };

        // Generate optimized main image
        const mainBuffer = await optimizeImage(body, preset.main);
        await storagePut(uploadInfo.key, mainBuffer, OUTPUT_IMAGE_MIME);

        const result: Record<string, string> = {
          success: "true",
          key: uploadInfo.key,
          publicUrl: buildPublicUrl(uploadInfo.key),
        };

        // Generate thumbnail if preset requires it
        if (preset.thumb) {
          const thumbKey = uploadInfo.key.replace(/\.[^.]+$/, `-thumb.${OUTPUT_IMAGE_EXTENSION}`);
          const thumbBuffer = await optimizeImage(body, preset.thumb, 70);
          await storagePut(thumbKey, thumbBuffer, OUTPUT_IMAGE_MIME);
          result.thumbKey = thumbKey;
          result.thumbUrl = buildPublicUrl(thumbKey);
        }

        // Store original if preset requires it
        if (preset.original) {
          const originalKey = uploadInfo.key.replace(/\.[^.]+$/, `-original.${OUTPUT_IMAGE_EXTENSION}`);
          const originalBuffer = await sharp(body).webp({ quality: 95 }).toBuffer();
          await storagePut(originalKey, originalBuffer, OUTPUT_IMAGE_MIME);
          result.originalKey = originalKey;
          result.originalUrl = buildPublicUrl(originalKey);
        }

        uploadTokens.delete(token);
        const metadata = await sharp(mainBuffer).metadata();
        console.log(`[Media] Optimized ${kind}: ${body.length} -> ${mainBuffer.length} bytes (${metadata.width}x${metadata.height})`);
        res.json(result);
      } catch (error) {
        console.error("[Media] Upload failed", error);
        res.status(500).json({ error: "Upload failed" });
      }

    }
  );

  app.get("/api/media/file", async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) {
      res.status(400).json({ error: "key is required" });
      return;
    }

    try {
      const { url } = await storageGet(key);
      res.redirect(url);
    } catch (error) {
      console.error("[Media] File fetch failed", error);
      res.status(404).json({ error: "File not found" });
    }
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(requestContextMiddleware);

  // Stripe Webhook endpoint - MUST be registered BEFORE express.json()
  // express.json() would parse the body as JSON, but Stripe signature verification
  // requires the raw body buffer. Registering this route first ensures raw body is preserved.
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    
    try {
      const event = constructWebhookEvent(req.body, signature, webhookSecret);
      
      // Handle test events
      if (event.id.startsWith('evt_test_')) {
        console.log('[Stripe Webhook] Test event detected, returning verification response');
        return res.json({ verified: true });
      }
      
      console.log(`[Stripe Webhook] Received event: ${event.type}`);
      
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as any);
          break;
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (err: any) {
      console.error('[Stripe Webhook] Error:', err.message);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerMediaRoutes(app);
  // SSE endpoint for real-time updates
  app.get('/api/sse', handleSSE);

  app.post('/api/twilio/webhook', async (req, res) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
      console.error('[Twilio Webhook] Missing TWILIO_AUTH_TOKEN');
      return res.status(500).json({ error: 'Webhook auth token not configured' });
    }

    if (!isTwilioSignatureValid(req, authToken)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const body = req.body as Record<string, unknown> | undefined;
    const fromNumber = typeof body?.From === 'string' ? body.From : '';
    const messageBody = typeof body?.Body === 'string' ? body.Body : '';

    if (!fromNumber) {
      return res.status(400).json({ error: 'From is required' });
    }

    const keyword = messageBody.trim().toUpperCase().split(/\s+/)[0];
    if (STOP_KEYWORDS.has(keyword)) {
      await db.optOutSmsSubscriptionsByPhone(fromNumber);
    }

    return res.status(200).send('OK');
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Start background jobs
    startAutoSkipJob(60); // Run every 60 seconds
    startCleanupSmsLogsJob();
    startCleanupOldTicketsJob(); // Clean up tickets older than 90 days, runs every 24h
    startDailyResetJob(300);
    startWaitAlertJob(60); // Run every 60 seconds

  });
}

startServer().catch(console.error);
