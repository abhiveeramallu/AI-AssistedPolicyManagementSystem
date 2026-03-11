export const FilePreviewModal = ({ preview, onClose }) => {
  if (!preview) return null;

  const isImage = preview.mimeType?.startsWith('image/');
  const isPdf = preview.mimeType === 'application/pdf';
  const isHtml = preview.mimeType?.includes('text/html');
  const isText = preview.mimeType?.startsWith('text/');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,10,10,0.82)] p-4">
      <div className="h-[85vh] w-full max-w-5xl rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-4 shadow-panel">
        <div className="flex items-center justify-between border-b border-[color:var(--ui-border)] pb-3">
          <div>
            <h3 className="ui-title text-lg font-bold">View File</h3>
            <p className="ui-text-muted text-xs">{preview.filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-secondary px-3 py-1"
          >
            Close
          </button>
        </div>

        <div className="mt-4 h-[calc(85vh-86px)] overflow-auto rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-bg)] p-2">
          {isImage ? (
            <img src={preview.url} alt={preview.filename} className="mx-auto max-h-full object-contain" />
          ) : null}

          {isPdf ? (
            <iframe title={preview.filename} src={preview.url} className="h-full w-full rounded-md" />
          ) : null}

          {isHtml ? (
            <iframe title={preview.filename} srcDoc={preview.textContent} className="h-full w-full rounded-md" />
          ) : null}

          {isText && !isHtml ? (
            <pre className="whitespace-pre-wrap break-words p-3 text-sm text-[color:var(--ui-text)]">
              {preview.textContent}
            </pre>
          ) : null}

          {!isImage && !isPdf && !isText && !isHtml ? (
            <div className="p-5 text-sm text-[color:var(--ui-muted)]">
              View-only token is valid, but this file type cannot be previewed in-browser.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
