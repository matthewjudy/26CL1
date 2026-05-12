import { describe, it, expect } from 'vitest';
import { buildEmailAgentPrompt } from './agent.js';

describe('buildEmailAgentPrompt', () => {
  it('includes email subjects in the prompt', () => {
    const emails = [
      { id: 'e1', subject: 'Quarterly report', from: 'boss@fci.com', bodyPreview: 'Please review.', receivedDateTime: '2026-05-11T08:00:00Z', isRead: false },
    ];
    const voiceProfile = 'Direct and concise. Lead with bottom line.';
    const prompt = buildEmailAgentPrompt(emails, voiceProfile, []);

    expect(prompt).toContain('Quarterly report');
    expect(prompt).toContain('Direct and concise');
  });

  it('includes active goals context', () => {
    const prompt = buildEmailAgentPrompt([], '', [
      { id: 'g1', title: 'SEM Leads 2026', progress: 0.45 } as any,
    ]);
    expect(prompt).toContain('SEM Leads 2026');
  });
});
