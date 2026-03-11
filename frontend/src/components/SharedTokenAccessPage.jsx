import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';

const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    const payloadJson = atob(padded);
    return JSON.parse(payloadJson);
  } catch (_error) {
    return null;
  }
};

export const SharedTokenAccessPage = ({ token }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [tokenInput, setTokenInput] = useState(token || '');
  const [secretPassword, setSecretPassword] = useState('');
  const [claims, setClaims] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setTokenInput(token || '');
  }, [token]);

  const tokenClaims = useMemo(() => decodeJwtPayload(tokenInput.trim()), [tokenInput]);

  const openWithPermission = async ({ validatedClaims, activeToken, password }) => {
    const fileId = validatedClaims?.fileId;
    const permissionLevel = validatedClaims?.permissionLevel || 'view';

    if (!fileId) {
      throw new Error('Token does not include fileId');
    }

    const accessResponse = await apiClient.accessFileWithToken({
      fileId,
      token: activeToken,
      preview: permissionLevel === 'view',
      password
    });

    if (permissionLevel === 'edit') {
      const downloadUrl = URL.createObjectURL(accessResponse.blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = accessResponse.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setStatusMessage(`Edit token validated. Downloaded: ${accessResponse.filename}`);
      return;
    }

    const url = URL.createObjectURL(accessResponse.blob);
    const previewPayload = {
      url,
      filename: accessResponse.filename,
      mimeType: accessResponse.mimeType,
      textContent: ''
    };

    if ((accessResponse.mimeType || '').startsWith('text/')) {
      previewPayload.textContent = await accessResponse.blob.text();
    }

    setPreview(previewPayload);
    setStatusMessage(`View token validated. Opened: ${accessResponse.filename}`);
  };

  const validateAndOpen = async () => {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const activeToken = tokenInput.trim();
      const password = secretPassword.trim() || undefined;

      if (!activeToken) {
        throw new Error('Shared file token is required');
      }

      const runUnlockFlow = async () => {
        const validationResult = await apiClient.validateSharedFileToken({ token: activeToken, password });
        setClaims(validationResult.claims);
        await openWithPermission({ validatedClaims: validationResult.claims, activeToken, password });
      };

      try {
        await runUnlockFlow();
      } catch (error) {
        if ((error.message || '').toLowerCase().includes('backend unreachable')) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          await runUnlockFlow();
        } else {
          throw error;
        }
      }
    } catch (error) {
      setErrorMessage(error.message || 'Token validation failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const activeClaims = claims || tokenClaims;
  const permission = activeClaims?.permissionLevel || 'unknown';
  const isImage = preview?.mimeType?.startsWith('image/');
  const isPdf = preview?.mimeType === 'application/pdf';
  const isHtml = preview?.mimeType?.includes('text/html');
  const isText = preview?.mimeType?.startsWith('text/');

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-6 shadow-panel">
        <h1 className="ui-title text-2xl font-bold">Shared Token File Access</h1>
        <p className="ui-text-muted mt-2 text-sm">
          Token permission: <span className="font-semibold uppercase">{permission}</span>
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="ui-label">Shared Token</span>
            <textarea
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              rows={3}
              className="ui-input mt-1 text-xs"
              placeholder="Paste file access JWT"
            />
          </label>
          <label className="text-sm">
            <span className="ui-label">Secret Password</span>
            <input
              value={secretPassword}
              onChange={(event) => setSecretPassword(event.target.value)}
              type="password"
              minLength={6}
              maxLength={128}
              className="ui-input mt-1"
              placeholder="Enter token password if set"
            />
          </label>
        </div>

        {errorMessage ? (
          <div className="ui-alert-error mt-4">{errorMessage}</div>
        ) : null}

        {statusMessage ? (
          <div className="ui-alert-success mt-4">{statusMessage}</div>
        ) : null}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={validateAndOpen}
            disabled={loading}
            className="ui-btn-primary"
          >
            {loading ? 'Unlocking...' : 'Unlock & Open File'}
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = window.location.origin)}
            className="ui-btn-secondary"
          >
            Back to Dashboard
          </button>
        </div>

        {preview ? (
          <div className="mt-6 h-[72vh] overflow-auto rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-bg)] p-2">
            {isImage ? <img src={preview.url} alt={preview.filename} className="mx-auto max-h-full object-contain" /> : null}
            {isPdf ? <iframe title={preview.filename} src={preview.url} className="h-full w-full rounded-md" /> : null}
            {isHtml ? <iframe title={preview.filename} srcDoc={preview.textContent} className="h-full w-full rounded-md" /> : null}
            {isText && !isHtml ? (
              <pre className="whitespace-pre-wrap break-words p-3 text-sm text-[color:var(--ui-text)]">
                {preview.textContent}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
