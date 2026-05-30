import { MarkdownPostProcessor, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting, App, editorLivePreviewField } from 'obsidian';
import { Decoration, DecorationSet, EditorView, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

interface BlurPluginSettings {
	revealOnHover: boolean;
}

const DEFAULT_SETTINGS: BlurPluginSettings = {
	revealOnHover: false
};

type BlurType = 'blur' | 'brick' | 'bone';

class BlurWidget extends WidgetType {
	constructor(
		readonly content: string,
		readonly type: BlurType
	) {
		super();
	}

	toDOM(): HTMLElement {
		const span = createSpan({ cls: `blur-widget blur-widget-${this.type}` });
		const code = span.createEl('code', { cls: this.getCssClass() });
		code.setText(this.type === 'brick' ? this.content.replace(/[^\s]/g, '█') : this.content);
		return span;
	}

	private getCssClass(): string {
		switch (this.type) {
			case 'blur': return 'blur-inline';
			case 'brick': return 'blur-brick';
			case 'bone': return 'blur-bone';
		}
	}

	eq(other: BlurWidget): boolean {
		return other.content === this.content && other.type === this.type;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

const BLUR_REGEXP = /(`~\{.*?\}`|`~\[.*?\]`|`~\(.*?\)`)/gm;

const viewPlugin = ViewPlugin.fromClass(class {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		this.decorations = this.buildDecorations(update.view);
	}

	destroy() { }

	buildDecorations(view: EditorView): DecorationSet {
		if (!view.state.field(editorLivePreviewField)) {
			return Decoration.none;
		}
		const builder = new RangeSetBuilder<Decoration>();
		let lines: number[] = [];
		if (view.state.doc.length > 0) {
			lines = Array.from(
				{ length: view.state.doc.lines },
				(_, i) => i + 1,
			);
		}

		const currentSelections = [...view.state.selection.ranges];

		for (const n of lines) {
			const line = view.state.doc.line(n);
			const matches = Array.from(line.text.matchAll(BLUR_REGEXP));
			for (const match of matches) {
				let add = true;
				const from = match.index != undefined ? match.index + line.from : -1;
				const to = from + match[0].length;
				if (to - from < 5) {
					add = false;
				}
				currentSelections.forEach((r) => {
					if (r.to >= from && r.from <= to) {
						add = false;
					}
				});
				if (add) {
					const text = match[0];
					let type: BlurType;
					let content: string;
					if (text.startsWith('`~{') && text.endsWith('}`')) {
						type = 'blur';
						content = text.slice(3, -2);
					} else if (text.startsWith('`~[') && text.endsWith(']`')) {
						type = 'brick';
						content = text.slice(3, -2);
					} else {
						type = 'bone';
						content = text.slice(3, -2);
					}
					builder.add(from, to, Decoration.replace({ widget: new BlurWidget(content, type), inclusive: true }));
				}
			}
		}
		return builder.finish();
	}
}, {
	decorations: (v) => v.decorations,
});

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
		this.registerEditorExtension(viewPlugin);
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