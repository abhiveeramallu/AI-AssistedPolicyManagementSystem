export const AuthPage = ({
  mode,
  onModeChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  name,
  onNameChange,
  onSubmit,
  loading,
  errorMessage,
  statusMessage
}) => {
  const isRegister = mode === 'register';

  return (
    <div className="min-h-screen px-4 py-8 md:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr,1fr]">
        <section className="ui-card relative overflow-hidden">
          <div className="absolute -left-16 top-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-white/5 blur-3xl" />

          <p className="ui-text-muted text-xs uppercase tracking-[0.14em]">Secure Access Intelligence</p>
          <h1 className="ui-title mt-3 text-3xl font-bold leading-tight md:text-4xl">
            AI-Assisted Secure Access Policy Management System
          </h1>
          <p className="ui-text-muted mt-4 max-w-xl text-sm leading-7">
            Prevent security misconfiguration during file sharing with human-approved policy recommendations,
            encrypted storage, and password-protected access workflows.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="ui-card-soft">
              <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Security First</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ui-text)]">
                Files are encrypted before storage. No plaintext persists.
              </p>
            </div>
            <div className="ui-card-soft">
              <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Policy Control</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ui-text)]">
                AI assists recommendations, humans approve enforcement.
              </p>
            </div>
            <div className="ui-card-soft md:col-span-2">
              <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Shared Access</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ui-text)]">
                Login and open shared files by owner ID with per-file password checks.
              </p>
            </div>
          </div>
        </section>

        <section className="ui-card">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onModeChange('login')}
              className={isRegister ? 'ui-btn-secondary' : 'ui-btn-primary'}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onModeChange('register')}
              className={isRegister ? 'ui-btn-primary' : 'ui-btn-secondary'}
            >
              Sign Up
            </button>
          </div>

          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <div className="space-y-3">
            <label className="block">
              <span className="ui-label">Email</span>
              <input
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                className="ui-input mt-1"
              />
            </label>

            <label className="block">
              <span className="ui-label">Password</span>
              <input
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={128}
                placeholder={isRegister ? 'Create password' : 'Enter password'}
                className="ui-input mt-1"
              />
            </label>

            {isRegister ? (
              <div className="grid gap-3">
                <label className="block">
                  <span className="ui-label">Display Name (optional)</span>
                  <input
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    maxLength={80}
                    placeholder="Your name"
                    className="ui-input mt-1"
                  />
                </label>
              </div>
            ) : null}
            </div>

            {errorMessage ? (
              <div className="ui-alert-error mt-4">{errorMessage}</div>
            ) : null}

            {statusMessage ? (
              <div className="ui-alert-success mt-4">{statusMessage}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="ui-btn-primary mt-5 w-full"
            >
              {loading
                ? isRegister
                  ? 'Creating account...'
                  : 'Signing in...'
                : isRegister
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
