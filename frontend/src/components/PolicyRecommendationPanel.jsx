const RecommendationItem = ({ label, value }) => (
  <div className="ui-card-soft">
    <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">{label}</p>
    <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text)]">{value}</p>
  </div>
);

const formatConfidence = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return `${Math.round(parsed * 100)}%`;
};

const sanitizeAccessText = (value) =>
  String(value || '')
    .replace(/\bview\b/gi, 'restricted')
    .replace(/\bedit\b/gi, 'restricted');

const getRiskBadgeClass = (riskLevel) => {
  const normalized = String(riskLevel || '').toLowerCase();
  if (normalized === 'critical') {
    return 'border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.12)] text-white';
  }
  if (normalized === 'high') {
    return 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-white';
  }
  if (normalized === 'medium') return 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)] text-[color:var(--ui-text)]';
  return 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-muted)]';
};

export const PolicyRecommendationPanel = ({ recommendation }) => {
  if (!recommendation) {
    return (
      <div className="ui-card">
        <h3 className="ui-title text-lg font-bold">AI Recommendation</h3>
        <p className="ui-text-muted mt-2 text-sm">
          Generate a policy to view secure access and risk guidance.
        </p>
      </div>
    );
  }

  const riskLevelLabel = String(recommendation.riskLevel || 'unknown').toUpperCase();
  const riskScore = Number.isFinite(Number(recommendation.riskScore))
    ? `${Number(recommendation.riskScore)}/100`
    : '-';
  const riskSignals = Array.isArray(recommendation.riskSignals) ? recommendation.riskSignals : [];
  const reviewChecklist = Array.isArray(recommendation.reviewChecklist)
    ? recommendation.reviewChecklist
    : [];
  const uploadModuleRecommendations = Array.isArray(recommendation.uploadModuleRecommendations)
    ? recommendation.uploadModuleRecommendations
    : [];
  const guardrailsApplied = Array.isArray(recommendation.guardrailsApplied)
    ? recommendation.guardrailsApplied
    : [];
  const riskDrivers = Array.isArray(recommendation.riskDrivers) ? recommendation.riskDrivers : [];
  const controls =
    recommendation && typeof recommendation.recommendedControls === 'object'
      ? recommendation.recommendedControls
      : null;
  const engineLabel = recommendation.engine || 'unknown';

  return (
    <div className="ui-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="ui-title text-lg font-bold">AI Recommendation</h3>
        <span className="rounded-md border border-[color:var(--ui-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-muted)]">
          {engineLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RecommendationItem label="Access Profile" value="System Enforced" />
        <RecommendationItem label="Expiry" value={`${recommendation.expiryHours} hours`} />
        <RecommendationItem label="Encryption" value={recommendation.encryptionRequired ? 'Required' : 'Optional'} />
        <RecommendationItem label="Max Attempts" value={recommendation.maxAccessAttempts} />
        <RecommendationItem label="Risk Score" value={riskScore} />
        <div className={`rounded-lg border px-3 py-3 ${getRiskBadgeClass(recommendation.riskLevel)}`}>
          <p className="text-xs uppercase tracking-[0.14em]">Risk Level</p>
          <p className="mt-1 text-sm font-semibold">{riskLevelLabel}</p>
        </div>
      </div>

      <div className="ui-card-soft mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
          Decision Summary
        </p>
        <p className="mt-1 text-sm text-[color:var(--ui-text)]">
          {sanitizeAccessText(recommendation.decisionSummary || 'No decision summary provided.')}
        </p>
      </div>

      <div className="ui-card-soft mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
          Risk Explanation
        </p>
        <p className="mt-1 text-sm text-[color:var(--ui-text)]">{sanitizeAccessText(recommendation.riskExplanation)}</p>
      </div>

      {riskSignals.length > 0 ? (
        <div className="ui-card-soft mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            Risk Signals
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ui-text)]">
            {riskSignals.map((item) => (
              <li key={item}>- {sanitizeAccessText(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {riskDrivers.length > 0 ? (
        <div className="ui-card-soft mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            Risk Driver Breakdown
          </p>
          <ul className="mt-2 space-y-2 text-sm text-[color:var(--ui-text)]">
            {riskDrivers.slice(0, 6).map((driver, index) => (
              <li key={`${driver.factor}-${index}`} className="rounded-md border border-[color:var(--ui-border)] px-2 py-2">
                <p className="font-semibold">
                  {driver.factor}: {Number(driver.impact) > 0 ? '+' : ''}
                  {driver.impact}
                </p>
                <p className="ui-text-muted mt-1 text-xs">{sanitizeAccessText(driver.detail)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {controls ? (
        <div className="ui-card-soft mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            Enforced Controls
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ui-text)]">
            <li>- Token password required: {controls.requireTokenPassword ? 'Yes' : 'No'}</li>
            <li>- Max token TTL: {controls.maxTokenTtlMinutes} minutes</li>
            <li>- Strict audit trail: {controls.requireStrictAuditTrail ? 'Enabled' : 'Disabled'}</li>
          </ul>
        </div>
      ) : null}

      {reviewChecklist.length > 0 ? (
        <div className="ui-card-soft mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            Reviewer Checklist
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-[color:var(--ui-text)]">
            {reviewChecklist.map((item) => (
              <li key={item}>{sanitizeAccessText(item)}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {uploadModuleRecommendations.length > 0 ? (
        <div className="ui-card-soft mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-accent)]">
            Upload Module Improvements
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ui-text)]">
            {uploadModuleRecommendations.map((item) => (
              <li key={item}>- {sanitizeAccessText(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {guardrailsApplied.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {guardrailsApplied.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-bg)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-muted)]"
              >
                {item}
              </span>
          ))}
        </div>
      ) : null}

      <p className="ui-text-muted mt-3 text-xs">
        Confidence: {formatConfidence(recommendation.confidence)}
      </p>
    </div>
  );
};
