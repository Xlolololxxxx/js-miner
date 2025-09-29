import {
  ENDPOINTS_GET_REGEX,
  ENDPOINTS_POST_REGEX,
  ENDPOINTS_PUT_REGEX,
  ENDPOINTS_DELETE_REGEX,
  ENDPOINTS_PATCH_REGEX,
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { appendFoundMatch, isLikelyEndpoint } from '../utilities.js';

function scanEndpoints(resources, pattern, method) {
  const issues = [];
  for (const resource of resources.filter((res) => res.type === 'js')) {
    const matchesSet = new Set();
    const matchesList = [];
    for (const match of (resource.content || '').matchAll(pattern)) {
      const endpoint = match[1];
      if (isLikelyEndpoint(endpoint)) {
        appendFoundMatch(matchesSet, matchesList, endpoint);
      }
    }
    if (matchesList.length > 0) {
      issues.push({
        title: `[JS Miner] API Endpoints (${method})`,
        severity: SEVERITY_INFORMATION,
        confidence: CONFIDENCE_CERTAIN,
        description: 'The following API endpoints were found in a static file.',
        resourceUrl: resource.url,
        matches: matchesList
      });
    }
  }
  return issues;
}

export function runEndpointsScan(context) {
  const { resources } = context;
  return {
    scanner: 'endpoints',
    issues: [
      ...scanEndpoints(resources, ENDPOINTS_GET_REGEX, 'GET'),
      ...scanEndpoints(resources, ENDPOINTS_POST_REGEX, 'POST'),
      ...scanEndpoints(resources, ENDPOINTS_PUT_REGEX, 'PUT'),
      ...scanEndpoints(resources, ENDPOINTS_DELETE_REGEX, 'DELETE'),
      ...scanEndpoints(resources, ENDPOINTS_PATCH_REGEX, 'PATCH')
    ]
  };
}
