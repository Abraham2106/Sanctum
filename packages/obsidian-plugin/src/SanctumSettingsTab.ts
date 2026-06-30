import { App, PluginSettingTab, Setting } from 'obsidian';
import type SanctumAgentsPlugin from '../main';

export class SanctumSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: SanctumAgentsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Sanctum Agents' });

    new Setting(containerEl)
      .setName('Gemini Proxy URL')
      .setDesc('URL of the Gemini Proxy Balancer (OpenAI-compatible endpoint)')
      .addText(text => text
        .setPlaceholder('http://localhost:8080/v1')
        .setValue(this.plugin.settings.geminiProxyUrl)
        .onChange(async value => {
          this.plugin.settings.geminiProxyUrl = value;
          await this.plugin.saveSettings();
          this.plugin.updateRuntime();
        }));

    new Setting(containerEl)
      .setName('MCP Server Command')
      .setDesc('Command to start the GitHub MCP server')
      .addText(text => text
        .setPlaceholder('npx @modelcontextprotocol/server-github')
        .setValue(this.plugin.settings.mcpCommand)
        .onChange(async value => {
          this.plugin.settings.mcpCommand = value;
          await this.plugin.saveSettings();
          this.plugin.updateRuntime();
        }));

    new Setting(containerEl)
      .setName('GitHub Token')
      .setDesc('GitHub personal access token with repo scope')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('ghp_...').setValue(this.plugin.settings.mcpGithubToken)
          .onChange(async value => {
            this.plugin.settings.mcpGithubToken = value;
            await this.plugin.saveSettings();
            this.plugin.updateRuntime();
          });
      });

    new Setting(containerEl)
      .setName('Auto-Tag Notes')
      .setDesc('Automatically extract topic tags when agents create new notes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTag)
        .onChange(async value => {
          this.plugin.settings.autoTag = value;
          await this.plugin.saveSettings();
          this.plugin.updateRuntime();
        }));

    new Setting(containerEl)
      .setName('Max Topics per Note')
      .setDesc('How many topic tags to extract per note (1-10)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.maxTopicsPerNote)
        .setDynamicTooltip()
        .onChange(async value => {
          this.plugin.settings.maxTopicsPerNote = value;
          await this.plugin.saveSettings();
          this.plugin.updateRuntime();
        }));
  }
}
