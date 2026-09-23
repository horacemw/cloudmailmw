import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Root React Error Boundary.
 *
 * Purpose: never let a single component throw take the whole app down to a
 * white/blank screen. Any error caught here is surfaced with a recovery UI
 * that offers "Reload" and a "Reset session and log in again" escape hatch.
 * The full error message is preserved for debugging (visible in the UI and
 * printed to console with a stack trace).
 *
 * Error boundaries MUST be class components — no hooks equivalent exists.
 */

interface Props {
  children: ReactNode;
  /** Optional label shown as the error dialog header. */
  scope?: string;
}

interface State {
  err: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { err: null, info: null };
  }

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    this.setState({ info });
    // Surface to console for support/debug. Do NOT silently swallow.
    console.error(
      `[ErrorBoundary${this.props.scope ? ` :: ${this.props.scope}` : ''}]`,
      err,
      info.componentStack,
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetAuth = (): void => {
    // Best-effort clear of any local persisted keys, then hard-reload to /login.
    // Refresh cookie is HttpOnly so we can't clear it from JS — the /login
    // page's Sign In will replace it automatically.
    try {
      Object.keys(sessionStorage).forEach((k) => sessionStorage.removeItem(k));
      Object.keys(localStorage).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* private-mode may throw — safe to ignore */
    }
    window.location.assign('/login');
  };

  render(): ReactNode {
    if (!this.state.err) return this.props.children;

    const message = this.state.err.message || 'Unexpected error';

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-bg dark:bg-dark-bg p-6">
        <div className="w-full max-w-lg rounded-2xl border border-surface-border dark:border-dark-border bg-white dark:bg-dark-panel p-8 shadow-card">
          <h1 className="text-[19px] font-semibold text-ink dark:text-dark-text">
            {this.props.scope ? `Something went wrong in ${this.props.scope}.` : 'Something went wrong.'}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted dark:text-dark-muted">
            The page hit an unexpected error and stopped rendering. Your session and mail data are safe.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-bg dark:bg-dark-bg p-3 text-[11.5px] text-ink-muted dark:text-dark-muted whitespace-pre-wrap break-words">
            {message}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-brand text-white text-[13.5px] font-semibold hover:bg-brand-600 touch-manipulation"
            >
              Reload the page
            </button>
            <button
              onClick={this.handleResetAuth}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-surface-border dark:border-dark-border text-[13.5px] text-ink-muted hover:bg-surface-hover dark:hover:bg-dark-hover touch-manipulation"
            >
              Reset session and sign in again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
