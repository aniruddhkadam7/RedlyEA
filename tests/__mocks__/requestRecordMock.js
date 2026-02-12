const { parse } = require('url');
const path = require('path');

function loadSceneCache(scene) {
  const cachePath = path.join(
    process.cwd(),
    'types',
    'cache',
    'mock',
    `${scene}.mock.cache.js`,
  );

  // Ensure we always reload, in case tests mutate or multiple scenes are used.
  try {
    delete require.cache[require.resolve(cachePath)];
  } catch {
    // ignore
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(cachePath);
}

async function startMock({ port, scene }) {
  void port;
  const mockFile = loadSceneCache(scene || 'default');

  const originalFetch = global.fetch;

  const toResponse = (status, body, headers = {}) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) => headers[String(name).toLowerCase()],
      },
      text: async () => text,
      json: async () => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      },
    };
  };

  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const resolved = new URL(url || '/', global.location?.href || 'http://localhost');
    const pathname = parse(resolved.href).pathname;
    const key = `${method} ${pathname}`;

    if (Object.prototype.hasOwnProperty.call(mockFile, key)) {
      return toResponse(200, mockFile[key], {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    if (typeof originalFetch === 'function') {
      return originalFetch(input, init);
    }

    return toResponse(404, `Mock key ${key} Not Found`, {
      'content-type': 'text/plain; charset=utf-8',
    });
  };

  return {
    close: () => {
      global.fetch = originalFetch;
    },
  };
}

module.exports = { startMock };
