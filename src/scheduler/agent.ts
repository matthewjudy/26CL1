import pino from 'pino';
import { executeJob } from './runner.js';
import { createLsvrJob } from './jobs/lsvr.js';
import { createLocalActExportJob } from './jobs/localact-export.js';
import type { PmscClient } from '../pmsc/client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.scheduler-agent' });

export async function runThursdayExports(
  pmsc: PmscClient,
  vault: VaultClient,
  pendingUploadsDir: string,
): Promise<void> {
  logger.info('Running Thursday export jobs');
  await executeJob(createLsvrJob(), pmsc, vault, pendingUploadsDir);
  await executeJob(createLocalActExportJob(), pmsc, vault, pendingUploadsDir);
}
