const formatExpiry = (policy, selectedFile) => {
  if (selectedFile?.policy?.expiresAt) {
    return new Date(selectedFile.policy.expiresAt).toLocaleString();
  }

  if (policy?.expiryHours) {
    return `${policy.expiryHours} hours`;
  }

  return '-';
};

export const AccessControlPanel = ({ approvedPolicy, selectedFile }) => {
  const activePolicy = selectedFile?.policy || approvedPolicy;

  return (
    <div className="ui-card">
      <h3 className="ui-title text-lg font-bold">Access Control Manager</h3>
      {!activePolicy ? (
        <p className="ui-text-muted mt-2 text-sm">
          Select an encrypted file to view live access controls, or approve a policy for the pending upload.
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-[color:var(--ui-text)]">
          <div className="rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] px-3 py-2 text-xs font-medium text-[color:var(--ui-muted)]">
            {selectedFile
              ? `Selected file policy: ${selectedFile.metadata.originalName}`
              : 'Pending upload approved policy'}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ui-border)] px-3 py-2">
            <span>Permission</span>
            <span className="font-semibold uppercase text-[color:var(--ui-accent)]">{activePolicy.permissionLevel}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ui-border)] px-3 py-2">
            <span>Risk Level</span>
            <span className="font-semibold uppercase">
              {String(activePolicy.riskLevel || 'n/a')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ui-border)] px-3 py-2">
            <span>{selectedFile ? 'Policy Expires' : 'Token Expiry'}</span>
            <span className="font-semibold">{formatExpiry(activePolicy, selectedFile)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ui-border)] px-3 py-2">
            <span>Max Attempts</span>
            <span className="font-semibold">{activePolicy.maxAccessAttempts}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ui-border)] px-3 py-2">
            <span>Encryption</span>
            <span className="font-semibold">AES-256 Required</span>
          </div>
          {activePolicy.decisionSummary ? (
            <div className="ui-card-soft text-xs text-[color:var(--ui-text)]">
              <p className="ui-text-muted uppercase tracking-[0.12em]">Policy Summary</p>
              <p className="mt-1">{activePolicy.decisionSummary}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
