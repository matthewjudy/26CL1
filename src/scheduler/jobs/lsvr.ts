import { spawn } from 'node:child_process';
import type { ScheduledJob } from '../runner.js';

export function createLsvrJob(): ScheduledJob {
  return {
    name: 'lsvr',
    goalId: undefined, // set to SEM Leads 2026 goal ID once PMSC read API is live
    async run(): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const proc = spawn('claude', ['--print', '/lsvr'], {
          cwd: process.env.HOME,
          env: { ...process.env },
        });

        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill();
          reject(new Error('lsvr timed out after 10 minutes'));
        }, 10 * 60 * 1000);

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });

        proc.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (code !== 0) {
            reject(new Error(`lsvr exited ${code}: ${stderr}`));
          } else {
            resolve({ output: stdout, completedAt: new Date().toISOString() });
          }
        });
      });
    },
  };
}
