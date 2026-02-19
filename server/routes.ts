import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { log } from "./logger";
import { z } from "zod";
import { cookieSessionSchema, loginRequestSchema } from "../shared/schema";
import { validateNetflixCookies } from "./netflix-validator";
import { validateNetflixViaPlaywright } from "./playwright-netflix";

const USE_PLAYWRIGHT = false;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required");
}

const checkRequestSchema = z.object({
  cookies: z.any().optional(),
  sessionId: z.number({ required_error: "sessionId is required" }),
});

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil > Date.now()) {
    const retryAfter = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, retryAfter };
  }

  if (record.lockedUntil <= Date.now() && record.count >= MAX_LOGIN_ATTEMPTS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string) {
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    log(`Rate limit: IP ${ip} locked out for ${LOCKOUT_MINUTES} minutes after ${record.count} failed attempts`);
  }
  loginAttempts.set(ip, record);
}

function recordSuccessfulLogin(ip: string) {
  loginAttempts.delete(ip);
}

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
  });
}

async function verifyAuth(req: Request, res: Response, next: NextFunction) {
  const authKey = req.headers["x-activation-key"] as string;
  const deviceId = req.headers["x-device-id"] as string;

  if (!authKey || !deviceId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let response = await supabaseRequest(
      `activation_keys?key=eq.${encodeURIComponent(authKey)}&select=key,is_active,expires_at,devices,device_limit,max_devices,is_premium`
    );

    if (!response.ok) {
      const errText = await response.text();
      if (errText.includes("is_premium") && errText.includes("does not exist")) {
        response = await supabaseRequest(
          `activation_keys?key=eq.${encodeURIComponent(authKey)}&select=key,is_active,expires_at,devices,device_limit,max_devices`
        );
        if (!response.ok) {
          return res.status(401).json({ message: "Unauthorized" });
        }
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
    }

    const rows = await response.json();
    if (!rows.length) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const record = rows[0];
    if (!record.is_active) {
      return res.status(401).json({ message: "Key deactivated" });
    }
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return res.status(401).json({ message: "Key expired" });
    }

    const devices: string[] = Array.isArray(record.devices) ? record.devices : [];
    if (!devices.includes(deviceId)) {
      if (record.device_limit === "single" && devices.length >= 1) {
        return res.status(403).json({ message: "Device limit reached" });
      }
      if (record.device_limit === "limited" && devices.length >= record.max_devices) {
        return res.status(403).json({ message: "Device limit reached" });
      }
    }

    (req as any).userIsPremium = record.is_premium === true;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `Too many attempts. Try again in ${rateCheck.retryAfter} seconds.`,
        });
      }

      const parsed = loginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Invalid request" });
      }

      const { key, deviceId } = parsed.data;

      const response = await supabaseRequest(
        `activation_keys?key=eq.${encodeURIComponent(key)}&select=*`
      );

      if (!response.ok) {
        log(`Supabase auth error: ${await response.text()}`);
        return res.status(500).json({ success: false, error: "Server error" });
      }

      const rows = await response.json();
      if (!rows.length) {
        recordFailedAttempt(ip);
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
        return res.status(401).json({ success: false, error: "Invalid activation key" });
      }

      const record = rows[0];

      if (!record.is_active) {
        recordFailedAttempt(ip);
        return res.status(401).json({ success: false, error: "This key has been deactivated" });
      }

      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        recordFailedAttempt(ip);
        return res.status(401).json({ success: false, error: "This key has expired" });
      }

      const devices: string[] = Array.isArray(record.devices) ? record.devices : [];

      if (!devices.includes(deviceId)) {
        if (record.device_limit === "single" && devices.length >= 1) {
          recordFailedAttempt(ip);
          return res.status(403).json({
            success: false,
            error: "Device limit reached. This key is locked to another device.",
          });
        }
        if (record.device_limit === "limited" && devices.length >= record.max_devices) {
          recordFailedAttempt(ip);
          return res.status(403).json({
            success: false,
            error: `Device limit reached (${record.max_devices} devices max).`,
          });
        }

        const updatedDevices = [...devices, deviceId];
        const updateRes = await supabaseRequest(
          `activation_keys?id=eq.${record.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ devices: updatedDevices }),
          }
        );

        if (!updateRes.ok) {
          log(`Failed to update devices: ${await updateRes.text()}`);
        }
      }

      recordSuccessfulLogin(ip);
      const expiresAt = record.expires_at ? new Date(record.expires_at).toISOString() : null;

      return res.json({
        success: true,
        deviceLimit: record.device_limit,
        maxDevices: record.max_devices,
        currentDevices: devices.includes(deviceId) ? devices.length : devices.length + 1,
        expiresAt,
        isPremium: record.is_premium === true,
      });
    } catch (err: any) {
      log(`Auth error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Authentication failed" });
    }
  });

  app.get("/api/cookies", verifyAuth, async (req: Request, res: Response) => {
    try {
      const userIsPremium = (req as any).userIsPremium === true;

      let response = await supabaseRequest(
        "cookie_sessions?select=id,description,cookies,is_premium&order=id.asc"
      );

      if (!response.ok) {
        const text = await response.text();
        if (text.includes("is_premium") && text.includes("does not exist")) {
          response = await supabaseRequest(
            "cookie_sessions?select=id,description,cookies&order=id.asc"
          );
          if (!response.ok) {
            log(`Supabase error: ${await response.text()}`);
            return res.status(500).json({ message: "Failed to fetch cookies from database" });
          }
        } else {
          log(`Supabase error: ${text}`);
          return res.status(500).json({ message: "Failed to fetch cookies from database" });
        }
      }

      const rawData = await response.json();
      const data = (rawData as any[]).map((row) => ({
        ...row,
        is_premium: row.is_premium === true,
      }));

      const validated = z.array(cookieSessionSchema).safeParse(data);
      if (!validated.success) {
        log(`Supabase response validation failed: ${validated.error.message}`);
        return res.status(500).json({ message: "Invalid data format from database" });
      }

      const sessions = validated.data.map((session) => {
        if (session.is_premium && !userIsPremium) {
          return {
            id: session.id,
            description: session.description,
            is_premium: true,
            cookies: null,
          };
        }
        return session;
      });

      res.json({ sessions, userIsPremium });
    } catch (err: any) {
      log(`Supabase fetch error: ${err.message}`);
      res.status(500).json({ message: "Failed to connect to database" });
    }
  });

  app.post("/api/check", verifyAuth, async (req: Request, res: Response) => {
    try {
      const userIsPremium = (req as any).userIsPremium === true;

      const parsed = checkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ valid: false, error: "sessionId is required" });
      }

      const { sessionId } = parsed.data;

      let sessionRes = await supabaseRequest(
        `cookie_sessions?id=eq.${sessionId}&select=id,cookies,is_premium`
      );

      if (!sessionRes.ok) {
        const errText = await sessionRes.text();
        if (errText.includes("is_premium") && errText.includes("does not exist")) {
          sessionRes = await supabaseRequest(
            `cookie_sessions?id=eq.${sessionId}&select=id,cookies`
          );
          if (!sessionRes.ok) {
            return res.status(500).json({ valid: false, error: "Failed to fetch session" });
          }
        } else {
          return res.status(500).json({ valid: false, error: "Failed to fetch session" });
        }
      }

      const rows = await sessionRes.json();
      if (!rows.length) {
        return res.status(404).json({ valid: false, error: "Session not found" });
      }

      const session = rows[0];

      if (session.is_premium === true && !userIsPremium) {
        log(`Free user attempted to check premium cookie session ${sessionId}`);
        return res.status(403).json({
          valid: false,
          error: "Premium cookie — upgrade your activation key to access this session",
        });
      }

      const cookies = session.cookies;

      let result;
      if (USE_PLAYWRIGHT) {
        log("Using Playwright-based Netflix validator (421 bypass via web.prod GraphQL)");
        try {
          result = await validateNetflixViaPlaywright(cookies);
          if (!result.valid && result.error && result.error.includes("launch")) {
            log(`Playwright browser launch failed, falling back to HTTP validator`);
            result = await validateNetflixCookies(cookies);
          }
        } catch (pwErr: any) {
          log(`Playwright validator failed, falling back to HTTP: ${pwErr.message}`);
          result = await validateNetflixCookies(cookies);
        }
      } else {
        result = await validateNetflixCookies(cookies);
      }

      res.json(result);
    } catch (err: any) {
      log(`Check error: ${err.message}`);
      res.status(500).json({ valid: false, error: "Failed to check cookie" });
    }
  });

  return httpServer;
}
