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
      userText,
      systemText,
      temperature = 0.3,
      maxOutputTokens = 8192,
      responseMimeType,
      responseSchema,
    } = req.body || {};

    if (!userText || typeof userText !== 'string') {
      res.status(400).json({ error: 'Invalid userText' });
      return;
    }

    const body: any = {
      contents: [
        { role: 'user', parts: [{ text: userText }] },
      ],
      generationConfig: { temperature, maxOutputTokens },
    };
    if (systemText) {
      body.systemInstruction = { role: 'system', parts: [{ text: systemText }] };
    }
    if (responseMimeType) {
      body.generationConfig.responseMimeType = responseMimeType;
    }
    if (responseSchema) {
      body.generationConfig.responseSchema = responseSchema;
    }

    const resp = await fetch(`${EVOLINK_BASE}/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
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

