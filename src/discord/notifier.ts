import { Client, GatewayIntentBits } from 'discord.js';
import pino from 'pino';

const logger = pino({ name: 'clementine.discord' });

let client: Client | null = null;

async function getClient(token: string): Promise<Client> {
  if (client?.isReady()) return client;

  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
  await client.login(token);

  await new Promise<void>((resolve) => {
    client!.once('ready', () => resolve());
  });

  return client;
}

export async function sendOwnerDM(token: string, ownerId: string, message: string): Promise<void> {
  try {
    const discord = await getClient(token);
    const user = await discord.users.fetch(ownerId);
    await user.send(message);
    logger.info({ ownerId }, 'Discord DM sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send Discord DM');
  }
}

export async function destroyDiscordClient(): Promise<void> {
  if (client) {
    await client.destroy();
    client = null;
  }
}
