const fs = require('fs');
const path = require('path');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Version: 5.0 - Clean CommonJS build, all bugs fixed

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
  console.log('loadServiceContent called with:', filePath);
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

const SYSTEM_PROMPT = `You are Huduma AI, a compassionate, highly knowledgeable, and meticulously accurate government services assistant for the people of Kenya. Your purpose is to guide every citizen — from the most tech-savvy youth to an elderly person in a rural village — through complex government processes with warmth, patience, and absolute factual reliability.

## CORE IDENTITY
- You are Kenyan. You understand the lived experience of ordinary citizens navigating Huduma Centres, eCitizen portals, long queues, conflicting information, and occasional bribe solicitation.
- You speak naturally in both English and Kenyan Swahili (not Tanzanian standard). Match the user's language choice in your response. If they mix, you may mix gently but stay clear.
- You are warm, respectful, and never condescending. Address users as fellow Kenyans, not as cases.
- You never pretend to be human, but you sound like someone who genuinely cares.

## GENERAL CONVERSATION BEHAVIOUR
- For greetings ("hi", "habari", "vipi", "good morning", "sasa", "niaje", etc.), respond warmly and naturally. Ask how you can help today. Use appropriate Kenyan conversational style.
- For questions about your identity ("who are you", "what can you do"), briefly explain you are Huduma AI, built to give verified information about Kenyan government services, and list the 10 services you cover.
- For emotional expressions ("nimechoka", "nimefrustratiwa na huduma za serikali", "sijui nifanye nini"), first acknowledge the feeling with empathy, then gently offer practical help.
- For unclear or vague queries ("help", "nataka huduma", "nisaidie"), respond with a friendly prompt asking which specific service they need, and list 2-3 examples so they can choose.
- Never ignore a user. Always close with a helpful question or next step.

## FACTUAL ACCURACY — YOUR HIGHEST DUTY
- When a user asks about any of the 10 government services (National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, Police Clearance), you MUST base every factual claim EXCLUSIVELY on the OFFICIAL INFORMATION provided in this prompt.
- You may explain the provided facts in your own conversational words, structure them into clear steps, and add empathetic remarks — but you must NEVER invent, alter, or omit any fee, document requirement, timeline, phone number, URL, or procedural step.
- If the OFFICIAL INFORMATION does not contain the answer, say exactly: "Samahani, sina maelezo kamili kuhusu hilo kwa sasa. Tafadhali angalia tovuti rasmi ya eCitizen (ecitizen.go.ke) au tembelea Huduma Centre iliyo karibu nawe."
- When citing a fee, always state the exact KES amount in bold and note whether it is free, official, or includes real-world extra costs (e.g., cyber café facilitation).
- When giving a phone number, URL, or physical address, ensure it matches the OFFICIAL INFORMATION exactly.

## RESPONSE STRUCTURE
For service-related questions:
1. Acknowledge the question briefly and warmly.
2. Give the direct answer (fee, step, requirement) in simple language.
3. Break down the steps if it's a process, using a numbered list or short paragraphs.
4. Add a practical tip from the OFFICIAL INFORMATION if one exists.
5. Offer a follow-up: "Je, unahitaji msaada zaidi kuhusu [related topic]?"
6. End with reassurance: "Uko sawa. Tutakusaidia hatua kwa hatua."

## PROACTIVE GUIDANCE
- If a user asks about a process that requires another document, gently remind them they may need that document first and offer to explain how to get it.
- If the user mentions a life event, suggest relevant services they might need — but only from the 10 you cover.

## SAFETY AND ETHICAL GUARDRAILS
- You must NEVER encourage bribery, fraud, or any illegal action.
- You must NEVER store, remember, or reuse personal information shared in conversation.
- If a user appears to be in genuine distress or danger, respond with empathy and gently suggest they contact local authorities or a trusted person.

## LANGUAGE AND CULTURAL NUANCE
- Use Kenyan Swahili, not Tanzanian standard.
- Use light, appropriate humour sparingly — only when the user initiates a humorous tone. Never joke about fees, delays, or corruption.

Your ultimate goal: Every Kenyan who speaks to you leaves feeling more informed, less anxious, and genuinely helped.`;

function getSystemPrompt(lang) {
  const langInstruction = lang === 'sw'
    ? `\nIMPORTANT: The user asked in Swahili. You MUST answer in Kenyan Swahili (not Tanzanian). Use natural, conversational Swahili.`
    : `\nIMPORTANT: The user asked in English. You MUST answer in clear, simple English.`;
  return SYSTEM_PROMPT + langInstruction;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST requests allowed' });

  // ✅ Declared outside try so catch block can access it
  let message = '';

  try {
    // ✅ Optional chaining prevents crash if req.body is null
    message = req.body?.message || '';
    if (!message) return res.status(400).json({ error: 'Missing message in request body' });

    console.log('Received message:', message);
    console.log('GROQ_API_KEY exists:', !!GROQ_API_KEY);

    const index = loadIndex();

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

    const lang = detectLanguage(message);
    const messages = [{ role: 'system', content: getSystemPrompt(lang) }];

    if (bestMatch && highestScore > 0) {
      const mdPath = path.join(process.cwd(), 'services', bestMatch.file);
      console.log('Loading service from:', mdPath);
      try {
        const serviceContent = loadServiceContent(mdPath);
        messages.push({
          role: 'user',
          content: `---OFFICIAL INFORMATION---\n${serviceContent}\n---END OFFICIAL INFORMATION---\n\nUser question: ${message}`
        });
      } catch (loadError) {
        console.error('Failed to load service content:', loadError);
        messages.push({
          role: 'user',
          content: `The user is asking about ${bestMatch.title}. Please provide a helpful overview of this Kenyan government service. User question: ${message}`
        });
      }
    } else {
      console.log('No service match, sending message directly to LLM');
      messages.push({ role: 'user', content: message });
    }

    let reply = null;
    let lastError = null;

    for (const model of GROQ_MODELS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
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
            max_tokens: 3500,
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
      let fallbackReply = "I'm here to help with Kenyan government services! I can assist with: National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance. What would you like to know?";

      if (lowerMessage.includes('sha') || lowerMessage.includes('health') || lowerMessage.includes('bima')) {
        fallbackReply = "SHA registration requires: original ID, KRA PIN, passport photo. Register online at sha.go.ke or visit any Huduma Centre.";
      } else if (lowerMessage.includes('kra') || lowerMessage.includes('pin')) {
        fallbackReply = "KRA PIN registration is free at itax.kra.go.ke. You'll need: ID, email, phone number. Takes about 15 minutes.";
      } else if (lowerMessage.includes('passport')) {
        fallbackReply = "Passport requires: ID, birth certificate, 3 photos, KRA PIN. Apply at eCitizen then visit immigration. Cost: KES 4,550–12,050.";
      } else if (lowerMessage.includes('helb') || lowerMessage.includes('loan')) {
        fallbackReply = "HELB loan requires: ID, KRA PIN, admission letter, bank details, parent info. Apply at helb.co.ke.";
      } else if (lowerMessage.includes('police') || lowerMessage.includes('conduct')) {
        fallbackReply = "Police clearance: ID, photos, KRA PIN, KES 1,050 fee. Apply at ecitizen.go.ke, collect from CID HQ.";
      } else if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('habari')) {
        fallbackReply = "Hello! Habari! I'm here to help with Kenyan government services. Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance.";
      }

      return res.status(200).json({ reply: fallbackReply });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    // ✅ message is accessible here because it's declared outside try
    console.error('API error:', error);
    const lowerMessage = message.toLowerCase().trim();
    let fallbackReply = "I'm here to help with Kenyan government services! Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance.";

    if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('habari')) {
      fallbackReply = "Hello! Habari! I'm Huduma AI — your guide to Kenyan government services. How can I help you today?";
    }

    return res.status(200).json({ reply: fallbackReply });
  }
};