
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleType } from './types';
import { StyleSelector } from './components/StyleSelector';
import { Button } from './components/Button';
import { formatText, planArticleImages, generateImage, generateImageDescription } from './services/geminiService';
import { imageStore } from './utils/imageStore';
import { compressImage } from './utils/imageCompressor';

const App: React.FC = () => {
  const enableImageFeatures = (import.meta as any)?.env?.VITE_ENABLE_IMAGE_GEN === 'true';
  const [inputText, setInputText] = useState<string>('');
  const [formattedHtml, setFormattedHtml] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleType>(StyleType.MODERN_WECHAT);
  const [hasApiKey, setHasApiKey] = useState(false);
  
  // Loading states
  const [isFormatting, setIsFormatting] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isGeneratingIllustration, setIsGeneratingIllustration] = useState(false);
  // Progress state for formatting
  const [progressActive, setProgressActive] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState<string>('');

  // Refs for auto-scrolling
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const progressTimerRef = useRef<number | null>(null);
  const progressStartRef = useRef<number>(0);
  const progressDurationRef = useRef<number>(35000);
  // Short URL token mapping for remote/base64 images pasted as HTML
  const urlShortMapRef = useRef<Map<string, string>>(new Map()); // shortKey -> url
  const urlToShortRef = useRef<Map<string, string>>(new Map());  // url -> shortKey
  const urlShortCounterRef = useRef<number>(1);
  const shortToLocalIdRef = useRef<Map<string, string>>(new Map()); // shortKey -> local image id

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } else {
        // Fallback for environments without the wrapper
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleConnectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success if no error, re-check
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } catch (e) {
        console.error("Failed to select key", e);
        alert("API Key 选择失败，请重试");
      }
    } else {
      alert("当前环境不支持在线更换 Key，请检查环境变量配置。");
    }
  };

  const handleApiError = (error: any) => {
    console.error(error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("403") || /permission/i.test(msg)) {
      alert(
        "调用 API 失败（403/权限）。\n\n请检查：\n1) 服务器端是否已设置 EVOLINK_API_KEY 并重新部署；\n2) Key 是否有效、权限/配额是否足够；\n\n错误详情：" + msg
      );
    } else {
      alert("操作失败: " + msg);
    }
  };

  // Handlers
  const handleFormat = async () => {
    if (!inputText.trim()) return;
    setIsFormatting(true);
    startFormattingProgress(45000);
    try {
      // 0) 清理从 Word/Office 粘贴可能混入的 CSS/样式声明等噪音
      const cleaned = cleanWordArtifactsInPlainText(inputText);
      // 在发送给模型前：
      // 1) 将本地图片占位 {{IMG:...}} 统一规范为 [[IMAGE:...]]，减少模型误删概率
      // 2) 将长的 {{IMGURL:...}} 统一压缩为 [[URL:n]]，并记录映射
      const normalized = normalizeImgTokensInText(cleaned);
      const { compressedText } = compressImgUrlTokensInText(normalized);
      const html = await formatText(compressedText, selectedStyle);
      // Ensure Tech Magazine style uses an OUTERMOST grid wrapper (WeChat-safe linear-gradient)
      if (selectedStyle === StyleType.TECH_MAG) {
        const trimmed = html.trimStart();
        const startsWithTechWrapper = /^<section[^>]*?(?:background-image\s*:\s*linear-gradient\(|background\s*:[^>]*linear-gradient\(|background-color\s*:\s*#?f7f7f7)[^>]*>/i.test(trimmed);
        const ensured = startsWithTechWrapper
          ? trimmed
          : `<section style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: rgb(229, 229, 229); color: rgb(10, 10, 10); font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; text-align: left; line-height: 1.85; font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif; font-size: 15px; background-color: #F7F7F7; background-image: linear-gradient(0deg, #E7E7E7 1px, transparent 1px), linear-gradient(90deg, #E7E7E7 1px, transparent 1px); background-size: 24px 24px; background-repeat: repeat; border-radius: 12px; padding: 12px; visibility: visible;">${trimmed}</section>`;
        setFormattedHtml(await replaceImagePlaceholders(ensured, selectedStyle));
      } else if (selectedStyle === StyleType.LITERARY) {
        // Ensure Literary style uses a soft paper-like background wrapper
        const trimmed = html.trimStart();
        const startsWithSoftWrapper = /^<section[^>]*background-color:\s*#fdfbf7/i.test(trimmed) || /^<section[^>]*background:\s*#fdfbf7/i.test(trimmed);
        const ensured = startsWithSoftWrapper
          ? trimmed
          : `<section style="box-sizing: border-box; border-width: 1px; border-style: solid; border-color: #e6e6e6; color: #2c2c2c; font-style: normal; font-weight: 400; letter-spacing: normal; text-indent: 0; text-transform: none; word-spacing: 0; -webkit-text-stroke-width: 0; white-space: normal; text-align: justify; line-height: 2.0; font-family: 'Kaiti SC','STKaiti', serif; font-size: 17px; background-color: #fdfbf7; padding: 20px;">${trimmed}</section>`;
        setFormattedHtml(await replaceImagePlaceholders(ensured, selectedStyle));
      } else if (selectedStyle === StyleType.CLAUDE) {
        // Apply huasheng's Claude background color (#faf9f7) as an outer wrapper to persist in WeChat
        const trimmed = html.trimStart();
        const startsWithClaudeBg = /^<section[^>]*background-color:\s*#faf9f7/i.test(trimmed) || /^<section[^>]*background:\s*#faf9f7/i.test(trimmed);
        const ensured = startsWithClaudeBg
          ? trimmed
          : `<section style="box-sizing: border-box; color: #24292f; line-height: 1.75; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif; font-size: 16px; background-color: #faf9f7; padding: 20px 16px;">${trimmed}</section>`;
        setFormattedHtml(await replaceImagePlaceholders(ensured, selectedStyle));
      } else {
        let out = await replaceImagePlaceholders(html, selectedStyle);
        if (selectedStyle === StyleType.ZEN) {
          out = ensureZenDecorGif(out);
        }
        setFormattedHtml(out);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsFormatting(false);
      completeFormattingProgress();
    }
  };

  const handleGenerateCover = async () => {
    if (!inputText.trim()) {
      alert("请先输入文章内容");
      return;
    }
    setIsGeneratingCover(true);
    try {
      // 1. Get a specific prompt for the cover
      const desc = await generateImageDescription(inputText, 'cover');
      
      // 2. Generate using Gemini 3 Pro (Nano Banana) with 16:9 for covers
      const base64Image = await generateImage(desc + ", high quality, artistic, masterpiece", '16:9');
      
      // 3. Insert cover at the top
      const imgTag = `<section style="margin-bottom: 24px;"><img src="${base64Image}" style="display: block; width: 100%; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);" alt="Cover" /></section>`;

      // In Tech Magazine style, ensure the cover is inserted INSIDE the grid wrapper
      setFormattedHtml(prev => {
        const current = prev || '';
        if (selectedStyle === StyleType.TECH_MAG) {
          const trimmed = current.trimStart();
          // Detect outer tech wrapper with grid background
          const match = trimmed.match(/^<section[^>]*?(?:background-image\s*:\s*linear-gradient\(|background\s*:[^>]*linear-gradient\(|background-color\s*:\s*#?f7f7f7)[^>]*>/i);
          if (match) {
            const openTagEnd = match[0].length; // position right after '>' of opening tag
            // If first child is already a cover section, replace it; else insert after opening wrapper
            const afterOpen = trimmed.slice(openTagEnd);
            if (afterOpen.startsWith('<section style="margin-bottom: 24px;"><img')) {
              const firstClose = afterOpen.indexOf('</section>');
              if (firstClose !== -1) {
                return trimmed.slice(0, openTagEnd) + imgTag + afterOpen.slice(firstClose + 10);
              }
            }
            return trimmed.slice(0, openTagEnd) + imgTag + afterOpen;
          }
          // If no wrapper found (edge), prepend as before
        }
        // Non-tech-mag or no wrapper: if first child is cover, replace; else prepend
        if (current.startsWith('<section style="margin-bottom: 24px;"><img')) {
          return imgTag + current.substring(current.indexOf('</section>') + 10);
        }
        return imgTag + current;
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleSmartIllustration = async () => {
    if (!formattedHtml || !inputText.trim()) {
      alert("请先输入内容并进行排版");
      return;
    }
    setIsGeneratingIllustration(true);
    try {
      // 1. Analyze text and plan images
      const plan = await planArticleImages(inputText);
      console.log("Image Plan:", plan);

      let newHtml = formattedHtml;

      // 2. Generate and Insert each image
      for (const imgPlan of plan.images) {
        // Construct a full prompt with the art style
        const fullPrompt = `${imgPlan.prompt}. Art Style: ${plan.artStyle}. Aspect Ratio 4:3. High resolution, detailed.`;
        
        try {
            const base64 = await generateImage(fullPrompt, '4:3');
            const imgTag = `<section style="margin: 30px 0; text-align: center;"><img src="${base64}" style="width: 100%; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);" alt="Illustration" /><section style="font-size: 12px; color: #999; margin-top: 6px;">AI配图: ${imgPlan.prompt.substring(0, 10)}...</section></section>`;

            // 3. Find insertion point
            if (newHtml.includes(imgPlan.positionKeyword)) {
                // Find the closing </section> tag AFTER the keyword
                const keywordIndex = newHtml.indexOf(imgPlan.positionKeyword);
                const insertionIndex = newHtml.indexOf('</section>', keywordIndex);
                
                if (insertionIndex !== -1) {
                    newHtml = newHtml.slice(0, insertionIndex + 10) + imgTag + newHtml.slice(insertionIndex + 10);
                }
            } else {
                console.warn("Keyword not found, skipping specific placement:", imgPlan.positionKeyword);
            }
        } catch (e) {
            console.error("Failed to generate single image", e);
        }
      }
      
      setFormattedHtml(newHtml);
      alert(`已根据文章调性生成 ${plan.images.length} 张配图并插入文章中。`);

    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGeneratingIllustration(false);
    }
  };

  const handleCopyToWeChat = useCallback(async () => {
    if (!formattedHtml) return;

    // Prefer modern Clipboard API to preserve 'text/html' payload like huasheng project
    const toPlainText = (html: string) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      return (d.textContent || d.innerText || '').trim();
    };

    try {
      const htmlForCopy = await inlineImagesAsBase64(formattedHtml);
      // Ensure the HTML is a single root element (already ensured for Tech Mag)
      const htmlBlob = new Blob([htmlForCopy], { type: 'text/html' });
      const textBlob = new Blob([toPlainText(htmlForCopy)], { type: 'text/plain' });
      const item = new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob });
      await (navigator as any).clipboard.write([item]);
      alert('已复制！请直接粘贴到公众号后台。');
      return;
    } catch (e) {
      // Fallback to execCommand with hidden editable node
      const temp = document.createElement('div');
      temp.setAttribute('contenteditable', 'true');
      temp.style.position = 'fixed';
      temp.style.left = '-99999px';
      temp.style.top = '-99999px';
      temp.style.opacity = '0';
      temp.style.pointerEvents = 'none';
      document.body.appendChild(temp);
      temp.innerHTML = await inlineImagesAsBase64(formattedHtml);

      const range = document.createRange();
      const firstEl = temp.firstElementChild as HTMLElement | null;
      if (firstEl) range.selectNode(firstEl); else range.selectNodeContents(temp);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        try { document.execCommand('copy'); alert('已复制！请直接粘贴到公众号后台。'); }
        catch { alert('复制失败，请尝试手动全选复制。'); }
        selection.removeAllRanges();
      }
      document.body.removeChild(temp);
    }
  }, [formattedHtml]);

  // Paste & Drop Handlers for images
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) {
          // Accept all file items; we'll validate type later
          files.push(f);
        }
      }
    }
    const html = e.clipboardData?.getData('text/html');
    const plain = e.clipboardData?.getData('text/plain') || '';

    // Unified path: if HTML exists, convert it, optionally consuming image files for Word's file:/blob: images
    if (html && html.trim()) {
      e.preventDefault();
      const textWithTokens = await htmlToTextWithImgTokensAsync(html, files);
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? inputText.length;
      const end = ta?.selectionEnd ?? inputText.length;
      const before = inputText.slice(0, start);
      const after = inputText.slice(end);
      const next = before + textWithTokens + after;
      setInputText(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = before.length + textWithTokens.length;
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos;
        }
      });
      return;
    }

    // No HTML — try to parse markdown-like image syntax from plain text (Word/WPS often yields '![](<file://...>)')
    const hasMdImage = /!\[[^\]]*\]\([^\)]+\)/.test(plain || '');
    if (hasMdImage) {
      e.preventDefault();
      const textWithTokens = await plainTextToTokensAsync(plain, files);
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? inputText.length;
      const end = ta?.selectionEnd ?? inputText.length;
      const before = inputText.slice(0, start);
      const after = inputText.slice(end);
      const next = before + textWithTokens + after;
      setInputText(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = before.length + textWithTokens.length;
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos;
        }
      });
      return;
    }

    // No HTML and no markdown images — if we have image files, insert tokens; otherwise let default paste of plain text occur
    if (files.length > 0) {
      e.preventDefault();
      await insertImagesAsTokens(files);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    const files: File[] = [];
    if (dt?.files && dt.files.length) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i];
        if (f.type.startsWith('image/')) files.push(f);
      }
    }
    if (files.length === 0) return;
    await insertImagesAsTokens(files);
  };

  async function insertImagesAsTokens(files: File[]) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? inputText.length;
    const end = ta?.selectionEnd ?? inputText.length;
    let before = inputText.slice(0, start);
    const after = inputText.slice(end);
    for (const file of files) {
      try {
        const { blob, width, height, mimeType, originalSize, compressedSize } = await compressImage(file);
        const id = generateImageId();
        await imageStore.saveImage({
          id,
          name: file.name || 'image',
          mimeType,
          width,
          height,
          originalSize,
          compressedSize,
          createdAt: Date.now(),
        }, blob);
        // Create a local object URL for short placeholder mapping
        const objectUrl = URL.createObjectURL(blob);
        const shortKey = getOrAssignShortUrl(objectUrl);
        // Remember this shortKey maps to a local image id so we can inline later
        if (shortKey) shortToLocalIdRef.current.set(shortKey, id);
        // Insert short URL token in the editor
        const token = shortKey ? `\n[[URL:${shortKey}]]\n` : '';
        before += token;
      } catch (err) {
        console.error('Failed to handle image', err);
      }
    }
    const next = before + after;
    setInputText(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length;
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos;
      }
    });
  }

  function cleanWordArtifactsInPlainText(text: string): string {
    if (!text) return text;
    let out = text;
    // Remove common MS Word html/css fragments accidentally pasted as text
    out = out.replace(/@font-face\s*\{[\s\S]*?\}\s*/gi, '');
    out = out.replace(/@page[^\{]*\{[\s\S]*?\}\s*/gi, '');
    out = out.replace(/@list[^\{]*\{[\s\S]*?\}\s*/gi, '');
    // Any CSS block whose selector contains 'Mso'
    out = out.replace(/(^|\n)[^{\n]*Mso[^\{]*\{[\s\S]*?\}\s*/gi, '$1');
    // Section page mapping
    out = out.replace(/div\.Section\d+\s*\{[\s\S]*?\}\s*/gi, '');
    // Drop stray mso-* declarations left as plaintext
    out = out.replace(/mso-[^:;\n]+:[^;\n]+;?/gi, '');
    return out;
  }

  function normalizeImgTokensInText(text: string): string {
    if (!text) return text;
    // {{IMG:...}} -> [[IMAGE:...]]
    return text.replace(/\{\{\s*IMG\s*:\s*([^}]+)\}\}/gi, (_s, id) => {
      const v = String(id || '').trim();
      return v ? `[[IMAGE:${v}]]` : '';
    });
  }

  function generateImageId() {
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function insertImageUrlsAsTokens(urls: string[]) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? inputText.length;
    const end = ta?.selectionEnd ?? inputText.length;
    const before = inputText.slice(0, start);
    const after = inputText.slice(end);
    const tokens = urls.map(u => {
      const sid = getOrAssignShortUrl(u);
      return sid ? `\n[[URL:${sid}]]\n` : '';
    }).join('');
    const next = before + tokens + after;
    setInputText(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + tokens.length;
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos;
      }
    });
  }

  function getOrAssignShortUrl(url: string): string {
    const u = (url || '').trim();
    if (!u) return '';
    const existed = urlToShortRef.current.get(u);
    if (existed) return existed;
    const id = String(urlShortCounterRef.current++);
    urlToShortRef.current.set(u, id);
    urlShortMapRef.current.set(id, u);
    return id;
  }

  function createUnresolvedShortKey(): string {
    const id = String(urlShortCounterRef.current++);
    // Do not register urlToShort mapping; map id -> '' so renderer knows it's unresolved
    urlShortMapRef.current.set(id, '');
    return id;
  }

  function htmlToTextWithImgTokens(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;
    // Strip Word/Office HEAD payload aggressively
    for (const el of Array.from(container.querySelectorAll('style,script,meta,link,title,head'))) el.remove();

    const blocks = new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','TABLE','THEAD','TBODY','TR','TD','TH','HR','BR']);
    const skipTags = new Set(['STYLE','SCRIPT','META','LINK','TITLE','HEAD','OBJECT','EMBED','IFRAME','NOSCRIPT']);
    let out = '';

    const walk = (node: Node) => {
      // Ignore comments
      if (node.nodeType === Node.COMMENT_NODE) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').replace(/[\t\r]+/g, ' ');
        out += text;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName;
      // Skip Office/Word noise: <style> et al, and namespaced tags like <o:p>
      if (skipTags.has(tag)) return;
      if (tag.includes(':')) return; // e.g., O:P, V:*, W:*

      if (tag === 'IMG') {
        let src = (el.getAttribute('src') || '').trim();
        const dataSrc = (el.getAttribute('data-src') || '').trim();
        // WeChat often sets a 1x1 svg to src and the real url in data-src
        if ((!src || /^data:image\/svg\+xml/i.test(src)) && dataSrc) src = dataSrc;
        if (src) {
          const sid = getOrAssignShortUrl(src);
          if (sid) out += `\n[[URL:${sid}]]\n`;
        }
        return;
      }
      if (tag === 'BR' || tag === 'HR') {
        out += '\n';
        return;
      }
      if (tag === 'LI') {
        out += '\n- ';
      }
      // Word uses <p class="MsoListParagraph"> with bullet characters; treat as list-like
      if (tag === 'P') {
        const cls = (el.getAttribute('class') || '');
        const style = (el.getAttribute('style') || '');
        if (/MsoListParagraph/i.test(cls) || /mso-list/i.test(style)) {
          if (!out.endsWith('\n')) out += '\n';
          out += '- ';
        }
      }
      // Enter block: ensure newline separation
      if (blocks.has(tag)) {
        if (!out.endsWith('\n')) out += '\n';
      }
      for (const child of Array.from(el.childNodes)) walk(child);
      if (blocks.has(tag)) {
        if (!out.endsWith('\n')) out += '\n';
      }
    };
    for (const child of Array.from(container.childNodes)) walk(child);
    // Normalize newlines and spaces; strip leading Word CSS like @font-face that might have slipped through
    out = out.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    // Remove any stray @font-face or @page declarations if they ended up as text
    out = out.replace(/@font-face\s*\{[\s\S]*?\}/gi, '')
             .replace(/@page[^\n]*;?/gi, '')
             .replace(/mso-[^:]+:[^;\n]+;?/gi, '');
    return out.trim();
  }

  // Async variant that can consume pasted File images to replace Word's blob:/file: refs at the right positions
  async function htmlToTextWithImgTokensAsync(html: string, pastedFiles: File[] = []): Promise<string> {
    const container = document.createElement('div');
    container.innerHTML = html;
    for (const el of Array.from(container.querySelectorAll('style,script,meta,link,title,head'))) el.remove();

    const blocks = new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','TABLE','THEAD','TBODY','TR','TD','TH','HR','BR']);
    const skipTags = new Set(['STYLE','SCRIPT','META','LINK','TITLE','HEAD','OBJECT','EMBED','IFRAME','NOSCRIPT']);
    let out = '';
    const fileQueue = [...pastedFiles];

    const handleLocalImageFile = async (file: File): Promise<string> => {
      try {
        let blob: Blob;
        let width = 0, height = 0;
        let mimeType = file.type || '';
        let originalSize = file.size;
        let compressedSize = file.size;

        if (mimeType && mimeType.startsWith('image/')) {
          const res = await compressImage(file);
          blob = res.blob; width = res.width; height = res.height; mimeType = res.mimeType; originalSize = res.originalSize; compressedSize = res.compressedSize;
        } else {
          // Unknown type: store original bytes and use objectURL; browsers可以嗅探类型
          blob = file;
        }

        const id = generateImageId();
        await imageStore.saveImage({ id, name: file.name || 'image', mimeType: mimeType || 'application/octet-stream', width, height, originalSize, compressedSize, createdAt: Date.now() }, blob);
        const objectUrl = URL.createObjectURL(blob);
        const shortKey = getOrAssignShortUrl(objectUrl);
        if (shortKey) shortToLocalIdRef.current.set(shortKey, id);
        return shortKey ? `\n[[URL:${shortKey}]]\n` : '';
      } catch (e) {
        console.error('Failed to process pasted image file', e);
        return '';
      }
    };

    const appendImgBySrc = async (src: string) => {
      if (!src) return;
      if (/^data:/i.test(src) || /^https?:/i.test(src)) {
        const sid = getOrAssignShortUrl(src);
        if (sid) out += `\n[[URL:${sid}]]\n`;
        return;
      }
      if (/^(blob:|file:)/i.test(src)) {
        if (fileQueue.length) {
          out += await handleLocalImageFile(fileQueue.shift() as File);
        } else {
          // No file bytes available; still create an unresolved token to keep position
          const sid = createUnresolvedShortKey();
          out += `\n[[URL:${sid}]]\n`;
        }
        return;
      }
      // Relative or cid: references from Word/Outlook → try consuming a file; else create unresolved
      if (/^(cid:|data:)/i.test(src) === false && !/^\w+:/.test(src)) {
        if (fileQueue.length) {
          out += await handleLocalImageFile(fileQueue.shift() as File);
        } else {
          const sid = createUnresolvedShortKey();
          out += `\n[[URL:${sid}]]\n`;
        }
        return;
      }
      // otherwise ignore (non-loadable scheme)
    };

    const walk = async (node: Node) => {
      if (node.nodeType === Node.COMMENT_NODE) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').replace(/[\t\r]+/g, ' ');
        out += text;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (skipTags.has(tag)) return;
      // VML image: <v:imagedata src="..." o:href="..."/>
      if (tag.includes(':')) {
        const lower = tag.toLowerCase();
        if (lower.endsWith(':imagedata')) {
          const src = (el.getAttribute('src') || el.getAttribute('o:href') || '').trim();
          await appendImgBySrc(src);
          return;
        }
        return;
      }

      if (tag === 'IMG') {
        let src = (el.getAttribute('src') || '').trim();
        const dataSrc = (el.getAttribute('data-src') || '').trim();
        if ((!src || /^data:image\/svg\+xml/i.test(src)) && dataSrc) src = dataSrc;
        await appendImgBySrc(src);
        return;
      }
      if (tag === 'BR' || tag === 'HR') {
        out += '\n';
        return;
      }
      if (tag === 'LI') out += '\n- ';
      if (tag === 'P') {
        const cls = (el.getAttribute('class') || '');
        const style = (el.getAttribute('style') || '');
        if (/MsoListParagraph/i.test(cls) || /mso-list/i.test(style)) {
          if (!out.endsWith('\n')) out += '\n';
          out += '- ';
        }
      }
      if (blocks.has(tag)) { if (!out.endsWith('\n')) out += '\n'; }
      for (const child of Array.from(el.childNodes)) await walk(child);
      if (blocks.has(tag)) { if (!out.endsWith('\n')) out += '\n'; }
    };
    for (const child of Array.from(container.childNodes)) await walk(child);
    out = out.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
             .replace(/@font-face\s*\{[\s\S]*?\}/gi, '')
             .replace(/@page[^\n]*;?/gi, '')
             .replace(/mso-[^:]+:[^;\n]+;?/gi, '');
    return out.trim();
  }

  async function plainTextToTokensAsync(text: string, pastedFiles: File[] = []): Promise<string> {
    const fileQueue = [...pastedFiles];
    const parts: string[] = [];
    let last = 0;
    const re = /!\[[^\]]*\]\(([^\)]+)\)/g; // markdown image

    const handleLocalImageFile = async (file: File): Promise<string> => {
      try {
        let blob: Blob = file;
        let width = 0, height = 0;
        let mimeType = file.type || '';
        let originalSize = file.size;
        let compressedSize = file.size;
        if (mimeType && mimeType.startsWith('image/')) {
          const res = await compressImage(file);
          blob = res.blob; width = res.width; height = res.height; mimeType = res.mimeType; originalSize = res.originalSize; compressedSize = res.compressedSize;
        }
        const id = generateImageId();
        await imageStore.saveImage({ id, name: file.name || 'image', mimeType: mimeType || 'application/octet-stream', width, height, originalSize, compressedSize, createdAt: Date.now() }, blob);
        const objectUrl = URL.createObjectURL(blob);
        const shortKey = getOrAssignShortUrl(objectUrl);
        if (shortKey) shortToLocalIdRef.current.set(shortKey, id);
        return `[[URL:${shortKey}]]`;
      } catch (e) {
        console.error('Failed to process file from plain text', e);
        return `[[URL:${createUnresolvedShortKey()}]]`;
      }
    };

    const appendForSrc = async (src: string): Promise<string> => {
      const s = src.trim();
      // local id scheme
      const m = s.match(/^img:\/\/(img-[a-z0-9\-]+)/i);
      if (m) return `[[IMAGE:${m[1]}]]`;
      if (/^data:/i.test(s) || /^https?:/i.test(s)) {
        return `[[URL:${getOrAssignShortUrl(s)}]]`;
      }
      if (/^(blob:|file:)/i.test(s) || !/^\w+:/.test(s)) {
        if (fileQueue.length) return await handleLocalImageFile(fileQueue.shift() as File);
        return `[[URL:${createUnresolvedShortKey()}]]`;
      }
      return '';
    };

    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      parts.push(text.slice(last, m.index));
      const token = await appendForSrc(m[1]);
      parts.push(token);
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.join('');
  }

  async function replaceImagePlaceholders(html: string, style: StyleType): Promise<string> {
    // 0) Normalize common model quirks first
    let pre = html;
    //    a) Any <img ... [[IMAGE:...]] ...> → [[IMAGE:...]]
    pre = pre.replace(/<img[^>]*?(\[\[\s*image\s*:\s*([^\]]+?)\s*\]\])[^>]*?>/gi, (_s, _wholeToken, gid) => `[[IMAGE:${gid}]]`);
    //    b) Any <img ... {{IMG:...}} ...> → {{IMG:...}}
    pre = pre.replace(/<img[^>]*?(\{\{\s*img\s*:\s*([^}]+?)\s*\}\})[^>]*?>/gi, (_s, wholeToken) => wholeToken);
    //    c) Any <img ... {{IMGURL:...}} ...> → {{IMGURL:...}}
    pre = pre.replace(/<img[^>]*?(\{\{\s*imgurl\s*:\s*([^}]+?)\s*\}\})[^>]*?>/gi, (_s, wholeToken) => wholeToken);
    //    d) Any <img ... [[URL:...]] ...> → [[URL:...]]
    pre = pre.replace(/<img[^>]*?(\[\[\s*url\s*:\s*([^\]]+?)\s*\]\])[^>]*?>/gi, (_s, wholeToken) => wholeToken);
    //    d) Remove artefacts like "[image 1024x768 PNG]"
    pre = pre.replace(/\[\s*image[^\]]*\]/gi, '');
    //    e) Remove empty-src <img> outright to avoid broken icons
    pre = pre.replace(/<img\b[^>]*?\bsrc\s*=\s*["']\s*["'][^>]*>/gi, '');

    // 1) Collect tokens with tolerant, case-insensitive patterns and optional spaces
    const ids = new Set<string>();
    const urlTokens: Array<string> = [];
    const re1 = /\[\[\s*image\s*:\s*([^\]]+?)\s*\]\]/gi;      // [[IMAGE:id]] tolerant
    const re2 = /\{\{\s*img\s*:\s*([^}]+?)\s*\}\}/gi;           // {{IMG:id}}
    const reUrl = /\{\{\s*imgurl\s*:\s*([^}]+?)\s*\}\}/gi;      // {{IMGURL:url}}
    const reShortUrl = /\[\[\s*url\s*:\s*([^\]]+?)\s*\]\]/gi;  // [[URL:n]]
    let m: RegExpExecArray | null;
    while ((m = re1.exec(pre))) ids.add((m[1] || '').trim());
    while ((m = re2.exec(pre))) ids.add((m[1] || '').trim());
    while ((m = reUrl.exec(pre))) urlTokens.push((m[1] || '').trim());
    // Collect short-url occurrences and resolve to actual URL
    const shortUrlTokens: Array<{ key: string; url: string }> = [];
    while ((m = reShortUrl.exec(pre))) {
      const key = (m[1] || '').trim();
      if (!key) continue;
      const real = urlShortMapRef.current.get(key);
      if (real) shortUrlTokens.push({ key, url: real });
    }

    // 1.5) Fast path: if nothing to do, still strip dangling attribute tails and incomplete endings
    if (ids.size === 0 && urlTokens.length === 0 && shortUrlTokens.length === 0) {
      let fast = stripDanglingAttributeTails(pre);
      fast = dropTrailingIncompleteTokens(fast);
      // Also sanitize empty/broken <img> via DOM
      fast = sanitizeImageHtml(fast);
      return fast;
    }

    // 2) Resolve local image ids to object URLs
    const urlMap = new Map<string, string>();
    for (const id of ids) {
      try {
        const blob = await imageStore.getImageBlob(id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          urlMap.set(id, url);
        }
      } catch (e) {
        console.warn('No image for id', id);
      }
    }

    const buildBlock = (id: string) => {
      const src = urlMap.get(id) || '';
      return imageBlockForStyle(style, id, src, null);
    };

    // 3) Replace tokens to styled blocks
    let out = pre;
    out = out.replace(re1, (_s, gid) => buildBlock((gid || '').trim()))
             .replace(re2, (_s, gid) => buildBlock((gid || '').trim()))
             .replace(reUrl, (_s, gurl) => imageBlockForStyle(style, null, (gurl || '').trim(), (gurl || '').trim()))
             .replace(reShortUrl, (_s, key) => {
               const k = (key || '').trim();
               const real = urlShortMapRef.current.get(k) || '';
               const localId = shortToLocalIdRef.current.get(k) || null;
               return imageBlockForStyle(style, localId, real, real || null);
             });

    // 4) Strip dangling attribute text tails like:  src="" style="..." alt="image"/>
    out = stripDanglingAttributeTails(out);

    // 5) Drop trailing incomplete tokens/tags produced by truncation
    out = dropTrailingIncompleteTokens(out);

    // 6) DOM sanitize: remove any remaining empty-src <img>, normalize
    out = sanitizeImageHtml(out);

    return out;
  }

  function compressImgUrlTokensInText(text: string): { compressedText: string } {
    if (!text) return { compressedText: text };
    const re = /\{\{\s*IMGURL\s*:\s*([^}]+)\}\}/gi;
    let out = text.replace(re, (_s, url) => {
      const u = String(url || '').trim();
      if (!u) return '';
      const sid = getOrAssignShortUrl(u);
      return sid ? `[[URL:${sid}]]` : '';
    });
    return { compressedText: out };
  }

  function stripDanglingAttributeTails(s: string): string {
    // Remove common attribute tail leftovers that appear as plain text after replacing <img ...[[IMAGE]]...>
    // Examples to remove:  ' src="" style="..." alt="image"/>'  or  ' src=""/>'  or variant spacing
    let out = s.replace(/[\s\u00A0]src\s*=\s*(["'])\s*\1[^<>]*\/>/gi, '');
    // Also remove bare attribute chains not necessarily ending with '/>' (very conservative)
    out = out.replace(/[\s\u00A0]src\s*=\s*(["'])\s*\1[^<>]*(?=$)/gi, '');
    return out;
  }

  function dropTrailingIncompleteTokens(s: string): string {
    let out = s;
    // Cut off trailing incomplete [[IMAGE: ...
    out = out.replace(/\[\[\s*image\s*:[^\]]*$/i, '');
    // Cut off trailing incomplete {{IMG: ... or {{IMGURL:
    out = out.replace(/\{\{\s*img(?:url)?\s*:[^}]*$/i, '');
    // Cut off trailing incomplete <img...
    out = out.replace(/<img[^>]*$/i, '');
    return out;
  }

  function sanitizeImageHtml(html: string): string {
    try {
      const container = document.createElement('div');
      container.innerHTML = html;
      const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      for (const img of imgs) {
        const src = (img.getAttribute('src') || '').trim();
        // Remove images with empty or placeholder-like src
        if (!src || src === 'about:blank' || /^\[\[\s*image\s*:/i.test(src) || /^\{\{\s*img/i.test(src)) {
          img.remove();
          continue;
        }
        // Also drop clearly broken data URLs with just prefix
        if (/^data:\s*$/i.test(src)) {
          img.remove();
        }
      }
      return container.innerHTML;
    } catch {
      return html;
    }
  }

  function imageBlockForStyle(style: StyleType, id: string | null, src: string, remoteUrl: string | null) {
    // Base styles
    const baseImg = 'width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px; display: block;';
    const baseWrap = 'margin: 20px 0; text-align: center;';
    let extraWrap = '';
    let extraImg = '';
    switch (style) {
      case StyleType.TECH_MAG:
        extraImg = 'box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-radius: 6px;';
        break;
      case StyleType.CLAUDE:
        extraImg = 'box-shadow: 0 8px 32px rgba(193,95,60,0.12); border-radius: 12px;';
        break;
      case StyleType.ZEN:
        extraImg = 'border-radius: 0; box-shadow: none;';
        break;
      case StyleType.LITERARY:
        extraWrap = 'padding: 6px; border: 1px solid #e6e6e6; border-radius: 6px; background: #fff;';
        break;
      default:
        extraImg = 'box-shadow: 0 2px 8px rgba(0,0,0,0.06);';
    }
    const attrs: string[] = [];
    if (id) attrs.push(`data-image-id=\"${id}\"`);
    if (remoteUrl) attrs.push(`data-image-url=\"${remoteUrl}\"`);
    if (!src) {
      // Avoid broken-image icon if we didn't resolve a src
      return `<section style="${baseWrap} ${extraWrap}"><section style="font-size:12px;color:#9aa0a6;">[图片未找到]</section></section>`;
    }
    return `<section style="${baseWrap} ${extraWrap}"><img ${attrs.join(' ')} src="${src}" style="${baseImg} ${extraImg}" alt="image"/></section>`;
  }

  function ensureZenDecorGif(html: string): string {
    const DECOR_URL = 'https://mmbiz.qpic.cn/mmbiz_gif/Lz789qfThgsibMHR1vh2lNxtrwwvkKgx8Rz9icxpg2iauzJKzbSh5QHbj2ghXCIzxVOv4WWibADeEnUkRvcaWkdjNQ/640?wx_fmt=gif';
    try {
      const container = document.createElement('div');
      container.innerHTML = html;
      const wrappers = Array.from(container.querySelectorAll('section,h2,h3')) as HTMLElement[];
      for (const wrap of wrappers) {
        const style = (wrap.getAttribute('style') || '').toLowerCase();
        if (!/text-align\s*:\s*center/.test(style)) continue;
        // Heuristic: a bold 16px span inside indicates Zen subtitle
        const span = wrap.querySelector('span[style*="font-size: 16px" i]') as HTMLElement | null;
        if (!span) continue;
        const s2 = (span.getAttribute('style') || '').toLowerCase();
        if (!/font-weight/.test(s2)) continue;
        // Skip if already has our decor
        const hasDecor = wrap.querySelector('img[data-zen-decor="1"]') || wrap.querySelector('svg');
        if (hasDecor) continue;
        const img = document.createElement('img');
        img.setAttribute('data-zen-decor', '1');
        img.setAttribute('alt', '');
        img.setAttribute('src', DECOR_URL);
        img.setAttribute('data-image-url', DECOR_URL);
        img.setAttribute('style', 'width: 88px; height: auto; display: inline-block;');
        // Insert at start
        if (wrap.firstChild) wrap.insertBefore(img, wrap.firstChild);
        else wrap.appendChild(img);
        // Add a line break after the image if not present
        const br = document.createElement('br');
        wrap.insertBefore(br, img.nextSibling);
      }
      return container.innerHTML;
    } catch {
      return html;
    }
  }

  async function inlineImagesAsBase64(html: string): Promise<string> {
    // Parse and replace <img data-image-id>
    const container = document.createElement('div');
    container.innerHTML = html;
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    for (const img of imgs) {
      const id = img.getAttribute('data-image-id');
      const remote = img.getAttribute('data-image-url');
      try {
        if (id) {
          const blob = await imageStore.getImageBlob(id);
          if (blob) {
            const b64 = await blobToDataURL(blob);
            img.setAttribute('src', b64);
            continue;
          }
        }
        if (remote) {
          const b64 = await fetchToBase64(remote);
          if (b64) img.setAttribute('src', b64);
        }
      } catch (e) {
        console.warn('inline base64 failed for', id || remote || 'unknown', e);
      }
    }
    return container.innerHTML;
  }

  function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  async function fetchToBase64(url: string): Promise<string | null> {
    try {
      if (/^data:/i.test(url)) {
        // Already a data URI
        return url;
      }
      const res = await fetch(url, { mode: 'cors', cache: 'default' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToDataURL(blob);
    } catch {
      return null;
    }
  }

  // --- Formatting progress helpers ---
  function startFormattingProgress(durationMs: number) {
    // Clear previous
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressStartRef.current = Date.now();
    progressDurationRef.current = durationMs;
    setProgressActive(true);
    setProgressPercent(0);
    setProgressLabel('正在理解文章内容…');

    progressTimerRef.current = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - progressStartRef.current;
      const d = progressDurationRef.current;
      const t = Math.max(0, Math.min(1, elapsed / d));

      // Piecewise curve: fast start -> moderate -> slow after 90%
      // 0 - 40% time: 0% -> 70% (easeOut)
      // 40% - 80% time: 70% -> 90% (easeInOut)
      // 80% - 100% time: 90% -> 98% (easeIn, very slow)
      const easeOut = (x: number) => 1 - Math.pow(1 - x, 2);
      const easeInOut = (x: number) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      const easeIn = (x: number) => x * x;

      let target = 0;
      if (t <= 0.4) {
        target = 0 + 70 * easeOut(t / 0.4);
      } else if (t <= 0.8) {
        target = 70 + 20 * easeInOut((t - 0.4) / 0.4);
      } else {
        target = 90 + 8 * easeIn((t - 0.8) / 0.2);
      }

      // After expected duration, creep from ~98 -> 99 slowly
      if (elapsed > d) {
        const over = Math.min(1, (elapsed - d) / 5000); // 5s to gain +1%
        target = Math.min(99, target + over);
      }

      const targetInt = Math.floor(target);
      setProgressPercent((prev) => (targetInt > prev ? targetInt : prev));
      setProgressLabel(labelForTime(elapsed, d));
    }, 200);
  }

  function completeFormattingProgress() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgressPercent(100);
    setProgressLabel('完成排版');
    // small delay then hide
    setTimeout(() => {
      setProgressActive(false);
      setProgressPercent(0);
      setProgressLabel('');
    }, 800);
  }

  function labelForTime(elapsed: number, duration: number) {
    const r = Math.max(0, Math.min(1, elapsed / duration));
    if (r < 0.15) return '正在理解文章内容…';
    if (r < 0.35) return '正在分析文章结构…';
    if (r < 0.55) return '正在匹配风格模板…';
    if (r < 0.75) return '正在生成排版与段落…';
    if (r < 0.9)  return '正在插入图片与装饰…';
    return '正在优化细节…';
  }

  return (
    <div className="bg-[var(--background-primary,#f5f5f7)] text-[var(--text-charcoal,#333)] h-screen w-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border-color,#e5e7eb)] px-6 py-3 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div className="text-[var(--accent-color,#5c7c68)] w-6 h-6">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#c)"><path d="M8.58 8.58A23 23 0 0 0 2.61 19.75a23 23 0 0 0 1.24 12.6A23 23 0 0 0 24 45.81a23 23 0 0 0 12.12-3.68 23 23 0 0 0 8.03-9.78 23 23 0 0 0 1.24-12.6 23 23 0 0 0-5.97-11.17L24 24 8.58 8.58Z" fill="currentColor"/></g><defs><clipPath id="c"><path fill="#fff" d="M0 0h48v48H0z"/></clipPath></defs></svg>
          </div>
          <h1 className="text-lg font-bold tracking-tight">Museflow</h1>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Left: Input */}
        <section className="col-span-12 md:col-span-4 flex flex-col h-full bg-white rounded-xl border border-[var(--border-color,#e5e7eb)]">
          <div className="flex flex-col p-4 flex-1">
            <label className="flex flex-col flex-1 h-full">
              <p className="text-base font-medium pb-3">在此处粘贴您的文章内容...</p>
              <textarea
                className="form-input flex w-full flex-1 resize-none overflow-auto rounded-lg focus:outline-0 focus:ring-0 border border-[var(--border-color,#e5e7eb)] bg-[var(--background-primary,#f5f5f7)] focus:border-[var(--accent-color,#5c7c68)] placeholder:text-gray-400 p-4 text-base leading-relaxed custom-scrollbar"
                placeholder="开始你的创作之旅，将文字粘贴于此，让AI赋予它新的生命。"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                ref={textareaRef}
              />
            </label>
            <div className="flex items-center justify-between pt-3 text-sm text-gray-500">
              <span>字数: {inputText.length}</span>
              {enableImageFeatures && (
                <div className="hidden md:flex gap-2">
                  <Button variant="secondary" onClick={handleGenerateCover} isLoading={isGeneratingCover} disabled={!inputText} className="!h-8 !py-1 !px-3 !text-xs">AI 生成封面</Button>
                  <Button variant="secondary" onClick={handleSmartIllustration} isLoading={isGeneratingIllustration} disabled={!formattedHtml} className="!h-8 !py-1 !px-3 !text-xs">智能分析配图</Button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Middle: Style Picker */}
        <section className="col-span-12 md:col-span-3 flex flex-col h-full bg-white rounded-xl border border-[var(--border-color,#e5e7eb)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-color,#e5e7eb)]"><h3 className="text-lg font-bold">选择一个风格</h3></div>
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            <StyleSelector selected={selectedStyle} onSelect={setSelectedStyle} />
          </div>
          <div className="p-4 mt-auto">
            <Button onClick={handleFormat} isLoading={isFormatting} className="flex w-full h-12 !rounded-lg !bg-[var(--accent-color,#5c7c68)] hover:!bg-[var(--accent-color,#5c7c68)]/90 font-bold">
              一键AI排版
            </Button>
          </div>
        </section>

        {/* Right: Preview */}
        <section className="col-span-12 md:col-span-5 flex flex-col h-full bg-white rounded-xl border border-[var(--border-color,#e5e7eb)] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-color,#e5e7eb)]">
            <h3 className="text-lg font-bold">排版预览</h3>
            <Button
              variant="primary"
              onClick={handleCopyToWeChat}
              disabled={!formattedHtml}
              className="!h-10 !rounded-lg !bg-[var(--background-primary,#f5f5f7)] hover:!bg-[var(--border-color,#e5e7eb)] !text-[var(--text-charcoal,#333)] !text-sm"
            >
              复制到公众号
            </Button>
          </div>
          {progressActive && (
            <div className="px-4 py-2 bg-[var(--background-primary,#f5f5f7)] border-b border-[var(--border-color,#e5e7eb)]">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{progressLabel}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-[var(--accent-color,#5c7c68)] transition-all duration-200" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-6 bg-[var(--background-primary,#f5f5f7)] custom-scrollbar">
            {formattedHtml ? (
              <div className="w-full max-w-[680px] mx-auto bg-white rounded-xl shadow relative">
                <div
                  ref={previewRef}
                  style={{
                    padding: '20px 16px 40px 16px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
                    color: '#333',
                    ...(selectedStyle === StyleType.TECH_MAG
                      ? { backgroundColor: '#F7F7F7', backgroundImage: "linear-gradient(0deg, #E7E7E7 1px, transparent 1px), linear-gradient(90deg, #E7E7E7 1px, transparent 1px)", backgroundSize: '24px 24px', backgroundRepeat: 'repeat', borderRadius: '12px' }
                      : { backgroundColor: '#fff' }),
                  }}
                  dangerouslySetInnerHTML={{ __html: formattedHtml }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-500 h-full w-full max-w-md mx-auto">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6">
                  <svg className="w-12 h-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
                </div>
                <h4 className="text-xl font-bold mb-2">您的文章预览将在此呈现</h4>
                <p className="text-gray-400 max-w-xs text-center">在左侧输入内容，选择一种风格，然后点击“一键AI排版”开始创作。</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
