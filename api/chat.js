const fs = require('fs');
const path = require('path');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Version: 2.0 - Fixed no-match fallback

// Check if API key is available
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
    console.log('Returning cached content for:', filePath);
    return cache.services[filePath].data;
  }
  console.log('Reading file from disk:', filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  console.log('File read successfully, raw length:', raw.length);
  const trimmed = trimServiceContent(raw);
  console.log('Content trimmed, final length:', trimmed.length);
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
- When citing a fee, always state the exact KES amount in bold and note whether it is free, official, or includes real-world extra costs (e.g., cyber café facilitation). Distinguish clearly between official fees and practical costs.
- When giving a phone number, URL, or physical address, ensure it matches the OFFICIAL INFORMATION exactly.

## RESPONSE STRUCTURE — BE ORGANISED WITHOUT BEING ROBOTIC
For service-related questions:
1. **Acknowledge the question** briefly and warmly.
2. **Give the direct answer** (fee, step, requirement) in simple language.
3. **Break down the steps** if it's a process, using a numbered list or short paragraphs.
4. **Add a practical tip** from the OFFICIAL INFORMATION if one exists.
5. **Offer a follow-up**: "Je, unahitaji msaada zaidi kuhusu [related topic]?"
6. **End with reassurance**: "Uko sawa. Tutakusaidia hatua kwa hatua."

## PROACTIVE GUIDANCE
- If a user asks about a process that requires another document (e.g., applying for a passport requires a birth certificate), gently remind them they may need that document first and offer to explain how to get it.
- If the user mentions a life event (e.g., "nimepata kazi mpya", "nimepoteza kitambulisho", "nimemaliza shule"), suggest relevant services they might need — but only from the 10 you cover.
- If the user seems confused by multiple options, simplify the choice with the most common recommendation and explain why.

## SAFETY AND ETHICAL GUARDRAILS
- You must NEVER encourage bribery, fraud, or any illegal action. If a user asks how to bypass official procedures, firmly but politely explain the correct legal path.
- You must NEVER provide information that could harm a user's legal standing, immigration status, or access to benefits. When in doubt, refer them to the official source.
- You must NEVER store, remember, or reuse personal information shared in conversation. Treat every query as standalone.
- If a user appears to be in genuine distress or danger, respond with empathy and gently suggest they contact local authorities or a trusted person. Do not attempt to solve the crisis yourself.

## LANGUAGE AND CULTURAL NUANCE
- Use Kenyan Swahili, not Tanzanian standard. Recognise Kenyan English phrases: "I need to renew my good conduct", "nataka kuapply passport", "nisaidie na KRA pin". Understand the intent even if the phrasing is informal.
- Use light, appropriate humour sparingly — only when the user initiates a humorous tone. Never joke about fees, delays, or corruption.

## CONTINUOUS IMPROVEMENT MINDSET
- You are always learning from each conversation how to be clearer, kinder, and more helpful. If you sense the user didn't understand, rephrase rather than repeat.
- If you make a mistake (rare, but possible), apologise briefly and correct yourself immediately with the right information from the OFFICIAL INFORMATION.

Your ultimate goal: Every Kenyan who speaks to you leaves feeling more informed, less anxious, and genuinely helped — even if the government system itself is slow or frustrating. You are the bridge between citizens and the services they deserve.`;

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

  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message in request body' });

    console.log('Received message:', message);
    console.log('GROQ_API_KEY exists:', !!GROQ_API_KEY);

    const index = loadIndex();

    // Keyword matching
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

    // Build messages with system prompt
    const lang = detectLanguage(message);
    const messages = [{ role: 'system', content: getSystemPrompt(lang) }];

    // Inject official information ONLY if a service is matched
    if (bestMatch && highestScore > 0) {
      const mdPath = path.join(process.cwd(), 'services', bestMatch.file);
      console.log('Loading service from:', mdPath);
      console.log('Best match:', bestMatch.title);
      
      try {
        const serviceContent = loadServiceContent(mdPath);
        console.log('Service content loaded successfully, length:', serviceContent.length);
        
        messages.push({
          role: 'user',
          content: `---OFFICIAL INFORMATION---\n${serviceContent}\n---END OFFICIAL INFORMATION---\n\nUser question: ${message}`
        });
      } catch (loadError) {
        console.error('Failed to load service content:', loadError);
        // Fallback to basic info without the file content
        messages.push({
          role: 'user',
          content: `The user is asking about ${bestMatch.title}. Please provide a helpful overview of this Kenyan government service. User question: ${message}`
        });
      }
    } else {
      // No service match: just send the user message, let super prompt handle it
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
      // Enhanced fallback responses when API fails
      const fallbackResponses = {
        // Greetings
        'hi': "Hello! How can I help you with government services today? Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance.",
        'hello': "Hello! How can I help you with government services today? Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance.",
        'habari': "Habari! How can I help you with government services today? Ask me about National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance.",
        
        // SHA responses
        'sha': "SHA (Social Health Authority) registration requires: original ID, KRA PIN, passport photo, and registration fee. You can register online at sha.go.ke or visit any Huduma Centre. Monthly contributions depend on your income level.",
        'health': "For SHA services, you need: original ID, KRA PIN, passport photo, and registration fee. Register online at sha.go.ke or visit Huduma Centre. The service covers inpatient, outpatient, and chronic illness benefits.",
        'bima': "SHA (Social Health Authority) ni mfumo mpya wa bima ya afya. Unahitaji: kitambulisho, KRA PIN, picha, na ada ya usajili. Jisajili online kwa sha.go.ke au tembelea Huduma Centre.",
        'afya': "SHA inakupa bima ya afya inayofaa. Malipo yanategemea kipato chako. Jisajili kwa kutumia ID, KRA PIN, na pisha.",
        
        // KRA PIN responses
        'kra': "KRA PIN registration is free and can be done online at itax.kra.go.ke. You'll need: ID document, email address, and phone number. The process takes about 15 minutes. Keep your PIN safe as it's required for many services.",
        'pin': "KRA PIN registration is free at itax.kra.go.ke. Requirements: ID, email, phone number. Processing time: 15 minutes. You'll need it for employment, banking, and business registration.",
        'kodi': "Usajili wa KRA PIN ni bure. Fanya online kwa itax.kra.go.ke. Unahitaji: kitambulisho, email, na nambari ya simu.",
        'tax': "KRA PIN is your tax identification number. Registration is free at itax.kra.go.ke. Required for jobs, banking, and many government services.",
        'fees': "KRA PIN registration is completely free. However, if you use a cyber cafe, they may charge a small service fee (usually KES 50-200) for assistance.",
        
        // National ID responses
        'national id': "For National ID application, you'll need: birth certificate, parent's ID copies, passport photos, and KRA PIN. Visit your nearest Huduma Centre with these documents. Processing takes 2-3 weeks.",
        'national': "National ID requires: birth certificate, parent's IDs, passport photos, KRA PIN. Apply at Huduma Centre. Processing: 2-3 weeks. Cost: free.",
        'id': "National ID requires: birth certificate, parent's IDs, passport photos, KRA PIN. Apply at Huduma Centre. Processing: 2-3 weeks. Cost: free.",
        'kitambulisho': "Kupata kitambulisho cha Taifa, unahitaji: cheti cha kuzaliwa, vitambulisho vya wazazi, picha, na KRA PIN. Omba kwa kituo cha Huduma.",
        
        // Passport responses
        'passport': "Passport application requires: original ID, birth certificate, 3 passport photos, KRA PIN, and recommendation letter. Apply online at eCitizen portal then visit immigration offices. Cost varies by type (KES 4,550-12,050).",
        'pasi': "Pasipoti inahitaji: ID asili, cheti cha kuzaliwa, picha 3, KRA PIN, na barua ya utangamano. Omba online kwanza kisha enda ofisi za uhamiaji.",
        
        // NSSF responses
        'nssf': "NSSF registration requires: ID copy, KRA PIN, and employer details. Register online at nssf.or.ke or visit NSSF offices. Contributions are mandatory for all employees.",
        'pension': "NSSF provides social security benefits. Registration requires ID, KRA PIN, and employer information. Visit nssf.or.ke to register.",
        
        // Birth Certificate responses
        'birth certificate': "Birth certificate application requires: birth notification, parent's IDs, and KRA PIN. Apply at civil registration office or Huduma Centre. Processing takes 2-3 weeks.",
        'birth': "Birth certificate requires: notification of birth from hospital, parent's IDs, and KRA PIN. Apply at civil registration or Huduma Centre. Cost: KES 50-200.",
        'cheti': "Cheti cha kuzaliwa kinahitaji: taarifa ya kuzaliwa kutoka hospitali, vitambulisho vya wazazi, na KRA PIN. Omba kwa ofisi za usajili wa raia au Huduma Centre.",
        'kuzaliwa': "Kupata cheti cha kuzaliwa: tembelea ofisi ya usajili wa raia au Huduma Centre na taarifa ya kuzaliwa na vitambulisho vya wazazi.",
        
        // Driving Licence responses
        'driving licence': "Driving licence requires: valid ID, passport photos, eye test certificate, and medical certificate. Apply at NTSA offices after passing both theory and practical tests.",
        'driving': "Driving licence process: 1) Pass theory test 2) Take driving lessons 3) Pass practical test 4) Apply at NTSA with ID, photos, medical cert.",
        'leseni': "Leseni ya kuendesha gari inahitaji: kufaulu mtihani wa theory na practical, ID, picha, na cheti cha afya kutoka hospitali.",
        
        // Business responses
        'business': "Business registration can be done online at ecitizen.go.ke. You'll need: ID, KRA PIN, business name approval, and registration fee (KES 1,500 for sole proprietor).",
        'biashara': "Usajili wa biashara unafanywa online kwa ecitizen.go.ke. Unahitaji: ID, KRA PIN, jina la biashara, na ada (KES 1,500 kwa mtu binafsi).",
        'company': "Company registration available at ecitizen.go.ke. Requirements: ID, KRA PIN, business name search, registration fees vary by business type.",
        
        // HELB responses
        'helb': "HELB loan application requires: ID, KRA PIN, admission letter, bank details, and parent's information. Apply online at helb.co.ke. Applications open twice a year.",
        'mkopo': "Mkopo wa HELB unahitaji: ID, KRA PIN, barua ya kukubaliwa chuo, taarifa za benki, na maelezo ya wazazi. Omba kwa helb.co.ke.",
        'loan': "HELB provides loans for university students. Requirements: ID, KRA PIN, admission letter, bank details. Apply at helb.co.ke. Two application windows per year.",
        'university': "For university funding, apply for HELB loan at helb.co.ke. You'll need admission letter, ID, KRA PIN, and parent/guardian details.",
        
        // Police Clearance responses
        'police clearance': "Police clearance certificate requires: original ID, passport photos, KRA PIN, and application fee (KES 1,050). Apply online at ecitizen.go.ke and collect from CID headquarters.",
        'good conduct': "Certificate of Good Conduct requires: ID, photos, KRA PIN, and KES 1,050 fee. Apply at ecitizen.go.ke then collect from CID HQ after 2-4 weeks.",
        'police': "Police clearance (Certificate of Good Conduct) needed for employment. Apply online at ecitizen.go.ke with ID, photos, KRA PIN. Fee: KES 1,050.",
        
        // Help/Default
        'help': "I can help you with: National ID, SHA (health insurance), KRA PIN, Passport, NSSF (pension), Birth Certificate, Driving Licence, Business Registration, HELB (student loans), and Police Clearance. What do you need help with?",
        'services': "Available services: National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, Police Clearance. Click any icon above or type your question!",
        
        // Default
        'default': "I'm here to help with Kenyan government services! I can assist with: National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance. What would you like to know?"
      };
      
      const lowerMessage = message.toLowerCase().trim();
      let fallbackReply = fallbackResponses.default;
      
      // Check for keyword matches
      for (const key in fallbackResponses) {
        if (key !== 'default' && lowerMessage.includes(key)) {
          fallbackReply = fallbackResponses[key];
          break;
        }
      }
      
      return res.status(200).json({ reply: fallbackReply });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('API error:', error);
    // Enhanced fallback for general errors
    const lowerMessage = message.toLowerCase().trim();
    let fallbackReply = "I'm here to help with Kenyan government services! I can assist with: National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, or Police Clearance. What would you like to know?";
    
    // Better keyword matching for common queries
    if (lowerMessage.includes('sha') || lowerMessage.includes('health') || lowerMessage.includes('bima') || lowerMessage.includes('afya')) {
      fallbackReply = "SHA (Social Health Authority) registration requires: original ID, KRA PIN, passport photo. Register online at sha.go.ke or visit any Huduma Centre.";
    } else if (lowerMessage.includes('kra') || lowerMessage.includes('pin') || lowerMessage.includes('tax') || lowerMessage.includes('kodi')) {
      fallbackReply = "KRA PIN registration is free at itax.kra.go.ke. You'll need: ID, email, phone number. Processing takes about 15 minutes.";
    } else if (lowerMessage.includes('national id') || lowerMessage.includes('kitambulisho') || (lowerMessage.includes('id') && !lowerMessage.includes('passport'))) {
      fallbackReply = "National ID requires: birth certificate, parent's IDs, passport photos, KRA PIN. Apply at Huduma Centre. Processing: 2-3 weeks. Cost: free.";
    } else if (lowerMessage.includes('birth') || lowerMessage.includes('certificate') || lowerMessage.includes('kuzaliwa') || lowerMessage.includes('cheti')) {
      fallbackReply = "Birth certificate requires: birth notification from hospital, parent's IDs, KRA PIN. Apply at civil registration or Huduma Centre.";
    } else if (lowerMessage.includes('passport') || lowerMessage.includes('pasi')) {
      fallbackReply = "Passport requires: ID, birth certificate, 3 passport photos, KRA PIN. Apply online at eCitizen then visit immigration. Cost: KES 4,550-12,050.";
    } else if (lowerMessage.includes('nssf') || lowerMessage.includes('pension')) {
      fallbackReply = "NSSF registration requires: ID, KRA PIN, employer details. Register at nssf.or.ke. Mandatory for all employees.";
    } else if (lowerMessage.includes('driving') || lowerMessage.includes('licence') || lowerMessage.includes('leseni')) {
      fallbackReply = "Driving licence requires: Pass theory & practical tests, ID, photos, medical cert. Apply at NTSA offices.";
    } else if (lowerMessage.includes('business') || lowerMessage.includes('biashara') || lowerMessage.includes('company')) {
      fallbackReply = "Business registration at ecitizen.go.ke. Need: ID, KRA PIN, business name. Fee: KES 1,500 for sole proprietor.";
    } else if (lowerMessage.includes('helb') || lowerMessage.includes('loan') || lowerMessage.includes('mkopo') || lowerMessage.includes('university')) {
      fallbackReply = "HELB loan requires: ID, KRA PIN, admission letter, bank details, parent info. Apply at helb.co.ke.";
    } else if (lowerMessage.includes('police') || lowerMessage.includes('clearance') || lowerMessage.includes('conduct')) {
      fallbackReply = "Police clearance requires: ID, photos, KRA PIN, KES 1,050 fee. Apply at ecitizen.go.ke, collect from CID HQ.";
    } else if (lowerMessage.includes('help') || lowerMessage.includes('services')) {
      fallbackReply = "I can help with: National ID, SHA, KRA PIN, Passport, NSSF, Birth Certificate, Driving Licence, Business Registration, HELB, Police Clearance. What do you need?";
    }
    
    return res.status(200).json({ reply: fallbackReply });
  }
};