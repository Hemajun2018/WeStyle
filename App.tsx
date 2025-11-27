
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
    if (msg.includes("403") || msg.includes("Permission denied") || msg.includes("permission")) {
      if (window.confirm("调用 API 失败：权限被拒绝。\n\nGemini 3 Pro 等高级模型可能需要绑定了结算账户（Billing）的 API Key。\n\n是否重新选择/配置 API Key？")) {
        handleConnectKey();
      }
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
      setFormattedHtml(html);
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
      
      // If there is already a cover (first child is an img section), replace it, otherwise prepend
      setFormattedHtml(prev => {
        if (prev.startsWith('<section style="margin-bottom: 24px;"><img')) {
            // Very basic replacement heuristic
            return imgTag + prev.substring(prev.indexOf('</section>') + 10);
        }
        return imgTag + prev;
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

  const handleCopyToWeChat = useCallback(() => {
    if (!previewRef.current) return;
    
    const range = document.createRange();
    range.selectNode(previewRef.current);
    
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      
      try {
        document.execCommand('copy');
        alert("已复制！格式已针对公众号优化，请直接粘贴到公众号后台。");
      } catch (err) {
        alert("复制失败，请尝试手动全选复制。");
      }
      
      selection.removeAllRanges();
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans text-ink-900 bg-paper-50">
      
      {/* Left Panel: Input & Controls */}
      <div className="w-full md:w-5/12 lg:w-1/3 p-6 flex flex-col border-r border-gray-200 bg-white z-20 shadow-xl h-screen overflow-y-auto">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-serif font-bold text-ink-900 mb-1 tracking-tight">
              MuseFlow Typesetter
            </h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest">
              AI 驱动的公众号排版引擎
            </p>
          </div>
          {window.aistudio && (
            <button 
              onClick={handleConnectKey}
              className="text-xs text-gray-400 hover:text-ink-900 underline"
              title="更换 API Key"
            >
              更换 Key
            </button>
          )}
        </header>

        {/* Style Selection */}
        <div className="mb-6">
           <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">排版风格</label>
           <StyleSelector selected={selectedStyle} onSelect={setSelectedStyle} />
        </div>

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

        {/* Action Bar */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={handleFormat} 
            isLoading={isFormatting}
            className="col-span-2 py-3 bg-ink-900 hover:bg-black text-white"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>}
          >
            一键智能排版
          </Button>
          {enableImageFeatures && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Right Panel: Preview */}
      <div className="flex-1 bg-[#f5f5f7] flex flex-col h-screen overflow-hidden relative">
        <div className="h-14 border-b border-gray-200 bg-white flex justify-between items-center px-6 shadow-sm z-10 shrink-0">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            公众号效果预览
          </h2>
          <Button 
            variant="primary"
            onClick={handleCopyToWeChat}
            disabled={!formattedHtml}
            className="!py-1.5 !px-4 !text-xs bg-green-600 hover:bg-green-700 border-none rounded-full shadow-green-200 shadow-lg translate-y-0 hover:-translate-y-0.5 transition-transform"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>}
          >
            复制全文
          </Button>
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
                    backgroundColor: '#fff',
                    color: '#333'
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
              <p className="text-xs mt-2 opacity-60">支持一键复制到公众号后台</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
