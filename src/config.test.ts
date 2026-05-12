import { describe, it, expect } from 'vitest';

describe('config', () => {
  it('exports PMSC_BASE_URL', async () => {
    const { PMSC_BASE_URL } = await import('./config.js');
    expect(PMSC_BASE_URL).toBe('https://pmsc.fcifloors.com');
  });

  it('exports EMAIL_AGENT_START_HOUR and EMAIL_AGENT_END_HOUR', async () => {
    const { EMAIL_AGENT_START_HOUR, EMAIL_AGENT_END_HOUR } = await import('./config.js');
    expect(EMAIL_AGENT_START_HOUR).toBe(7);
    expect(EMAIL_AGENT_END_HOUR).toBe(19);
  });
});
