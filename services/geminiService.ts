
import { GoogleGenAI, Type } from "@google/genai";
import { StyleType, ImagePlan } from "../types";

// Helper to get a fresh AI instance with the latest env key
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// System instruction focuses on strict inline CSS and WeChat compatible tags
const SYSTEM_INSTRUCTION_FORMATTER = `
You are an expert WeChat Official Account (公众号) typographer.
Your output must be RAW HTML suitable for direct copy-pasting into the WeChat editor.

CRITICAL RULES:
1. **NO External CSS**: Do not use <style> tags or class names.
2. **INLINE STYLES ONLY**: Every single tag must have a 'style' attribute defining its look (font-size, color, line-height, margin, padding).
3. **TAG USAGE**: Use <section> tags for containers and paragraphs. Avoid <div> if possible. Use <span> for inline styling.
4. **COMPATIBILITY**: Use rgb() colors. Ensure padding and margins are specific.
5. **STRUCTURE**: The output should just be the content stream, no <html> or <body> tags.
`;

export const formatText = async (text: string, style: StyleType): Promise<string> => {
  let stylePrompt = "";

  switch (style) {
    case StyleType.TECH_MAG:
      stylePrompt = `
        STYLE TARGET: "Tech Magazine / 科技杂志风"
        
        HTML TEMPLATE RULES:
        1. **Global Container** (Must wrap everything):
           <section style="box-sizing: border-box; font-family: 'PingFang SC', -apple-system-font, BlinkMacSystemFont, Arial, sans-serif; font-size: 15px; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0px, rgba(0, 0, 0, 0.05) 1px, transparent 1px, transparent 32px) rgba(0, 0, 0, 0.02); border-radius: 12px; padding: 8px; color: rgb(10, 10, 10); line-height: 1.75;">
        
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
             <!-- Specific dynamic wave separator -->
             <img src="https://mmbiz.qpic.cn/mmbiz_gif/Lz789qfThgsibMHR1vh2lNxtrwwvkKgx8Rz9icxpg2iauzJKzbSh5QHbj2ghXCIzxVOv4WWibADeEnUkRvcaWkdjNQ/640?wx_fmt=gif" style="width: 88px; display: inline-block; vertical-align: middle;">
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
        1. **Global**: <section style="font-family: -apple-system, sans-serif; font-size: 16px; line-height: 1.75; color: #24292f;">
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

  const prompt = `
    ${stylePrompt}
    
    TASK: Format the following text into the requested HTML structure.
    INPUT TEXT:
    ${text}

    OUTPUT: Only the HTML code. Do not include markdown code fences.
  `;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_FORMATTER,
        temperature: 0.3, 
      }
    });

    return response.text || "<p>Format generation failed.</p>";
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
    Analyze the following article text.
    1. Determine the "Tone" of the article (e.g., Serious, Emotional, Tech-focused, Whimsical).
    2. Define a consistent "Art Style" for illustrations that matches this tone (e.g., "Minimalist flat vector with orange accents", "Moody oil painting", "Futuristic 3D render").
    3. Identify 2 or 3 distinct locations in the text where an image would enhance the reading experience (e.g. after a major point or section break).
    4. For each location, select a unique "positionKeyword" - a short sentence or unique phrase from the text that appears IMMEDIATELY BEFORE where the image should be inserted.
    5. Write a detailed image prompt for each location.

    Article Text (Snippet): "${text.substring(0, 3000)}"
  `;

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          artStyle: { type: Type.STRING, description: "The visual style description for the images." },
          images: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: "Detailed prompt for generating the image." },
                positionKeyword: { type: Type.STRING, description: "Exact sentence or phrase from text to insert image after." },
              },
              required: ["prompt", "positionKeyword"]
            }
          }
        },
        required: ["artStyle", "images"]
      }
    }
  });

  const jsonStr = response.text?.trim();
  if (!jsonStr) throw new Error("Failed to generate image plan");
  
  return JSON.parse(jsonStr) as ImagePlan;
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

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || "A beautiful abstract artistic background";
};

export const generateImage = async (prompt: string, aspectRatio: '4:3' | '16:9' | '1:1' = '4:3'): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K" 
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Image gen error:", error);
    throw error;
  }
};