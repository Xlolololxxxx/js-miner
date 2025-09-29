import {
  EXTRACT_DEPENDENCIES_REGEX,
  EXTRACT_FROM_NODE_MODULES,
  SEVERITY_INFORMATION,
  SEVERITY_HIGH,
  CONFIDENCE_CERTAIN
} from '../constants.js';
import { appendFoundMatch } from '../utilities.js';
import { NPMPackage } from '../npm-package.js';

let connectivityCache = null;

async function checkConnectivity() {
  if (connectivityCache !== null) return connectivityCache;
  try {
    const robots = await fetch('https://www.npmjs.com/robots.txt');
    const registry = await fetch('https://registry.npmjs.org/');
    connectivityCache = robots.ok && registry.ok;
  } catch (e) {
    connectivityCache = false;
  }
  return connectivityCache;
}

async function verifyPackage(npmPackage) {
  if (!npmPackage.isVersionValidNPM()) {
    return {
      title: '[JS Miner] Dependency (Non-NPM registry package)',
      severity: SEVERITY_INFORMATION,
      detail: 'The following non-NPM dependency was found in a static file. The version might contain a public repository URL, a private repository URL or a file path. Manual review is advised.'
    };
  }

  if (npmPackage.getName().startsWith('@')) {
    const org = npmPackage.getOrgNameFromScopedDependency();
    try {
      const response = await fetch(`https://www.npmjs.com/org/${org}`);
      if (response.status === 404) {
        return {
          title: '[JS Miner] Dependency (organization not found)',
          severity: SEVERITY_HIGH,
          detail: `The following potentially exploitable dependency was found in a static file. The organization does not seem to be available, which indicates that it can be registered: https://www.npmjs.com/org/${org}`
        };
      }
    } catch (e) {
      return null;
    }
  } else {
    try {
      const response = await fetch(`https://registry.npmjs.org/${npmPackage.getName()}`);
      if (response.status === 404) {
        return {
          title: '[JS Miner] Dependency Confusion',
          severity: SEVERITY_HIGH,
          detail: `The following potentially exploitable dependency was found in a static file. There was no entry for this package on the npm registry: https://registry.npmjs.org/${npmPackage.getName()}`
        };
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function runDependencyConfusionScan({ resources }) {
  const issues = [];
  const uniqueIssueKeys = new Set();
  for (const resource of resources.filter((res) => ['js', 'json', 'css'].includes(res.type))) {
    const isCss = resource.type === 'css';
    const content = resource.content || '';
    const normalized = isCss ? content : content.replace(/\s|\t|\r|\n/g, '');

    const matchesSet = new Set();
    const matchesList = [];
    const uniquePackages = new Map();

    if (!isCss) {
      for (const depsMatch of normalized.matchAll(EXTRACT_DEPENDENCIES_REGEX)) {
        const dependenciesBlock = depsMatch[2] || '';
        const dependencyList = dependenciesBlock.split(',');
        for (const dependency of dependencyList) {
          const npmPackage = new NPMPackage(dependency);
          if (npmPackage.isNameValid()) {
            appendFoundMatch(matchesSet, matchesList, npmPackage.getNameWithVersion());
            uniquePackages.set(`${npmPackage.getName()}|${npmPackage.version || ''}`, npmPackage);
          }
        }
      }
    }

    for (const disclosure of content.matchAll(EXTRACT_FROM_NODE_MODULES)) {
      const npmPackage = new NPMPackage(disclosure[1], true);
      if (npmPackage.isNameValid()) {
        appendFoundMatch(matchesSet, matchesList, npmPackage.getNameWithVersion());
        uniquePackages.set(`${npmPackage.getName()}|${npmPackage.version || ''}`, npmPackage);
      }
    }

    if (matchesList.length > 0) {
      issues.push({
        title: '[JS Miner] Dependencies',
        severity: SEVERITY_INFORMATION,
        confidence: CONFIDENCE_CERTAIN,
        description: 'The following dependencies were found in a static file.',
        resourceUrl: resource.url,
        matches: matchesList
      });

      if (await checkConnectivity()) {
        for (const npmPackage of uniquePackages.values()) {
          const verification = await verifyPackage(npmPackage);
          if (verification) {
            const key = `${verification.title}|${verification.detail}|${npmPackage.getNameWithVersion()}|${resource.url}`;
            if (!uniqueIssueKeys.has(key)) {
              uniqueIssueKeys.add(key);
              issues.push({
                title: verification.title,
                severity: verification.severity,
                confidence: CONFIDENCE_CERTAIN,
                description: verification.detail,
                resourceUrl: resource.url,
                matches: [npmPackage.getNameWithVersion()]
              });
            }
          }
        }
      }
    }
  }
  return { scanner: 'dependency', issues };
}
