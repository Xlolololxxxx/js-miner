import {
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { extractSourcesFromMap } from '../source-mapper.js';
import { nowTimestamp } from '../utilities.js';

function buildMapUrl(resourceUrl) {
  try {
    const url = new URL(resourceUrl);
    return `${url.origin}${url.pathname}.map`;
  } catch (e) {
    return null;
  }
}

export async function runActiveSourceMapperScan({ resources }) {
  const issues = [];
  for (const resource of resources.filter((res) => res.type === 'js' && !res.isInline)) {
    const mapUrl = buildMapUrl(resource.url);
    if (!mapUrl) continue;
    try {
      const response = await fetch(mapUrl, { credentials: 'include' });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.includes('sources') || !text.includes('sourcesContent')) continue;
      const entries = extractSourcesFromMap(text);
      if (entries.length > 0) {
        const host = (() => {
          try {
            return new URL(mapUrl).host;
          } catch (e) {
            return 'source-map';
          }
        })();
        const ts = nowTimestamp();
        issues.push({
          title: '[JS Miner] JavaScript Source Mapper (Active)',
          severity: SEVERITY_INFORMATION,
          confidence: CONFIDENCE_CERTAIN,
          description: 'JavaScript source map file was retrieved via active request.',
          resourceUrl: mapUrl,
          matches: entries.map((entry) => entry.path),
          download: {
            zipName: `JS-Miner-active-${host}-${ts}.zip`,
            rootDir: `${host}-${ts}`,
            entries: entries.map((entry) => ({ path: entry.path, data: entry.content }))
          }
        });
      }
    } catch (e) {
      // ignore fetch errors
    }
  }
  return { scanner: 'activeMaps', issues };
}
