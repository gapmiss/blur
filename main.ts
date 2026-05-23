import { MarkdownPostProcessor, MarkdownPostProcessorContext, Plugin } from 'obsidian';

export default class BlurPlugin extends Plugin {

  onload(): void {
		this.registerMarkdownCodeBlockProcessor("blur", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-brick", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor("blur-bone", (source, el, ctx) => this.blurBlockHandler(source, el, ctx));
		this.registerMarkdownPostProcessor(
			buildPostProcessor()
		);
	}

  blurBlockHandler(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    if (el.className==='block-language-blur-brick') {
      const block = el.createDiv({cls: "blur-brick-block"});
      const inputElement = block.createDiv({cls: "blur-brick-innerblock"});
      source.split(/\W+/).forEach((w:string) => {
        let word = w.trim();
        if (word !== '') {
          //redact w/ char '█'  &block; █
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