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

  const routeModules = import.meta.glob('../src/app/api/**/route.js');
  const moduleCache = new Map<string, Promise<RouteModule>>();
  const routeFiles = Object.keys(routeModules).sort((a, b) => b.length - a.length);
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

  for (const routeFile of routeFiles) {
    const loader = routeModules[routeFile];
    if (!loader) continue;

    const getRouteModule = () => {
      if (!moduleCache.has(routeFile)) {
        moduleCache.set(routeFile, loader().then((mod) => mod as RouteModule));
      }
      return moduleCache.get(routeFile)!;
    };

    const honoPath = getHonoPath(routeFile);

    for (const method of methods) {
      const handler: Handler = async (c) => {
        let route: RouteModule;
        try {
          route = await getRouteModule();
        } catch (error) {
          return c.json(
            {
              error: 'Failed to load API route module',
              route: routeFile,
              details: error instanceof Error ? error.message : String(error),
            },
            500
          );
        }

        const methodHandler = route[method];
        if (typeof methodHandler !== 'function') {
          return c.json({ error: 'Method not allowed' }, 405);
        }

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
