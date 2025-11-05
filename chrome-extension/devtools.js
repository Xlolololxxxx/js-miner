// This script runs in the DevTools context and creates a panel
chrome.devtools.panels.create(
  'JS Miner',
  '',
  'panel.html',
  (panel) => {
    console.log('JS Miner DevTools panel created');
  }
);
