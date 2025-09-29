import {
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { appendFoundMatch, getDomainFromReferrer, getRootDomain, isMatchedDomainValid } from '../utilities.js';

export function runSubdomainScan({ resources, pageUrl, referrer }) {
  const issues = [];
  const pageHost = (() => {
    try {
      return new URL(pageUrl).host;
    } catch (e) {
      return '';
    }
  })();
  const refRoot = getDomainFromReferrer(referrer);

  for (const resource of resources.filter((res) => ['js', 'json'].includes(res.type))) {
    const content = resource.content || '';
    const resourceHost = (() => {
      try {
        return new URL(resource.url).host;
      } catch (e) {
        return pageHost;
      }
    })();
    const rootDomain = refRoot || getRootDomain(resourceHost);
    if (!rootDomain) continue;
    const regex = new RegExp(`([a-z0-9-]+[.])+${rootDomain.replace('.', '\\.')}`, 'gi');
    const matchesSet = new Set();
    const matchesList = [];
    for (const match of content.matchAll(regex)) {
      const value = decodeURIComponent(match[0]);
      if (isMatchedDomainValid(value, rootDomain, resourceHost)) {
        appendFoundMatch(matchesSet, matchesList, value);
      }
    }
    if (matchesList.length > 0) {
      issues.push({
        title: '[JS Miner] Subdomains',
        severity: SEVERITY_INFORMATION,
        confidence: CONFIDENCE_CERTAIN,
        description: 'The following subdomains were found in a static file.',
        resourceUrl: resource.url,
        matches: matchesList
      });
    }
  }
  return { scanner: 'subdomains', issues };
}
