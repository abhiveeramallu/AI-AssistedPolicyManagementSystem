const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
};

export const EncryptedFileList = ({ files, onSelectFile, selectedFileId, onDelete }) => {
  return (
    <div className="ui-card">
      <div className="flex items-center justify-between">
        <h3 className="ui-title text-lg font-bold">Encrypted Files</h3>
        <span className="ui-badge">
          {files.length} items
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-text-muted text-xs uppercase tracking-[0.12em]">
            <tr>
              <th className="px-2 py-2">File</th>
              <th className="px-2 py-2">Expiry</th>
              <th className="px-2 py-2">Attempts</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="border-t border-[color:var(--ui-border)]">
                <td className="px-2 py-3">
                  <p className="font-medium text-[color:var(--ui-text)]">{file.metadata.originalName}</p>
                  <p className="ui-text-muted text-xs">{Math.round(file.sizeBytes / 1024)} KB</p>
                </td>
                <td className="px-2 py-3 text-[color:var(--ui-text)]">{formatDate(file.policy.expiresAt)}</td>
                <td className="px-2 py-3 text-[color:var(--ui-text)]">
                  {file.accessMetrics.attemptCount}/{file.policy.maxAccessAttempts}
                </td>
                <td className="px-2 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectFile(file)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                        selectedFileId === file.id
                          ? 'border border-white/25 bg-[#2A2A2A] text-white shadow-[0_6px_16px_rgba(0,0,0,0.38)]'
                          : 'border border-[color:var(--ui-border)] bg-[color:var(--ui-bg)] text-[color:var(--ui-muted)] hover:border-white/20 hover:text-[color:var(--ui-text)]'
                      }`}
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(file.id)}
                      className="rounded-md border border-white/20 bg-[color:var(--ui-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--ui-muted)] transition hover:bg-[#2A2A2A] hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {files.length === 0 ? (
              <tr>
                <td colSpan={4} className="ui-text-muted px-2 py-6 text-center text-sm">
                  No encrypted files stored yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
