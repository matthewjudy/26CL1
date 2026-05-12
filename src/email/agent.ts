import { query } from '@anthropic-ai/claude-agent-sdk';
import pino from 'pino';
import type { EmailMessage } from './graph-client.js';
import type { Goal } from '../pmsc/types.js';

const logger = pino({ name: 'clementine.email-agent' });

export function buildEmailAgentPrompt(
  emails: EmailMessage[],
  voiceProfile: string,
  goals: Goal[],
): string {
  const emailList = emails.length === 0
    ? 'No new emails since last run.'
    : emails.map((e, i) =>
        `[${i + 1}] ID: ${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.bodyPreview}\nReceived: ${e.receivedDateTime}`
      ).join('\n\n');

  const goalsContext = goals.length === 0
    ? ''
    : `Active 2026 goals:\n${goals.map((g) => `- ${g.title} (${Math.round(g.progress * 100)}% progress)`).join('\n')}\n\n`;

  return `You are Clementine, Matthew Judy's always-on assistant. Matthew is VP of Performance Marketing at Floor Coverings International (300+ franchise locations).

${goalsContext}Matthew's voice profile for drafting:
${voiceProfile || 'Direct and concise. Lead with the bottom line. No hedging.'}

---

New emails since last run:

${emailList}

---

For each email, classify it as one of:
- ACTIONABLE: needs a reply from Matthew
- FYI: informational — a commitment made to Matthew, a decision, a metric, vendor update, or anything he'd want to find later
- NOISE: newsletter, notification, automated mail — skip entirely

For ACTIONABLE emails: draft a reply in Matthew's voice using the voice profile above. Be specific and direct. The draft should be ready to send with minimal editing.

For FYI emails: write a one-sentence summary of what's worth remembering.

Respond with a JSON object in this exact format:
{
  "actionable": [
    { "emailId": "...", "subject": "...", "from": "...", "draftSubject": "Re: ...", "draftBody": "...", "draftTo": "..." }
  ],
  "fyi": [
    { "emailId": "...", "subject": "...", "summary": "..." }
  ],
  "urgent": [
    { "emailId": "...", "subject": "...", "reason": "..." }
  ]
}

urgent[] = emails that cannot wait for Matthew's next check — time-sensitive decisions, blocked initiatives, or direct asks from key stakeholders. Keep this list empty unless genuinely urgent.`;
}

interface AgentResult {
  actionable: Array<{ emailId: string; subject: string; from: string; draftSubject: string; draftBody: string; draftTo: string }>;
  fyi: Array<{ emailId: string; subject: string; summary: string }>;
  urgent: Array<{ emailId: string; subject: string; reason: string }>;
}

export async function runEmailAgent(options: {
  graphClient: import('./graph-client.js').GraphEmailClient;
  vault: import('../vault/client.js').VaultClient;
  goals: Goal[];
  discordToken?: string;
  discordOwnerId?: string;
  sinceDate: Date;
  vaultPath: string;
  modelSonnet: string;
}): Promise<void> {
  const { graphClient, vault, goals, discordToken, discordOwnerId, sinceDate, vaultPath, modelSonnet } = options;

  logger.info({ since: sinceDate.toISOString() }, 'Email Agent starting');

  const [emails, voiceProfile] = await Promise.all([
    graphClient.getInboxSince(sinceDate),
    Promise.resolve(vault.readVoiceProfile()),
  ]);

  if (emails.length === 0) {
    logger.info('No new emails — skipping');
    return;
  }

  logger.info({ count: emails.length }, 'Fetched emails');

  const prompt = buildEmailAgentPrompt(emails, voiceProfile, goals);
  let resultJson = '';

  for await (const msg of query({
    prompt,
    options: {
      model: modelSonnet,
      maxTurns: 3,
      cwd: vaultPath,
    },
  })) {
    if (msg.type === 'assistant' && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') resultJson += block.text;
      }
    }
  }

  let result: AgentResult;
  try {
    const jsonMatch = resultJson.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch?.[0] ?? '{}') as AgentResult;
  } catch {
    logger.error({ resultJson }, 'Failed to parse agent JSON response');
    return;
  }

  // Save drafts
  for (const item of result.actionable ?? []) {
    try {
      await graphClient.saveDraft({
        subject: item.draftSubject,
        body: item.draftBody,
        to: item.draftTo,
      });
      logger.info({ subject: item.draftSubject }, 'Draft saved');
    } catch (err) {
      logger.error({ err, subject: item.draftSubject }, 'Failed to save draft');
    }
  }

  // Log to daily note
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fyiSummary = (result.fyi ?? []).map((f) => f.summary).join(' ');
  const draftCount = (result.actionable ?? []).length;
  const urgentCount = (result.urgent ?? []).length;

  const summary = [
    fyiSummary || null,
    draftCount > 0 ? `${draftCount} draft${draftCount > 1 ? 's' : ''} saved to Outlook Drafts.` : null,
  ].filter(Boolean).join(' ');

  const next = urgentCount > 0
    ? (result.urgent ?? []).map((u) => `"${u.subject}" — ${u.reason}`).join('; ')
    : undefined;

  if (summary) {
    vault.appendDailyLog(time, 'Email scan', summary, next);
  }

  // Discord urgent alerts
  if (urgentCount > 0 && discordToken && discordOwnerId) {
    const { sendOwnerDM } = await import('../discord/notifier.js');
    for (const item of result.urgent ?? []) {
      await sendOwnerDM(discordToken, discordOwnerId, `Urgent email: **${item.subject}**\n${item.reason}`);
    }
  }

  logger.info({ fyi: result.fyi?.length, drafts: draftCount, urgent: urgentCount }, 'Email Agent complete');
}
