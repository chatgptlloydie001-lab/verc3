import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CookieSession, CheckResult } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/icon-128_1771330377572.png";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Tv,
  Mail,
  Globe,
  CreditCard,
  Users,
  Shield,
  ChevronDown,
  LogOut,
  Lock,
  Crown,
} from "lucide-react";

function InfoRow({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Mail;
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <Icon className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
      <span className="text-xs sm:text-sm text-neutral-400 w-24 sm:w-28 shrink-0">{label}</span>
      <span
        className={`text-xs sm:text-sm font-medium flex-1 break-all ${
          highlight ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
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
      <div className="flex flex-col items-center justify-center py-16 sm:py-20 gap-4">
        <div className="relative">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-[3px] border-neutral-800" />
          <div className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full border-[3px] border-red-600 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-medium text-neutral-400">Verifying account...</p>
      </div>
    );
  }

  if (!result) return null;

  if (!result.valid) {
    return (
      <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
        </div>
        <p className="text-sm sm:text-base font-semibold text-white">Invalid / Expired</p>
        {result.error && (
          <p className="text-xs text-neutral-500 max-w-xs text-center">{result.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-white/10">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs sm:text-sm font-bold text-emerald-400 tracking-wide uppercase">Valid Account</span>
        {result.plan && (
          <span className="ml-auto text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-600/30 font-medium">
            {result.plan}
          </span>
        )}
      </div>

      <div>
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
        <div className="flex flex-col gap-2">
          <a
            href={result.watchLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-direct-watch"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm transition-colors"
          >
            <Play className="w-4 h-4" />
            WATCH NOW
          </a>
          <a
            href={result.watchLink.replace(/netflix\.com\/browse\?/, "netflix.com/unsupported?")}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-netflix-app"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white font-semibold text-sm transition-colors border border-white/10"
          >
            <Tv className="w-4 h-4" />
            Watch on Netflix App
          </a>
        </div>
      )}
    </div>
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="border-b border-white/5 bg-[#0f0f0f]/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logoImg} alt="Premium Netflix" className="w-7 h-7 sm:w-8 sm:h-8 rounded" data-testid="img-logo" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight" data-testid="text-title">Premium Netflix</h1>
            {isPremium ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20" data-testid="badge-tier">
                <Crown className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-400 uppercase">Premium</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-[10px] font-medium text-neutral-500 uppercase" data-testid="badge-tier">
                Free
              </span>
            )}
          </div>
          <button
            onClick={onLogout}
            data-testid="button-logout"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 sm:py-8">
        <div className="space-y-5">
          <div ref={dropdownRef} className="relative" data-testid="dropdown-container">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              disabled={isLoading}
              data-testid="button-dropdown"
              className="w-full flex items-center justify-between gap-2 px-3.5 sm:px-4 py-3 rounded-xl border border-white/10 bg-[#141414] hover:bg-[#1a1a1a] transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-neutral-500 animate-spin shrink-0" />
                ) : selectedSession ? (
                  <CheckCircle2 className="w-4 h-4 text-red-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-neutral-600 shrink-0" />
                )}
                <span className={`text-sm truncate ${selectedSession ? "text-white font-medium" : "text-neutral-500"}`}>
                  {isLoading
                    ? "Loading sessions..."
                    : selectedSession
                      ? (selectedSession.description || `Cookie #${selectedSession.id}`)
                      : "Select a cookie session"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isLoading && sessions.length > 0 && (
                  <span className="text-[10px] sm:text-xs text-neutral-600 tabular-nums">{sessions.length}</span>
                )}
                <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {dropdownOpen && (
              <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-white/10 bg-[#141414] shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="max-h-60 sm:max-h-80 overflow-y-auto overscroll-contain">
                  {sessions.map((session) => {
                    const locked = session.is_premium && !isPremium;
                    return (
                      <button
                        key={session.id}
                        data-testid={`cookie-item-${session.id}`}
                        onClick={() => handleSelect(session)}
                        className={`w-full text-left px-3.5 sm:px-4 py-2.5 flex items-center gap-2.5 transition-colors text-sm ${
                          locked
                            ? "text-neutral-600 cursor-not-allowed"
                            : selectedSession?.id === session.id
                              ? "bg-red-600/10 text-red-400"
                              : "text-neutral-300 hover:bg-white/5 active:bg-white/10"
                        }`}
                      >
                        <span className="w-5 sm:w-6 text-right text-[10px] sm:text-xs font-mono text-neutral-600 shrink-0">{session.id}</span>
                        <span className={`truncate flex-1 text-xs sm:text-sm ${locked ? "text-neutral-600" : ""}`}>
                          {session.description || `Cookie #${session.id}`}
                        </span>
                        {session.is_premium ? (
                          locked ? (
                            <span className="flex items-center gap-1 shrink-0">
                              <Lock className="w-3 h-3 text-amber-600" />
                              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold uppercase">Premium</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 shrink-0">
                              <Crown className="w-3 h-3 text-amber-400" />
                              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold uppercase">Premium</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700 font-medium uppercase shrink-0">Free</span>
                        )}
                        {selectedSession?.id === session.id && !locked && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-[#111111]" data-testid="result-panel">
            <div className="p-4 sm:p-6">
              {!selectedSession && !checkMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-neutral-600">
                  <Tv className="w-9 h-9 sm:w-10 sm:h-10 mb-3 opacity-40" />
                  <p className="text-xs sm:text-sm">Select a session to check</p>
                </div>
              )}
              <ResultPanel result={checkResult} isChecking={checkMutation.isPending} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-3 sm:py-4 mt-auto">
        <p className="text-center text-[10px] sm:text-xs text-neutral-700">Premium Netflix Checker</p>
      </footer>
    </div>
  );
}
