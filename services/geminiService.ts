import { StyleType, ImagePlan } from "../types";

// ========== New Platform Client (Evolink) ==========
// 生产环境通过 Vercel 函数代理，开发环境可直连（不推荐将密钥暴露到浏览器）
const EVOLINK_BASE = 'https://api.evolink.ai/v1beta';
// Prefer EVOLINK_API_KEY; allow legacy API_KEY for local fallback
const getApiKey = () => (process.env.EVOLINK_API_KEY || process.env.API_KEY);

type GenOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
  systemText?: string;
  model?: string; // allow overriding model name if needed
};

async function directEvolinkRequest(body: any) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('缺少 EVOLINK_API_KEY（仅开发直连时需要）。');
  const resp = await fetch(`${EVOLINK_BASE}/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API 调用失败 (${resp.status}): ${text || resp.statusText}`);
  }
  return resp.json();
}

// 低层：多轮生成（优先 Vercel 代理，开发环境可直连）
async function generateViaEvolink(
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  opts?: GenOptions
) {
  // lightweight trace id for correlating turns in Vercel logs
  const traceId = `mf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const common: any = {
    contents,
    systemText: opts?.systemText,
    temperature: opts?.temperature ?? 0.3,
    maxOutputTokens: opts?.maxOutputTokens ?? 8192,
    responseMimeType: opts?.responseMimeType,
    responseSchema: opts?.responseSchema,
  };

  let data: any | null = null;
  // 1) 先走 Vercel 无服务器函数（生产环境）
  try {
    const started = Date.now();
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...common, traceId, turn: 1 }),
    });
    if (resp.ok) {
      data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p?.text).filter(Boolean).join('');
      console.log(`[TRACE] turn=1 trace=${traceId} dur=${Date.now() - started}ms outChars=${text.length}`);
    } else if (resp.status !== 404) {
      const t = await resp.text().catch(() => '');
      throw new Error(`API 调用失败 (${resp.status}): ${t || resp.statusText}`);
    }
  } catch {}

  // 2) 若代理不可用（如本地 404），在本地开发回退直连 Evolink
  if (!data) {
    const isLocal = typeof window !== 'undefined' && (
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || window.location.port === '3000'
    );
    if (isLocal) {
      const evoBody: any = {
        contents,
        generationConfig: {
          temperature: common.temperature,
          maxOutputTokens: common.maxOutputTokens,
        },
      };
      if (common.systemText) evoBody.systemInstruction = { role: 'system', parts: [{ text: common.systemText }] };
      if (common.responseMimeType) evoBody.generationConfig.responseMimeType = common.responseMimeType;
      if (common.responseSchema) evoBody.generationConfig.responseSchema = common.responseSchema;
      const started = Date.now();
      data = await directEvolinkRequest(evoBody);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p?.text).filter(Boolean).join('');
      console.log(`[TRACE-LOCAL] turn=1 trace=${traceId} dur=${Date.now() - started}ms outChars=${text.length}`);
    } else {
      throw new Error('API 代理不可用：/api/generate 404。请检查 Vercel 函数或在本地使用开发直连。');
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: any) => p?.text).filter(Boolean).join('');
  const finishReason = data?.candidates?.[0]?.finishReason;
  return { text: text as string, finishReason, raw: data, _traceId: traceId };
}

// 单轮：优先走代理，失败再直连（给 JSON 规划/短文本用）
async function generateTextViaEvolink(userText: string, opts?: GenOptions) {
  // 优先通过后端代理，避免在浏览器暴露密钥与跨域问题。
  const body: any = {
    userText,
    systemText: opts?.systemText,
    temperature: opts?.temperature ?? 0.3,
    maxOutputTokens: opts?.maxOutputTokens ?? 8192,
    responseMimeType: opts?.responseMimeType,
    responseSchema: opts?.responseSchema,
  };

  let data: any | null = null;

  // 1) 尝试走 Vercel 代理（生产环境生效；本地若无函数会返回 404）
  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      data = await resp.json();
    } else if (resp.status !== 404) {
      const text = await resp.text().catch(() => '');
      throw new Error(`API 调用失败 (${resp.status}): ${text || resp.statusText}`);
    }
  } catch (e) {
    // 忽略网络错误，继续尝试直连（本地开发兜底）
  }

  // 2) 若代理不可用（如本地 404），在开发环境回退到直连 Evolink
  if (!data) {
    const isLocal = typeof window !== 'undefined' && (
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || window.location.port === '3000'
    );
    if (isLocal) {
      const evoBody: any = {
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: body.temperature,
          maxOutputTokens: body.maxOutputTokens,
        },
      };
      if (body.systemText) {
        evoBody.systemInstruction = { role: 'system', parts: [{ text: body.systemText }] };
      }
      if (body.responseMimeType) evoBody.generationConfig.responseMimeType = body.responseMimeType;
      if (body.responseSchema) evoBody.generationConfig.responseSchema = body.responseSchema;
      data = await directEvolinkRequest(evoBody);
    } else {
      throw new Error('API 代理不可用：/api/generate 404。请检查 Vercel 函数或在本地使用开发直连。');
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: any) => p?.text).filter(Boolean).join('');
  return text as string;
}

// System instruction focuses on strict inline CSS and WeChat compatible tags
const SYSTEM_INSTRUCTION_FORMATTER = `
You are an expert WeChat Official Account (公众号) typographer.
Your output must be RAW HTML suitable for direct copy-pasting into the WeChat editor.

CRITICAL RULES:
1. NO External CSS: Do not use <style> tags or class names.
2. INLINE STYLES ONLY: Every single tag must have a 'style' attribute defining its look (font-size, color, line-height, margin, padding).
3. TAG USAGE: Use <section> tags for containers and paragraphs. Avoid <div> if possible. Use <span> for inline styling.
4. COMPATIBILITY: Use rgb() colors. Ensure padding and margins are specific.
5. STRUCTURE: The output should just be the content stream, no <html> or <body> tags.
`;

export const formatText = async (text: string, style: StyleType): Promise<string> => {
  let stylePrompt = "";

  switch (style) {
    case StyleType.DEEP_BLUE_BRIEF:
      stylePrompt = `
        STYLE TARGET: "Deep Blue Brief / 深蓝简报风"

        COLOR PALETTE:
        - Deep Blue: rgb(7, 98, 210)
        - Blue Light: rgb(82, 138, 212)
        - Gold Accent: rgb(227, 194, 94)
        - Text Primary: rgb(62, 62, 62)
        - Content Background (light blue): rgb(239, 248, 252)

        HTML TEMPLATE RULES (Inline styles only; no classes or <style>):

        1) GLOBAL CONTAINER (wrap everything once):
           <section style="font-size: 15px; letter-spacing: 1px; line-height: 2; color: rgb(62,62,62); text-align: justify;">

        2) SECTION TITLE BAR (centered deep-blue ribbon with gold dots on both sides):
           <section style="text-align: center; display: flex; justify-content: center; align-items: center; margin: 50px 0 20px;">
             <section style="display: inline-block; width: 10px; height: 10px; background-color: rgb(227,194,94); border-radius: 100px; margin-right: 10px;"></section>
             <section style="display: inline-block; padding: 2px 15px; background-color: rgb(7,98,210); border-top: 2px solid rgb(82,138,212); border-bottom: 5px solid rgb(227,194,94);">
               <section style="font-size: 18px; color: rgb(248,248,248); letter-spacing: 2px;">
                 <b>[SECTION TITLE / 栏目标题]</b>
               </section>
             </section>
             <section style="display: inline-block; width: 10px; height: 10px; background-color: rgb(227,194,94); border-radius: 100px; margin-left: 10px;"></section>
           </section>

        3) CONTENT BLOCK (light blue background paragraph area):
           <section style="background-color: rgb(239,248,252); padding: 0 14px;">
              <p style="margin: 0;">[Paragraph...]</p>
           </section>

        4) NUMBERED HEADING (01/02 ... + deep-blue title):
           <section style="display: flex; align-items: center; margin: 20px 0 10px;">
             <section style="background-color: rgb(7,98,210); padding: 2px 9px; margin-right: 8px;">
               <section style="color: rgb(255,255,255); font-size: 18px; font-weight: bold;">01</section>
             </section>
             <section style="padding: 0 15px; border-top: 2px solid rgb(227,194,94); border-bottom: 2px solid rgb(227,194,94);">
               <section style="font-size: 18px; color: rgb(7,98,210); font-weight: 700;">[HEADING TEXT]</section>
             </section>
           </section>

        5) PARAGRAPHS (standard):
           <p style="text-indent: 0em; margin: 0 0 12px 0;">[Paragraph...]</p>

        6) QUOTE / EMPHASIS BOX (gray caption style):
           <section style="background-color: rgb(248,248,248); padding: 10px 12px; font-size: 12px;">
             <p style="margin: 0; color: rgb(62,62,62);"><strong>说明</strong>： [Note content]</p>
           </section>

        7) SMALL MUTED TEXT (editor / audit etc):
           <p style="margin: 0; color: rgb(162,162,162);">[Muted small text]</p>
      `;
      break;
    case StyleType.TECH_MAG:
      stylePrompt = `
        STYLE TARGET: "Tech Magazine / 科技杂志风"
        
        HTML TEMPLATE RULES:
        1. **Global Container** (Must wrap everything):
           <section style="box-sizing: border-box; font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 15px; color: rgb(10,10,10); line-height: 1.85; border-radius: 12px; padding: 12px; background-color: #F7F7F7; background-image: linear-gradient(0deg, #E7E7E7 1px, transparent 1px), linear-gradient(90deg, #E7E7E7 1px, transparent 1px); background-size: 24px 24px; background-repeat: repeat;">
        
        2. **Headings** (Capsule Style):
           <h2 style="font-size: 19.5px; font-weight: bold; margin: 4em auto 2em; text-align: center; line-height: 1.75; display: table; padding: 0.3em 1em; background: rgb(198, 110, 73); border-radius: 8px; box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 6px; color: white !important;">
             [Heading Text]
           </h2>

        3. **Paragraphs**:
           <p style="margin: 24px 8px 8px; text-align: justify; line-height: 2; font-size: 16px; letter-spacing: 0.1em; color: rgb(63, 63, 63); word-break: break-all; opacity: 0.9;">
             [Content]
           </p>

        4. **Emphasis/Bold**:
           <strong style="color: rgb(198, 110, 73); font-weight: bold;">[Text]</strong>

        5. **Blockquotes/Cards**:
           <blockquote style="border-left: 4px solid rgb(198, 110, 73); margin: 16px 8px 32px; padding: 1em 1em 1em 16px; background: rgb(255, 255, 255); border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.05) 0px 4px 6px; color: rgba(0, 0, 0, 0.6); font-style: italic;">
             <p style="margin: 0; line-height: 1.8; font-size: 1em; color: rgb(63, 63, 63);">[Quote Content]</p>
           </blockquote>
           
        6. **Lists**:
           <ul style="list-style: disc; margin: 0px 12px 16px 16px; padding-left: 0.2em; color: rgb(63, 63, 63); opacity: 0.8;">
             <li style="margin: 0.5em 8px;">[Item]</li>
           </ul>
           
        7. **Separator**:
           <hr style="border: none; height: 1px; margin: 2em 0px; background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0)); transform: scale(1, 0.5);">
      `;
      break;

    case StyleType.QBIT:
      stylePrompt = `
        STYLE TARGET: "QbitAI / 量子位" (Tech News Style)

        HTML TEMPLATE RULES:
        1. **Global Settings**:
           - Font: Arial, sans-serif
           - Size: 16px
           - Line-height: 2
           - Letter-spacing: 1px
           - Color: rgb(34, 34, 34)
           - Text-align: left (NOT justify)
           
        2. **Intro Header** (Conditional Author Block):
           - **LOGIC**: Check if the start of the article contains author/source metadata (e.g., lines containing "发自", "凹非寺", "公众号", "QbitAI").
           - **IF FOUND**: Extract those lines and wrap them in this grey box structure:
             <section style="background-color: rgb(248, 248, 248); border-radius: 3px; margin: 10px 0 30px; padding: 10px; color: rgb(51, 51, 51); font-size: 14px; line-height: 2; font-weight: 300;">
               [Content Line 1]<br>
               [Content Line 2]
             </section>
           - **IF NOT FOUND**: Do NOT generate this section. Do NOT invent author names.

        3. **Headings** (H2/H3):
           <section style="margin: 40px 0; line-height: 1.5; font-weight: bold; padding-left: 15px; border-left: 6px solid rgb(0, 153, 127); font-size: 20px; color: rgb(34, 34, 34);">
             [Heading Text]
           </section>

        4. **Paragraphs**:
           <p style="margin: 20px 16px; letter-spacing: 1px; word-spacing: 1px; line-height: 2; color: rgb(34, 34, 34); font-size: 16px; font-family: Arial;">
             [Content]
           </p>

        5. **Emphasis/Highlight**:
           <strong style="color: rgb(0, 153, 127); font-weight: bold;">[Highlighted Text]</strong>

        6. **Footer**:
           <section style="margin-top: 40px; text-align: center;">
             <p style="font-size: 17px; color: rgb(0, 0, 0);">— <strong>完</strong> —</p>
           </section>
      `;
      break;

    case StyleType.ZEN:
      stylePrompt = `
        STYLE TARGET: "Zen Minimalist / 极简禅意风"

        HTML TEMPLATE RULES:
        1. **Global Settings**:
           - Font: PingFangSC-light, sans-serif
           - Line-height: 2.6 (Very airy)
           - Letter-spacing: 2px (Wide spacing)
           - Color: rgb(58, 58, 58)
           - Font-size: 15px

        2. **Top Subtitle/Mood text** (Optional intro sentence):
           <section style="margin: 12px 0 20px; text-align: center; font-size: 11px; color: rgb(160, 160, 160); letter-spacing: 5px;">
             [Short Intro Sentence]
           </section>

        3. **Numbered Headings** (Level 1/2):
           <section style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
             <!-- Decorative separator (no <img>) -->
             <section style="width: 88px; height: 6px; display: inline-block; vertical-align: middle; background: linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,0.25), rgba(0,0,0,0)); border-radius: 6px;"></section>
             <br>
             <span style="font-size: 16px; font-weight: bold; color: rgb(58, 58, 58); letter-spacing: 2px; margin-top: 10px; display: inline-block;">01 [Heading Text]</span>
           </section>

        4. **Paragraphs**:
           <section style="margin-bottom: 20px; text-align: justify; letter-spacing: 2px; line-height: 2.6;">
             [Paragraph Content]
           </section>

        5. **Footer / Author Box**:
           <section style="margin-top: 40px; margin-bottom: 20px; text-align: center; opacity: 0.76;">
             <section style="display: inline-block; border: 2px solid rgb(240, 240, 240); padding: 4px 12px; background-color: rgb(240, 240, 240); color: rgb(80, 80, 80); font-size: 11px; letter-spacing: 1px;">
               [Author Name/Footer Text]
             </section>
           </section>
      `;
      break;

    case StyleType.LOGIC:
      stylePrompt = `
        STYLE TARGET: "Logic Thinking / 罗辑思维"
        
        HTML TEMPLATE RULES (Strict adherence to this structure):
        
        1. **Global Settings**: 
           - Font: PingFangSC-light, sans-serif
           - Line-height: 2
           - Letter-spacing: 0.578px
           - Color: rgb(63, 63, 63)
           
        2. **Intro/Opening Section**:
           Use this specific "L-shape border" structure for the opening paragraph or introduction:
           <section style="margin-bottom: 20px;">
             <section style="width: 2.25em; height: 2.25em; border-top: 5px solid rgb(227, 108, 9); border-left: 5px solid rgb(227, 108, 9); transform: rotate(0deg);"></section>
             <section style="margin-top: -2.25em;">
               <section style="padding: 10px; background-color: rgb(242, 242, 242);">
                 <section style="text-align: justify; padding: 10px; font-size: 15px; color: rgb(0, 0, 0); line-height: 2; font-family: PingFangSC-light; letter-spacing: 0.578px;">
                   [Intro Content Here]
                 </section>
               </section>
             </section>
           </section>

        3. **Numbered Headings** (Level 1/2 headings):
           <section style="text-align: center; line-height: 2; margin-top: 30px; margin-bottom: 20px;">
             <section style="font-size: 16px; margin-top: 16px;">
               <span style="font-size: 36px; color: rgb(227, 108, 9); font-weight: bold;">01</span> <!-- Increment numbers -->
             </section>
             <p style="text-align: center; margin-top: 5px;">
               <strong style="color: rgb(62, 62, 62); font-size: 17px;">[Heading Text]</strong>
             </p>
           </section>

        4. **Standard Paragraphs**:
           <section style="margin-bottom: 15px; text-align: justify; font-size: 15px; color: rgb(63, 63, 63); line-height: 2; letter-spacing: 0.578px; font-family: PingFangSC-light;">
             [Paragraph Content]
           </section>

        5. **Emphasis/Bold**:
           <span style="color: rgb(227, 108, 9); font-weight: bold;">[Text]</span>
           
        6. **Tips/Footer Box** (Optional, at the end):
           <section style="padding: 10px; display: inline-block; width: 90%; border: 2px dotted rgb(192, 200, 209); margin: 20px auto; text-align: center;">
             <section style="font-size: 14px; color: rgb(89, 89, 89);">
               [Footer/Author Info]
             </section>
           </section>
      `;
      break;

    case StyleType.MODERN_WECHAT:
      stylePrompt = `
        STYLE TARGET: "Knowledge V-Style" (General Orange Accents)
        
        HTML TEMPLATE RULES:
        1. **Global Container**: <section style="font-size: 16px; color: rgb(63, 63, 63); line-height: 1.8; letter-spacing: 0.05em; text-align: justify; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;">
        2. **Headings**: Use this structure for H2/H3:
           <section style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
             <section style="font-size: 24px; color: rgb(227, 108, 9); font-weight: bold; margin-bottom: 8px;">01</section>
             <section style="font-size: 16px; font-weight: bold; color: rgb(63, 63, 63);">YOUR HEADER TEXT</section>
           </section>
        3. **Paragraphs**: Wrap each paragraph in <section style="margin-bottom: 20px; text-align: justify;">text...</section>
        4. **Highlights/Quotes**: Use a grey box:
           <section style="margin: 20px 0; padding: 15px; background-color: rgb(242, 242, 242); border-radius: 4px; color: rgb(89, 89, 89); font-size: 15px;">text...</section>
        5. **Emphasis**: <strong style="color: rgb(227, 108, 9);">text</strong> for bold text.
      `;
      break;

    case StyleType.NYT:
      stylePrompt = `
        STYLE TARGET: "New York Times Chinese"
        
        HTML TEMPLATE RULES:
        1. **Global**: <section style="font-family: Georgia, 'SimSun', serif; font-size: 17px; line-height: 1.9; color: #1a1a1a; max-width: 100%;">
        2. **Headings**: <h2 style="font-family: sans-serif; font-weight: 700; margin-top: 32px; margin-bottom: 12px; font-size: 20px; border-bottom: 1px solid #e2e2e2; padding-bottom: 8px;">Header</h2>
        3. **Paragraphs**: <p style="margin-bottom: 24px;">text...</p>
        4. **First Paragraph Drop Cap**: Wrap the very first character in <span style="float: left; font-size: 3.2em; line-height: 0.8; margin-right: 8px; font-weight: bold;">L</span>
        5. **Captions**: <section style="font-family: sans-serif; font-size: 13px; color: #666; margin-top: -10px; margin-bottom: 24px;">Caption</section>
      `;
      break;

    case StyleType.CLAUDE:
      stylePrompt = `
        STYLE TARGET: "Claude/Tech Minimalist"
        
        HTML TEMPLATE RULES:
        1. **Global**: <section style="font-family: -apple-system, sans-serif; font-size: 16px; line-height: 1.75; color: #24292f; background-color: #faf9f7;">
        2. **Headings**: <section style="color: #b56a5d; font-size: 18px; font-weight: 600; margin-top: 30px; margin-bottom: 15px; padding-left: 10px; border-left: 4px solid #b56a5d;">Header</section>
        3. **Paragraphs**: <section style="margin-bottom: 20px;">text...</section>
        4. **Code/Tech terms**: <span style="background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #24292f;">code</span>
      `;
      break;

    case StyleType.LITERARY:
      stylePrompt = `
        STYLE TARGET: "Literary/Letter"
        
        HTML TEMPLATE RULES:
        1. **Global**: <section style="font-family: 'Kaiti SC', 'STKaiti', serif; font-size: 17px; line-height: 2.0; color: #2c2c2c; text-align: justify;">
        2. **Container**: If possible, suggest a wrapper with <section style="padding: 20px; background-color: #fdfbf7; border: 1px solid #e6e6e6; margin: 10px;">
        3. **Headings**: <section style="text-align: center; margin: 40px 0 20px 0; letter-spacing: 2px; color: #5c7c68;">Header</section>
        4. **Paragraphs**: <p style="text-indent: 2em; margin-bottom: 20px;">text...</p>
      `;
      break;
  }

  const IMAGE_TOKEN_RULES = `
    IMAGE TOKEN RULES (STRICT):
    - The input may contain tokens: [[IMAGE:img-<id>]] (preferred), {{IMG:img-<id>}}, {{IMGURL:https://...}}, and short URL tokens [[URL:1]], [[URL:2]], etc.
    - Do NOT remove, reorder, rename, or deduplicate tokens.
    - For [[IMAGE:img-<id>]]: KEEP THE TOKEN TEXT UNCHANGED at that position. It must be plain text (not inside any attribute). You may wrap it in a simple <section> for layout, but the token string must stay intact.
    - For {{IMG:img-<id>}}: Output a STANDALONE block containing ONLY the placeholder [[IMAGE:img-<id>]] at that exact position.
    - For {{IMGURL:https://...}} and [[URL:n]]: KEEP THE TOKEN TEXT UNCHANGED at the exact position (do not convert it or wrap it in <img>); the client will resolve it.
    - NEVER generate <img>, <figure>, <picture>, or any tag that sets an image src. Do not place [[IMAGE:...]], {{IMGURL:...}}, or [[URL:n]] inside any HTML attribute.
    - NEVER output natural-language placeholders like [image 1024x768 PNG]; always keep the exact tokens instead.
    - Do NOT invent, add, or remove any image references beyond the given tokens.
  `;

  const prompt = `
    ${stylePrompt}
    ${IMAGE_TOKEN_RULES}
    
    TASK: Format the following text into the requested HTML structure.
    INPUT TEXT:
    ${text}

    OUTPUT: Only the HTML code. Do not include markdown code fences.
    IMPORTANT: Append the exact sentinel comment <!-- END_OF_ARTICLE --> at the very end of the output.
  `;

  try {
    // Auto-continue loop to avoid truncation on providers with tighter output limits
    const messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: prompt + '\n\nOUTPUT: Only the HTML code, no code fences.' }] },
    ];
    const opts = {
      systemText: SYSTEM_INSTRUCTION_FORMATTER,
      temperature: 0.25,
      maxOutputTokens: 8192,
    } as GenOptions;

    let combined = '';
    let safetyBreak = 0;
    const MAX_TURNS = 6;

    while (safetyBreak < MAX_TURNS) {
      const t0 = Date.now();
      const { text: chunk, finishReason, _traceId } = await generateViaEvolink(messages, opts);
      const chunkSafe = chunk || '';
      if (!chunkSafe.trim()) break;
      combined += chunkSafe;

      // Found end sentinel → stop
      if (combined.includes('<!-- END_OF_ARTICLE -->')) break;

      // If model signaled max-tokens or simply didn't finish, ask to continue
      messages.push({ role: 'model', parts: [{ text: chunkSafe }] });
      messages.push({
        role: 'user',
        parts: [{
          text: 'Continue ONLY the remaining HTML from where you left off. Do not repeat any previous content. Ensure all tags are closed. End with <!-- END_OF_ARTICLE -->.'
        }],
      });

      console.log(`[TRACE] trace=${_traceId} turn=${safetyBreak + 1} finish=${finishReason || '-'} dur=${Date.now() - t0}ms combinedChars=${combined.length}`);
      safetyBreak += 1;
    }

    if (!combined) return "<p>Format generation failed.</p>";
    // Strip the sentinel before returning
    return combined.replace(/<!--\s*END_OF_ARTICLE\s*-->/g, '').trim();
  } catch (error) {
    console.error("Format error:", error);
    throw error;
  }
};

/**
 * Reads the article and decides on an art style and 2-3 insertion points.
 */
export const planArticleImages = async (text: string): Promise<ImagePlan> => {
  const prompt = `
    You are an expert Art Director for a WeChat Official Account.
    Analyze the following article text and RETURN A VALID JSON ONLY (no explanations, no markdown fences) with this shape:
    {
      "artStyle": string,
      "images": [
        { "prompt": string, "positionKeyword": string },
        { "prompt": string, "positionKeyword": string },
        { "prompt": string, "positionKeyword": string }
      ]
    }

    Requirements:
    - 2 or 3 items in images.
    - positionKeyword must be an exact short phrase/sentence that appears immediately BEFORE the insertion point in the article.
    - prompts must be detailed and in English.

    Article Text (Snippet): "${text.substring(0, 3000)}"
  `;

  const content = await generateTextViaEvolink(
    prompt,
    {
      systemText: 'You output only strict, valid JSON.',
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      // 如果 Evolink 兼容 responseSchema，将其传递；否则模型仍会按要求输出 JSON
      responseSchema: {
        type: 'object',
        properties: {
          artStyle: { type: 'string' },
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                positionKeyword: { type: 'string' },
              },
              required: ['prompt', 'positionKeyword'],
            },
          },
        },
        required: ['artStyle', 'images'],
      },
    }
  );

  // Try direct parse first, then fallback to extracting JSON substring
  const tryParse = (s: string) => {
    try { return JSON.parse(s) as ImagePlan; } catch { return null as any; }
  };
  let parsed = tryParse(content?.trim());
  if (!parsed) {
    const match = content.match(/\{[\s\S]*\}$/);
    if (match) parsed = tryParse(match[0]);
  }
  if (!parsed) throw new Error('Failed to parse image plan JSON');
  return parsed as ImagePlan;
};

export const generateImageDescription = async (text: string, type: 'cover' | 'illustration'): Promise<string> => {
  // Keeping this for simple cover generation fallbacks if needed, 
  // though we mostly use the planner now.
  const prompt = `
    Analyze the following article text and write a detailed, artistic image generation prompt for a ${type}.
    The prompt should describe a scene, mood, lighting, and style.
    
    Article text: "${text.substring(0, 1000)}..."
    
    Return ONLY the English prompt string.
  `;

  const content = await generateTextViaEvolink(
    prompt + '\n\nReturn ONLY the English prompt string, no quotes.',
    {
      systemText: 'You are a helpful prompt engineer.',
      temperature: 0.5,
      maxOutputTokens: 8192,
    }
  );

  return (content || '').trim();
};

export const generateImage = async (prompt: string, aspectRatio: '4:3' | '16:9' | '1:1' = '4:3'): Promise<string> => {
  // 暂无 apicore 的图像生成接口文档，先提示未配置。
  // 如需启用，请提供该平台的图片生成 API 规范（端点、参数、返回值）。
  throw new Error('当前平台的图片生成接口未配置。如需启用，请提供 apicore 的图片生成 API 文档。');
};
