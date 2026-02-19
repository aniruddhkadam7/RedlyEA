type RequestMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';

type Primitive = string | number | boolean;

type RequestParams = Record<string, Primitive | Primitive[] | null | undefined>;

export type RequestOptions = Omit<
  RequestInit,
  'method' | 'headers' | 'body'
> & {
  method?: RequestMethod;
  params?: RequestParams;
  data?: unknown;
  headers?: Record<string, string>;
  requestType?: 'json' | 'form';
};

const appendParams = (url: string, params?: RequestParams): string => {
  if (!params) return url;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
      return;
    }
    query.append(key, String(value));
  });

  const serialized = query.toString();
  if (!serialized) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${serialized}`;
};

const shouldHaveBody = (method: RequestMethod) =>
  method !== 'GET' && method !== 'HEAD';

const toFormBody = (data: unknown): URLSearchParams => {
  const body = new URLSearchParams();
  if (!data || typeof data !== 'object') return body;
  Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        body.append(key, String(item));
      }
      return;
    }
    body.append(key, String(value));
  });
  return body;
};

export async function request<T = any>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase() as RequestMethod;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const finalUrl = appendParams(url, options.params);

  let body: BodyInit | undefined;
  if (shouldHaveBody(method) && options.data !== undefined) {
    const data = options.data;
    if (
      data instanceof FormData ||
      data instanceof URLSearchParams ||
      data instanceof Blob ||
      typeof data === 'string'
    ) {
      body = data;
    } else if (options.requestType === 'form') {
      body = toFormBody(data);
      if (!headers['Content-Type']) {
        headers['Content-Type'] =
          'application/x-www-form-urlencoded;charset=UTF-8';
      }
    } else {
      body = JSON.stringify(data);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const response = await fetch(finalUrl, {
    ...options,
    method,
    headers,
    body,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error: any = new Error(
      `Request failed with status ${response.status}`,
    );
    error.response = response;
    error.data = payload;
    throw error;
  }

  return payload as T;
}
