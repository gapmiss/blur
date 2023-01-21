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
    if (el.className==='block-language-blur-brick') {
      const block = el.createEl("div", {cls: "blur-brick-block"})
      let inputElement: HTMLElement
      inputElement = block.createEl("div", {text: '', cls: "blur-brick-innerblock"})
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          //redact w/ char '█'  &block; █
          inputElement.appendChild(createEl('code', {text: word.replace(/[^\s]/g, '█'), cls: "blur-brick" })); 
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
      inputElement = block.createEl("div", {text: '', cls: "blur-innerblock"})
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
      let text = code.innerText.trim();
      if (text.startsWith('~[') && text.endsWith(']')) {
        let part = text.substring(1);
        let content = part.substring(part.length-1,1);
        code.addClass('blur-brick');
        //redact w/ char '█'  &block; █
        code.innerText=content.replace(/[^\s]/g, '█');
      }
      else if (text.startsWith("~(") && text.endsWith(')')) {
        let part = text.substring(1);
        let content = part.substring(part.length-1,1);
        code.addClass('blur-bone');
        code.innerText=content;
      }
      else if (text.startsWith('~{') && text.endsWith('}')) {
        let part = text.substring(1);
        let content = part.substring(part.length-1,1);
        code.addClass('blur-inline');
        code.innerText=content;
      }
    })
  }
}