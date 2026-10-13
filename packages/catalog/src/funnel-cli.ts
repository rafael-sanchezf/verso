/**
 * `pnpm funnel`: print the onboarding funnel (funnel.ts). The connection
 * string comes from the environment and is never logged.
 */

import { funnelUsage, parseFunnelArgs, runFunnel } from './funnel';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(funnelUsage());
    return;
  }
  const args = parseFunnelArgs(argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Pass the connection string in the environment, ' +
        'for one command: DATABASE_URL=\'...\' pnpm funnel (docs/process/hosted-setup.md, section 12).',
    );
  }
  console.log(await runFunnel(connectionString, args));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
