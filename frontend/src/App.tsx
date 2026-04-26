import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConnectionScreen } from "./components/ConnectionScreen";
import { EditorLayout } from "./components/EditorLayout";
import { connectDatabase, getConnectionStatus } from "./lib/api";
import type { ConnectionStatus, ThemePreference } from "./lib/types";

type Theme = "dark" | "light";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem("theme");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : null;
}

function resolveTheme(preference: ThemePreference, systemTheme: Theme): Theme {
  return preference === "system" ? systemTheme : preference;
}

export default function App() {
  const [statusOverride, setStatusOverride] = useState<ConnectionStatus | null>(null);
  const [userThemePreference, setUserThemePreference] = useState<ThemePreference | null>(getStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const statusQuery = useQuery({
    queryKey: ["connection-status"],
    queryFn: getConnectionStatus,
  });

  const connectMutation = useMutation({
    mutationFn: connectDatabase,
    onSuccess: (status) => {
      setStatusOverride(status);
      void statusQuery.refetch();
    },
  });

  const status = (statusOverride || connectMutation.data || statusQuery.data) as ConnectionStatus | undefined;
  const themePreference = userThemePreference ?? status?.theme ?? "system";
  const theme = resolveTheme(themePreference, systemTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "light" : "dark");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (userThemePreference) {
      window.localStorage.setItem("theme", userThemePreference);
    }
  }, [theme, userThemePreference]);

  const toggleTheme = () => {
    setUserThemePreference(theme === "dark" ? "light" : "dark");
  };

  if (statusQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-lg text-muted">Loading workspace...</div>;
  }
  if (!status) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-lg text-muted">Unable to load application state.</div>;
  }

  if (!status.connected) {
    return (
      <ConnectionScreen
        loading={connectMutation.isPending}
        error={connectMutation.error instanceof Error ? connectMutation.error.message : status.error}
        onConnect={async (url) => {
          await connectMutation.mutateAsync(url);
          await statusQuery.refetch();
        }}
      />
    );
  }

  return (
    <EditorLayout
      status={status}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}
