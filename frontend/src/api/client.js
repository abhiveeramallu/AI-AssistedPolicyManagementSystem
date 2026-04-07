const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
const TOKEN_STORAGE_KEY = 'secure-policy-user-token';
const isDevAuthEnabled = String(import.meta.env.VITE_ENABLE_DEV_AUTH || '').toLowerCase() === 'true';

const inferHost = () => {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.hostname || 'localhost';
};

const buildCandidateApiUrls = () => {
  const host = inferHost();
  const hostVariants = new Set([host, 'localhost', '127.0.0.1']);
  const variantHosts = Array.from(hostVariants).filter(Boolean);
  const variantUrls = variantHosts.flatMap((variantHost) => [
    `http://${variantHost}:5050`,
    `http://${variantHost}:5000`
  ]);

  const candidates = [
    configuredApiBaseUrl || `http://${host}:5050`,
    ...variantUrls
  ];

  return [...new Set(candidates.filter(Boolean))];
};

const apiBaseCandidates = buildCandidateApiUrls();
let API_BASE_URL = apiBaseCandidates[0];

const getApiBaseUrl = () => API_BASE_URL;

const tryWithFallbackBaseUrls = async (execute) => {
  let lastError;

  for (const baseUrl of apiBaseCandidates) {
    try {
      const response = await execute(baseUrl);
      API_BASE_URL = baseUrl;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Backend unreachable');
};

const mimeExtensionMap = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

const decodeRfc5987Value = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

const getFilenameFromContentDisposition = (contentDisposition = '') => {
  const filenameStarMatch = contentDisposition.match(/filename\\*=UTF-8''([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    return decodeRfc5987Value(filenameStarMatch[1].trim());
  }

  const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1].trim();
  }

  return '';
};

const ensureFilenameExtension = (filename, fileId, mimeType) => {
  if (filename && /\\.[a-zA-Z0-9]{2,8}$/.test(filename)) {
    return filename;
  }

  const extension = mimeExtensionMap[mimeType] || 'bin';
  if (filename) {
    return `${filename}.${extension}`;
  }

  return `${fileId}.${extension}`;
};

const request = async ({ path, method = 'GET', body, token, extraHeaders = {}, isFormData = false }) => {
  const serializedBody = isFormData ? body : body ? JSON.stringify(body) : undefined;

  const buildHeaders = (authToken) => {
    const headers = {
      ...extraHeaders
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
  };

  const executeFetch = async (authToken, baseUrl = getApiBaseUrl()) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: buildHeaders(authToken),
      body: serializedBody
    });

  let response;
  try {
    response = await executeFetch(token);
  } catch (_error) {
    try {
      response = await tryWithFallbackBaseUrls((baseUrl) => executeFetch(token, baseUrl));
    } catch (_fallbackError) {
      throw new Error(
        `Backend unreachable. Tried: ${apiBaseCandidates.join(', ')}. Verify API server is running.`
      );
    }
  }

  if (isDevAuthEnabled && response.status === 401 && token) {
    try {
      const refreshResponse = await fetch(`${getApiBaseUrl()}/auth/dev-token`);
      if (refreshResponse.ok) {
        const refreshPayload = await refreshResponse.json().catch(() => ({}));
        const refreshedToken = refreshPayload?.token;

        if (refreshedToken) {
          localStorage.setItem(TOKEN_STORAGE_KEY, refreshedToken);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('auth-token-refreshed', { detail: { token: refreshedToken } })
            );
          }
          response = await executeFetch(refreshedToken, getApiBaseUrl());
        }
      }
    } catch (_error) {
      // Keep original unauthorized response path.
    }
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = payload?.error?.message || 'Request failed';
    const details = payload?.error?.details;

    if (errorMessage === 'Validation failed' && Array.isArray(details) && details.length > 0) {
      const detailMessage = details
        .slice(0, 3)
        .map((issue) => {
          const pathSegments = Array.isArray(issue?.path) ? issue.path.join('.') : '';
          if (pathSegments) {
            return `${pathSegments}: ${issue?.message || 'invalid value'}`;
          }
          return issue?.message || 'invalid value';
        })
        .join('; ');

      throw new Error(`Validation failed: ${detailMessage}`);
    }

    throw new Error(errorMessage);
  }

  return payload;
};

export const apiClient = {
  login: (credentials) => request({ path: '/auth/login', method: 'POST', body: credentials }),
  fetchDevToken: () => request({ path: '/auth/dev-token', method: 'GET' }),
  generatePolicy: (token, data) => request({ path: '/generate-policy', method: 'POST', body: data, token }),
  approvePolicy: (token, data) => request({ path: '/approve-policy', method: 'POST', body: data, token }),
  uploadFile: (token, formData) =>
    request({ path: '/upload', method: 'POST', body: formData, token, isFormData: true }),
  listFiles: (token) => request({ path: '/files', method: 'GET', token }),
  generateFileToken: (token, data) =>
    request({ path: '/generate-token', method: 'POST', body: data, token }),
  validateFileToken: (token, data) =>
    request({ path: '/validate-token', method: 'POST', body: data, token }),
  validateSharedFileToken: (data) =>
    request({ path: '/validate-file-token', method: 'POST', body: data }),
  deleteFile: (token, id) => request({ path: `/file/${id}`, method: 'DELETE', token }),
  accessFileWithToken: async ({ fileId, token, preview = false, password }) => {
    let response;

    const executeFileFetch = async (baseUrl) => {
      const querySuffix = preview ? '?preview=true' : '';
      const headers = {
        'X-Access-Token': token
      };

      if (password) {
        headers['X-Access-Password'] = password;
      }

      return fetch(`${baseUrl}/file/${encodeURIComponent(fileId)}${querySuffix}`, {
        method: 'GET',
        headers
      });
    };

    try {
      response = await executeFileFetch(getApiBaseUrl());
    } catch (_error) {
      try {
        response = await tryWithFallbackBaseUrls((baseUrl) => executeFileFetch(baseUrl));
      } catch (_fallbackError) {
        throw new Error(
          `Backend unreachable. Tried: ${apiBaseCandidates.join(', ')}. Verify API server is running.`
        );
      }
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message || 'Failed to access file with token');
    }

    const contentDisposition = response.headers.get('content-disposition') || '';
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    const rawFilename = getFilenameFromContentDisposition(contentDisposition);
    const filename = ensureFilenameExtension(rawFilename, fileId, mimeType);

    return {
      blob: await response.blob(),
      filename,
      mimeType
    };
  }
};

export { API_BASE_URL, getApiBaseUrl, isDevAuthEnabled };
