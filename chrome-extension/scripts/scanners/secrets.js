import {
  SECRETS_REGEX,
  HTTP_BASIC_AUTH_SECRETS,
  SEVERITY_MEDIUM,
  CONFIDENCE_FIRM,
  CONFIDENCE_TENTATIVE
} from '../constants.js';
import { appendFoundMatch, isHighEntropy, isValidBase64 } from '../utilities.js';

const FALSE_POSITIVES = ['basic', 'bearer', 'token'];

// Analytics/tracking services that commonly appear as config keys (not real secrets)
const ANALYTICS_SERVICES = [
  'graphite',
  'amplitude',
  'firebase',
  'raygun',
  'mixpanel',
  'segment',
  'heap',
  'intercom',
  'hotjar',
  'fullstory',
  'logrocket',
  'sentry',
  'bugsnag',
  'rollbar',
  'appsflyer',
  'branch',
  'adjust',
  'kochava',
  'tune'
];

function isNotFalsePositive(secret) {
  const cleaned = secret.replace(/\s|\*/g, '');
  if (cleaned.length <= 4) return false;
  return !FALSE_POSITIVES.includes(cleaned.toLowerCase());
}

function isNotAnalyticsService(fullMatch) {
  const lowerMatch = fullMatch.toLowerCase();
  // Check if the match contains any analytics service name
  for (const service of ANALYTICS_SERVICES) {
    if (lowerMatch.includes(service)) {
      return false; // Filter out this match
    }
  }
  return true; // Keep this match
}

export function runSecretsScan({ resources }) {
  const issues = [];
  for (const resource of resources.filter((res) => ['js', 'json'].includes(res.type))) {
    const content = resource.content || '';
    const highMatchesSet = new Set();
    const highMatchesList = [];
    const lowMatchesSet = new Set();
    const lowMatchesList = [];

    for (const match of content.matchAll(SECRETS_REGEX)) {
      const secret = match.groups?.secret || '';
      const fullMatch = match[0];

      if (!secret) continue;

      // Filter out analytics service keys
      if (!isNotAnalyticsService(fullMatch)) continue;

      if (isHighEntropy(secret)) {
        appendFoundMatch(highMatchesSet, highMatchesList, fullMatch);
      } else if (isNotFalsePositive(secret)) {
        appendFoundMatch(lowMatchesSet, lowMatchesList, fullMatch);
      }
    }

    const basicMatch = content.match(HTTP_BASIC_AUTH_SECRETS);
    if (basicMatch) {
      // Filter out analytics service keys from basic auth matches too
      if (isNotAnalyticsService(basicMatch[0])) {
        const base64String = basicMatch[2];
        if (isValidBase64(base64String) && isHighEntropy(atob(base64String))) {
          appendFoundMatch(highMatchesSet, highMatchesList, basicMatch[0]);
        } else {
          appendFoundMatch(lowMatchesSet, lowMatchesList, basicMatch[0]);
        }
      }
    }

    if (highMatchesList.length > 0) {
      issues.push({
        title: '[JS Miner] Secrets / Credentials',
        severity: SEVERITY_MEDIUM,
        confidence: CONFIDENCE_FIRM,
        description: 'The following secrets (with High entropy) were found in a static file.',
        resourceUrl: resource.url,
        matches: highMatchesList
      });
    }

    if (lowMatchesList.length > 0) {
      issues.push({
        title: '[JS Miner] Secrets / Credentials',
        severity: SEVERITY_MEDIUM,
        confidence: CONFIDENCE_TENTATIVE,
        description: 'The following secrets (with Low entropy) were found in a static file.',
        resourceUrl: resource.url,
        matches: lowMatchesList
      });
    }
  }
  return { scanner: 'secrets', issues };
}
