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

export const SharedTokenAccessPage = ({ token, shareId, shareCode }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [tokenInput, setTokenInput] = useState(token || '');
  const [shareIdInput, setShareIdInput] = useState(shareId || '');
  const [shareCodeInput, setShareCodeInput] = useState(shareCode || '');
  const [secretPassword, setSecretPassword] = useState('');
  const [claims, setClaims] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setTokenInput(token || '');
  }, [token]);

  useEffect(() => {
    setShareIdInput(shareId || '');
    setShareCodeInput(shareCode || '');
  }, [shareId, shareCode]);

  useEffect(() => {
    if (shareId || shareCode) return;

    const params = new URLSearchParams(window.location.search);
    const queryShareId = (params.get('share_id') || '').trim();
    const queryShareCode = (params.get('share_code') || '').trim();

    setShareIdInput(queryShareId);
    setShareCodeInput(queryShareCode);
  }, []);

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
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }

      const downloadUrl = URL.createObjectURL(accessResponse.blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = accessResponse.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setStatusMessage(`Access validated. Downloaded: ${accessResponse.filename}`);
      return;
    }

    const url = URL.createObjectURL(accessResponse.blob);
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }

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
    setStatusMessage(`Access validated. Opened: ${accessResponse.filename}`);
  };

  const validateAndOpen = async () => {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const activeToken = tokenInput.trim();
      const activeShareId = shareIdInput.trim();
      const activeShareCode = shareCodeInput.trim();
      const password = secretPassword.trim() || undefined;

      const runUnlockFlow = async () => {
        if (activeToken) {
          const validationResult = await apiClient.validateSharedFileToken({
            token: activeToken,
            password
          });
          setClaims(validationResult.claims);
          await openWithPermission({
            validatedClaims: validationResult.claims,
            activeToken,
            password
          });
          return;
        }

        if (!activeShareId || !activeShareCode) {
          throw new Error('Share link details are required');
        }

        const resolved = await apiClient.resolveShareAccess({
          tokenId: activeShareId,
          shareCode: activeShareCode,
          password
        });

        setClaims(resolved.claims);
        await openWithPermission({
          validatedClaims: resolved.claims,
          activeToken: resolved.token,
          password
        });
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
  const expiresAt = activeClaims?.expiresAt || null;
  const tokenMode = Boolean(tokenInput.trim());
  const isImage = preview?.mimeType?.startsWith('image/');
  const isPdf = preview?.mimeType === 'application/pdf';
  const isHtml = preview?.mimeType?.includes('text/html');
  const isText = preview?.mimeType?.startsWith('text/');

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-6 shadow-panel">
        <h1 className="ui-title text-2xl font-bold">Shared File Access</h1>
        {expiresAt ? (
          <p className="ui-text-muted mt-2 text-sm">
            Access expires: {new Date(expiresAt).toLocaleString()}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {tokenMode ? (
            <label className="text-sm md:col-span-2">
              <span className="ui-label">Shared Token</span>
              <textarea
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                rows={3}
                className="ui-input mt-1 text-xs"
                placeholder="Paste file access JWT"
              />
            </label>
          ) : (
            <>
              <label className="text-sm">
                <span className="ui-label">Share ID</span>
                <input
                  value={shareIdInput}
                  onChange={(event) => setShareIdInput(event.target.value)}
                  className="ui-input mt-1 text-xs"
                  placeholder="24-char token id"
                />
              </label>
              <label className="text-sm">
                <span className="ui-label">Share Code</span>
                <input
                  value={shareCodeInput}
                  onChange={(event) => setShareCodeInput(event.target.value)}
                  className="ui-input mt-1 text-xs"
                  placeholder="short access code"
                />
              </label>
            </>
          )}
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
