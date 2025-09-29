import { sanitizePathSegment } from './utilities.js';

function cleanSourceName(name) {
  return name
    .replace(/\?.*/, '')
    .split('/')
    .map((segment) => sanitizePathSegment(segment))
    .join('/') || 'source.js';
}

export function extractSourcesFromMap(mapContent) {
  try {
    const data = JSON.parse(mapContent);
    const sources = data.sources || [];
    const contents = data.sourcesContent || [];
    const entries = [];
    for (let i = 0; i < sources.length; i += 1) {
      const name = cleanSourceName(sources[i] || `source_${i}.js`);
      const content = contents[i] || '';
      entries.push({ path: name.startsWith('/') ? name.slice(1) : name, content });
    }
    return entries;
  } catch (e) {
    return [];
  }
}
