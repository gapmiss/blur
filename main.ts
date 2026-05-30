import { MarkdownPostProcessor, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting, App } from 'obsidian';

interface BlurPluginSettings {
	revealOnHover: boolean;
}

const DEFAULT_SETTINGS: BlurPluginSettings = {
	revealOnHover: false
};

export default class BlurPlugin extends Plugin {
	settings: BlurPluginSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BlurSettingTab(this.app, this));
		this.applyHoverClass();
		this.registerMarkdownCodeBlockProcessor("blur", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-brick", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-bone", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownPostProcessor(
			buildPostProcessor()
		);
	}

	onunload(): void {
		activeDocument.body.removeClass('obsidian-blur-hover');
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BlurPluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	applyHoverClass(): void {
		activeDocument.body.toggleClass('obsidian-blur-hover', this.settings.revealOnHover);
	}

	blurBlockHandler(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
		if (el.className==='block-language-blur-brick') {
			const block = el.createDiv({cls: "blur-brick-block"});
			const inputElement = block.createDiv({cls: "blur-brick-innerblock"});
			source.split(/\W+/).forEach((w:string) => {
				const word = w.trim();
				if (word !== '') {
					inputElement.appendChild(createEl('code', {text: word.replace(/[^\s]/g, '█'), cls: "blur-brick" }));
				}
			})
    }
    else if (el.className==='block-language-blur-bone') {
      const block = el.createDiv({cls: "blur-bone-block"});
      const inputElement = block.createDiv({cls: "blur-bone-innerblock"});
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          inputElement.appendChild(createEl('code', {text: word, cls: "blur-bone"})); 
        }
      })
    }
    else if (el.className==='block-language-blur') {
      const block = el.createDiv({cls: "blur-block"});
      const inputElement = block.createDiv({cls: "blur-innerblock"});
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          inputElement.appendChild(createEl('code', {text: word, cls: "blur-inline"})); 
        }
      })
    }
	}
}

export function buildPostProcessor(): MarkdownPostProcessor {
	return (el) => {
		el.findAll("code").forEach((code) => {
			const text = code.innerText.trim();
			if (text.startsWith('~[') && text.endsWith(']')) {
				const content = text.slice(2, -1);
				code.addClass('blur-brick');
				code.innerText = content.replace(/[^\s]/g, '█');
			}
			else if (text.startsWith("~(") && text.endsWith(')')) {
				const content = text.slice(2, -1);
				code.addClass('blur-bone');
				code.innerText = content;
			}
			else if (text.startsWith('~{') && text.endsWith('}')) {
				const content = text.slice(2, -1);
				code.addClass('blur-inline');
				code.innerText = content;
			}
		});
	};
}

class BlurSettingTab extends PluginSettingTab {
	plugin: BlurPlugin;

	constructor(app: App, plugin: BlurPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Reveal on hover')
			.setDesc('Reveal obfuscated text when hovering with the mouse')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.revealOnHover)
				.onChange(async (value) => {
					this.plugin.settings.revealOnHover = value;
					await this.plugin.saveSettings();
					this.plugin.applyHoverClass();
				}));
	}
}