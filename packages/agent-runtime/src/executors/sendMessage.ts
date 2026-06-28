import { Client, GatewayIntentBits, TextChannel } from 'discord.js';

export async function sendMessage(token: string, channelId: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds]
    });

    client.once('ready', async () => {
      try {
        const channel = await client.channels.fetch(channelId) as TextChannel;
        if (!channel) {
          throw new Error(`No se encontró el canal con ID ${channelId}`);
        }

        await channel.send(content);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        client.destroy();
      }
    });

    client.on('error', (err) => {
      reject(err);
      client.destroy();
    });

    client.login(token).catch(reject);
  });
}
