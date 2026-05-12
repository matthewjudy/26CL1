import { query } from '@anthropic-ai/claude-agent-sdk';
import pino from 'pino';
import type { GraphEmailClient } from './graph-client.js';
import type { VaultClient } from '../vault/client.js';

const logger = pino({ name: 'clementine.voice-learner' });

function buildVoiceLearnerPrompt(sentEmails: Array<{ subject: string; bodyPreview: string }>, existingProfile: string): string {
  if (sentEmails.length === 0) return '';

  const emailSamples = sentEmails
    .slice(0, 10)
    .map((e, i) => `[${i + 1}] Subject: ${e.subject}\n${e.bodyPreview}`)
    .join('\n\n');

  return `You are analyzing Matthew Judy's sent emails to build a voice profile that will guide future draft writing.

Current voice profile:
${existingProfile || '(none yet)'}

Today's sent emails:
${emailSamples}

Analyze these emails and update the voice profile. Extract patterns in:
- Tone (formal vs. casual, direct vs. diplomatic)
- Sentence structure (short/punchy vs. longer explanations)
- How he opens emails (salutation style, first sentence pattern)
- How he closes (sign-off style)
- What he leads with (bottom line first, context first, etc.)
- Level of detail vs. brevity
- Any recurring phrases or framings
- What he avoids (hedging, filler phrases, emojis, etc.)

Return ONLY the updated voice profile as plain text — 150-250 words. Write it as a style guide for someone drafting on his behalf. No headers, no bullet points — prose only.`;
}

export async function runVoiceLearner(options: {
  graphClient: GraphEmailClient;
  vault: VaultClient;
  vaultPath: string;
  modelHaiku: string;
}): Promise<void> {
  const { graphClient, vault, vaultPath, modelHaiku } = options;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const sentEmails = await graphClient.getSentSince(since);
  if (sentEmails.length === 0) {
    logger.info('No sent emails today — skipping voice learning');
    return;
  }

  const existingProfile = vault.readVoiceProfile();
  const prompt = buildVoiceLearnerPrompt(sentEmails, existingProfile);

  let updatedProfile = '';
  for await (const msg of query({
    prompt,
    options: { model: modelHaiku, maxTurns: 1, cwd: vaultPath },
  })) {
    if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'text') updatedProfile += block.text;
      }
    }
  }

  if (updatedProfile.trim()) {
    vault.writeVoiceProfile(updatedProfile.trim());
    logger.info({ sentCount: sentEmails.length }, 'Voice profile updated');
  }
}
