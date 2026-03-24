import { DatabaseZap, ArrowRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

type Props = {
  onConnect: (url: string) => Promise<void>;
  loading: boolean;
  error?: string;
};

export function ConnectionScreen({ onConnect, loading, error }: Props) {
  const [url, setURL] = useState("");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-[70px] items-center border-b border-line bg-[var(--bg)] px-8">
        <h1 className="text-[20px] font-semibold text-ink">Data Editorial</h1>
      </header>

      <main className="mx-auto flex max-w-[720px] flex-col items-center px-6 pb-16 pt-20">
        <div className="w-full border border-line bg-[var(--bg)] px-12 py-12 shadow-panel">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center border border-line bg-[var(--surface)] text-[var(--red)]">
            <DatabaseZap size={34} />
          </div>
          <h2 className="text-center text-[28px] font-semibold tracking-[-0.02em] text-ink">
            Unable to auto-connect to database.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-center text-[18px] leading-8 text-muted">
            Please provide your PostgreSQL connection details manually to access the editorial suite.
          </p>

          <div className="mt-12">
            <label className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-dim)]">
              Database URL
            </label>
            <input
              value={url}
              onChange={(event) => setURL(event.target.value)}
              placeholder="postgresql://user:password@host:port/dbname"
              className="mt-4 h-16 w-full border border-line bg-[var(--surface)] px-5 text-lg text-ink outline-none ring-0 placeholder:text-[var(--text-dim)] focus:border-brand"
            />
          </div>

          <div className="mt-6 flex gap-3 border border-line bg-[var(--surface)] px-4 py-4 text-base text-muted">
            <span className="mt-0.5 text-[var(--text-dim)]">i</span>
            <p>
              Tip: You can automate this connection by setting the{" "}
              <span className="bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 text-brand">DATABASE_URL</span>{" "}
              environment variable in your Docker container or server configuration.
            </p>
          </div>

          {error ? <p className="mt-5 text-sm text-[var(--red)]">{error}</p> : null}

          <button
            onClick={() => onConnect(url)}
            disabled={loading || !url.trim()}
            className={cn(
              "mt-8 flex h-16 w-full items-center justify-center gap-3 border border-brand bg-brand text-xl font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-light)]",
              (loading || !url.trim()) && "cursor-not-allowed opacity-60",
            )}
          >
            {loading ? "Connecting..." : "Connect"}
            <ArrowRight size={20} />
          </button>

          <div className="mt-12 grid grid-cols-2 gap-4 border-t border-line pt-10 text-sm uppercase tracking-[0.18em] text-[var(--text-h)]">
            <div className="border border-line bg-[var(--surface)] px-5 py-4">
              <span className="mr-3 inline-block h-2.5 w-2.5 bg-[var(--success)]" />
              App server: online
            </div>
            <div className="border border-line bg-[var(--surface)] px-5 py-4">
              <span className="mr-3 inline-block h-2.5 w-2.5 bg-[var(--red)]" />
              DB socket: disconnected
            </div>
          </div>
        </div>

        <div className="mt-14 h-56 w-full border border-line bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--surface)_70%,transparent),transparent_70%)]" />
      </main>
    </div>
  );
}
