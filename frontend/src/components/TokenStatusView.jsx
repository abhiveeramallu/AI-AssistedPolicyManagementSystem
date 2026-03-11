import { useEffect, useState } from 'react';

export const TokenStatusView = ({ selectedFile, onGenerate, generatedToken, loading }) => {
  const [permissionLevel, setPermissionLevel] = useState('view');
  const [expiryMinutes, setExpiryMinutes] = useState(30);
  const [maxUsageCount, setMaxUsageCount] = useState(3);
  const [accessPassword, setAccessPassword] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setLocalError('');

    if (selectedFile?.policy?.permissionLevel) {
      const normalizedPermission = String(selectedFile.policy.permissionLevel).toLowerCase();
      setPermissionLevel(normalizedPermission === 'edit' ? 'edit' : 'view');

      const policyMaxAttempts = Number.parseInt(String(selectedFile.policy.maxAccessAttempts), 10);
      if (Number.isInteger(policyMaxAttempts) && policyMaxAttempts >= 1 && policyMaxAttempts <= 20) {
        setMaxUsageCount(Math.min(5, policyMaxAttempts));
      } else {
        setMaxUsageCount(3);
      }
    }

    setAccessPassword('');
  }, [selectedFile]);

  const handleGenerateToken = () => {
    setLocalError('');

    const normalizedPermission = String(permissionLevel || '').toLowerCase();
    if (normalizedPermission !== 'view' && normalizedPermission !== 'edit') {
      setLocalError('Unsupported policy permission on selected file. Re-select the file and retry.');
      return;
    }

    const parsedExpiry = Number.parseInt(String(expiryMinutes), 10);
    if (!Number.isInteger(parsedExpiry) || parsedExpiry < 1 || parsedExpiry > 1440) {
      setLocalError('Expiry must be between 1 and 1440 minutes.');
      return;
    }

    const parsedMaxUsage = Number.parseInt(String(maxUsageCount), 10);
    if (!Number.isInteger(parsedMaxUsage) || parsedMaxUsage < 1 || parsedMaxUsage > 20) {
      setLocalError('Max uses must be between 1 and 20.');
      return;
    }

    const trimmedPassword = accessPassword.trim();
    if (trimmedPassword && trimmedPassword.length < 6) {
      setLocalError('Secret password must be at least 6 characters, or leave it empty.');
      return;
    }

    onGenerate({
      fileId: selectedFile.id,
      permissionLevel: normalizedPermission,
      expiryMinutes: parsedExpiry,
      maxUsageCount: parsedMaxUsage,
      accessPassword: trimmedPassword || undefined
    });
  };

  return (
    <div className="ui-card">
      <h3 className="ui-title text-lg font-bold">Token Status</h3>
      <p className="ui-text-muted mt-1 text-sm">
        Generate a token for the selected encrypted file.
      </p>

      {selectedFile ? (
        <p className="mt-3 rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] px-3 py-2 text-xs text-[color:var(--ui-text)]">
          Selected: {selectedFile.metadata.originalName}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[color:var(--ui-muted)]">Select an encrypted file first.</p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="ui-label">Permission (locked)</span>
          <input
            disabled
            value={permissionLevel.toUpperCase()}
            className="ui-input mt-1"
          />
        </label>

        <label className="text-sm">
          <span className="ui-label">Expiry (minutes)</span>
          <input
            disabled={!selectedFile}
            value={expiryMinutes}
            onChange={(event) => setExpiryMinutes(event.target.value)}
            type="number"
            min={1}
            max={1440}
            className="ui-input mt-1"
          />
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
        <span className="ui-label">Secret Password (optional)</span>
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
      </label>

      <button
        disabled={!selectedFile || loading}
        type="button"
        onClick={handleGenerateToken}
        className="ui-btn-primary mt-4"
      >
        {loading ? 'Processing...' : 'Generate token'}
      </button>

      {localError ? (
        <p className="ui-alert-error mt-2 text-xs">{localError}</p>
      ) : null}

      {generatedToken ? (
        <div className="ui-card-soft mt-4">
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
            Issued Token
          </p>
          <p className="mt-1 break-all text-xs text-[color:var(--ui-text)]">{generatedToken}</p>
          <p className="ui-text-muted mt-2 text-xs">
            Use this token in the top <span className="font-semibold">Access Files</span> section to open the file in a new page.
          </p>
        </div>
      ) : null}
    </div>
  );
};
