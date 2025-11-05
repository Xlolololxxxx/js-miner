/**
 * Crawler/Directory Enumeration Module
 *
 * This module discovers additional JavaScript files and endpoints by:
 * 1. Scanning initial resources for endpoint patterns
 * 2. Testing common JavaScript file paths
 * 3. Following discovered paths to find more resources
 *
 * CRITICAL: This runs BEFORE the main scanners to expand the resource pool
 */

import {
  ENDPOINTS_GET_REGEX,
  ENDPOINTS_POST_REGEX,
  ENDPOINTS_PUT_REGEX,
  ENDPOINTS_DELETE_REGEX,
  ENDPOINTS_PATCH_REGEX
} from './constants.js';
import { normalizeUrl, trimUrl, isLikelyEndpoint } from './utilities.js';

// Common JavaScript file paths to check
const COMMON_JS_PATHS = [
  '/js/main.js',
  '/js/app.js',
  '/js/bundle.js',
  '/js/vendor.js',
  '/js/common.js',
  '/js/scripts.js',
  '/static/js/main.js',
  '/static/js/bundle.js',
  '/assets/js/main.js',
  '/assets/js/app.js',
  '/dist/js/main.js',
  '/dist/bundle.js',
  '/build/bundle.js',
  '/webpack/bundle.js',
  '/main.bundle.js',
  '/app.bundle.js',
  '/vendor.bundle.js',
  '/runtime.js',
  '/polyfills.js',
  '/config.js',
  '/api.js',
  '/utils.js',
  '/helpers.js'
];

// Common API/endpoint patterns to check
const COMMON_ENDPOINTS = [
  '/api/',
  '/api/v1/',
  '/api/v2/',
  '/v1/',
  '/v2/',
  '/graphql',
  '/rest/',
  '/services/'
];

/**
 * Extracts endpoint paths from JavaScript content
 */
function extractEndpointsFromContent(content) {
  const endpoints = new Set();
  const regexes = [
    ENDPOINTS_GET_REGEX,
    ENDPOINTS_POST_REGEX,
    ENDPOINTS_PUT_REGEX,
    ENDPOINTS_DELETE_REGEX,
    ENDPOINTS_PATCH_REGEX
  ];

  for (const regex of regexes) {
    // Reset regex state
    regex.lastIndex = 0;

    for (const match of content.matchAll(regex)) {
      const endpoint = match[1];
      if (endpoint && isLikelyEndpoint(endpoint)) {
        endpoints.add(endpoint);
      }
    }
  }

  return Array.from(endpoints);
}

/**
 * Builds full URL from base URL and path
 */
function buildFullUrl(baseUrl, path) {
  try {
    // If path is already a full URL, return it
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const base = new URL(baseUrl);

    // If path starts with //, it's protocol-relative
    if (path.startsWith('//')) {
      return `${base.protocol}${path}`;
    }

    // If path starts with /, it's absolute from origin
    if (path.startsWith('/')) {
      return `${base.origin}${path}`;
    }

    // Otherwise it's relative to current path
    const currentPath = base.pathname.endsWith('/')
      ? base.pathname
      : base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

    return `${base.origin}${currentPath}${path}`;
  } catch (e) {
    return null;
  }
}

/**
 * Checks if URL points to a JavaScript file
 */
function isJavaScriptUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return pathname.endsWith('.js') ||
           pathname.endsWith('.mjs') ||
           pathname.includes('/js/') ||
           pathname.includes('.bundle');
  } catch (e) {
    return false;
  }
}

/**
 * Attempts to fetch a URL and determine if it's JavaScript
 */
async function probeUrl(url, logCallback) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJs = contentType.includes('javascript') ||
                 contentType.includes('ecmascript') ||
                 isJavaScriptUrl(url);

    if (!isJs) {
      return null;
    }

    const text = await response.text();
    const cloned = response.clone();
    const buffer = await cloned.arrayBuffer();
    const bytes = buffer ? new Uint8Array(buffer) : new TextEncoder().encode(text);

    logCallback(`Discovered: ${url} (${bytes.length} bytes)`, 'success');

    return {
      type: 'js',
      url: url,
      isInline: false,
      content: text,
      bytes: bytes,
      discovered: true // Mark as discovered by crawler
    };

  } catch (e) {
    // Silent fail - this is normal for 404s and timeouts
    return null;
  }
}

/**
 * Main crawler function
 *
 * @param {Object} options - Crawler configuration
 * @param {string} options.baseUrl - Base URL of the site
 * @param {Array} options.initialResources - Initial resources to scan
 * @param {number} options.maxDepth - Maximum crawl depth (default: 1)
 * @param {boolean} options.checkCommonPaths - Check common JS paths (default: true)
 * @param {Function} options.logCallback - Logging function
 * @returns {Promise<Array>} Array of discovered resources
 */
export async function crawlForResources(options) {
  const {
    baseUrl,
    initialResources = [],
    maxDepth = 1,
    checkCommonPaths = true,
    logCallback = () => {}
  } = options;

  logCallback('Starting crawler/directory enumeration...', 'status');

  const discoveredResources = [];
  const attemptedUrls = new Set();
  const urlsToCheck = [];

  // Extract the origin for building full URLs
  const origin = trimUrl(baseUrl);

  // Phase 1: Check common JavaScript paths
  if (checkCommonPaths) {
    logCallback(`Checking ${COMMON_JS_PATHS.length} common JS paths...`, 'status');

    for (const path of COMMON_JS_PATHS) {
      const fullUrl = buildFullUrl(baseUrl, path);
      if (fullUrl && !attemptedUrls.has(fullUrl)) {
        urlsToCheck.push(fullUrl);
        attemptedUrls.add(fullUrl);
      }
    }
  }

  // Phase 2: Extract endpoints from initial resources
  logCallback('Extracting endpoints from initial resources...', 'status');

  for (const resource of initialResources.filter(r => r.type === 'js' && r.content)) {
    const endpoints = extractEndpointsFromContent(resource.content);

    logCallback(`Found ${endpoints.length} endpoint(s) in ${resource.url}`, 'debug');

    for (const endpoint of endpoints) {
      const fullUrl = buildFullUrl(baseUrl, endpoint);

      if (fullUrl && !attemptedUrls.has(fullUrl)) {
        // Check if it might be a JS file
        if (isJavaScriptUrl(fullUrl)) {
          urlsToCheck.push(fullUrl);
          attemptedUrls.add(fullUrl);
        }

        // Also check common variations
        const variations = [
          fullUrl + '.js',
          fullUrl + '/index.js',
          fullUrl + '/main.js'
        ];

        for (const variation of variations) {
          if (!attemptedUrls.has(variation)) {
            urlsToCheck.push(variation);
            attemptedUrls.add(variation);
          }
        }
      }
    }
  }

  // Phase 3: Probe discovered URLs
  logCallback(`Probing ${urlsToCheck.length} potential JavaScript files...`, 'status');

  let probeCount = 0;
  const maxProbes = 50; // Limit to prevent excessive requests

  for (const url of urlsToCheck.slice(0, maxProbes)) {
    const resource = await probeUrl(url, logCallback);
    if (resource) {
      discoveredResources.push(resource);
      probeCount++;
    }
  }

  logCallback(`Crawler complete: discovered ${discoveredResources.length} new resource(s)`, 'success');

  return discoveredResources;
}

/**
 * Deduplicates resources by URL
 */
export function deduplicateResources(resources) {
  const seen = new Map();
  const deduplicated = [];

  for (const resource of resources) {
    const key = normalizeUrl(resource.url);
    if (!seen.has(key)) {
      seen.set(key, true);
      deduplicated.push(resource);
    }
  }

  return deduplicated;
}
