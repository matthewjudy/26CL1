import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VaultClient } from './client.js';

const TMP = path.join(os.tmpdir(), 'vault-client-test-' + Date.now());

beforeEach(() => {
  mkdirSync(path.join(TMP, 'Daily'), { recursive: true });
  mkdirSync(path.join(TMP, 'Meta/Clementine'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('VaultClient', () => {
  it('appendDailyLog creates the log section if missing', () => {
    const client = new VaultClient(TMP);
    client.appendDailyLog('08:00', 'Email scan', 'Found 2 actionable emails.');

    const date = new Date().toISOString().slice(0, 10);
    const content = readFileSync(path.join(TMP, 'Daily', `${date}.md`), 'utf-8');
    expect(content).toContain('## Log');
    expect(content).toContain('**08:00** - Email scan');
    expect(content).toContain('Found 2 actionable emails.');
  });

  it('appendDailyLog appends to existing log section', () => {
    const client = new VaultClient(TMP);
    client.appendDailyLog('08:00', 'First entry', 'Summary A.');
    client.appendDailyLog('09:00', 'Second entry', 'Summary B.');

    const date = new Date().toISOString().slice(0, 10);
    const content = readFileSync(path.join(TMP, 'Daily', `${date}.md`), 'utf-8');
    expect(content).toContain('**08:00** - First entry');
    expect(content).toContain('**09:00** - Second entry');
  });

  it('readVoiceProfile returns empty string when file missing', () => {
    const client = new VaultClient(TMP);
    expect(client.readVoiceProfile()).toBe('');
  });

  it('writeVoiceProfile creates the file', () => {
    const client = new VaultClient(TMP);
    client.writeVoiceProfile('Lead with the bottom line. Direct and concise.');
    const content = readFileSync(path.join(TMP, 'Meta/Clementine/voice-patterns.md'), 'utf-8');
    expect(content).toContain('Lead with the bottom line');
  });
});
