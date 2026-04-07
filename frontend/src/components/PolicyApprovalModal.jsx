import { useEffect, useState } from 'react';

const sanitizeAccessText = (value) =>
  String(value || '')
    .replace(/\bview\b/gi, 'restricted')
    .replace(/\bedit\b/gi, 'restricted');

export const PolicyApprovalModal = ({ isOpen, recommendation, onClose, onConfirm, loading }) => {
  const [useAiRecommendation, setUseAiRecommendation] = useState(true);
  const [expiryHours, setExpiryHours] = useState(24);
  const [maxAccessAttempts, setMaxAccessAttempts] = useState(5);
  const [approvalNote, setApprovalNote] = useState('');

  useEffect(() => {
    if (recommendation) {
      setExpiryHours(recommendation.expiryHours);
      setMaxAccessAttempts(recommendation.maxAccessAttempts);
      setUseAiRecommendation(true);
      setApprovalNote('');
    }
  }, [recommendation]);

  if (!isOpen || !recommendation) return null;

  const trimmedApprovalNote = approvalNote.trim();
  const overrideMode = !useAiRecommendation;
  const requiresOverrideNote = overrideMode && trimmedApprovalNote.length < 12;
  const reviewChecklist = Array.isArray(recommendation.reviewChecklist)
    ? recommendation.reviewChecklist
    : [];
  const guardrailsApplied = Array.isArray(recommendation.guardrailsApplied)
    ? recommendation.guardrailsApplied
    : [];
  const recommendedControls =
    recommendation && typeof recommendation.recommendedControls === 'object'
      ? recommendation.recommendedControls
      : null;

  const submit = (event) => {
    event.preventDefault();
    if (requiresOverrideNote) {
      return;
    }

    onConfirm({
      useAiRecommendation,
      expiryHours: Number(expiryHours),
      maxAccessAttempts: Number(maxAccessAttempts),
      approvalNote: approvalNote.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(10,10,10,0.82)] p-4">
      <div className="w-full max-w-2xl rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-6 shadow-panel">
        <h3 className="ui-title text-xl font-bold">Confirm AI Policy</h3>
        <p className="ui-text-muted mt-1 text-sm">
          Review and approve recommendation before secure enforcement.
        </p>

        <div className="ui-card-soft mt-4 text-sm">
          <p className="font-semibold text-[color:var(--ui-accent)]">AI recommended baseline</p>
          <p className="mt-1 text-[color:var(--ui-text)]">
            Enforced access profile with {recommendation.expiryHours}h expiry and{' '}
            {recommendation.maxAccessAttempts} max attempts.
          </p>
          <p className="ui-text-muted mt-2 text-xs">
            {sanitizeAccessText(recommendation.decisionSummary || 'No decision summary was returned.')}
          </p>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="ui-card-soft">
            <p className="ui-text-muted text-[10px] uppercase tracking-[0.14em]">Risk Level</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-accent)]">
              {String(recommendation.riskLevel || 'unknown').toUpperCase()}
            </p>
          </div>
          <div className="ui-card-soft">
            <p className="ui-text-muted text-[10px] uppercase tracking-[0.14em]">Risk Score</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
              {Number.isFinite(Number(recommendation.riskScore))
                ? `${Number(recommendation.riskScore)}/100`
                : '-'}
            </p>
          </div>
          <div className="ui-card-soft">
            <p className="ui-text-muted text-[10px] uppercase tracking-[0.14em]">Engine</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">
              {recommendation.engine || 'unknown'}
            </p>
          </div>
        </div>

        {reviewChecklist.length > 0 ? (
          <div className="ui-card-soft mt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
              Reviewer Checklist
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-[color:var(--ui-text)]">
              {reviewChecklist.map((item) => (
                <li key={item}>{sanitizeAccessText(item)}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {guardrailsApplied.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {guardrailsApplied.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[color:var(--ui-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-muted)]"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}

        {recommendedControls ? (
          <div className="ui-card-soft mt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
              Enforced Controls
            </p>
            <ul className="mt-2 space-y-1 text-xs text-[color:var(--ui-text)]">
              <li>- Token password required: {recommendedControls.requireTokenPassword ? 'Yes' : 'No'}</li>
              <li>- Max token TTL: {recommendedControls.maxTokenTtlMinutes} minutes</li>
              <li>- Strict audit trail: {recommendedControls.requireStrictAuditTrail ? 'Enabled' : 'Disabled'}</li>
            </ul>
          </div>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="flex items-center gap-3 rounded-md border border-[color:var(--ui-border)] px-3 py-2">
            <input
              type="checkbox"
              checked={useAiRecommendation}
              onChange={(event) => setUseAiRecommendation(event.target.checked)}
            />
            <span className="text-sm font-medium text-[color:var(--ui-text)]">
              Approve exactly as AI recommended
            </span>
          </label>

          {overrideMode ? (
            <div className="rounded-md border border-white/20 bg-white/8 px-3 py-2 text-xs text-[color:var(--ui-text)]">
              Override mode enabled. Changes to expiry/attempts will be recorded in audit logs.
            </div>
          ) : null}

          <label className="block">
            <span className="ui-label">Expiry (hours)</span>
            <input
              disabled={useAiRecommendation}
              value={expiryHours}
              onChange={(event) => setExpiryHours(event.target.value)}
              type="number"
              min={1}
              max={2160}
              className="ui-input mt-1"
            />
          </label>

          <label className="block">
            <span className="ui-label">Max access attempts</span>
            <input
              disabled={useAiRecommendation}
              value={maxAccessAttempts}
              onChange={(event) => setMaxAccessAttempts(event.target.value)}
              type="number"
              min={1}
              max={20}
              className="ui-input mt-1"
            />
          </label>

          <label className="block">
            <span className="ui-label">Approval note</span>
            <textarea
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              rows={2}
              maxLength={300}
              className="ui-input mt-1"
              placeholder="Optional note for audit trail"
            />
            {overrideMode ? (
              <p className="ui-text-muted mt-1 text-xs">
                Required for overrides (minimum 12 characters).
              </p>
            ) : (
              <p className="ui-text-muted mt-1 text-xs">
                Optional note is saved in the policy audit trail.
              </p>
            )}
            {requiresOverrideNote ? (
              <p className="mt-1 text-xs text-[color:var(--ui-accent)]">
                Add a clearer approval note before confirming an override.
              </p>
            ) : null}
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary"
            >
              Cancel
            </button>
            <button
              disabled={loading || requiresOverrideNote}
              type="submit"
              className="ui-btn-primary"
            >
              {loading ? 'Approving...' : 'Approve policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
