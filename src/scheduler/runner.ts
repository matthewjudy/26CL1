import pino from 'pino';
import type { PmscClient } from '../pmsc/client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.scheduler' });

export interface ScheduledJob {
  name: string;
  goalId?: string;
  run(): Promise<Record<string, unknown>>;
}

export function isWithinScheduleWindow(currentHour: number, startHour: number, endHour: number): boolean {
  return currentHour >= startHour && currentHour < endHour;
}

export async function executeJob(
  job: ScheduledJob,
  pmsc: PmscClient,
  vault: VaultClient,
  pendingUploadsDir: string,
): Promise<void> {
  const startedAt = new Date();
  const time = `${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}`;

  logger.info({ job: job.name }, 'Scheduler job starting');

  try {
    const data = await job.run();

    try {
      await pmsc.submitIntake({ jobName: job.name, data, goalId: job.goalId });
      vault.appendDailyLog(time, `Scheduler: ${job.name}`, 'Completed. Data uploaded to PMSC.');
      logger.info({ job: job.name }, 'Job complete — uploaded to PMSC');
    } catch (pmscErr) {
      const stagingPath = vault.writePendingUpload(pendingUploadsDir, job.name, data);
      vault.appendDailyLog(time, `Scheduler: ${job.name}`, `Completed. PMSC unavailable — staged to ${stagingPath}.`);
      logger.warn({ job: job.name, pmscErr }, 'PMSC upload failed — staged locally');
    }
  } catch (err) {
    vault.appendDailyLog(time, `Scheduler: ${job.name} FAILED`, String(err), 'Manual review needed.');
    logger.error({ job: job.name, err }, 'Job failed');
  }
}
