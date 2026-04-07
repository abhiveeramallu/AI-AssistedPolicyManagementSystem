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
import { AuthPage } from './components/AuthPage';

const TOKEN_STORAGE_KEY = 'secure-policy-user-token';

const NAV_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'policies', label: 'Policies' },
  { id: 'tokens', label: 'Shares' }
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
  maxAccessAttempts: z.number().int().min(1).max(20)
});

const getInitialToken = () => localStorage.getItem(TOKEN_STORAGE_KEY) || '';

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

const getSharedAccessFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const sharedToken = (params.get('shared_token') || '').trim();
  const shareId = (params.get('share_id') || '').trim();
  const shareCode = (params.get('share_code') || '').trim();

  return {
    sharedToken,
    shareId,
    shareCode
  };
};

const sanitizeAccessText = (value) =>
  String(value || '')
    .replace(/\bview\b/gi, 'restricted')
    .replace(/\bedit\b/gi, 'restricted');

function App() {
  const sharedAccessFromUrl = getSharedAccessFromUrl();
  if (sharedAccessFromUrl.sharedToken || (sharedAccessFromUrl.shareId && sharedAccessFromUrl.shareCode)) {
    return (
      <SharedTokenAccessPage
        token={sharedAccessFromUrl.sharedToken}
        shareId={sharedAccessFromUrl.shareId}
        shareCode={sharedAccessFromUrl.shareCode}
      />
    );
  }

  const [authToken, setAuthToken] = useState(getInitialToken);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authStatus, setAuthStatus] = useState('');

  const [localFile, setLocalFile] = useState(null);
  const [fileInputError, setFileInputError] = useState('');
  const [policyData, setPolicyData] = useState(null);
  const [approvedPolicy, setApprovedPolicy] = useState(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedStoredFile, setSelectedStoredFile] = useState(null);
  const [generatedToken, setGeneratedToken] = useState('');
  const [generatedShareLink, setGeneratedShareLink] = useState('');
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
    sanitizeAccessText(
      policyData?.recommendation?.decisionSummary ||
      activePolicy?.decisionSummary ||
      'Generate and approve a policy to view decision summary.'
    );
  const activePolicyExpiry = activePolicy?.expiresAt
    ? new Date(activePolicy.expiresAt).toLocaleString()
    : activePolicy?.expiryHours
      ? `${activePolicy.expiryHours} hours`
      : '-';

  useEffect(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }

    let cancelled = false;

    const hydrateUser = async () => {
      try {
        const response = await apiClient.getCurrentUser(authToken);
        if (!cancelled) {
          setCurrentUser(response.user || null);
        }
      } catch (_error) {
        if (!cancelled) {
          setCurrentUser(null);
          setAuthToken('');
        }
      }
    };

    hydrateUser();

    return () => {
      cancelled = true;
    };
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
    const loadedFiles = response.files || [];
    setFiles(loadedFiles);

    if (selectedStoredFile) {
      const updatedSelection = loadedFiles.find((item) => item.id === selectedStoredFile.id) || null;
      setSelectedStoredFile(updatedSelection);
    }
  };

  useEffect(() => {
    if (!authToken) {
      setFiles([]);
      setSelectedStoredFile(null);
      return;
    }

    withActionState('load-files', loadFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const runAuthAction = async (callback) => {
    setAuthError('');
    setAuthStatus('');
    setAuthLoading(true);

    try {
      await callback();
    } catch (error) {
      setAuthError(error.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const onLogin = () =>
    runAuthAction(async () => {
      const email = authEmail.trim();
      const password = authPassword;

      if (!email) throw new Error('Email is required');
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const response = await apiClient.login({ email, password });
      setAuthToken(response.token);
      setCurrentUser(response.user || null);
      setAuthPassword('');
      setAuthStatus('Signed in successfully.');
    });

  const onRegister = () =>
    runAuthAction(async () => {
      const email = authEmail.trim();
      const password = authPassword;
      const name = registerName.trim();

      if (!email) throw new Error('Email is required');
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const response = await apiClient.register({
        email,
        password,
        name: name || undefined,
        role: 'editor'
      });

      setAuthToken(response.token);
      setCurrentUser(response.user || null);
      setAuthPassword('');
      setAuthStatus('Account created and signed in successfully.');
    });

  const onLogout = () => {
    setAuthToken('');
    setCurrentUser(null);
    setPolicyData(null);
    setApprovedPolicy(null);
    setSelectedStoredFile(null);
    setGeneratedToken('');
    setGeneratedShareLink('');

    setFiles([]);
    setStatusMessage('Signed out.');
  };

  const onGeneratePolicy = handleSubmit((formValues) =>
    withActionState('generate-policy', async () => {
      if (!authToken) throw new Error('Login is required');
      if (!localFile) throw new Error('Select a file before generating policy');

      const policyPayload = {
        ...formValues,
        fileName: localFile.name,
        fileType: localFile.type || 'application/octet-stream',
        fileSize: localFile.size
      };

      const response = await apiClient.generatePolicy(authToken, policyPayload);
      setPolicyData(response);
      setApprovedPolicy(null);
      setStatusMessage('AI recommendation generated. Review and confirm policy.');
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
          expiryHours: overrides.expiryHours,
          maxAccessAttempts: overrides.maxAccessAttempts
        };
      }

      const response = await apiClient.approvePolicy(authToken, approvalPayload);
      setApprovedPolicy(response.approvedPolicy);
      setApprovalModalOpen(false);
      setStatusMessage('Policy approved and ready for secure upload.');
    });

  const onUpload = () =>
    withActionState('upload-file', async () => {
      if (!authToken) throw new Error('Login is required');
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
      const shareLink =
        response.shareId && response.shareCode
          ? `${window.location.origin}${window.location.pathname}?share_id=${encodeURIComponent(response.shareId)}&share_code=${encodeURIComponent(response.shareCode)}`
          : '';

      setGeneratedShareLink(shareLink);
      setStatusMessage('Share access generated. Send the share link to the recipient.');
    });

  const onDeleteFile = (id) =>
    withActionState('delete-file', async () => {
      await apiClient.deleteFile(authToken, id);
      setStatusMessage('Encrypted file deleted.');
      await loadFiles();
    });

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

  if (!authToken) {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        email={authEmail}
        onEmailChange={setAuthEmail}
        password={authPassword}
        onPasswordChange={setAuthPassword}
        name={registerName}
        onNameChange={setRegisterName}
        onSubmit={authMode === 'register' ? onRegister : onLogin}
        loading={authLoading}
        errorMessage={authError}
        statusMessage={authStatus}
      />
    );
  }

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

          <div className="mt-4 flex items-center gap-4 md:mt-0">
            <nav className="flex items-center gap-5 text-xs font-semibold uppercase tracking-[0.14em]">
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

            <div className="hidden rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] px-3 py-2 text-right md:block">
              <p className="text-xs font-semibold text-[color:var(--ui-text)]">{currentUser?.email || 'Signed in'}</p>
              <p className="ui-text-muted text-[10px] uppercase tracking-[0.12em]">
                USER ID: {currentUser?.id || '-'}
              </p>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="ui-btn-outline"
            >
              Sign Out
            </button>
          </div>
        </header>

        <section className="ui-card mt-5">
          <div className="flex items-center justify-between">
            <h2 className="ui-title text-lg font-bold">
              {activeSection === 'dashboard'
                ? 'Dashboard Overview'
                : activeSection === 'policies'
                  ? 'Policy Intelligence'
                  : 'Share Intelligence'}
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
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Share Status</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {generatedShareLink
                    ? 'Share access configured for selected file'
                    : 'No share access generated in this session'}
                </p>
              </div>
            </div>
          ) : null}

          {activeSection === 'policies' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Access Profile</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-accent)]">System Enforced</p>
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
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Access Mode</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-accent)]">Auto Derived</p>
              </div>
              <div className="ui-card-soft">
                <p className="ui-text-muted text-xs uppercase tracking-[0.12em]">Share Link Expiry</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
                  {generatedTokenClaims?.exp
                    ? new Date(generatedTokenClaims.exp * 1000).toLocaleString()
                    : 'Generate share access to view expiry'}
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
                  Access mode is policy-driven and enforced automatically. Password is enforced if configured.
                </p>
              </div>
            </div>
          ) : null}
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
              generatedShareLink={generatedShareLink}
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
