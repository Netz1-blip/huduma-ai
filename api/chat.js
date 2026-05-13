const fs = require('fs');
const path = require('path');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Version: 6.0 - Conversation memory + structured responses

if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY is not set in environment variables');
}

let cache = { index: { data: null, timestamp: 0 }, services: {} };
const CACHE_TTL = 5 * 60 * 1000;

function isCacheValid(ts) { return ts && (Date.now() - ts) < CACHE_TTL; }

function trimServiceContent(raw) {
  let trimmed = raw.replace(/^#+\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (trimmed.length > 1500) trimmed = trimmed.substring(0, 1500) + '… (truncated)';
  return trimmed;
}

function loadIndex() {
  if (cache.index.data && isCacheValid(cache.index.timestamp)) return cache.index.data;
  const indexPath = path.join(process.cwd(), 'services', 'index.json');
  const raw = fs.readFileSync(indexPath, 'utf8');
  const data = JSON.parse(raw);
  cache.index = { data, timestamp: Date.now() };
  return data;
}

function loadServiceContent(filePath) {
  if (cache.services[filePath] && isCacheValid(cache.services[filePath].timestamp)) {
    return cache.services[filePath].data;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = trimServiceContent(raw);
  cache.services[filePath] = { data: trimmed, timestamp: Date.now() };
  return trimmed;
}

function detectLanguage(text) {
  const swWords = ['habari', 'naomba', 'tafadhali', 'asante', 'sawa', 'kwa', 'nisaidie', 'nataka', 'kupata', 'gharama', 'ada', 'malipo', 'kitambulisho', 'cheti', 'kuzaliwa', 'bima', 'afya', 'kodi', 'leseni', 'biashara', 'mkopo'];
  const lower = text.toLowerCase();
  for (const w of swWords) if (lower.includes(w)) return 'sw';
  return 'en';
}

const SYSTEM_PROMPT = `You are Huduma AI, a compassionate and meticulously accurate government services assistant for the people of Kenya.

## IDENTITY
- You are Kenyan. You speak naturally in both English and Kenyan Swahili (not Tanzanian).
- You are warm, respectful, and never condescending.
- Match the user's language. If they write in Swahili, respond in Swahili. If English, respond in English.

## RESPONSE FORMAT — THIS IS CRITICAL
You MUST always structure your responses like this. NEVER write long unbroken paragraphs.

**For service questions, use this exact structure:**

Brief warm acknowledgement (1 sentence max).

**What You Need:**
- Requirement 1
- Requirement 2
- Requirement 3

**Steps:**
1. First step
2. Second step
3. Third step

**Cost:** State the exact KES amount or FREE

**Time:** How long it takes

**Apply at:** [Official Website Name](https://official-url.go.ke) or physical location

💡 **Tip:** One practical insider tip

*Je, unahitaji msaada zaidi? / Need more help?*

---

**For greetings:** Respond warmly in 2-3 sentences, ask how you can help, mention you cover 10 services.

**For follow-up questions:** Use the conversation history to understand context. If someone asks "what documents?" after asking about SHA, answer about SHA documents specifically.

**For unclear questions:** Ask one clarifying question.

## OFFICIAL LINKS — ALWAYS INCLUDE WHEN RELEVANT
- eCitizen portal: https://ecitizen.go.ke
- KRA iTax: https://itax.kra.go.ke
- SHA: https://sha.go.ke
- NSSF: https://nssf.or.ke
- HELB: https://helb.co.ke
- NTSA (driving): https://ntsa.go.ke
- DCI (Good Conduct): https://dci.go.ke
- HUDUMA CENTRE locations: https://hudumacentre.go.ke

## FACTUAL ACCURACY
- Base ALL service facts exclusively on the OFFICIAL INFORMATION provided.
- NEVER invent fees, timelines, or requirements.
- State exact KES amounts in bold.
- If you don't have information, say: "Samahani, sina maelezo kamili. Tafadhali angalia [ecitizen.go.ke](https://ecitizen.go.ke) au tembelea Huduma Centre."

## MARKDOWN RULES
- Use **bold** for fees, important terms, section headers
- Use numbered lists (1. 2. 3.) for steps
- Use bullet points (- ) for requirements/documents
- Use [link text](url) for official websites
- Keep each paragraph to maximum 2 sentences
- Use emojis sparingly for headers: 📋 💰 ⏱️ 🏢 💡

Your goal: Every Kenyan leaves feeling informed, not overwhelmed. Structure saves lives.`;

function getSystemPrompt(lang) {
  const langInstruction = lang === 'sw'
    ? `\nCRITICAL: The user is writing in Swahili. Respond ENTIRELY in Kenyan Swahili. Use the same structured format but in Swahili. Keep section headers in Swahili e.g. "Unahitaji Nini:", "Hatua:", "Gharama:", "Muda:", "Omba Hapa:"`
    : `\nCRITICAL: The user is writing in English. Respond entirely in clear, simple English using the structured format.`;
  return SYSTEM_PROMPT + langInstruction;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  let message = '';

  try {
    message = req.body?.message || '';
    const history = req.body?.history || []; // ✅ Conversation history from frontend

    if (!message) return res.status(400).json({ error: 'Missing message in request body' });

    console.log('Received message:', message);
    console.log('History length:', history.length);
    console.log('GROQ_API_KEY exists:', !!GROQ_API_KEY);

    const index = loadIndex();

    // Keyword matching on current message
    const userMessage = message.toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;

    for (const service of index) {
      let score = 0;
      for (const keyword of service.keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(userMessage)) score++;
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = service;
      }
    }

    // Also check history for service context if no match in current message
    if (!bestMatch || highestScore === 0) {
      const historyText = history.map(h => h.content).join(' ').toLowerCase();
      for (const service of index) {
        let score = 0;
        for (const keyword of service.keywords) {
          if (historyText.includes(keyword.toLowerCase())) score++;
        }
        if (score > highestScore) {
          highestScore = score;
          bestMatch = service;
        }
      }
    }

    const lang = detectLanguage(message);
    const messages = [{ role: 'system', content: getSystemPrompt(lang) }];

    // ✅ Inject service knowledge if matched
    if (bestMatch && highestScore > 0) {
      const mdPath = path.join(process.cwd(), 'services', bestMatch.file);
      console.log('Loading service:', bestMatch.title);
      try {
        const serviceContent = loadServiceContent(mdPath);
        messages.push({
          role: 'system',
          content: `---OFFICIAL INFORMATION FOR ${bestMatch.title.toUpperCase()}---\n${serviceContent}\n---END OFFICIAL INFORMATION---`
        });
      } catch (loadError) {
        console.error('Failed to load service content:', loadError);
      }
    }

    // ✅ Add conversation history (max last 8 exchanges = 16 messages)
    const trimmedHistory = history.slice(-16);
    for (const entry of trimmedHistory) {
      if (entry.role && entry.content) {
        messages.push({ role: entry.role, content: entry.content });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    let reply = null;
    let lastError = null;

    for (const model of GROQ_MODELS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.3,
            max_tokens: 1200,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          reply = data.choices[0].message.content;
          break;
        }

        const errData = await response.json();
        lastError = errData;
        const isRateLimit = errData?.error?.code === 'rate_limit_exceeded';
        if (!isRateLimit) {
          console.error(`Groq API error with ${model}:`, errData);
          return res.status(500).json({ error: 'Groq API error', details: errData });
        }
        console.log(`Model ${model} rate limited, trying next...`);
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') console.error(`Timeout for ${model}`);
        else console.error(`Request error with ${model}:`, err);
      }
    }

    if (!reply) {
      console.error('All Groq models failed:', lastError);
      const lowerMessage = message.toLowerCase().trim();
      let fallbackReply = "I'm here to help with Kenyan government services! Ask me about **National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB,** or **Police Clearance**.";

      if (lowerMessage.includes('sha') || lowerMessage.includes('health') || lowerMessage.includes('bima')) {
        fallbackReply = "**SHA (Social Health Authority)**\n\n**What You Need:**\n- Original National ID\n- KRA PIN\n- Passport photo\n\n**Apply at:** [sha.go.ke](https://sha.go.ke) or any Huduma Centre\n\n**Cost:** Registration fee applies\n\n💡 **Tip:** You can also register via *147# on your phone.";
      } else if (lowerMessage.includes('kra') || lowerMessage.includes('pin')) {
        fallbackReply = "**KRA PIN Registration**\n\n**Cost:** FREE\n\n**What You Need:**\n- National ID\n- Email address\n- Phone number\n\n**Apply at:** [itax.kra.go.ke](https://itax.kra.go.ke)\n\n⏱️ **Time:** About 15 minutes online\n\n💡 **Tip:** Keep your PIN safe — you'll need it for almost every government service.";
      } else if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('habari')) {
        fallbackReply = "Hello! Habari! 👋 I'm **Huduma AI** — your guide to Kenyan government services.\n\nI can help you with:\n- National ID, Passport, Birth Certificate\n- SHA, NSSF, HELB\n- KRA PIN, Driving Licence, Business Registration, Police Clearance\n\nWhat do you need help with today?";
      }

      return res.status(200).json({ reply: fallbackReply });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('API error:', error);
    return res.status(200).json({
      reply: "I'm here to help with Kenyan government services! Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance."
    });
  }
};