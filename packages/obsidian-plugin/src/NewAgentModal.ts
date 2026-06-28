import { Modal, App, Setting, TextComponent } from 'obsidian';

export class NewAgentModal extends Modal {
  private result: string = '';
  private onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: 'Create New Sanctum Agent' });

    const inputSetting = new Setting(contentEl)
      .setName('Agent Name')
      .setDesc('Enter the name of the new agent.')
      .addText(text => {
        text.onChange(value => {
          this.result = value;
        });
        // Enfocar el input al abrir
        setTimeout(() => text.inputEl.focus(), 50);
      });

    // Añadir listener para presionar Enter en el input
    inputSetting.controlEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.submit();
      }
    });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Create')
        .setCta()
        .onClick(() => {
          this.submit();
        }))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => {
          this.close();
        }));
  }

  submit() {
    this.close();
    this.onSubmit(this.result);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
