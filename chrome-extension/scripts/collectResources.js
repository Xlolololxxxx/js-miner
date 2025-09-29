(() => {
  const absoluteUrl = (url) => {
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return null;
    }
  };

  const resources = [];
  const seen = new Set();
  let inlineScriptIndex = 0;
  let inlineJsonIndex = 0;
  let inlineStyleIndex = 0;

  document.querySelectorAll('script').forEach((script) => {
    const type = script.type && script.type.includes('json') ? 'json' : 'js';
    if (script.src) {
      const url = absoluteUrl(script.src);
      if (url && !seen.has(url)) {
        seen.add(url);
        resources.push({
          url,
          type,
          isInline: false
        });
      }
    } else if (script.textContent) {
      inlineScriptIndex += 1;
      if (type === 'json') {
        inlineJsonIndex += 1;
      }
      resources.push({
        url: `${window.location.href}#inline-script-${inlineScriptIndex}`,
        type,
        isInline: true,
        content: script.textContent,
        path: type === 'json' ? `/inline/json-${inlineJsonIndex}.json` : `/inline/script-${inlineScriptIndex}.js`
      });
    }
  });

  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const url = absoluteUrl(link.href);
    if (url && !seen.has(url)) {
      seen.add(url);
      resources.push({
        url,
        type: 'css',
        isInline: false
      });
    }
  });

  document.querySelectorAll('style').forEach((style) => {
    if (style.textContent) {
      inlineStyleIndex += 1;
      resources.push({
        url: `${window.location.href}#inline-style-${inlineStyleIndex}`,
        type: 'css',
        isInline: true,
        content: style.textContent,
        path: `/inline/style-${inlineStyleIndex}.css`
      });
    }
  });

  window.__JS_MINER_LAST_COLLECTED__ = {
    pageUrl: window.location.href,
    referrer: document.referrer,
    resources
  };
})();
