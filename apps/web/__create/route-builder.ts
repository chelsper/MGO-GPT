import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();
if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

type RouteModule = Record<string, unknown>;

function getHonoPath(routeFile: string): string {
  const relativePath = routeFile.replace('../src/app/api/', '');
  const routePath = relativePath.replace(/\/route\.js$/, '');

  if (!routePath || routePath === 'route.js') {
    return '/';
  }

  const segments = routePath.split('/').filter(Boolean);
  const transformed = segments.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (!match) return segment;
    const [, dots, param] = match;
    return dots === '...' ? `:${param}{.+}` : `:${param}`;
  });

  return `/${transformed.join('/')}`;
}

function registerRoute(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  honoPath: string,
  handler: Handler
) {
  switch (method) {
    case 'GET':
      api.get(honoPath, handler);
      return;
    case 'POST':
      api.post(honoPath, handler);
      return;
    case 'PUT':
      api.put(honoPath, handler);
      return;
    case 'DELETE':
      api.delete(honoPath, handler);
      return;
    case 'PATCH':
      api.patch(honoPath, handler);
      return;
  }
}

function registerRoutes() {
  api.routes = [];

  const routeModules = import.meta.glob('../src/app/api/**/route.js', { eager: true });
  const routeFiles = Object.keys(routeModules).sort((a, b) => b.length - a.length);
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

  for (const routeFile of routeFiles) {
    const route = routeModules[routeFile] as RouteModule;
    const honoPath = getHonoPath(routeFile);

    for (const method of methods) {
      const methodHandler = route[method];
      if (typeof methodHandler !== 'function') continue;

      const handler: Handler = async (c) => {
        const params = c.req.param();
        return await (methodHandler as (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>)(
          c.req.raw,
          { params }
        );
      };

      registerRoute(method, honoPath, handler);
    }
  }
}

registerRoutes();

export { api, API_BASENAME };
