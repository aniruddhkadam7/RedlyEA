import crypto from 'crypto';

import type { ImpactAnalysisRequest } from './ImpactAnalysisRequest';
import type { ImpactAnalysisResponseData, ComposeImpactAnalysisResponseOptions } from './ImpactAnalysisApiComposer';
import { composeImpactAnalysisResponse } from './ImpactAnalysisApiComposer';
import type { ImpactQuerySafeguards } from './ImpactAnalysisEngine';
import { asDomainError, DomainError, type DomainErrorCode } from '../reliability/DomainError';

export type AsyncAnalysisStatus = 'Pending' | 'Running' | 'Completed' | 'Aborted';

export type AsyncImpactAnalysisJobInfo = {
  jobId: string;
  status: AsyncAnalysisStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

type AsyncImpactAnalysisJobRecord = AsyncImpactAnalysisJobInfo & {
  request: ImpactAnalysisRequest;
  options: { includePaths: boolean; safeguards?: Partial<ImpactQuerySafeguards>; timeoutMs?: number };
  abortController?: AbortController;
  result?: ImpactAnalysisResponseData;
  errorMessage?: string;
  errorCode?: DomainErrorCode;
  abortReason?: string;
};

type AsyncImpactAnalysisJobManagerConfig = {
  maxRunningJobs: number;
  maxStoredJobs: number;
  completedJobTtlMs: number;
};

const defaultConfig: AsyncImpactAnalysisJobManagerConfig = {
  // Single-threaded Node mock server: keep this low.
  maxRunningJobs: 1,
  maxStoredJobs: 200,
  completedJobTtlMs: 30 * 60 * 1000,
};

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const nowIso = () => new Date().toISOString();

const generateJobId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const basis = `${Date.now()}|${Math.random()}|${process.pid}`;
  return crypto.createHash('sha1').update(basis).digest('hex');
};

export class AsyncImpactAnalysisJobManager {
  private readonly config: AsyncImpactAnalysisJobManagerConfig;
  private readonly jobsById = new Map<string, AsyncImpactAnalysisJobRecord>();

  constructor(config?: Partial<AsyncImpactAnalysisJobManagerConfig>) {
    this.config = { ...defaultConfig, ...(config ?? {}) };
  }

  private cleanup(nowMs = Date.now()): void {
    // TTL cleanup for finished jobs.
    const cutoff = nowMs - this.config.completedJobTtlMs;
    for (const [id, job] of this.jobsById) {
      if (job.status !== 'Completed' && job.status !== 'Aborted') continue;
      const completedAtMs = job.completedAt ? Date.parse(job.completedAt) : Number.NaN;
      if (Number.isFinite(completedAtMs) && completedAtMs < cutoff) {
        this.jobsById.delete(id);
      }
    }

    // Capacity enforcement: delete oldest completed/aborted first.
    if (this.jobsById.size <= this.config.maxStoredJobs) return;

    const candidates = Array.from(this.jobsById.values())
      .filter((j) => j.status === 'Completed' || j.status === 'Aborted')
      .sort((a, b) => compareStrings(a.completedAt ?? '', b.completedAt ?? '') || compareStrings(a.createdAt, b.createdAt));

    for (const job of candidates) {
      if (this.jobsById.size <= this.config.maxStoredJobs) break;
      this.jobsById.delete(job.jobId);
    }
  }

  createJob(input: {
    request: ImpactAnalysisRequest;
    options: { includePaths: boolean; safeguards?: Partial<ImpactQuerySafeguards>; timeoutMs?: number };
  }): AsyncImpactAnalysisJobInfo {
    this.cleanup();

    if (this.jobsById.size >= this.config.maxStoredJobs) {
      // Refuse to store endless pending jobs.
      throw new DomainError({
        code: 'CONCURRENCY_LIMIT',
        message: `Job store full (maxStoredJobs=${this.config.maxStoredJobs}).`,
        retryable: true,
      });
    }

    const jobId = generateJobId();
    const record: AsyncImpactAnalysisJobRecord = {
      jobId,
      status: 'Pending',
      createdAt: nowIso(),
      request: input.request,
      options: {
        includePaths: input.options.includePaths === true,
        safeguards: input.options.safeguards,
        timeoutMs: typeof input.options.timeoutMs === 'number' ? input.options.timeoutMs : undefined,
      },
    };

    this.jobsById.set(jobId, record);
    return this.toInfo(record);
  }

  getJob(jobId: string): AsyncImpactAnalysisJobInfo | null {
    this.cleanup();
    const job = this.jobsById.get(jobId);
    return job ? this.toInfo(job) : null;
  }

  getJobResult(
    jobId: string,
  ): { status: AsyncAnalysisStatus; result?: ImpactAnalysisResponseData; errorMessage?: string; errorCode?: DomainErrorCode } | null {
    this.cleanup();
    const job = this.jobsById.get(jobId);
    if (!job) return null;

    return {
      status: job.status,
      result: job.result,
      errorMessage: job.errorMessage,
      errorCode: job.errorCode,
    };
  }

  startJob(jobId: string): { ok: boolean; job?: AsyncImpactAnalysisJobInfo; errorMessage?: string } {
    this.cleanup();

    const job = this.jobsById.get(jobId);
    if (!job) return { ok: false, errorMessage: 'Job not found.' };

    if (job.status === 'Completed' || job.status === 'Aborted') return { ok: true, job: this.toInfo(job) };
    if (job.status === 'Running') return { ok: true, job: this.toInfo(job) };

    const runningCount = Array.from(this.jobsById.values()).filter((j) => j.status === 'Running').length;
    if (runningCount >= this.config.maxRunningJobs) {
      return {
        ok: false,
        errorMessage: `Too many running jobs (maxRunningJobs=${this.config.maxRunningJobs}).`,
      };
    }

    job.status = 'Running';
    job.startedAt = nowIso();
    job.abortController = new AbortController();

    // Fire-and-forget execution (explicit start trigger only).
    void this.runJob(job);

    return { ok: true, job: this.toInfo(job) };
  }

  abortJob(jobId: string, reason?: string): { ok: boolean; job?: AsyncImpactAnalysisJobInfo; errorMessage?: string } {
    this.cleanup();

    const job = this.jobsById.get(jobId);
    if (!job) return { ok: false, errorMessage: 'Job not found.' };

    if (job.status === 'Completed' || job.status === 'Aborted') return { ok: true, job: this.toInfo(job) };

    job.abortReason = (reason ?? '').trim() || 'user_requested';

    if (job.status === 'Pending') {
      job.status = 'Aborted';
      job.completedAt = nowIso();
      job.errorMessage = 'Aborted before start.';
      return { ok: true, job: this.toInfo(job) };
    }

    // Running.
    try {
      job.abortController?.abort();
    } catch {
      // ignore
    }

    // Status will transition to Aborted when the runner unwinds.
    return { ok: true, job: this.toInfo(job) };
  }

  private toInfo(job: AsyncImpactAnalysisJobRecord): AsyncImpactAnalysisJobInfo {
    return {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  private async runJob(job: AsyncImpactAnalysisJobRecord): Promise<void> {
    const abortSignal = job.abortController?.signal;

    const options: ComposeImpactAnalysisResponseOptions = {
      includePaths: job.options.includePaths,
      safeguards: job.options.safeguards,
      abortSignal,
      timeoutMs: job.options.timeoutMs,
    };

    try {
      const result = await composeImpactAnalysisResponse(job.request, options);
      job.result = result;

      // If the engine aborted (safeguards or user abort), mark job Aborted.
      job.status = result.analysisStats.aborted || abortSignal?.aborted ? 'Aborted' : 'Completed';
      job.completedAt = nowIso();

      if (job.status === 'Aborted' && !job.errorMessage) {
        job.errorMessage = abortSignal?.aborted ? 'Aborted by user.' : 'Aborted due to safeguards.';
        job.errorCode = undefined;
      }
    } catch (err) {
      job.status = 'Aborted';
      job.completedAt = nowIso();
      const domain = asDomainError(err);
      job.errorCode = domain.code;
      job.errorMessage = `Execution failed: ${domain.message}`;
    } finally {
      // Release controller reference.
      job.abortController = undefined;
    }
  }
}

// Singleton in-memory manager for the running process.
export const asyncImpactAnalysisJobManager = new AsyncImpactAnalysisJobManager();
