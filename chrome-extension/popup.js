import { runSecretsScan } from './scripts/scanners/secrets.js';
import { runDependencyConfusionScan } from './scripts/scanners/dependencyConfusion.js';
import { runCloudUrlsScan } from './scripts/scanners/cloudUrls.js';
import { runSubdomainScan } from './scripts/scanners/subDomains.js';
import { runInlineSourceMapScan } from './scripts/scanners/inlineSourceMaps.js';
import { runActiveSourceMapperScan } from './scripts/scanners/activeSourceMapper.js';
import { runStaticFilesDump } from './scripts/scanners/staticFilesDumper.js';
import { runEndpointsScan } from './scripts/scanners/endpoints.js';
import { createZipDownload, pathFromUrl, textToBytes } from './scripts/utilities.js';

const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const controls = document.querySelectorAll('button[data-scan]');

const SCANNERS = {
  secrets: runSecretsScan,
  dependency: runDependencyConfusionScan,
  cloud: runCloudUrlsScan,
  subdomains: runSubdomainScan,
  inlineMaps: runInlineSourceMapScan,
  activeMaps: runActiveSourceMapperScan,
  staticDump: runStaticFilesDump,
  endpoints: runEndpointsScan
};

const PASSIVE_SCANNERS = ['dependency', 'subdomains', 'secrets', 'cloud', 'inlineMaps', 'endpoints'];
const ALL_SCANNERS = [...PASSIVE_SCANNERS, 'activeMaps', 'staticDump'];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function collectResources(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['scripts/collectResources.js']
  });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__JS_MINER_LAST_COLLECTED__
  });
  return result;
}

async function fetchResourceContent(resource) {
  if (resource.isInline) {
    const extension = resource.type === 'css' ? '.css' : resource.type === 'json' ? '.json' : '.js';
    const fallbackPath = resource.path || pathFromUrl(resource.url, `inline-${resource.type}${extension}`);
    return {
      ...resource,
      content: resource.content || '',
      bytes: textToBytes(resource.content || ''),
      path: fallbackPath
    };
  }
  try {
    const response = await fetch(resource.url, { credentials: 'include' });
    if (!response.ok) {
      return { ...resource, content: '', bytes: new Uint8Array() };
    }
    const cloned = response.clone();
    const text = await response.text();
    const buffer = await cloned.arrayBuffer();
    const bytes = buffer ? new Uint8Array(buffer) : textToBytes(text);
    return {
      ...resource,
      content: text,
      bytes,
      path: resource.path || pathFromUrl(resource.url)
    };
  } catch (e) {
    return { ...resource, content: '', bytes: new Uint8Array() };
  }
}

async function prepareContext(tabId) {
  const metadata = await collectResources(tabId);
  const resources = [];
  for (const resource of metadata.resources) {
    const enriched = await fetchResourceContent(resource);
    resources.push(enriched);
  }
  return {
    pageUrl: metadata.pageUrl,
    referrer: metadata.referrer,
    resources
  };
}

function flattenIssues(results) {
  return results.flatMap((result) => result.issues.map((issue) => ({ ...issue, scanner: result.scanner })));
}

function renderIssues(issues) {
  resultsEl.innerHTML = '';
  if (!issues.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No findings were reported.';
    resultsEl.appendChild(empty);
    return;
  }
  issues.forEach((issue, index) => {
    const card = document.createElement('article');
    card.className = 'result-card';

    const title = document.createElement('h2');
    title.textContent = issue.title;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${issue.severity} | ${issue.confidence} | ${issue.resourceUrl}`;
    card.appendChild(meta);

    const description = document.createElement('p');
    description.innerHTML = issue.description;
    card.appendChild(description);

    if (issue.matches?.length) {
      const list = document.createElement('ul');
      issue.matches.forEach((match) => {
        const item = document.createElement('li');
        item.textContent = match;
        list.appendChild(item);
      });
      card.appendChild(list);
    }

    if (issue.download) {
      const downloadButton = document.createElement('button');
      downloadButton.className = 'download';
      downloadButton.textContent = 'Download artifacts';
      downloadButton.addEventListener('click', async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Preparing...';
        await createZipDownload(issue.download.entries, issue.download.zipName, issue.download.rootDir);
        downloadButton.textContent = 'Download artifacts';
        downloadButton.disabled = false;
      });
      card.appendChild(downloadButton);
    }

    resultsEl.appendChild(card);
  });
}

async function runScans(scanKeys) {
  statusEl.textContent = 'Collecting resources...';
  controls.forEach((btn) => (btn.disabled = true));
  const tab = await getActiveTab();
  const context = await prepareContext(tab.id);
  statusEl.textContent = 'Running scans...';

  const results = [];
  for (const key of scanKeys) {
    const scanner = SCANNERS[key];
    if (!scanner) continue;
    // Some scanners are async
    // eslint-disable-next-line no-await-in-loop
    const outcome = await scanner(context);
    results.push(outcome);
  }

  const issues = flattenIssues(results);
  renderIssues(issues);
  statusEl.textContent = `Completed ${scanKeys.length} scan(s).`;
  controls.forEach((btn) => (btn.disabled = false));
}

controls.forEach((button) => {
  button.addEventListener('click', () => {
    const scan = button.dataset.scan;
    if (scan === 'auto') {
      runScans(ALL_SCANNERS);
    } else if (scan === 'passive') {
      runScans(PASSIVE_SCANNERS);
    } else {
      runScans([scan]);
    }
  });
});
