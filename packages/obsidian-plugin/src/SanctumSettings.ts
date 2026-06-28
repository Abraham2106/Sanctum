import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import type SanctumPlugin from '../main';

export interface SanctumSettings {
  runtimePath: string;
  vaultPath: string;
}

export const DEFAULT_SETTINGS: SanctumSettings = {
  runtimePath: '',
  vaultPath: ''
};

export class SanctumSettingsTab extends PluginSettingTab {
  plugin: SanctumPlugin;

  constructor(app: App, plugin: SanctumPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Sanctum — Configuración' });

    new Setting(containerEl)
      .setName('Ruta del Agent Runtime')
      .setDesc('Ruta absoluta a la carpeta packages/agent-runtime del proyecto Sanctum. Ej: C:\\Users\\yo\\Sanctum\\packages\\agent-runtime')
      .addText(text => text
        .setPlaceholder('C:\\ruta\\al\\proyecto\\Sanctum\\packages\\agent-runtime')
        .setValue(this.plugin.settings.runtimePath)
        .onChange(async (value) => {
          this.plugin.settings.runtimePath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Ruta del Vault de Sanctum')
      .setDesc('Ruta absoluta a la carpeta vault/ del proyecto Sanctum (donde están los agentes reales). Ej: C:\\Users\\yo\\Sanctum\\vault')
      .addText(text => text
        .setPlaceholder('C:\\ruta\\al\\proyecto\\Sanctum\\vault')
        .setValue(this.plugin.settings.vaultPath)
        .onChange(async (value) => {
          this.plugin.settings.vaultPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    // Botón para autodetectar basándonos en el vault activo
    new Setting(containerEl)
      .setName('Autodetectar rutas')
      .setDesc('Intenta detectar las rutas automáticamente asumiendo que el vault de Obsidian está dentro del proyecto Sanctum.')
      .addButton(btn => btn
        .setButtonText('Autodetectar')
        .onClick(async () => {
          // @ts-ignore
          const obsidianVaultPath: string = this.app.vault.adapter.getBasePath();
          // Intentamos subir niveles para encontrar el proyecto Sanctum
          const path = require('path');
          const fs = require('fs');

          // Buscar packages/agent-runtime subiendo hasta 3 niveles
          let found = false;
          for (let i = 1; i <= 4; i++) {
            const parts = Array(i).fill('..');
            const candidate = path.resolve(obsidianVaultPath, ...parts);
            const runtimeCandidate = path.join(candidate, 'packages', 'agent-runtime');
            const vaultCandidate = path.join(candidate, 'vault');
            if (fs.existsSync(runtimeCandidate) && fs.existsSync(vaultCandidate)) {
              this.plugin.settings.runtimePath = runtimeCandidate;
              this.plugin.settings.vaultPath = vaultCandidate;
              await this.plugin.saveSettings();
              this.display(); // Refrescar la vista
              found = true;
              break;
            }
          }

          if (!found) {
            // Si no encontramos, dejar los campos para que el usuario los rellene manualmente
            const { Notice } = require('obsidian');
            new Notice('No se pudo autodetectar. Por favor ingresa las rutas manualmente.');
          } else {
            const { Notice } = require('obsidian');
            new Notice('Rutas detectadas correctamente.');
          }
        })
      );
  }
}
