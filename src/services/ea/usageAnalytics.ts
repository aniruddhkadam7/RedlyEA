import { request } from '@/utils/request';

export interface AppUsageSummary {
  name: string;
  machines: number;
  lastSeen: number;
  observations: number;
  daysObserved: number;
  usage: 'Frequent' | 'Occasional' | 'Rare';
}

export type UsageApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export async function getApplicationUsage(options?: Record<string, any>) {
  return request<UsageApiResponse<AppUsageSummary[]>>(
    '/api/usage/applications',
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}
