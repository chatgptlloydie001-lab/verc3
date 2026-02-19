import { useState, useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "@/pages/login";
import Home from "@/pages/home";

function App() {
  const [session, setSession] = useState<{ key: string; deviceId: string; expiresAt: string | null } | null>(null);

  const handleLogin = useCallback((s: { key: string; deviceId: string; expiresAt: string | null }) => {
    queryClient.clear();
    setSession(s);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("pn_session");
    queryClient.clear();
    setSession(null);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {session ? (
          <Home onLogout={handleLogout} />
        ) : (
          <Login onLogin={handleLogin} />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
