import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import path from 'node:path';

export class VaultClient {
  private readonly dailyDir: string;
  private readonly systemDir: string;
  private readonly voiceProfilePath: string;

  constructor(vaultPath: string) {
    this.dailyDir = path.join(vaultPath, 'Daily');
    this.systemDir = path.join(vaultPath, 'Meta', 'Clementine');
    this.voiceProfilePath = path.join(this.systemDir, 'voice-patterns.md');
  }

  private todayPath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.dailyDir, `${date}.md`);
  }

  appendDailyLog(time: string, title: string, summary: string, next?: string): void {
    const filePath = this.todayPath();
    mkdirSync(this.dailyDir, { recursive: true });

    const entry = [
      `**${time}** - ${title}`,
      `- **Summary:** ${summary}`,
      next ? `- **Next:** ${next}` : null,
      '',
    ].filter(Boolean).join('\n');

    if (!existsSync(filePath)) {
      writeFileSync(filePath, `## Log\n\n${entry}`);
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    if (content.includes('## Log')) {
      writeFileSync(filePath, content.trimEnd() + '\n\n' + entry);
    } else {
      appendFileSync(filePath, '\n\n## Log\n\n' + entry);
    }
  }

  readVoiceProfile(): string {
    if (!existsSync(this.voiceProfilePath)) return '';
    return readFileSync(this.voiceProfilePath, 'utf-8');
  }

  writeVoiceProfile(content: string): void {
    mkdirSync(this.systemDir, { recursive: true });
    writeFileSync(this.voiceProfilePath, content);
  }

  writePendingUpload(pendingUploadsDir: string, jobName: string, data: Record<string, unknown>): string {
    mkdirSync(pendingUploadsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}-${jobName}.json`;
    const filePath = path.join(pendingUploadsDir, filename);
    writeFileSync(filePath, JSON.stringify({ jobName, data, savedAt: new Date().toISOString() }, null, 2));
    return filePath;
  }
}
