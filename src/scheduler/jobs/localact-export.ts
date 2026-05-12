import { spawn } from 'node:child_process';
import type { ScheduledJob } from '../runner.js';

export function createLocalActExportJob(): ScheduledJob {
  return {
    name: 'localact-export',
    goalId: undefined, // set to Vendor Adoption goal ID once PMSC read API is live
    async run(): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const proc = spawn('claude', ['--print', '/localact-export'], {
          cwd: process.env.HOME,
          env: { ...process.env },
          timeout: 15 * 60 * 1000,
        });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`localact-export exited ${code}: ${stderr}`));
          } else {
            resolve({ output: stdout, completedAt: new Date().toISOString() });
          }
        });
      });
    },
  };
}
