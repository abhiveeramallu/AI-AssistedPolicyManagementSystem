import { useEffect, useState } from 'react';

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
};

export const UserFileAccessPanel = ({
  ownerId,
  onOwnerIdChange,
  onDiscover,
  discovering,
  files,
  onOpenFile,
  openingTokenId,
  errorMessage,
  statusMessage
}) => {
  const [passwordsByTokenId, setPasswordsByTokenId] = useState({});

  useEffect(() => {
    setPasswordsByTokenId({});
  }, [ownerId, files.length]);

  const updatePassword = (tokenId, password) => {
    setPasswordsByTokenId((previous) => ({
      ...previous,
      [tokenId]: password
    }));
  };

  return (
    <section className="ui-card mt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="ui-title text-lg font-bold">Access Shared Files by User ID</h2>
          <p className="ui-text-muted mt-1 text-sm">
            Enter owner user ID to fetch active shared files. Use file password to unlock access.
          </p>
        </div>
        <span className="ui-badge">{files.length} files</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto]">
        <input
          value={ownerId}
          onChange={(event) => onOwnerIdChange(event.target.value)}
          className="ui-input"
          placeholder="Enter owner user ID (24-char)"
        />
        <button
          type="button"
          onClick={onDiscover}
          disabled={discovering}
          className="ui-btn-primary"
        >
          {discovering ? 'Finding...' : 'Find Files'}
        </button>
      </div>

      {errorMessage ? (
        <div className="ui-alert-error mt-4">{errorMessage}</div>
      ) : null}

      {statusMessage ? (
        <div className="ui-alert-success mt-4">{statusMessage}</div>
      ) : null}

      <div className="mt-4 space-y-3">
        {files.map((file) => {
          const rowPassword = passwordsByTokenId[file.tokenId] || '';
          const isOpening = openingTokenId === file.tokenId;

          return (
            <div
              key={file.tokenId}
              className="rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] p-3"
            >
              <div className="grid gap-3 md:grid-cols-[1.3fr,1fr,1fr,auto] md:items-end">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ui-text)]">{file.fileName}</p>
                  <p className="ui-text-muted mt-1 text-xs">
                    Expires: {formatDate(file.expiresAt)} | Remaining uses: {file.remainingUses}
                  </p>
                </div>

                <div className="text-xs ui-text-muted">
                  {file.requiresPassword ? 'Password required' : 'Password not required'}
                </div>

                <input
                  value={rowPassword}
                  onChange={(event) => updatePassword(file.tokenId, event.target.value)}
                  type="password"
                  minLength={6}
                  maxLength={128}
                  className="ui-input"
                  placeholder="File password"
                />

                <button
                  type="button"
                  onClick={() => onOpenFile(file, rowPassword)}
                  disabled={isOpening}
                  className="ui-btn-secondary"
                >
                  {isOpening ? 'Opening...' : 'Open File'}
                </button>
              </div>
            </div>
          );
        })}

        {files.length === 0 ? (
          <div className="ui-text-muted rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] px-4 py-4 text-sm">
            No shared files found for this owner ID yet.
          </div>
        ) : null}
      </div>
    </section>
  );
};
