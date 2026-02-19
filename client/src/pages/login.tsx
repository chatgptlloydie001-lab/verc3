import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/icon-128_1771330377572.png";
import { Loader2, KeyRound, Shield } from "lucide-react";

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
    } catch (err: any) {
      const msg = err.message || "Connection failed";
      try {
        const body = JSON.parse(msg.substring(msg.indexOf("{")));
        if (body.error) { setError(body.error); return; }
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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={logoImg} alt="Premium Netflix" className="w-16 h-16 rounded-xl mb-4" data-testid="img-login-logo" />
          <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-login-title">Premium Netflix</h1>
          <p className="text-sm text-neutral-500 mt-1">Enter your activation key to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(""); }}
              placeholder="Enter activation key"
              data-testid="input-activation-key"
              disabled={loading}
              className="w-full h-12 pl-10 pr-4 rounded-lg border border-white/10 bg-[#141414] text-white text-sm placeholder:text-neutral-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/30 transition-all disabled:opacity-50"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20" data-testid="text-login-error">
              <Shield className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            data-testid="button-login"
            className="w-full h-12 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Activate"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-700 mt-6">Secured access only</p>
      </div>
    </div>
  );
}
