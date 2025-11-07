/**
 * ABP User Configuration Scanner
 *
 * Checks for the /abpuserconfiguration/getall endpoint
 * If it returns 200, automatically downloads the JSON response
 */

import { SEVERITY_INFORMATION, CONFIDENCE_CERTAIN } from '../constants.js';

/**
 * Extract base domain name for filename
 */
function getBaseDomainName(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    // Remove www. prefix if present
    const cleanHostname = hostname.replace(/^www\./, '');
    // Replace dots with underscores for valid filename
    return cleanHostname.replace(/\./g, '_');
  } catch (e) {
    return 'abpconfig';
  }
}

/**
 * Build the ABP configuration endpoint URL
 */
function buildAbpEndpoint(baseUrl) {
  try {
    const urlObj = new URL(baseUrl);
    const origin = urlObj.origin;
    return `${origin}/abpuserconfiguration/getall`;
  } catch (e) {
    return null;
  }
}

/**
 * Download JSON content as a file
 */
async function downloadJson(jsonData, baseUrl) {
  const baseName = getBaseDomainName(baseUrl);
  const filename = `${baseName}_abpconfig.json`;

  try {
    // Pretty print the JSON
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    return filename;
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`);
  }
}

/**
 * Check the ABP user configuration endpoint
 */
async function checkAbpEndpoint(baseUrl) {
  const endpoint = buildAbpEndpoint(baseUrl);

  if (!endpoint) {
    return {
      found: false,
      error: 'Invalid base URL'
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (response.status === 200) {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const jsonData = await response.json();
        const filename = await downloadJson(jsonData, baseUrl);

        return {
          found: true,
          status: 200,
          endpoint: endpoint,
          filename: filename,
          dataSize: JSON.stringify(jsonData).length,
          data: jsonData
        };
      } else {
        return {
          found: true,
          status: 200,
          endpoint: endpoint,
          error: 'Response is not JSON format',
          contentType: contentType
        };
      }
    } else {
      return {
        found: false,
        status: response.status,
        endpoint: endpoint
      };
    }
  } catch (error) {
    return {
      found: false,
      endpoint: endpoint,
      error: error.message
    };
  }
}

/**
 * Main scanner function
 */
export async function runAbpConfigScan(context) {
  const { pageUrl } = context;
  const issues = [];

  const result = await checkAbpEndpoint(pageUrl);

  if (result.found) {
    let description = `The ABP User Configuration endpoint was found and returned status ${result.status}.<br><br>`;
    description += `<strong>Endpoint:</strong> ${result.endpoint}<br>`;

    if (result.filename) {
      description += `<strong>Downloaded as:</strong> ${result.filename}<br>`;
      description += `<strong>Data size:</strong> ${result.dataSize} bytes<br><br>`;
      description += 'The configuration file has been automatically downloaded and may contain sensitive information about the application structure, modules, permissions, and settings.';
    } else if (result.error) {
      description += `<strong>Issue:</strong> ${result.error}`;
    }

    issues.push({
      title: '[JS Miner] ABP User Configuration Exposed',
      severity: SEVERITY_INFORMATION,
      confidence: CONFIDENCE_CERTAIN,
      description: description,
      resourceUrl: result.endpoint,
      matches: [
        `Status: ${result.status}`,
        `Endpoint: ${result.endpoint}`,
        result.filename ? `Downloaded: ${result.filename}` : 'Response found'
      ]
    });
  }

  return {
    scanner: 'abpConfig',
    issues: issues
  };
}
