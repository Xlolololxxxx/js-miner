import {
  CLOUD_URLS_REGEX,
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { appendFoundMatch } from '../utilities.js';

export function runCloudUrlsScan({ resources }) {
  const issues = [];
  for (const resource of resources.filter((res) => ['js', 'json'].includes(res.type))) {
    const content = resource.content || '';
    const matchesSet = new Set();
    const matchesList = [];
    for (const match of content.matchAll(CLOUD_URLS_REGEX)) {
      appendFoundMatch(matchesSet, matchesList, match[0]);
    }
    if (matchesList.length > 0) {
      issues.push({
        title: '[JS Miner] Cloud Resources',
        severity: SEVERITY_INFORMATION,
        confidence: CONFIDENCE_CERTAIN,
        description: 'The following cloud URLs were found in a static file.',
        resourceUrl: resource.url,
        matches: matchesList
      });
    }
  }
  return { scanner: 'cloud', issues };
}
