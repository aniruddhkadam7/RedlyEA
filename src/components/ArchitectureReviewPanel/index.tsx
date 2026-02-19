import {
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import React from 'react';
import {
  getArchitectureReview,
  putArchitectureReview,
} from '@/services/ea/reviews';
import type {
  ArchitectureReviewRecord,
  ArchitectureReviewState,
  ReviewSubjectKind,
} from '../../../backend/review/ArchitectureReview';

const normalizeId = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const REVIEW_STATES: ArchitectureReviewState[] = [
  'Not Reviewed',
  'Reviewed',
  'Review Findings Accepted',
];

const tagColorForState = (s: ArchitectureReviewState): string => {
  if (s === 'Review Findings Accepted') return 'green';
  if (s === 'Reviewed') return 'gold';
  return 'default';
};

export type ArchitectureReviewPanelProps = {
  subjectKind: ReviewSubjectKind;
  subjectId: string;

  /** Optional prefill when creating a review. */
  defaultReviewer?: string;
};

const ArchitectureReviewPanel: React.FC<ArchitectureReviewPanelProps> = ({
  subjectKind,
  subjectId,
  defaultReviewer,
}) => {
  const id = normalizeId(subjectId);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [state, setState] =
    React.useState<ArchitectureReviewState>('Not Reviewed');
  const [reviewer, setReviewer] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [lastKnownRecord, setLastKnownRecord] =
    React.useState<ArchitectureReviewRecord | null>(null);

  const refresh = React.useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError('Missing subject id.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await getArchitectureReview(subjectKind, id);
      if (!res?.success)
        throw new Error(res?.errorMessage || 'Failed to load review');

      const record = res.data ?? null;
      setLastKnownRecord(record);

      if (!record) {
        setState('Not Reviewed');
        setReviewer(defaultReviewer ?? '');
        setNotes('');
        return;
      }

      setState(record.state);
      setReviewer(record.reviewer);
      setNotes(record.reviewNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [defaultReviewer, id, subjectKind]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener('ea:reviewsChanged', onChanged);
    return () => window.removeEventListener('ea:reviewsChanged', onChanged);
  }, [refresh]);

  const save = React.useCallback(async () => {
    if (!id) return;

    setSaving(true);
    setError(null);
    try {
      const effectiveReviewer =
        state === 'Not Reviewed'
          ? ''
          : normalizeId(reviewer) || (defaultReviewer ?? '') || 'unknown';
      const effectiveNotes = state === 'Not Reviewed' ? '' : notes;

      const res = await putArchitectureReview(subjectKind, id, {
        state,
        reviewer: effectiveReviewer,
        reviewNotes: effectiveNotes,
      });

      if (!res?.success)
        throw new Error(res?.errorMessage || 'Failed to save review');
      setLastKnownRecord(res.data ?? null);

      // Refresh local inputs based on stored canonical record.
      if (res.data) {
        setState(res.data.state);
        setReviewer(res.data.reviewer);
        setNotes(res.data.reviewNotes);
      } else {
        setState('Not Reviewed');
        setReviewer(defaultReviewer ?? '');
        setNotes('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save review');
    } finally {
      setSaving(false);
    }
  }, [defaultReviewer, id, notes, reviewer, state, subjectKind]);

  const reviewDateText = lastKnownRecord?.reviewDate
    ? lastKnownRecord.reviewDate
    : '—';

  return (
    <Card
      size="small"
      title={
        <Space size={10}>
          <Typography.Text strong>Architecture Review</Typography.Text>
          <Tag color={tagColorForState(state)}>{state}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => void refresh()} disabled={loading || saving}>
            Reload
          </Button>
          <Button
            type="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={loading || !id}
          >
            Save
          </Button>
        </Space>
      }
    >
      {error ? (
        <Typography.Text type="danger">{error}</Typography.Text>
      ) : (
        <Typography.Text type="secondary">
          Lightweight workflow: no approvals, no blocking, just traceability.
        </Typography.Text>
      )}

      <div style={{ marginTop: 12 }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap>
            <div style={{ minWidth: 260 }}>
              <Typography.Text type="secondary">State</Typography.Text>
              <div>
                <Select
                  value={state}
                  options={REVIEW_STATES.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => setState(v)}
                  style={{ width: 260 }}
                />
              </div>
            </div>

            <div style={{ minWidth: 260 }}>
              <Typography.Text type="secondary">Reviewer</Typography.Text>
              <div>
                <Input
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  placeholder="name or role"
                  disabled={state === 'Not Reviewed'}
                  style={{ width: 260 }}
                />
              </div>
            </div>
          </Space>

          <div>
            <Typography.Text type="secondary">Review notes</Typography.Text>
            <Input.TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                state === 'Not Reviewed'
                  ? 'Mark as Reviewed to add notes.'
                  : 'What was checked, what was decided, what was accepted.'
              }
              disabled={state === 'Not Reviewed'}
              autoSize={{ minRows: 3, maxRows: 8 }}
            />
          </div>

          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Subject">
              {subjectKind} · {id || '(missing id)'}
            </Descriptions.Item>
            <Descriptions.Item label="Review date">
              {reviewDateText}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </div>
    </Card>
  );
};

export default ArchitectureReviewPanel;
