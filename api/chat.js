const fs = require('fs');
const path = require('path');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

module.exports = async (req, res) => {
  // Allow CORS for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Temporary: respond with the error message instead of actual logic
    // This will show us if the environment variables are working
    return res.status(200).json({ 
      reply: `DEBUG: Received your message: "${message}". GROQ_API_KEY is ${GROQ_API_KEY ? 'SET' : 'MISSING'}. Knowledge base folder check: ${fs.existsSync(path.join(process.cwd(), 'Huduma -Ai Research.md')) ? 'FOUND' : 'NOT FOUND'}`
    });

  } catch (error) {
    console.error('Fatal error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
};