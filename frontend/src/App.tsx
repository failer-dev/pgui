import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConnectionScreen } from "./components/ConnectionScreen";
import { EditorLayout } from "./components/EditorLayout";
import { connectDatabase, getConnectionStatus } from "./lib/api";
import type { ConnectionStatus } from "./lib/types";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const stored = window.localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

export default function App() {
  const [statusOverride, setStatusOverride] = useState<ConnectionStatus | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  if (statusQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-lg text-muted">Loading workspace...</div>;
  }

  const status = (statusOverride || connectMutation.data || statusQuery.data) as ConnectionStatus | undefined;
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
