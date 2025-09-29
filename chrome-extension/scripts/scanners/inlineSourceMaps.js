import {
  B64_SOURCE_MAP_REGEX,
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { decodeBase64, nowTimestamp } from '../utilities.js';
import { extractSourcesFromMap } from '../source-mapper.js';

export function runInlineSourceMapScan({ resources }) {
  const issues = [];
  for (const resource of resources.filter((res) => res.type === 'js')) {
    const content = resource.content || '';
    for (const match of content.matchAll(B64_SOURCE_MAP_REGEX)) {
      const base64Data = match[3];
      const decoded = decodeBase64(base64Data);
      const entries = extractSourcesFromMap(decoded);
      if (entries.length > 0) {
        const host = (() => {
          try {
            return new URL(resource.url).host;
          } catch (e) {
            return 'inline-source';
          }
        })();
        const ts = nowTimestamp();
        issues.push({
          title: '[JS Miner] JavaScript Source Mapper (Inline)',
          severity: SEVERITY_INFORMATION,
          confidence: CONFIDENCE_CERTAIN,
          description: 'Inline base64 source maps were identified and reconstructed.',
          resourceUrl: resource.url,
          matches: entries.map((entry) => entry.path),
          download: {
            zipName: `JS-Miner-inline-${host}-${ts}.zip`,
            rootDir: `${host}-${ts}`,
            entries: entries.map((entry) => ({ path: entry.path, data: entry.content }))
          }
        });
      }
    }
  }
  return { scanner: 'inlineMaps', issues };
}
