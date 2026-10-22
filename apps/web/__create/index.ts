import { AsyncLocalStorage } from 'node:async_hooks';
import nodeConsole from 'node:console';
import { neonConfig } from '@neondatabase/serverless';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { retiredIntegrationProxy } from './retired-integration-proxy';
import { requestId } from 'hono/request-id';
import { createRequestHandler } from 'react-router';
import { serializeError } from 'serialize-error';
import * as build from 'virtual:react-router/server-build';
import ws from 'ws';
import { getHTMLForErrorPage } from './get-html-for-error-page';
import { API_BASENAME, api } from './route-builder';

neonConfig.webSocketConstructor = ws;

const als = new AsyncLocalStorage<{ requestId: string }>();

for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = nodeConsole[method].bind(console);

  console[method] = (...args: unknown[]) => {
    const requestId = als.getStore()?.requestId;
    if (requestId) {
      original(`[traceId:${requestId}]`, ...args);
    } else {
      original(...args);
    }
  };
}

const app = new Hono();

app.use('*', requestId());

app.use('*', (c, next) => {
  const requestId = c.get('requestId');
  return als.run({ requestId }, () => next());
});

app.use(contextStorage());

app.onError((err, c) => {
  if (c.req.method !== 'GET') {
    return c.json(
      {
        error: 'An error occurred in your app',
        details: serializeError(err),
      },
      500
    );
  }
  return c.html(getHTMLForErrorPage(err), 200);
});

if (process.env.CORS_ORIGINS) {
  app.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    })
  );
}

for (const method of ['post', 'put', 'patch'] as const) {
  app[method](
    '*',
    bodyLimit({
      maxSize: 4.5 * 1024 * 1024,
      onError: (c) => c.json({ error: 'Body size limit exceeded' }, 413),
    })
  );
}

app.all('/integrations/:path{.+}', () => retiredIntegrationProxy());

app.route(API_BASENAME, api);

const requestHandler = createRequestHandler(
  build,
  import.meta.env.DEV ? 'development' : 'production'
);

app.all('*', (c) => {
  return requestHandler(c.req.raw);
});

export default app.fetch;
