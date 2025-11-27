import type { VercelRequest, VercelResponse } from '@vercel/node';

// Serverless proxy on Vercel to call Evolink API securely
const EVOLINK_BASE = 'https://api.evolink.ai/v1beta';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.EVOLINK_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing EVOLINK_API_KEY on server' });
    return;
  }

  try {
    const {
      // Single-turn usage
      userText,
      // Multi-turn usage
      contents,
      // Shared config
      systemText,
      temperature = 0.3,
      maxOutputTokens = 8192,
      responseMimeType,
      responseSchema,
      // Observability (optional)
      traceId,
      turn,
    } = req.body || {};

    // Build request body for Evolink API
    const body: any = {
      generationConfig: { temperature, maxOutputTokens },
    };

    // Prefer multi-turn contents when provided; otherwise fall back to single userText
    if (Array.isArray(contents) && contents.length > 0) {
      body.contents = contents;
    } else {
      if (!userText || typeof userText !== 'string') {
        res.status(400).json({ error: 'Invalid userText or contents' });
        return;
      }
      body.contents = [{ role: 'user', parts: [{ text: userText }] }];
    }

    if (systemText) {
      body.systemInstruction = { role: 'system', parts: [{ text: systemText }] };
    }
    if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;
    if (responseSchema) body.generationConfig.responseSchema = responseSchema;

    const started = Date.now();
    const resp = await fetch(`${EVOLINK_BASE}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    const durationMs = Date.now() - started;

    // Basic sizes for observability (do not log actual content)
    const approxPromptChars = (() => {
      try {
        const arr = (body?.contents || []) as Array<any>;
        return arr.reduce((sum, c) => {
          const parts = Array.isArray(c?.parts) ? c.parts : [];
          const len = parts.reduce((s: number, p: any) => s + (p?.text ? String(p.text).length : 0), 0);
          return sum + len;
        }, 0);
      } catch { return 0; }
    })();

    let finishReason: string | undefined;
    let outChars: number | undefined;
    try {
      const data = JSON.parse(text);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      outChars = parts.map((p: any) => p?.text || '').join('').length;
      finishReason = data?.candidates?.[0]?.finishReason;
    } catch {}

    console.log(
      `[GEN] trace=${traceId || '-'} turn=${turn ?? '-'} status=${resp.status} ` +
      `dur=${durationMs}ms inChars=${approxPromptChars} outChars=${outChars ?? '-'} ` +
      `finish=${finishReason || '-'} temp=${temperature} maxOut=${maxOutputTokens}`
    );
    if (!resp.ok) {
      res.status(resp.status).send(text || resp.statusText);
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
