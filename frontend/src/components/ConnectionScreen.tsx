import { ArrowRight, Database, Lock, ShieldAlert, TerminalSquare } from "lucide-react";
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
      <header className="flex h-[64px] items-center border-b border-line bg-[var(--bg)] px-6">
        <h1 className="text-[19px] font-semibold text-ink">p<span className="text-[var(--red)]">gui</span></h1>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[1fr_420px] lg:items-center">
        <section>
          <div className="mb-7 flex h-16 w-16 items-center justify-center border border-line bg-[var(--surface)] text-[var(--accent)]">
            <Database size={30} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">Local PostgreSQL workspace</p>
          <h2 className="mt-4 max-w-3xl text-[42px] font-semibold leading-tight text-ink">
            Browse, edit, and query your database from one focused workbench.
          </h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-8 text-muted">
            pgui could not auto-connect. Paste a PostgreSQL connection URL to start a local session.
          </p>

          <div className="mt-8 grid gap-3 text-sm text-muted sm:grid-cols-3">
            <div className="border border-line bg-[var(--surface)] p-4">
              <ShieldAlert className="mb-3 text-[var(--accent)]" size={18} />
              Local-use only
            </div>
            <div className="border border-line bg-[var(--surface)] p-4">
              <TerminalSquare className="mb-3 text-[var(--accent)]" size={18} />
              SQL console ready
            </div>
            <div className="border border-line bg-[var(--surface)] p-4">
              <Lock className="mb-3 text-[var(--accent)]" size={18} />
              Honors read-only mode
            </div>
          </div>
        </section>

        <section className="border border-line bg-[var(--bg)] p-7 shadow-panel">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">Connection</p>
            <h3 className="mt-2 text-2xl font-semibold">Connect to PostgreSQL</h3>
          </div>

          <div>
            <label htmlFor="database-url" className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">
              Database URL
            </label>
            <input
              id="database-url"
              value={url}
              onChange={(event) => setURL(event.target.value)}
              placeholder="postgresql://user:password@host:port/dbname"
              className="mt-3 h-12 w-full border border-line bg-[var(--surface)] px-4 text-sm text-ink placeholder:text-[var(--text-dim)] focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"
            />
          </div>

          <div className="mt-5 border border-line bg-[var(--surface)] px-4 py-4 text-sm leading-6 text-muted">
            <p>
              Set{" "}
              <span className="bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 text-brand">DATABASE_URL</span>{" "}
              to auto-connect on startup. Use <span className="text-[var(--text-h)]">READ_ONLY=true</span> when you want a guarded browsing session.
            </p>
          </div>

          {error ? (
            <div className="mt-5 border border-[var(--red)] bg-[color:color-mix(in_srgb,var(--red)_10%,transparent)] p-4 text-sm leading-6 text-[var(--red-light)]">
              <p className="font-semibold text-[var(--text-h)]">Connection failed</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2 text-muted">Check host, port, credentials, database name, and SSL mode.</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onConnect(url)}
            disabled={loading || !url.trim()}
            className={cn(
              "mt-6 flex h-12 w-full items-center justify-center gap-2 border border-brand bg-brand text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-light)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]",
              (loading || !url.trim()) && "cursor-not-allowed opacity-60",
            )}
          >
            {loading ? "Connecting..." : "Connect"}
            <ArrowRight size={17} />
          </button>

          <div className="mt-7 grid grid-cols-2 gap-3 border-t border-line pt-6 text-[11px] uppercase tracking-[0.16em] text-[var(--text-h)]">
            <div className="border border-line bg-[var(--surface)] px-4 py-3">
              <span className="mr-3 inline-block h-2.5 w-2.5 bg-[var(--success)]" />
              Server online
            </div>
            <div className="border border-line bg-[var(--surface)] px-4 py-3">
              <span className="mr-3 inline-block h-2.5 w-2.5 bg-[var(--red)]" />
              DB disconnected
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
