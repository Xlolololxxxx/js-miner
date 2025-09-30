const terminalEl = document.getElementById('terminal');
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL('')).origin;

function now() {
  const date = new Date();
  return date.toLocaleTimeString([], { hour12: false });
}

function appendLine(text, variant = 'status') {
  const line = document.createElement('div');
  line.className = `line ${variant}`;
  line.textContent = `[${now()}] ${text}`;
  terminalEl.appendChild(line);
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

function appendIssueDetails(issue) {
  appendLine(issue.title, 'issue-title');
  appendLine(`Severity: ${issue.severity} | Confidence: ${issue.confidence}`, 'meta');
  appendLine(`Resource: ${issue.resourceUrl}`, 'meta');
  if (issue.matches?.length) {
    issue.matches.forEach((match) => {
      appendLine(`- ${match}`, 'match');
    });
  }
  if (issue.hasDownload) {
    appendLine('Artifacts available via the popup download button.', 'meta');
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== EXTENSION_ORIGIN) return;
  if (event.data?.source !== 'js-miner-popup') return;
  const { type, payload } = event.data;

  switch (type) {
    case 'status':
      appendLine(payload, 'status');
      break;
    case 'scan-start':
      appendLine(`Running \"${payload.scanner}\" scan...`, 'status');
      break;
    case 'scan-results': {
      const { scanner, issues } = payload;
      const variant = issues.length ? 'warn' : 'success';
      appendLine(`Completed \"${scanner}\" scan with ${issues.length} finding(s).`, variant);
      issues.forEach((issue) => appendIssueDetails(issue));
      break;
    }
    case 'summary':
      appendLine(
        `Finished ${payload.scanCount} scan(s) against ${payload.pageUrl} with ${payload.issueCount} total finding(s).`,
        payload.issueCount ? 'warn' : 'success'
      );
      break;
    case 'error':
      appendLine(`Error: ${payload}`, 'error');
      break;
    default:
      break;
  }
});

function notifyPopup(type) {
  if (!window.opener) return;
  window.opener.postMessage({ source: 'js-miner-console', type }, EXTENSION_ORIGIN);
}

window.addEventListener('DOMContentLoaded', () => {
  appendLine('JS Miner Console ready.', 'success');
  notifyPopup('console-ready');
});

window.addEventListener('beforeunload', () => {
  notifyPopup('console-closed');
});
