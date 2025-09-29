import {
  SEVERITY_INFORMATION,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { pathFromUrl, nowTimestamp } from '../utilities.js';

function extensionForType(type) {
  switch (type) {
    case 'css':
      return '.css';
    case 'json':
      return '.json';
    case 'map':
      return '.map';
    default:
      return '.js';
  }
}

export function runStaticFilesDump({ resources, pageUrl }) {
  const entries = [];
  for (const resource of resources.filter((res) => ['js', 'json', 'css', 'map'].includes(res.type))) {
    const extension = extensionForType(resource.type);
    const fallback = `inline-${resource.type}${extension}`;
    const path = resource.path || pathFromUrl(resource.url, fallback);
    entries.push({
      path,
      data: resource.bytes || new TextEncoder().encode(resource.content || '')
    });
  }

  if (entries.length === 0) {
    return { scanner: 'staticDump', issues: [] };
  }

  const host = (() => {
    try {
      return new URL(pageUrl).host;
    } catch (e) {
      return 'static-dump';
    }
  })();
  const ts = nowTimestamp();

  return {
    scanner: 'staticDump',
    issues: [{
      title: '[JS Miner] Static Files Dumper',
      severity: SEVERITY_INFORMATION,
      confidence: CONFIDENCE_CERTAIN,
      description: 'Static files were extracted from the current page context.',
      resourceUrl: pageUrl,
      matches: entries.map((entry) => entry.path),
      download: {
        zipName: `JS-Miner-dump-${host}-${ts}.zip`,
        rootDir: `${host}-${ts}`,
        entries
      }
    }]
  };
}
