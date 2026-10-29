/**
 * `pnpm engine:report`: print the engine's report (engine-report.ts). The
 * connection string comes from the environment and is never logged.
 */

import { engineReportUsage, parseEngineReportArgs, runEngineReport } from './engine-report';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(engineReportUsage());
    return;
  }
  const args = parseEngineReportArgs(argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Pass the connection string in the environment, ' +
        "for one command: DATABASE_URL='...' pnpm engine:report (docs/design/recommendation-engine.md, \"The report\").",
    );
  }
  await runEngineReport(connectionString, args, (text) => console.log(text));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
