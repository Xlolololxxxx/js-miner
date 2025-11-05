import { runSecretsScan } from './scripts/scanners/secrets.js';
import { runDependencyConfusionScan } from './scripts/scanners/dependencyConfusion.js';
import { runCloudUrlsScan } from './scripts/scanners/cloudUrls.js';
import { runSubdomainScan } from './scripts/scanners/subDomains.js';
import { runInlineSourceMapScan } from './scripts/scanners/inlineSourceMaps.js';
import { runActiveSourceMapperScan } from './scripts/scanners/activeSourceMapper.js';
import { runStaticFilesDump } from './scripts/scanners/staticFilesDumper.js';
import { runEndpointsScan } from './scripts/scanners/endpoints.js';
import { createZipDownload, pathFromUrl, textToBytes } from './scripts/utilities.js';

// DOM Elements
const terminalEl = document.getElementById('terminal');
const statusBarEl = document.getElementById('status-bar');
const clearTerminalBtn = document.getElementById('clear-terminal');
const saveSettingsBtn = document.getElementById('save-settings');
const settingsStatusEl = document.getElementById('settings-status');
const verbositySelect = document.getElementById('verbosity');
const aggressivenessSelect = document.getElementById('aggressiveness');
const scanButtons = document.querySelectorAll('button[data-scan]');

// Scanner definitions
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

// Scanner groups by aggressiveness
const PASSIVE_SCANNERS = ['secrets', 'dependency', 'subdomains', 'cloud', 'inlineMaps', 'endpoints'];
const MODERATE_SCANNERS = [...PASSIVE_SCANNERS, 'activeMaps'];
const AGGRESSIVE_SCANNERS = [...MODERATE_SCANNERS, 'staticDump'];

// Settings management
let settings = {
  verbosity: 'normal',
  aggressiveness: 'passive'
};

// Verbosity levels
const VERBOSITY = {
  MINIMAL: 0,
  NORMAL: 1,
  VERBOSE: 2,
  DEBUG: 3
};

function getVerbosityLevel() {
  const levels = {
    'minimal': VERBOSITY.MINIMAL,
    'normal': VERBOSITY.NORMAL,
    'verbose': VERBOSITY.VERBOSE,
    'debug': VERBOSITY.DEBUG
  };
  return levels[settings.verbosity] || VERBOSITY.NORMAL;
}

// Load settings from storage
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(['jsMinerSettings']);
    if (stored.jsMinerSettings) {
      settings = { ...settings, ...stored.jsMinerSettings };
      verbositySelect.value = settings.verbosity;
      aggressivenessSelect.value = settings.aggressiveness;
      log('Settings loaded successfully', 'debug');
    }
  } catch (error) {
    log('Error loading settings: ' + error.message, 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  settings.verbosity = verbositySelect.value;
  settings.aggressiveness = aggressivenessSelect.value;

  try {
    await chrome.storage.local.set({ jsMinerSettings: settings });
    settingsStatusEl.textContent = 'Settings saved!';
    settingsStatusEl.style.color = 'var(--success)';
    log('Settings saved: ' + JSON.stringify(settings), 'debug');
    setTimeout(() => {
      settingsStatusEl.textContent = '';
    }, 2000);
  } catch (error) {
    settingsStatusEl.textContent = 'Error saving settings';
    settingsStatusEl.style.color = 'var(--error)';
    log('Error saving settings: ' + error.message, 'error');
  }
}

// Terminal output functions
function now() {
  const date = new Date();
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(text, level = 'status', minVerbosity = VERBOSITY.NORMAL) {
  const currentVerbosity = getVerbosityLevel();

  // Check if this message should be logged based on verbosity
  if (currentVerbosity < minVerbosity) {
    return;
  }

  const line = document.createElement('div');
  line.className = `terminal-line ${level}`;
  line.textContent = `[${now()}] ${text}`;
  terminalEl.appendChild(line);
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

function clearTerminal() {
  terminalEl.innerHTML = '';
  log('Terminal cleared', 'status');
}

function updateStatusBar(text) {
  statusBarEl.textContent = text;
}

// Resource collection and preparation
async function getInspectedTab() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval('window.location.href', (url, error) => {
      if (error) {
        resolve(null);
      } else {
        resolve({ url });
      }
    });
  });
}

async function collectResources() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(
      `(${function() {
        const resources = [];
        const scripts = Array.from(document.scripts);
        const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));

        scripts.forEach(script => {
          if (script.src) {
            resources.push({
              type: 'js',
              url: script.src,
              isInline: false
            });
          } else if (script.textContent) {
            resources.push({
              type: 'js',
              url: window.location.href,
              isInline: true,
              content: script.textContent
            });
          }
        });

        links.forEach(link => {
          if (link.href) {
            resources.push({
              type: 'css',
              url: link.href,
              isInline: false
            });
          }
        });

        return {
          pageUrl: window.location.href,
          referrer: document.referrer,
          resources: resources
        };
      }.toString()})()`,
      (result, error) => {
        if (error) {
          resolve({ pageUrl: '', referrer: '', resources: [] });
        } else {
          resolve(result);
        }
      }
    );
  });
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
      log(`Failed to fetch ${resource.url}: ${response.status}`, 'debug', VERBOSITY.DEBUG);
      return { ...resource, content: '', bytes: new Uint8Array() };
    }

    const cloned = response.clone();
    const text = await response.text();
    const buffer = await cloned.arrayBuffer();
    const bytes = buffer ? new Uint8Array(buffer) : textToBytes(text);

    log(`Fetched ${resource.url} (${bytes.length} bytes)`, 'debug', VERBOSITY.DEBUG);

    return {
      ...resource,
      content: text,
      bytes,
      path: resource.path || pathFromUrl(resource.url)
    };
  } catch (e) {
    log(`Error fetching ${resource.url}: ${e.message}`, 'debug', VERBOSITY.VERBOSE);
    return { ...resource, content: '', bytes: new Uint8Array() };
  }
}

async function prepareContext() {
  log('Collecting resources from inspected page...', 'status', VERBOSITY.NORMAL);
  const metadata = await collectResources();

  log(`Found ${metadata.resources.length} resource(s)`, 'status', VERBOSITY.VERBOSE);

  const resources = [];
  for (const resource of metadata.resources) {
    const enriched = await fetchResourceContent(resource);
    resources.push(enriched);
  }

  log(`Successfully fetched ${resources.filter(r => r.content).length} resource(s)`, 'status', VERBOSITY.VERBOSE);

  return {
    pageUrl: metadata.pageUrl,
    referrer: metadata.referrer,
    resources
  };
}

// Scanner execution
function getScannersByAggressiveness() {
  switch (settings.aggressiveness) {
    case 'passive':
      return PASSIVE_SCANNERS;
    case 'moderate':
      return MODERATE_SCANNERS;
    case 'aggressive':
      return AGGRESSIVE_SCANNERS;
    default:
      return PASSIVE_SCANNERS;
  }
}

async function runScans(scanKeys) {
  updateStatusBar('Preparing scan...');
  scanButtons.forEach(btn => btn.disabled = true);

  try {
    const tab = await getInspectedTab();
    log(`Scanning: ${tab?.url || 'Unknown page'}`, 'status', VERBOSITY.NORMAL);

    updateStatusBar('Collecting resources...');
    const context = await prepareContext();

    if (context.resources.length === 0) {
      log('No resources found. Make sure the page is loaded.', 'warn', VERBOSITY.MINIMAL);
      updateStatusBar('No resources found');
      return;
    }

    log(`Starting ${scanKeys.length} scanner(s)...`, 'status', VERBOSITY.NORMAL);
    updateStatusBar(`Running ${scanKeys.length} scan(s)...`);

    const results = [];
    for (const key of scanKeys) {
      const scanner = SCANNERS[key];
      if (!scanner) {
        log(`Scanner "${key}" not found`, 'error', VERBOSITY.MINIMAL);
        continue;
      }

      log(`Running "${key}" scanner...`, 'status', VERBOSITY.VERBOSE);
      updateStatusBar(`Running "${key}" scanner...`);

      try {
        const outcome = await scanner(context);
        results.push(outcome);

        const issueCount = outcome.issues?.length || 0;
        const level = issueCount > 0 ? 'warn' : 'success';
        log(`Completed "${key}" scan: ${issueCount} finding(s)`, level, VERBOSITY.NORMAL);

        // Log detailed results
        if (issueCount > 0 && getVerbosityLevel() >= VERBOSITY.VERBOSE) {
          outcome.issues.forEach(issue => {
            log(`  ${issue.title}`, 'issue-title', VERBOSITY.VERBOSE);
            log(`  Severity: ${issue.severity} | Confidence: ${issue.confidence}`, 'meta', VERBOSITY.VERBOSE);
            log(`  Resource: ${issue.resourceUrl}`, 'meta', VERBOSITY.VERBOSE);

            if (getVerbosityLevel() >= VERBOSITY.DEBUG && issue.matches?.length > 0) {
              issue.matches.forEach(match => {
                log(`    - ${match}`, 'match', VERBOSITY.DEBUG);
              });
            }
          });
        }
      } catch (error) {
        log(`Error in "${key}" scanner: ${error.message}`, 'error', VERBOSITY.MINIMAL);
        console.error(error);
      }
    }

    // Summary
    const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
    const summaryLevel = totalIssues > 0 ? 'warn' : 'success';
    log(`Scan complete: ${totalIssues} total finding(s) from ${scanKeys.length} scanner(s)`, summaryLevel, VERBOSITY.MINIMAL);

    updateStatusBar(`Completed: ${totalIssues} finding(s) detected`);

  } catch (error) {
    log(`Scan error: ${error.message}`, 'error', VERBOSITY.MINIMAL);
    console.error(error);
    updateStatusBar('Scan failed');
  } finally {
    scanButtons.forEach(btn => btn.disabled = false);
  }
}

// Event handlers
saveSettingsBtn.addEventListener('click', saveSettings);
clearTerminalBtn.addEventListener('click', clearTerminal);

scanButtons.forEach(button => {
  button.addEventListener('click', () => {
    const scan = button.dataset.scan;
    if (scan === 'auto') {
      const scanners = getScannersByAggressiveness();
      log(`Running auto-mine with ${settings.aggressiveness} mode (${scanners.length} scanners)`, 'status', VERBOSITY.NORMAL);
      runScans(scanners);
    } else if (scan === 'passive') {
      log(`Running all passive scanners (${PASSIVE_SCANNERS.length} scanners)`, 'status', VERBOSITY.NORMAL);
      runScans(PASSIVE_SCANNERS);
    } else {
      log(`Running individual scanner: ${scan}`, 'status', VERBOSITY.NORMAL);
      runScans([scan]);
    }
  });
});

// Initialize
(async function init() {
  await loadSettings();
  log('JS Miner DevTools Panel initialized', 'success', VERBOSITY.NORMAL);
  log(`Verbosity: ${settings.verbosity} | Aggressiveness: ${settings.aggressiveness}`, 'status', VERBOSITY.VERBOSE);
  updateStatusBar('Ready');
})();
