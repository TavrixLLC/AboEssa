const MEDIA_PATH_MARKERS = ['/api/media/', '/uploads/'] as const;
const MEDIA_KEYS = new Set(['imageUrl', 'imageUrls', 'primaryImageUrl', 'snapshotUrl']);

export function normalizeMediaResponse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeMediaResponse);
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (MEDIA_KEYS.has(key)) {
      result[key] = normalizeMediaValue(nested);
      continue;
    }
    if (key === 'url' && typeof value.key === 'string' && typeof value.mimeType === 'string') {
      result[key] = normalizeMediaValue(nested);
      continue;
    }
    result[key] = normalizeMediaResponse(nested);
  }
  return result;
}

function normalizeMediaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeMediaValue);
  }
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('/api/media/') || trimmed.startsWith('/uploads/')) {
    return trimmed;
  }
  if (trimmed.startsWith('api/media/') || trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }

  try {
    const uri = new URL(trimmed);
    for (const marker of MEDIA_PATH_MARKERS) {
      const markerIndex = uri.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        return uri.pathname.slice(markerIndex);
      }
    }

    if (isInternalHost(uri.hostname)) {
      const folderIndex = uri.pathname.search(/\/(products|auctions|ads|customers|labels)\//);
      if (folderIndex >= 0) {
        return `/api/media${uri.pathname.slice(folderIndex)}`;
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function isInternalHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' || host === '127.0.0.1' || host === 'minio' || host.endsWith('.internal')
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
