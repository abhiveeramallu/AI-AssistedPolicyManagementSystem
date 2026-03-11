import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiClient, getApiBaseUrl } from './api/client';
import { UploadDropzone } from './components/UploadDropzone';
import { PolicyRecommendationPanel } from './components/PolicyRecommendationPanel';
import { PolicyApprovalModal } from './components/PolicyApprovalModal';
import { AccessControlPanel } from './components/AccessControlPanel';
import { EncryptedFileList } from './components/EncryptedFileList';
import { TokenStatusView } from './components/TokenStatusView';
import { SharedTokenAccessPage } from './components/SharedTokenAccessPage';

const TOKEN_STORAGE_KEY = 'secure-policy-user-token';
const NAV_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'policies', label: 'Policies' },
  { id: 'tokens', label: 'Tokens' }
];

const policyFormSchema = z.object({
  dataType: z.enum([
    'customer-data',
    'financial',
    'healthcare',
    'internal-doc',
    'source-code',
    'legal',
    'other'
  ]),
  purpose: z.string().min(10, 'Purpose must be at least 10 characters'),
  sensitivity: z.enum(['low', 'medium', 'high', 'critical']),
  durationHours: z.number().int().min(1).max(2160),
  desiredPermission: z.enum(['view', 'edit']),
  maxAccessAttempts: z.number().int().min(1).max(20)
});

const getInitialToken = () =>
  localStorage.getItem(TOKEN_STORAGE_KEY) || import.meta.env.VITE_DEFAULT_AUTH_TOKEN || '';

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

const getSharedTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('shared_token') || '';
};

function App() {
  const sharedTokenFromUrl = getSharedTokenFromUrl();
  if (sharedTokenFromUrl) {
    return <SharedTokenAccessPage token={sharedTokenFromUrl} />;
  }

  const [authToken, setAuthToken] = useState(getInitialToken);
  const [sharedTokenInput, setSharedTokenInput] = useState('');
  const [localFile, setLocalFile] = useState(null);
  const [fileInputError, setFileInputError] = useState('');
  const [policyData, setPolicyData] = useState(null);
  const [approvedPolicy, setApprovedPolicy] = useState(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedStoredFile, setSelectedStoredFile] = useState(null);
  const [generatedToken, setGeneratedToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingAction, setLoadingAction] = useState('');
  const [activeSection, setActiveSection] = useState('dashboard');

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      dataType: 'internal-doc',
      purpose: '',
      sensitivity: 'medium',
      durationHours: 24,
      desiredPermission: 'view',
      maxAccessAttempts: 5
    }
  });

  const isBusy = useMemo(() => loadingAction.length > 0, [loadingAction]);
  const generatedTokenClaims = useMemo(() => decodeJwtPayload(generatedToken), [generatedToken]);
  const activePolicy = useMemo(
    () => selectedStoredFile?.policy || approvedPolicy || policyData?.recommendation || null,
    [selectedStoredFile, approvedPolicy, policyData]
  );
  const activeRiskLevel = String(
    policyData?.recommendation?.riskLevel || activePolicy?.riskLevel || '-'
  ).toUpperCase();
  const activeRiskScore = Number.isFinite(
    Number(policyData?.recommendation?.riskScore ?? activePolicy?.riskScore)
  )
    ? `${Number(policyData?.recommendation?.riskScore ?? activePolicy?.riskScore)}/100`
    : '-';
  const activeEngine = policyData?.recommendation?.engine || activePolicy?.engine || '-';
  const activeDecisionSummary =
    policyData?.recommendation?.decisionSummary ||
    activePolicy?.decisionSummary ||
    'Generate and approve a policy to view decision summary.';
  const activePolicyExpiry = activePolicy?.expiresAt
    ? new Date(activePolicy.expiresAt).toLocaleString()
    : activePolicy?.expiryHours
      ? `${activePolicy.expiryHours} hours`
      : '-';

  useEffect(() => {
    if (authToken) return;

    const bootstrapToken = async () => {
      try {
        const response = await apiClient.fetchDevToken();
        setAuthToken(response.token);
        setStatusMessage('Development JWT issued automatically.');
      } catch (_error) {
        setErrorMessage('Unable to auto-issue development JWT. Provide a valid Session JWT.');
      }
    };

    bootstrapToken();
  }, [authToken]);

  useEffect(() => {
    const handleTokenRefresh = (event) => {
      const refreshedToken = event?.detail?.token;
      if (refreshedToken) {
        setAuthToken(refreshedToken);
      }
    };

    window.addEventListener('auth-token-refreshed', handleTokenRefresh);
    return () => {
      window.removeEventListener('auth-token-refreshed', handleTokenRefresh);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  }, [authToken]);

  const clearMessages = () => {
    setErrorMessage('');
    setStatusMessage('');
  };

  const withActionState = async (name, callback) => {
    clearMessages();
    setLoadingAction(name);

    try {
      await callback();
    } catch (error) {
      setErrorMessage(error.message || 'Unexpected error');
    } finally {
      setLoadingAction('');
    }
  };

  const loadFiles = async () => {
    if (!authToken) return;

    const response = await apiClient.listFiles(authToken);
    setFiles(response.files || []);
  };

  useEffect(() => {
    withActionState('load-files', loadFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const onGeneratePolicy = handleSubmit((formValues) =>
    withActionState('generate-policy', async () => {
      if (!authToken) throw new Error('Session JWT is required');
      if (!localFile) throw new Error('Upload module requires selecting a file first');

      const policyPayload = {
        ...formValues,
        fileName: localFile.name,
        fileType: localFile.type || 'application/octet-stream',
        fileSize: localFile.size
      };

      const response = await apiClient.generatePolicy(authToken, policyPayload);
      setPolicyData(response);
      setApprovedPolicy(null);
      setStatusMessage('AI recommendation generated. Review and approve before upload.');
    })
  );

  const onApprovePolicy = (overrides) =>
    withActionState('approve-policy', async () => {
      if (!policyData?.proposalId) throw new Error('No pending policy proposal available');

      const approvalPayload = {
        proposalId: policyData.proposalId,
        approved: true,
        approvalNote: overrides.approvalNote || undefined
      };

      if (!overrides.useAiRecommendation) {
        approvalPayload.overrides = {
          permissionLevel: overrides.permissionLevel,
          expiryHours: overrides.expiryHours,
          maxAccessAttempts: overrides.maxAccessAttempts
        };
      }

      const response = await apiClient.approvePolicy(authToken, approvalPayload);

      setApprovedPolicy(response.approvedPolicy);
      setApprovalModalOpen(false);
      setStatusMessage('Policy approved and ready for enforcement.');
    });

  const onUpload = () =>
    withActionState('upload-file', async () => {
      if (!authToken) throw new Error('Session JWT is required');
      if (!localFile) throw new Error('No file selected');
      if (!policyData?.proposalId || !approvedPolicy) {
        throw new Error('Policy approval is required before secure upload');
      }

      const payload = new FormData();
      payload.append('file', localFile);
      payload.append('proposalId', policyData.proposalId);

      await apiClient.uploadFile(authToken, payload);
      setStatusMessage('File encrypted and stored successfully.');
      setLocalFile(null);
      await loadFiles();
    });

  const onGenerateToken = (payload) =>
    withActionState('generate-token', async () => {
      const response = await apiClient.generateFileToken(authToken, payload);
      setGeneratedToken(response.token);
      setStatusMessage('Time-bound JWT token generated.');
    });

  const onDeleteFile = (id) =>
    withActionState('delete-file', async () => {
      await apiClient.deleteFile(authToken, id);
      setStatusMessage('Encrypted file deleted.');
      await loadFiles();
    });

  const onOpenSharedTokenPage = () => {
    clearMessages();
    const token = sharedTokenInput.trim();
    if (!token) {
      setErrorMessage('Paste a shared file JWT first');
      return;
    }

    const decoded = decodeJwtPayload(token);
    if (!decoded?.fileId || decoded?.type !== 'file_access') {
      setErrorMessage('This token is not a valid file access JWT');
      return;
    }

    const targetUrl = `${window.location.origin}${window.location.pathname}?shared_token=${encodeURIComponent(token)}`;
    const newTab = window.open(targetUrl, '_blank', 'noopener,noreferrer');

    if (!newTab) {
      setErrorMessage('Unable to open new tab. Allow pop-ups for this site and try again.');
      return;
    }

    setStatusMessage('Opened shared file access page in a new tab.');
  };

  const handleFileSelect = (file) => {
    setFileInputError('');
    if (!file) {
      setLocalFile(null);
      return;
    }

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileInputError('File exceeds 15MB size limit.');
      return;
    }

    setLocalFile(file);
  };

  return (
    <div className="min-h-screen text-[color:var(--ui-text)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <header className="ui-navbar">
          <div>
            <h1 className="ui-title text-2xl font-bold md:text-3xl">
              AI-Assisted Secure Access Policy Management System
            </h1>
            <p className="ui-text-muted mt-1 text-sm">
              API: {getApiBaseUrl()} | AI policy recommendation with enforced human approval.
            </p>
          </div>
          <nav className="mt-3 flex items-center gap-5 text-xs font-semibold uppercase tracking-[0.14em] md:mt-0">
            {NAV_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`ui-nav-item ${activeSection === section.id ? 'ui-nav-item-active' : ''}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="ui-card mt-5">
          <div className="flex items-center justify-between">
            <h2 className="ui-title text-lg font-bold">
              {activeSection === 'dashboard'
                ? 'Dashboard Overview'
                : activeSection === 'policies'
                  ? 'Policy Intelligence'
                  : 'Token Intelligence'}
            </h2>
            <span className="ui-badge">{activeSection}</span>
          </div>

          {activeSection === 'dashboard' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Encrypted Files</p>
                <p className="mt-1 text-xl font-bold text-[color:var(--ui-text)]">{files.length}</p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Policy Status</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {approvedPolicy
                    ? 'Approved and ready for secure upload'
                    : policyData
                      ? 'Recommendation generated, waiting approval'
                      : 'No active policy recommendation'}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Token Status</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {generatedToken ? 'Token issued for selected encrypted file' : 'No token issued in this session'}
                </p>
              </div>
            </div>
          ) : null}

          {activeSection === 'policies' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Recommended Permission</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-accent)]">
                  {(policyData?.recommendation?.permissionLevel || activePolicy?.permissionLevel || '-').toUpperCase()}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Policy Expiry Window</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">{activePolicyExpiry}</p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Maximum Access Attempts</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {activePolicy?.maxAccessAttempts ?? '-'}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Risk Posture</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {activeRiskLevel} ({activeRiskScore})
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Recommendation Engine</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">{activeEngine}</p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Policy Guardrail</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  Human approval is mandatory before policy enforcement and upload.
                </p>
              </div>
              <div className="ui-card-soft md:col-span-2">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Decision Summary</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {activeDecisionSummary}
                </p>
              </div>
            </div>
          ) : null}

          {activeSection === 'tokens' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Token Permission</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-accent)]">
                  {(generatedTokenClaims?.permissionLevel || activePolicy?.permissionLevel || '-').toUpperCase()}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Token Expiry</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {generatedTokenClaims?.exp
                    ? new Date(generatedTokenClaims.exp * 1000).toLocaleString()
                    : 'Issue a token to view expiry'}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Max Uses</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {generatedTokenClaims?.maxUsageCount ?? activePolicy?.maxAccessAttempts ?? '-'}
                </p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Access Behavior</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  View tokens open in-browser preview. Edit tokens download the file.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ui-card mt-5">
          <label className="ui-label block">Session JWT</label>
          <input
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            placeholder="Paste backend-issued user JWT"
            className="ui-input mt-1 text-xs"
          />

          <label className="ui-label mt-4 block">
            Access Files (Token)
          </label>
          <div className="mt-1 flex flex-col gap-2 md:flex-row">
            <input
              value={sharedTokenInput}
              onChange={(event) => setSharedTokenInput(event.target.value)}
              placeholder="Paste encrypted-file token"
              className="ui-input w-full text-xs"
            />
            <button
              type="button"
              onClick={onOpenSharedTokenPage}
              disabled={isBusy || !sharedTokenInput.trim()}
              className="ui-btn-primary"
            >
              Access Files
            </button>
          </div>
          <p className="ui-text-muted mt-2 text-xs">
            This opens a new page where token access is validated and unlocked.
          </p>
        </section>

        {errorMessage ? (
          <div className="ui-alert-error mt-4">{errorMessage}</div>
        ) : null}

        {statusMessage ? (
          <div className="ui-alert-success mt-4">{statusMessage}</div>
        ) : null}

        <main className="mt-5 grid gap-5 lg:grid-cols-12">
          <section className="space-y-5 lg:col-span-7">
            <div className="ui-card">
              <h2 className="ui-title text-xl font-bold">File Upload Module</h2>
              <p className="ui-text-muted mt-1 text-sm">
                Upload metadata is analyzed by AI. Content is encrypted before storage.
              </p>

              <div className="mt-4">
                <UploadDropzone file={localFile} onFileSelect={handleFileSelect} error={fileInputError} />
              </div>

              <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={onGeneratePolicy}>
                <label className="text-sm">
                  <span className="ui-label">Data Type</span>
                  <select
                    {...register('dataType')}
                    className="ui-input mt-1"
                  >
                    <option value="customer-data">Customer data</option>
                    <option value="financial">Financial</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="internal-doc">Internal document</option>
                    <option value="source-code">Source code</option>
                    <option value="legal">Legal</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.dataType ? (
                    <p className="mt-1 text-xs text-[color:var(--ui-accent)]">{errors.dataType.message}</p>
                  ) : null}
                </label>

                <label className="text-sm">
                  <span className="ui-label">Sensitivity</span>
                  <select
                    {...register('sensitivity')}
                    className="ui-input mt-1"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="ui-label">Duration (hours)</span>
                  <input
                    type="number"
                    {...register('durationHours', { valueAsNumber: true })}
                    className="ui-input mt-1"
                  />
                  {errors.durationHours ? (
                    <p className="mt-1 text-xs text-[color:var(--ui-accent)]">{errors.durationHours.message}</p>
                  ) : null}
                </label>

                <label className="text-sm">
                  <span className="ui-label">Desired Permission</span>
                  <select
                    {...register('desiredPermission')}
                    className="ui-input mt-1"
                  >
                    <option value="view">View</option>
                    <option value="edit">Edit</option>
                  </select>
                </label>

                <label className="text-sm md:col-span-2">
                  <span className="ui-label">Business Purpose</span>
                  <textarea
                    {...register('purpose')}
                    rows={3}
                    className="ui-input mt-1"
                    placeholder="Why does this data need to be shared or stored?"
                  />
                  {errors.purpose ? (
                    <p className="mt-1 text-xs text-[color:var(--ui-accent)]">{errors.purpose.message}</p>
                  ) : null}
                </label>

                <label className="text-sm">
                  <span className="ui-label">Max Access Attempts</span>
                  <input
                    type="number"
                    {...register('maxAccessAttempts', { valueAsNumber: true })}
                    className="ui-input mt-1"
                  />
                </label>

                <div className="flex flex-wrap items-end gap-3 md:col-span-2">
                  <button
                    disabled={isBusy}
                    type="submit"
                    className="ui-btn-primary"
                  >
                    {loadingAction === 'generate-policy' ? 'Generating...' : 'Generate policy'}
                  </button>

                  <button
                    disabled={!policyData || isBusy}
                    type="button"
                    onClick={() => setApprovalModalOpen(true)}
                    className="ui-btn-outline"
                  >
                    Confirm policy
                  </button>

                  <button
                    disabled={!approvedPolicy || isBusy}
                    type="button"
                    onClick={onUpload}
                    className="ui-btn-secondary"
                  >
                    {loadingAction === 'upload-file' ? 'Uploading...' : 'Secure upload'}
                  </button>
                </div>
              </form>
            </div>

            <EncryptedFileList
              files={files}
              selectedFileId={selectedStoredFile?.id}
              onSelectFile={setSelectedStoredFile}
              onDelete={onDeleteFile}
            />
          </section>

          <aside className="space-y-5 lg:col-span-5">
            <PolicyRecommendationPanel recommendation={policyData?.recommendation} />
            <AccessControlPanel approvedPolicy={approvedPolicy} selectedFile={selectedStoredFile} />
            <TokenStatusView
              selectedFile={selectedStoredFile}
              onGenerate={onGenerateToken}
              generatedToken={generatedToken}
              loading={isBusy}
            />
          </aside>
        </main>
      </div>

      <PolicyApprovalModal
        isOpen={approvalModalOpen}
        recommendation={policyData?.recommendation}
        onClose={() => setApprovalModalOpen(false)}
        onConfirm={onApprovePolicy}
        loading={loadingAction === 'approve-policy'}
      />
    </div>
  );
}

export default App;
