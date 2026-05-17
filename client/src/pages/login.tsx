import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/icon-128_1771330377572.png";
import { ArrowRight, BadgeCheck, KeyRound, Loader2, LockKeyhole, Shield, Sparkles } from "lucide-react";

function getDeviceId(activationKey: string): string {
  const storageKey = `pn_device_${activationKey}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) return stored;

  const globalId = localStorage.getItem("pn_device_id");
  if (globalId) {
    localStorage.setItem(storageKey, globalId);
    return globalId;
  }

  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const id = "DV-" + Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 20);

  localStorage.setItem(storageKey, id);
  localStorage.setItem("pn_device_id", id);
  return id;
}

interface LoginProps {
  onLogin: (session: { key: string; deviceId: string; expiresAt: string | null }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem("pn_session");
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
          localStorage.removeItem("pn_session");
          return;
        }
        if (session.key && session.deviceId) {
          onLogin(session);
        }
      } catch {}
    }
  }, [onLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError("");

    try {
      const trimmedKey = key.trim();
      const deviceId = getDeviceId(trimmedKey);
      const res = await apiRequest("POST", "/api/auth/login", { key: trimmedKey, deviceId });
      const data = await res.json();

      if (data.success) {
        const session = { key: trimmedKey, deviceId, expiresAt: data.expiresAt };
        localStorage.setItem("pn_session", JSON.stringify(session));
        toast({ title: "Access granted" });
        onLogin(session);
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      try {
        const body = JSON.parse(msg.substring(msg.indexOf("{")));
        if (body.error) {
          setError(body.error);
          return;
        }
      } catch {}
      if (msg.includes("429")) setError("Too many attempts. Please wait and try again.");
      else if (msg.includes("401")) setError("Invalid activation key");
      else if (msg.includes("403")) setError("Device limit reached for this key");
      else setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#07090f] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-red-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-neutral-300 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5 text-red-400" />
              Premium account validation workspace
            </div>
            <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight tracking-tight text-white">
              Secure access for fast, reliable Netflix session checks.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-neutral-400">
              A cleaner dashboard experience with protected activation, device-aware access, and a focused verification flow.
            </p>

            <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
              {[
                { label: "Protected", detail: "Key-based entry", icon: LockKeyhole },
                { label: "Fast", detail: "Instant checks", icon: BadgeCheck },
                { label: "Private", detail: "Device bound", icon: Shield },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
                  <item.icon className="h-5 w-5 text-red-400" />
                  <p className="mt-4 text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-2 shadow-[0_24px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl">
              <div className="rounded-[1.55rem] border border-white/10 bg-[#0d1118]/95 p-6 sm:p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5">
                    <div className="absolute inset-0 rounded-2xl bg-red-500/30 blur-xl" />
                    <img src={logoImg} alt="Premium Netflix" className="relative h-16 w-16 rounded-2xl ring-1 ring-white/10" data-testid="img-login-logo" />
                  </div>
                  <div className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-300">
                    Member access
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white" data-testid="text-login-title">Premium Netflix</h1>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">Enter your activation key to open the verification dashboard.</p>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="activation-key" className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                      Activation key
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                      <input
                        id="activation-key"
                        type="text"
                        value={key}
                        onChange={(e) => { setKey(e.target.value); setError(""); }}
                        placeholder="Enter activation key"
                        data-testid="input-activation-key"
                        disabled={loading}
                        className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-white/[0.055] py-4 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-neutral-600 hover:border-white/20 focus:border-red-500/60 focus:bg-white/[0.075] focus:ring-4 focus:ring-red-500/10 disabled:opacity-50"
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-3" data-testid="text-login-error">
                      <Shield className="h-4 w-4 shrink-0 text-red-400" />
                      <p className="text-xs text-red-200">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !key.trim()}
                    data-testid="button-login"
                    className="group flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 py-4 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition-all hover:-translate-y-0.5 hover:from-red-500 hover:to-red-400 hover:shadow-red-900/35 disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-red-900/60 disabled:to-red-800/60 disabled:text-white/60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Activate dashboard
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-500">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Secured device-aware access only
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
