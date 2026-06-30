import { sendMessage } from "./executors/sendMessage.js";

export interface Notification {
  channelId: string;
  title: string;
  body: string;
  color?: number;
}

/**
 * Sends notifications to Discord when agents complete their tasks.
 * Used by the scheduler and mention watcher.
 */
export class Notifier {
  private discordToken: string;

  constructor() {
    this.discordToken = process.env.DISCORD_TOKEN ?? "";
  }

  async send(notification: Notification): Promise<void> {
    if (!this.discordToken) {
      console.warn("[Notifier] No DISCORD_TOKEN configured, skipping notification");
      return;
    }

    const content = this.formatMessage(notification);
    try {
      await sendMessage(this.discordToken, notification.channelId, content);
      console.log(`[Notifier] Notification sent to ${notification.channelId}`);
    } catch (err) {
      console.error("[Notifier] Failed to send:", err);
    }
  }

  private formatMessage(n: Notification): string {
    const lines: string[] = [];
    lines.push(`**${n.title}**`);
    lines.push("");
    lines.push(n.body);
    if (n.color !== undefined) {
      lines.push("");
      lines.push(`_color: #${n.color.toString(16).padStart(6, "0")}_`);
    }
    return lines.join("\n");
  }
}
