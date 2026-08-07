import type { ThemeEditorContext } from "@voyant-travel/theme";

const BRIDGE_ID = "voyant-editor-bridge";

/** Platform-owned client bridge. It sends no context or DOM content. */
export function themeEditorBridgeScript(config: ThemeEditorContext): string {
  const origin = JSON.stringify(config.editorOrigin).replaceAll("<", "\\u003c");
  return `<script id="${BRIDGE_ID}">(()=>{const origin=${origin};if(window.parent===window)return;const START="\u2063\u2062",END="\u2064",ZERO="\u200b",ONE="\u200c";let ready=false,pointers=new WeakMap();const elements=new Map();const pointerOf=value=>{const at=value.lastIndexOf(START);if(at<0||!value.endsWith(END))return null;const encoded=value.slice(at+START.length,-END.length);if(encoded.length%8)return null;const bytes=new Uint8Array(encoded.length/8);for(let i=0;i<encoded.length;i+=8){let byte=0;for(let bit=0;bit<8;bit++){const c=encoded[i+bit];if(c!==ZERO&&c!==ONE)return null;byte=(byte<<1)|(c===ONE?1:0)}bytes[i/8]=byte}try{const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));return data&&typeof data.p==="string"&&data.p.startsWith("/")?data.p:null}catch{return null}};const scan=()=>{elements.clear();pointers=new WeakMap();const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const pointer=pointerOf(node.nodeValue||"");const parent=node.parentElement;if(pointer&&parent){pointers.set(parent,pointer);if(!elements.has(pointer))elements.set(pointer,parent)}}};const post=data=>{try{window.parent.postMessage(data,origin)}catch{}};addEventListener("message",event=>{if(event.origin!==origin||event.source!==window.parent||!event.data||typeof event.data!=="object")return;const data=event.data;if(data.type==="voyant:edit:ready"){ready=true;scan();return}if(!ready||typeof data.pointer!=="string"||!data.pointer.startsWith("/"))return;if(data.type==="voyant:edit:select"){scan();elements.get(data.pointer)?.scrollIntoView({behavior:"smooth",block:"center"});return}if(data.type==="voyant:edit:settings"&&data.settings&&typeof data.settings==="object"&&!Array.isArray(data.settings)){dispatchEvent(new CustomEvent("voyant:edit:settings",{detail:{pointer:data.pointer,settings:data.settings}}))}});document.addEventListener("click",event=>{if(!ready)return;scan();let element=event.target instanceof Element?event.target:null;while(element){const pointer=pointers.get(element);if(pointer){event.preventDefault();event.stopPropagation();post({type:"voyant:edit:select",pointer});return}element=element.parentElement}},true);post({type:"voyant:edit:load"})})();</script>`;
}

export function injectThemeEditorBridge(
  html: string,
  config: ThemeEditorContext | null,
): string {
  if (!config || html.includes(`id="${BRIDGE_ID}"`)) return html;
  const close = /<\/body\s*>/i.exec(html);
  if (!close) return html;
  const script = themeEditorBridgeScript(config);
  return `${html.slice(0, close.index)}${script}${html.slice(close.index)}`;
}
