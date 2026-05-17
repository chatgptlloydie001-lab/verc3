import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CookieSession, CheckResult } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/icon-128_1771330377572.png";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
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

function InfoRow({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 px-1 py-3.5 sm:px-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
      <span className="w-28 shrink-0 text-sm text-neutral-400 sm:w-32">{label}</span>
      <span className={`min-w-0 flex-1 break-words text-sm font-semibold ${highlight ? "text-emerald-300" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

function getNetflixActionLink(watchLink: string, path: string) {
  try {
    const url = new URL(watchLink);
    url.pathname = path;
    return url.toString();
  } catch {
    return watchLink.replace(/netflix\.com\/[^?]*\?/, `netflix.com${path}?`);
  }
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

      <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#0b0f16]/70 px-4 py-1">
        <InfoRow icon={Shield} label="Status" value={result.status} highlight />
        <InfoRow icon={CreditCard} label="Premium" value={result.premium} />
        <InfoRow icon={Globe} label="Country" value={result.country} />
        <InfoRow icon={Tv} label="Plan" value={result.plan} />
        <InfoRow icon={CreditCard} label="Price" value={result.price} />
        <InfoRow icon={Users} label="Member Since" value={result.memberSince} />
        <InfoRow icon={CreditCard} label="Payment" value={result.paymentMethod} />
        <InfoRow icon={Mail} label="Email" value={result.email} />
        <InfoRow icon={Shield} label="Verified" value={result.emailVerified} />
        <InfoRow icon={Tv} label="Quality" value={result.videoQuality} />
        <InfoRow icon={Users} label="Max Streams" value={result.maxStreams} />
        <InfoRow icon={Users} label="Extra Member" value={result.extraMember} />
        <InfoRow icon={Users} label="Profiles" value={result.profiles} />
        <InfoRow icon={CreditCard} label="Billing" value={result.billing} />
      </div>

      {result.watchLink && (
        <div className="grid gap-3">
          <a
            href={result.watchLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-direct-watch"
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-3.5 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-red-950/30 transition-all hover:-translate-y-0.5 hover:from-red-500 hover:to-red-400"
          >
            <Play className="h-4 w-4" />
            Watch now
          </a>
          <a
            href={getNetflixActionLink(result.watchLink, "/unsupported")}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-netflix-app"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/[0.12]"
          >
            <Smartphone className="h-4 w-4" />
            Watch on Netflix App
          </a>
          <a
            href={getNetflixActionLink(result.watchLink, "/tv8")}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-watch-tv"
            className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-semibold text-black transition-all hover:-translate-y-0.5 hover:bg-amber-300"
          >
            <Tv className="h-4 w-4" />
            Watch on TV
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

interface HomeProps {
  onLogout: () => void;
}

export default function Home({ onLogout }: HomeProps) {
  const [selectedSession, setSelectedSession] = useState<CookieSession | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: cookieData, isLoading } = useQuery<{ sessions: CookieSession[]; userIsPremium: boolean }>({
    queryKey: ["/api/cookies"],
  });

  const sessions = cookieData?.sessions ?? [];
  const isPremium = cookieData?.userIsPremium === true;
  const premiumSessions = sessions.filter((session) => session.is_premium).length;
  const availableSessions = sessions.filter((session) => !session.is_premium || isPremium).length;
  const selectedSessionLabel = selectedSession?.description || (selectedSession ? `Cookie #${selectedSession.id}` : "No session selected");

  const checkMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await apiRequest("POST", "/api/check", { sessionId });
      return (await res.json()) as CheckResult;
    },
    onSuccess: (data) => {
      setCheckResult(data);
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
    setDropdownOpen(false);
    checkMutation.mutate(session.id);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="flex items-center gap-2 rounded-full border border-red-400/15 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200">
                <Sparkles className="h-3.5 w-3.5" />
                Verification hub
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Select, verify, and launch with confidence.</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Choose an available cookie session to run a live account status check and view key membership details.
              </p>
            </section>

            <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">{stat.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                      <stat.icon className="h-5 w-5 text-red-300" />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </aside>

          <section className="space-y-5">
            <div ref={dropdownRef} className="relative" data-testid="dropdown-container">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                disabled={isLoading}
                data-testid="button-dropdown"
                className="group flex w-full items-center justify-between gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] px-4 py-4 text-left shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-70 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#111827]">
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                    ) : selectedSession ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    ) : (
                      <SearchCheck className="h-5 w-5 text-neutral-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Cookie session</p>
                    <p className={`mt-1 truncate text-sm sm:text-base ${selectedSession ? "font-semibold text-white" : "text-neutral-400"}`}>
                      {isLoading ? "Loading sessions..." : selectedSessionLabel}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!isLoading && sessions.length > 0 && (
                    <span className="hidden rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-neutral-400 sm:inline-flex">{sessions.length} sessions</span>
                  )}
                  <ChevronDown className={`h-5 w-5 text-neutral-500 transition-transform duration-200 group-hover:text-neutral-300 ${dropdownOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {dropdownOpen && (
                <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0d1118]/95 shadow-2xl shadow-black/70 backdrop-blur-2xl animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="max-h-72 overflow-y-auto overscroll-contain p-2 sm:max-h-96">
                    {sessions.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-neutral-500">No sessions are available yet.</div>
                    ) : (
                      sessions.map((session) => {
                        const locked = session.is_premium && !isPremium;
                        return (
                          <button
                            key={session.id}
                            data-testid={`cookie-item-${session.id}`}
                            onClick={() => handleSelect(session)}
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-all ${
                              locked
                                ? "cursor-not-allowed text-neutral-600"
                                : selectedSession?.id === session.id
                                  ? "bg-red-500/10 text-red-200 ring-1 ring-red-400/20"
                                  : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-xs text-neutral-500">{session.id}</span>
                            <span className={`min-w-0 flex-1 truncate ${locked ? "text-neutral-600" : ""}`}>
                              {session.description || `Cookie #${session.id}`}
                            </span>
                            {session.is_premium ? (
                              <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${locked ? "border-amber-600/20 bg-amber-600/10 text-amber-600" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
                                {locked ? <Lock className="h-3 w-3" /> : <Crown className="h-3 w-3" />}
                                Premium
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500">Free</span>
                            )}
                            {selectedSession?.id === session.id && !locked && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/25 backdrop-blur-2xl" data-testid="result-panel">
              <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Session result</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Account verification</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-medium text-neutral-400">
                    {checkMutation.isPending ? "Running check" : checkResult ? "Result ready" : "Awaiting selection"}
                  </span>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {!selectedSession && !checkMutation.isPending && (
                  <div className="flex flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-14 text-center text-neutral-500 sm:py-16">
                    <Tv className="mb-4 h-12 w-12 opacity-40" />
                    <p className="text-sm font-medium text-neutral-300">Select a session to begin</p>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">Your verification results and account details will appear here.</p>
                  </div>
                )}
                <ResultPanel result={checkResult} isChecking={checkMutation.isPending} />
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-white/10 py-5">
        <p className="text-center text-xs text-neutral-600">Premium Netflix Checker</p>
      </footer>
    </div>
  );
}
