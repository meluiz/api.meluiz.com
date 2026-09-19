import type { BuildConfig } from 'bun';

import colors from 'picocolors';

/* ///////////////////////////////////////////////// */

/**
 * Bundle the server into a single entrypoint at the project root.
 *
 * Vercel's Bun runtime resolves imports itself and understands neither the `@/`
 * alias from tsconfig `paths` nor package.json `imports`, so anything reached
 * only through an alias is dropped from the deployed function. Bundling ahead of
 * the deploy resolves the aliases while they still mean something.
 *
 * Dependencies stay external: the build only has to flatten our own modules, and
 * the emitted `from "hono"` is what marks this file as the framework entrypoint.
 */
export const config: BuildConfig = {
  target: 'bun',
  outdir: '.',
  packages: 'external',
  sourcemap: 'linked',
  entrypoints: ['src/server.ts'],
};

/* ///////////////////////////////////////////////// */

const toFormat = (bytes: number) => {
  return `${(bytes / 1024).toFixed(2)} KB`;
};

const build = async () => {
  const result = await Bun.build(config);

  if (!result.success) {
    console.error(colors.red('Build failed'));

    for (const log of result.logs) {
      console.error(log);
    }

    process.exit(1);
  }

  for (const artifact of result.outputs) {
    const size = toFormat(artifact.size);
    console.log(`${colors.green('✓')} ${artifact.path} ${colors.dim(size)}`);
  }
};

build().catch(console.error);
