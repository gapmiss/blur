import { MarkdownPostProcessor, Plugin} from 'obsidian';

interface BlurPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: BlurPluginSettings = {
	mySetting: 'default'
}

enum ComponentChoice {
	Default = "Default",
}

export default class BlurPlugin extends Plugin {

  settings: BlurPluginSettings;

  async onload() {
		this.registerMarkdownCodeBlockProcessor("blur", this.blurBlockHandler.bind(this, null));
		this.registerMarkdownCodeBlockProcessor("blur-brick", this.blurBlockHandler.bind(this, null));
		this.registerMarkdownCodeBlockProcessor("blur-bone", this.blurBlockHandler.bind(this, null));
		this.registerMarkdownPostProcessor(
			buildPostProcessor()
		);
		console.log("%c Obsidian Blur Plugin loaded", 'color:lime;');
	}

  onunload() {
		console.log("%c Obsidian Blur Plugin unloaded", 'color:lime;');
	}

  async blurBlockHandler(type: ComponentChoice, source: string, el: HTMLElement, ctx: any): Promise<any> {
    const element:any = document.createRange().createContextualFragment(source)
    if (el.className==='block-language-blur-brick') {
      const block = el.createEl("div", {cls: "blur-brick-block"})
      let inputElement: HTMLElement
      inputElement = block.createEl("div", {text: '', cls: "blur-brick-innerblock"})
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          inputElement.appendChild(createEl('code', {text: word, cls: "blur-brick" })); 
        }
      })
    }
    else if (el.className==='block-language-blur-bone') {
      const block = el.createEl("div", {cls: "blur-bone-block"})
      let inputElement: HTMLElement
      inputElement = block.createEl("div", {text: '', cls: "blur-bone-innerblock"})
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          inputElement.appendChild(createEl('code', {text: word, cls: "blur-bone"})); 
        }
      })
    }
    else if (el.className==='block-language-blur') {
      const block = el.createEl("div", {cls: "blur-block"})
      let inputElement: HTMLElement
      inputElement = block.createEl("div", {text: source, cls: "blur-innerblock"})
    }
	}
}

export function buildPostProcessor(): MarkdownPostProcessor {
	return (el) => {
    el.findAll("code").forEach((code) => {
      let text = code.innerText.trim();
      if (text.startsWith('~[]')) {
        let blur = text.substring(3).trim();
        code.addClass('blur-brick');
        code.innerText=blur;
      }
      else if (text.startsWith('~{}')) {
        let blur = text.substring(3).trim();
          code.addClass('blur-inline');
          code.innerText=blur;
      }
      else if (text.startsWith("~()")) {
        let blur = text.substring(3).trim();
          code.addClass('blur-bone');
          code.innerText=blur;
      }
    })
  }
}