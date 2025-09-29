export function appendFoundMatch(uniqueSet, matchesArray, value) {
  if (!uniqueSet.has(value)) {
    uniqueSet.add(value);
    matchesArray.push(value);
  }
}

export function isHighEntropy(value) {
  return getShannonEntropy(value) >= 3.5;
}

export function getShannonEntropy(str) {
  const occ = new Map();
  for (const ch of str) {
    occ.set(ch, (occ.get(ch) || 0) + 1);
  }
  const n = str.length || 1;
  let entropy = 0;
  for (const count of occ.values()) {
    const p = count / n;
    entropy += p * Math.log2(p);
  }
  return -entropy;
}

export function decodeBase64(data) {
  try {
    return atob(data);
  } catch (e) {
    return '';
  }
}

export function isValidBase64(data) {
  try {
    atob(data);
    return true;
  } catch (e) {
    return false;
  }
}

export function getRootDomain(domain) {
  if (!domain) return null;
  const match = domain.toLowerCase().match(/[a-z0-9-]+\.[a-z0-9-]+$/);
  return match ? match[0] : null;
}

export function getDomainFromReferrer(referrer) {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return getRootDomain(url.host);
  } catch (e) {
    return null;
  }
}

export function isMatchedDomainValid(matchedDomain, rootDomain, requestDomain) {
  if (!matchedDomain || !rootDomain || !requestDomain) return false;
  const lowerMatched = matchedDomain.toLowerCase();
  return lowerMatched.endsWith(rootDomain) &&
    lowerMatched !== requestDomain.toLowerCase() &&
    lowerMatched !== `www.${requestDomain.toLowerCase()}` &&
    lowerMatched !== `www.${rootDomain}`;
}

export function sanitizePathSegment(segment) {
  return segment.replace(/[?%*:|"<>]/g, '').replace(/\s+/g, '_');
}

export function pathFromUrl(resourceUrl, fallbackName = 'resource') {
  try {
    const url = new URL(resourceUrl);
    const path = url.pathname === '/' ? `/${fallbackName}` : url.pathname;
    return path.split('/').map((part, index) => index === 0 ? part : sanitizePathSegment(part)).join('/') || `/${fallbackName}`;
  } catch (e) {
    return `/${sanitizePathSegment(fallbackName)}`;
  }
}

function splitExtension(path) {
  const lastSlash = path.lastIndexOf('/');
  const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const dot = filename.lastIndexOf('.');
  if (dot === -1) {
    return { base: path, ext: '' };
  }
  return {
    base: path.slice(0, path.length - (filename.length - dot)),
    ext: filename.slice(dot)
  };
}

export function ensureUniquePaths(entries) {
  const seen = new Map();
  return entries.map(({ path, data }) => {
    let uniquePath = path;
    const { base, ext } = splitExtension(path);
    let counter = 1;
    while (seen.has(uniquePath)) {
      uniquePath = `${base}_${counter}${ext}`;
      counter += 1;
    }
    seen.set(uniquePath, true);
    return { path: uniquePath, data };
  });
}

export async function createZipDownload(entries, zipName, rootDir) {
  const zip = new window.JSZip();
  ensureUniquePaths(entries).forEach(({ path, data }) => {
    const normalized = path.startsWith('/') ? path.slice(1) : path;
    zip.file(`${rootDir}/${normalized}`, data);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: zipName,
    saveAs: true
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function dedupeByKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowTimestamp() {
  return Date.now();
}

export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (e) {
    return url;
  }
}

export function isLikelyEndpoint(path) {
  return path.includes('/') && !path.includes('<') && !path.includes('>');
}

export function trimUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (e) {
    return url;
  }
}
