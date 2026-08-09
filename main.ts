import { MarkdownPostProcessor, MarkdownPostProcessorContext, Plugin, PluginSettingTab, App, editorLivePreviewField, SettingDefinition } from 'obsidian';
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
		// Only four things change which decorations are needed: edited text, a
		// moved cursor (a match under the selection is shown as raw source), a
		// scrolled viewport, and toggling live preview. Rebuilding on every
		// update rescanned the document on each keystroke.
		const livePreviewChanged =
			update.state.field(editorLivePreviewField) !== update.startState.field(editorLivePreviewField);
		if (update.docChanged || update.selectionSet || update.viewportChanged || livePreviewChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() { }

	buildDecorations(view: EditorView): DecorationSet {
		if (!view.state.field(editorLivePreviewField)) {
			return Decoration.none;
		}
		const builder = new RangeSetBuilder<Decoration>();
		const currentSelections = [...view.state.selection.ranges];

		// Only the visible lines, not every line in the document.
		// visibleRanges is sorted and non-overlapping, which is the order
		// RangeSetBuilder requires.
		for (const range of view.visibleRanges) {
			const firstLine = view.state.doc.lineAt(range.from).number;
			const lastLine = view.state.doc.lineAt(range.to).number;

			for (let n = firstLine; n <= lastLine; n++) {
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
		// A window opened later starts without the class, so apply it there too.
		this.registerEvent(this.app.workspace.on('window-open', (_leaf, win) => {
			if (this.settings.revealOnHover) {
				win.document.body.addClass('obsidian-blur-hover');
			}
		}));
		this.registerMarkdownCodeBlockProcessor("blur", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-brick", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-bone", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownPostProcessor(
			buildPostProcessor()
		);
		this.registerEditorExtension(viewPlugin);
	}

	onunload(): void {
		for (const doc of this.getDocuments()) {
			doc.body.removeClass('obsidian-blur-hover');
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BlurPluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Every document the workspace occupies: the main window plus any popouts. */
	private getDocuments(): Document[] {
		const docs = new Set<Document>([this.app.workspace.containerEl.ownerDocument]);
		this.app.workspace.iterateAllLeaves((leaf) => {
			docs.add(leaf.view.containerEl.ownerDocument);
		});
		return Array.from(docs);
	}

	applyHoverClass(): void {
		// A popout window has its own document. Setting the class on the main
		// window's body only meant reveal on hover silently did nothing in any
		// note moved to a separate window.
		for (const doc of this.getDocuments()) {
			if (this.settings.revealOnHover) {
				doc.body.addClass('obsidian-blur-hover');
			} else {
				doc.body.removeClass('obsidian-blur-hover');
			}
		}
	}

	/**
	 * Render one <code> per whitespace-separated token, wrapping each source
	 * line in its own div.
	 *
	 * The tokens were previously produced by source.split(/\W+/), which splits
	 * on every non-word character and therefore discarded every apostrophe,
	 * hyphen, colon and bracket in the source. "Don't tell: 555-1234" came back
	 * as five bare words, so revealing the text showed something the user never
	 * wrote. Splitting on /\s+/ keeps punctuation attached to its token.
	 */
	private renderBlock(el: HTMLElement, blockCls: string, innerCls: string, codeCls: string, source: string, brick: boolean): void {
		const block = el.createDiv({ cls: blockCls });
		const inputElement = block.createDiv({ cls: innerCls });

		for (const line of source.replace(/\n$/, '').split('\n')) {
			const lineEl = inputElement.createDiv({ cls: 'blur-block-line' });
			for (const token of line.split(/\s+/)) {
				if (token === '') continue;
				lineEl.createEl('code', { text: brick ? token.replace(/[^\s]/g, '█') : token, cls: codeCls });
			}
		}
	}

	blurBlockHandler(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
		if (el.className === 'block-language-blur-brick') {
			this.renderBlock(el, 'blur-brick-block', 'blur-brick-innerblock', 'blur-brick', source, true);
		}
		else if (el.className === 'block-language-blur-bone') {
			this.renderBlock(el, 'blur-bone-block', 'blur-bone-innerblock', 'blur-bone', source, false);
		}
		else if (el.className === 'block-language-blur') {
			this.renderBlock(el, 'blur-block', 'blur-innerblock', 'blur-inline', source, false);
		}
	}
}

export function buildPostProcessor(): MarkdownPostProcessor {
	return (el) => {
		el.findAll("code").forEach((code) => {
			// findAll matches the <code> inside every fenced code block too, not
			// just inline code. Without this, a fenced block whose whole content
			// is ~{example} — documenting this plugin's own syntax, say — gets
			// rewritten as blurred text instead of shown as code.
			if (code.parentElement?.tagName === 'PRE') return;

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

	getSettingDefinitions(): SettingDefinition[] {
		return [
			{
				name: 'Reveal on hover',
				desc: 'Reveal obfuscated text when hovering with the mouse.',
				render: (setting) => {
					setting.addToggle(toggle => toggle
						.setValue(this.plugin.settings.revealOnHover)
						.onChange(async (value) => {
							this.plugin.settings.revealOnHover = value;
							await this.plugin.saveSettings();
							this.plugin.applyHoverClass();
						}));
				},
			},
		];
	}
}