import type { Hono } from 'hono';
import type { ServerContext } from './types';

import { Scalar } from '@scalar/hono-api-reference';
import { openAPIRouteHandler } from 'hono-openapi';

/* ///////////////////////////////////////////////// */

const SPEC_PATH = '/openapi.json';
const DOCS_PATH = '/docs';

/* ///////////////////////////////////////////////// */

/**
 * Serve the OpenAPI document and its reference UI. Registered last in bootstrap:
 * the document is generated from the routes of the app it receives.
 */
export const registerDocumentation = (app: Hono<ServerContext>) => {
  app.get(
    SPEC_PATH,
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          version: '0.1.0',
          title: 'api.meluiz.com',
          description: 'API for meluiz.com services',
        },
        servers: [{ url: 'https://api.meluiz.com', description: 'Production' }],
        tags: [
          {
            name: 'Metadata',
            description: 'Metadata extraction and SEO analysis of web pages',
          },
        ],
      },
      exclude: [DOCS_PATH],
      // Validation failure s are answered with 422, not the library's default 400
      defaultValidationErrorResponse: false,
    }),
  );

  app.get(
    DOCS_PATH,
    Scalar({
      darkMode: true,
      theme: 'alternate',
      title: 'api.meluiz.com',
      slug: 'com-meluiz-api',
      url: SPEC_PATH,
      agent: {
        disabled: false,
      },
      mcp: {
        disabled: true,
      },
      hideModels: true,
      hideSearch: true,
      hideClientButton: true,
      hideDownloadButton: true,
      hideDarkModeToggle: true,
      hiddenClients: [
        'c',
        'clojure',
        'csharp',
        'dart',
        'fsharp',
        'go',
        'java',
        'julia',
        'kotlin',
        'objc',
        'ocaml',
        'php',
        'powershell',
        'python',
        'r',
        'ruby',
        'rust',
        'swift',
      ],
      defaultHttpClient: {
        clientKey: 'fetch',
        targetKey: 'node',
      },
    }),
  );
};
