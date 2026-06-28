import { Client, GatewayIntentBits, TextChannel, Message } from 'discord.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.resolve(rootDir, '.env') });

const VAULT_DIR = process.env.VAULT_PATH
  ? path.resolve(rootDir, process.env.VAULT_PATH)
  : path.resolve(rootDir, '../vaults/Sanctum');

const LOGS_DIR = path.join(VAULT_DIR, 'Discord-logs');
const AGENT_PATH = path.join(VAULT_DIR, 'Agents', 'resumen.md');

// Threshold de frescura para skip del sync en !resumen (5 minutos)
const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface DiscordLogSchema {
  $schema: string;
  tags: string[];
  channel: string;
  channel_id: string;
  messages: Array<{
    id: string;
    author: string;
    timestamp: string;
    content: string;
  }>;
}

interface ChannelMeta {
  lastMessageId: string;
  lastSyncAt: string;
}

// ─── Helpers de archivo ───────────────────────────────────────────────────────

function logFilePath(channelId: string, temp = false): string {
  return path.join(LOGS_DIR, temp ? `${channelId}.temp.json` : `${channelId}.json`);
}

function metaFilePath(channelId: string): string {
  return path.join(LOGS_DIR, `${channelId}.meta.json`);
}

function readMeta(channelId: string): ChannelMeta | null {
  const metaFile = metaFilePath(channelId);
  if (!fs.existsSync(metaFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaFile, 'utf8')) as ChannelMeta;
  } catch {
    return null;
  }
}

function writeMeta(channelId: string, meta: ChannelMeta): void {
  fs.writeFileSync(metaFilePath(channelId), JSON.stringify(meta, null, 2), 'utf8');
}

/**
 * Verifica si el último sync del canal fue hace menos de FRESHNESS_THRESHOLD_MS.
 */
function isSyncFresh(channelId: string): boolean {
  const meta = readMeta(channelId);
  if (!meta?.lastSyncAt) return false;
  const elapsed = Date.now() - new Date(meta.lastSyncAt).getTime();
  return elapsed < FRESHNESS_THRESHOLD_MS;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Sincroniza los mensajes de un canal y los persiste en Discord-logs/{channel.id}.json
 * El archivo se nombra por ID para evitar ambigüedad entre canales con nombres similares.
 */
async function syncChannel(channel: TextChannel, temp = false): Promise<string> {
  const channelId = channel.id;
  const channelName = channel.name;
  const targetFile = logFilePath(channelId, temp);

  console.log(`[Sync] #${channelName} (${channelId})${temp ? ' [TEMP]' : ''}...`);

  // Leer cursor (solo para sync permanente, el temp siempre trae los últimos 100)
  let cursor: string | undefined;
  if (!temp) {
    const meta = readMeta(channelId);
    cursor = meta?.lastMessageId;
  }

  const fetchOptions: { limit: number; after?: string } = { limit: 100 };
  if (cursor) fetchOptions.after = cursor;

  const fetched = await channel.messages.fetch(fetchOptions as any);
  const newMessages = Array.from(fetched.values()).reverse() as any[];

  // Leer log existente (solo para sync permanente)
  let logData: DiscordLogSchema = {
    $schema: 'sanctum-discord-log/v1',
    tags: ['agent-access'],
    channel: channelName,
    channel_id: channelId,
    messages: [],
  };

  if (!temp && fs.existsSync(targetFile)) {
    try {
      logData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      // Asegurar que channel_id esté presente en logs antiguos
      logData.channel_id = channelId;
    } catch {
      console.warn(`[Sync Warning] Log corrupto para #${channelName}, reescribiendo.`);
    }
  }

  // Para temp: siempre partir de lista vacía con los últimos 100
  if (temp) {
    logData.messages = newMessages
      .filter((msg: any) => !msg.content.startsWith('!'))
      .map((msg: any) => ({
        id: msg.id,
        author: msg.author.username,
        timestamp: msg.createdAt.toISOString(),
        content: msg.content,
      }));
  } else {
    for (const msg of newMessages) {
      if (msg.content.startsWith('!')) continue;
      logData.messages.push({
        id: msg.id,
        author: msg.author.username,
        timestamp: msg.createdAt.toISOString(),
        content: msg.content,
      });
    }
  }

  fs.writeFileSync(targetFile, JSON.stringify(logData, null, 2), 'utf8');

  if (!temp && newMessages.length > 0) {
    const lastId = newMessages[newMessages.length - 1].id;
    writeMeta(channelId, { lastMessageId: lastId, lastSyncAt: new Date().toISOString() });
    console.log(`[Sync] ✓ ${newMessages.length} msgs guardados. Cursor: ${lastId}`);
  } else if (!temp) {
    // Sin mensajes nuevos pero actualizamos lastSyncAt
    const meta = readMeta(channelId);
    writeMeta(channelId, {
      lastMessageId: meta?.lastMessageId ?? '',
      lastSyncAt: new Date().toISOString(),
    });
    console.log(`[Sync] ✓ Sin mensajes nuevos en #${channelName}.`);
  } else {
    console.log(`[Sync] ✓ Temp log creado con ${logData.messages.length} msgs para #${channelName}.`);
  }

  return targetFile;
}

/**
 * Limpia el log temporal de un canal después de que el agente corre.
 */
function clearTempLog(channelId: string): void {
  const tempFile = logFilePath(channelId, true);
  if (fs.existsSync(tempFile)) {
    try {
      fs.unlinkSync(tempFile);
      console.log(`[Cleanup] Temp log borrado: ${path.basename(tempFile)}`);
    } catch (e) {
      console.warn(`[Cleanup Warning] No se pudo borrar temp log:`, e);
    }
  }
}

// ─── Sync periódico (cada 1 hora) ────────────────────────────────────────────

async function runPeriodicSync(client: Client, guildId: string): Promise<void> {
  console.log('[PeriodicSync] Iniciando sync de todos los canales de texto...');
  try {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();

    let synced = 0;
    for (const [, ch] of channels) {
      if (!ch || !ch.isTextBased() || ch.isDMBased()) continue;
      try {
        await syncChannel(ch as TextChannel);
        synced++;
      } catch (e) {
        console.warn(`[PeriodicSync] Error sincronizando #${(ch as TextChannel).name}:`, e);
      }
    }
    console.log(`[PeriodicSync] ✓ ${synced} canales sincronizados.`);
  } catch (e) {
    console.error('[PeriodicSync] Error general:', e);
  }
}

function startPeriodicSync(client: Client, guildId: string): void {
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hora

  // Sync inicial al arrancar
  runPeriodicSync(client, guildId);

  setInterval(() => {
    runPeriodicSync(client, guildId);
  }, INTERVAL_MS);

  console.log('[PeriodicSync] Programado cada 1 hora.');
}

// ─── AgentRunner (programático) ───────────────────────────────────────────────

async function runAgent(parameters: Record<string, unknown>): Promise<void> {
  // Importación programática — mismo proceso, sin spawn
  const { AgentRunner } = await import('../../agent-runtime/src/AgentRunner.js');
  const runner = new AgentRunner();

  await runner.run({
    agentPath: AGENT_PATH,
    vaultPath: VAULT_DIR,
    parameters,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    console.error('ERROR: DISCORD_TOKEN y DISCORD_GUILD_ID deben estar definidos en .env');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => {
    console.log('=================================================');
    console.log('SANCTUM BOT DAEMON - ESCUCHANDO COMANDOS');
    console.log(`Bot: ${client.user?.tag}`);
    console.log(`Servidor: ${guildId}`);
    console.log('Comandos: !sync, !resumen');
    console.log('=================================================');

    // Arrancar sync periódico
    startPeriodicSync(client, guildId!);
  });

  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith('!')) return;

    const command = content.split(' ')[0].toLowerCase();
    const channel = message.channel as TextChannel;

    // ── !sync ─────────────────────────────────────────────────────────────────
    if (command === '!sync') {
      try {
        await message.react('⏳');
        await syncChannel(channel);
        await message.react('✅');
        await message.reply(`Sincronización de **#${channel.name}** completada.`);
      } catch (err) {
        console.error('[!sync] Error:', err);
        await message.react('❌');
        await message.reply(`Error al sincronizar: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }

    // ── !resumen ──────────────────────────────────────────────────────────────
    if (command === '!resumen') {
      // Mensaje temporal de progreso
      const progressMsg = await message.reply('⏳ Recopilando contexto y generando resumen...');
      let usedTemp = false;

      try {
        if (!fs.existsSync(AGENT_PATH)) {
          throw new Error(`Agente no encontrado en: ${AGENT_PATH}`);
        }

        // 1. ¿El sync es fresco (< 5 min)?
        if (isSyncFresh(channel.id)) {
          console.log(`[!resumen] Sync fresco para #${channel.name} — reutilizando log existente.`);
        } else {
          console.log(`[!resumen] Sync stale para #${channel.name} — creando temp log.`);
          await syncChannel(channel, true); // escribe {channel_id}.temp.json
          usedTemp = true;
        }

        // 2. Invocar AgentRunner programáticamente
        await runAgent({
          channel_id: channel.id,
          channel_name: channel.name,
          triggered_by: message.author.username,
          use_temp: usedTemp,
        });

        // 3. Limpiar temp log si fue creado
        if (usedTemp) clearTempLog(channel.id);

        // 4. Editar mensaje temporal (el agente ya envió el resumen via discord_send)
        await progressMsg.edit('✅ Resumen generado.');
      } catch (err) {
        console.error('[!resumen] Error:', err);
        if (usedTemp) clearTempLog(channel.id);
        await progressMsg.edit(`❌ Error al generar resumen: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }
  });

  await client.login(token);
}

main();
