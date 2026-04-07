import { useEffect, useState } from 'react';

export const TokenStatusView = ({
  selectedFile,
  onGenerate,
  generatedToken,
  generatedShareLink,
  loading
}) => {
  const [expiryMinutes, setExpiryMinutes] = useState(30);
  const [maxUsageCount, setMaxUsageCount] = useState(3);
  const [accessPassword, setAccessPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const controlConfig =
    selectedFile?.policy && typeof selectedFile.policy.recommendedControls === 'object'
      ? selectedFile.policy.recommendedControls
      : {};
  const requireTokenPassword = Boolean(controlConfig.requireTokenPassword);
  const maxTokenTtlMinutes = Number(controlConfig.maxTokenTtlMinutes) || 1440;

  useEffect(() => {
    setLocalError('');

    if (selectedFile?.policy) {
      const policyMaxAttempts = Number.parseInt(String(selectedFile.policy.maxAccessAttempts), 10);
      if (Number.isInteger(policyMaxAttempts) && policyMaxAttempts >= 1 && policyMaxAttempts <= 20) {
        setMaxUsageCount(Math.min(5, policyMaxAttempts));
      } else {
        setMaxUsageCount(3);
      }

      setExpiryMinutes(Math.max(1, Math.min(30, maxTokenTtlMinutes)));
    }

    setAccessPassword('');
  }, [selectedFile]);

  useEffect(() => {
    setCopyStatus('');
  }, [generatedShareLink, generatedToken]);

  const handleGenerateShareLink = () => {
    setLocalError('');

    const parsedExpiry = Number.parseInt(String(expiryMinutes), 10);
    if (!Number.isInteger(parsedExpiry) || parsedExpiry < 1 || parsedExpiry > maxTokenTtlMinutes) {
      setLocalError(`Expiry must be between 1 and ${maxTokenTtlMinutes} minutes.`);
      return;
    }

    const parsedMaxUsage = Number.parseInt(String(maxUsageCount), 10);
    if (!Number.isInteger(parsedMaxUsage) || parsedMaxUsage < 1 || parsedMaxUsage > 20) {
      setLocalError('Max uses must be between 1 and 20.');
      return;
    }

    const trimmedPassword = accessPassword.trim();
    if (requireTokenPassword && trimmedPassword.length < 6) {
      setLocalError('This policy requires a secret password (minimum 6 characters).');
      return;
    }

    if (!requireTokenPassword && trimmedPassword && trimmedPassword.length < 6) {
      setLocalError('Secret password must be at least 6 characters, or leave it empty.');
      return;
    }

    onGenerate({
      fileId: selectedFile.id,
      expiryMinutes: parsedExpiry,
      maxUsageCount: parsedMaxUsage,
      accessPassword: trimmedPassword || undefined
    });
  };

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied');
    } catch (_error) {
      setCopyStatus('Copy failed');
    }
  };

  return (
    <div className="ui-card">
      <h3 className="ui-title text-lg font-bold">Share Access</h3>
      <p className="ui-text-muted mt-1 text-sm">
        Generate a secure share link for the selected encrypted file.
      </p>

      {selectedFile ? (
        <p className="mt-3 rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] px-3 py-2 text-xs text-[color:var(--ui-text)]">
          Selected: {selectedFile.metadata.originalName}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[color:var(--ui-muted)]">Select an encrypted file first.</p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="ui-label">Expiry (minutes)</span>
          <input
            disabled={!selectedFile}
            value={expiryMinutes}
            onChange={(event) => setExpiryMinutes(event.target.value)}
            type="number"
            min={1}
            max={maxTokenTtlMinutes}
            className="ui-input mt-1"
          />
          <p className="ui-text-muted mt-1 text-xs">
            AI control cap: {maxTokenTtlMinutes} minutes.
          </p>
        </label>

        <label className="text-sm">
          <span className="ui-label">Max Uses</span>
          <input
            disabled={!selectedFile}
            value={maxUsageCount}
            onChange={(event) => setMaxUsageCount(event.target.value)}
            type="number"
            min={1}
            max={20}
            className="ui-input mt-1"
          />
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="ui-label">
          Secret Password {requireTokenPassword ? '(required)' : '(optional)'}
        </span>
        <input
          disabled={!selectedFile}
          value={accessPassword}
          onChange={(event) => setAccessPassword(event.target.value)}
          type="password"
          minLength={6}
          maxLength={128}
          placeholder="Set password to require on shared access page"
          className="ui-input mt-1"
        />
        {requireTokenPassword ? (
          <p className="ui-text-muted mt-1 text-xs">
            AI marked this file as high-risk, so password is mandatory for share access.
          </p>
        ) : null}
      </label>

      <button
        disabled={!selectedFile || loading}
        type="button"
        onClick={handleGenerateShareLink}
        className="ui-btn-primary mt-4"
      >
        {loading ? 'Processing...' : 'Generate share link'}
      </button>

      {localError ? (
        <p className="ui-alert-error mt-2 text-xs">{localError}</p>
      ) : null}

      {generatedToken || generatedShareLink ? (
        <div className="ui-card-soft mt-4">
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
            Share Access Ready
          </p>
          <p className="ui-text-muted mt-1 text-xs">
            Token is handled internally. Share this link with recipient:
          </p>

          {generatedShareLink ? (
            <div className="mt-3 rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-3">
              <p className="ui-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                Share Link
              </p>
              <div className="mt-2">
                <p className="mt-1 break-all text-xs text-[color:var(--ui-text)]">{generatedShareLink}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedShareLink)}
                  className="ui-btn-secondary"
                >
                  Copy link
                </button>
              </div>
              {copyStatus ? (
                <p className="ui-text-muted mt-2 text-xs">{copyStatus}</p>
              ) : null}
            </div>
          ) : null}

          <p className="ui-text-muted mt-2 text-xs">
            Recipient opens the link and unlocks the file with password (if required).
          </p>
        </div>
      ) : null}
    </div>
  );
};
