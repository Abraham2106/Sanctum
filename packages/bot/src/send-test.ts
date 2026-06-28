import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  try {
    const channel = await client.channels.fetch('1475342168410423301') as TextChannel;
    if (channel) {
      await channel.send('🚀 **Sprint 3 (Propuesta):**\n\n1. Integrar capacidad de **enviar** mensajes al Discord (como este) usando una nueva acción `discord_send`.\n2. Crear el Plugin de Obsidian para interactuar con Sanctum.\n3. Permitir que el Agente lea tareas de Obsidian y mande resúmenes diarios a Discord automáticamente.\n\n¿Qué opinan del plan?');
      console.log('Mensaje enviado con éxito al canal modlog!');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
