
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleType } from './types';
import { StyleSelector } from './components/StyleSelector';
import { Button } from './components/Button';
import { formatText, planArticleImages, generateImage, generateImageDescription } from './services/geminiService';

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

  // Refs for auto-scrolling
  const previewRef = useRef<HTMLDivElement>(null);

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
    try {
      const html = await formatText(inputText, selectedStyle);
      // Ensure Tech Magazine style uses an OUTERMOST grid wrapper that WeChat preserves
      if (selectedStyle === StyleType.TECH_MAG) {
        const trimmed = html.trimStart();
        const startsWithGridWrapper = /^<section[^>]*repeating-linear-gradient\(/.test(trimmed);
        const ensured = startsWithGridWrapper
          ? trimmed
          : `<section style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: rgb(229, 229, 229); color: rgb(10, 10, 10); font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; text-indent: 0px; text-transform: none; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial; text-align: left; line-height: 1.75; font-family: 'PingFang SC', -apple-system-font, BlinkMacSystemFont, 'Helvetica Neue', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif; font-size: 15px; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px) rgba(0, 0, 0, 0.02); border-radius: 12px; padding: 8px; visibility: visible;">${trimmed}</section>`;
        setFormattedHtml(ensured);
      } else if (selectedStyle === StyleType.LITERARY) {
        // Ensure Literary style uses a soft paper-like background wrapper
        const trimmed = html.trimStart();
        const startsWithSoftWrapper = /^<section[^>]*background-color:\s*#fdfbf7/i.test(trimmed) || /^<section[^>]*background:\s*#fdfbf7/i.test(trimmed);
        const ensured = startsWithSoftWrapper
          ? trimmed
          : `<section style="box-sizing: border-box; border-width: 1px; border-style: solid; border-color: #e6e6e6; color: #2c2c2c; font-style: normal; font-weight: 400; letter-spacing: normal; text-indent: 0; text-transform: none; word-spacing: 0; -webkit-text-stroke-width: 0; white-space: normal; text-align: justify; line-height: 2.0; font-family: 'Kaiti SC','STKaiti', serif; font-size: 17px; background-color: #fdfbf7; padding: 20px;">${trimmed}</section>`;
        setFormattedHtml(ensured);
      } else {
        setFormattedHtml(html);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsFormatting(false);
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
          // Detect outer grid wrapper
          const match = trimmed.match(/^<section[^>]*repeating-linear-gradient\([^>]*\)>/);
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
      // Ensure the HTML is a single root element (already ensured for Tech Mag)
      const htmlBlob = new Blob([formattedHtml], { type: 'text/html' });
      const textBlob = new Blob([toPlainText(formattedHtml)], { type: 'text/plain' });
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
      temp.innerHTML = formattedHtml;

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

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans text-ink-900 bg-paper-50">

      {/* Left Panel: Input */}
      <div className="w-full md:w-5/12 p-6 flex flex-col border-r border-gray-200 bg-white z-20 shadow-xl h-screen overflow-y-auto">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-serif font-bold text-ink-900 mb-1 tracking-tight">
              MuseFlow Typesetter
            </h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest">
              AI 驱动的公众号排版引擎
            </p>
          </div>
          {/* 移除在线更换 Key 的入口，改为仅通过服务器端环境变量配置 */}
        </header>

        {/* Input Area */}
        <div className="flex-1 flex flex-col min-h-[200px] mb-6">
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">文章正文</label>
          <textarea
            className="flex-1 w-full p-4 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-ink-900 focus:border-transparent outline-none transition-all bg-gray-50 font-serif text-base leading-relaxed placeholder-gray-400 shadow-inner"
            placeholder="粘贴您的文章内容到这里..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>
        {/* Secondary Actions (可选功能保持在左侧) */}
        {enableImageFeatures && (
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="secondary" 
              onClick={handleGenerateCover} 
              isLoading={isGeneratingCover}
              disabled={!inputText}
              className="text-xs"
            >
              AI 生成封面
            </Button>

            <Button 
              variant="secondary" 
              onClick={handleSmartIllustration} 
              isLoading={isGeneratingIllustration}
              disabled={!formattedHtml}
              className="text-xs"
            >
              智能分析配图
            </Button>
          </div>
        )}
      </div>

      {/* Middle Panel: Style Picker */}
      <div className="w-full md:w-3/12 p-6 bg-white h-screen overflow-y-auto border-r border-gray-200">
        <div className="sticky top-0 bg-white pb-4 z-10">
          <h3 className="text-sm font-bold text-gray-700">选择一个风格</h3>
        </div>
        <div className="pt-2">
          <StyleSelector selected={selectedStyle} onSelect={setSelectedStyle} />
        </div>
      </div>

      {/* Right Panel: Preview */}
      <div className="w-full md:w-4/12 bg-[#f5f5f7] flex flex-col h-screen overflow-hidden relative">
        <div className="h-14 border-b border-gray-200 bg-white flex justify-between items-center px-4 md:px-6 shadow-sm z-10 shrink-0">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            实时预览
          </h2>
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleFormat} 
              isLoading={isFormatting}
              className="!py-1.5 !px-4 !text-xs bg-ink-900 hover:bg-black text-white rounded-full"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>}
            >
              一键排版
            </Button>
            <Button 
              variant="primary"
              onClick={handleCopyToWeChat}
              disabled={!formattedHtml}
              className="!py-1.5 !px-4 !text-xs bg-green-600 hover:bg-green-700 border-none rounded-full"
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>}
            >
              复制到公众号
            </Button>
          </div>
        </div>

        {/* Preview Container - Designed to mimic mobile phone width */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
          {formattedHtml ? (
             <div className="w-full max-w-[450px] bg-white min-h-[800px] h-fit shadow-2xl relative animate-in fade-in duration-500">
               {/* This div mimics the WeChat webview container */}
               <div 
                  ref={previewRef}
                  style={{
                    padding: '20px 16px 40px 16px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
                    color: '#333',
                    // Apply tech-mag grid background when that style is selected
                    ...(selectedStyle === StyleType.TECH_MAG
                      ? {
                          background:
                            'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px) rgba(0, 0, 0, 0.02)',
                          borderRadius: '12px',
                        }
                      : { backgroundColor: '#fff' }),
                  }}
                  dangerouslySetInnerHTML={{ __html: formattedHtml }}
               />
             </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 h-full w-full max-w-md border-2 border-dashed border-gray-300 rounded-xl m-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
              </div>
              <p className="text-sm font-medium">输入文章并选择风格开始排版</p>
              <p className="text-xs mt-2 opacity-60">点击右上角一键排版，支持复制到公众号</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
