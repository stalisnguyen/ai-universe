#!/usr/bin/env node
/**
 * AI Universe — Auto Update Bot
 * Uses Claude API + web search to find new AI tools and add them automatically
 * Runs daily via GitHub Actions
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/ai-tools.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function callClaude(messages, system, useWebSearch = false) {
  return new Promise((resolve, reject) => {
    const tools = useWebSearch ? [{
      type: 'web_search_20250305',
      name: 'web_search'
    }] : [];

    const body = JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 8096,
      system,
      messages,
      ...(tools.length > 0 ? { tools } : {})
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseJSON(text) {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ─── Step 1: Find new AI tools via web search ───────────────────────────────

async function findNewTools(existingNames) {
  console.log('🔍 Searching for new AI tools...');

  const system = `You are an AI researcher tracking new AI tools and products.
Your job is to find AI tools that were launched or gained significant traction recently.
Always respond with valid JSON only — no markdown, no explanation.`;

  const prompt = `Search the web for AI tools launched or trending in the last 30 days.

Existing tools to EXCLUDE (already in our catalog):
${existingNames.join(', ')}

Search for: "new AI tools 2025", "AI product launches", "trending AI apps"

Return a JSON array of up to 5 genuinely new tools not in the exclusion list:
[
  {
    "name": "Tool Name",
    "company": "Company Name",
    "category": "one of: llm|image|video|audio|code|search|agent|multimodal",
    "link": "https://...",
    "reason": "Why this tool is notable"
  }
]

Only include tools you are confident exist and are real. If nothing new found, return [].`;

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    system,
    true
  );

  try {
    return parseJSON(text);
  } catch (e) {
    console.error('Failed to parse new tools list:', text);
    return [];
  }
}

// ─── Step 2: Generate full tool data for each new tool ──────────────────────

async function generateToolData(tool, categories) {
  console.log(`  📝 Generating data for: ${tool.name}`);

  const system = `You are a technical writer creating structured data for an AI tools catalog.
You must respond with valid JSON only — absolutely no markdown fences, no explanation, just raw JSON.`;

  const prompt = `Research the AI tool "${tool.name}" by ${tool.company} (${tool.link}) and generate a complete catalog entry.

Return ONLY this JSON object (no markdown, no backticks):
{
  "id": "${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
  "name": "${tool.name}",
  "company": "${tool.company}",
  "category": "${tool.category}",
  "icon": "<single relevant emoji>",
  "badge": <"hot"|"new"|"pro"|null>,
  "color": "<hex color matching the tool brand>",
  "price": <"free"|"freemium"|"paid">,
  "priceLabel": "<e.g. Free / Freemium / From $20/mo>",
  "tags": ["<3-4 short tags>"],
  "shortDesc": "<one sentence, max 120 chars>",
  "fullDesc": "<2-3 sentences describing what it does and who it is for>",
  "info": [
    {"label": "Type", "value": "<type>"},
    {"label": "Released", "value": "<year or month/year>"},
    {"label": "Best for", "value": "<use case>"},
    {"label": "Pricing", "value": "<short pricing summary>"}
  ],
  "features": ["<6-8 key features, each one sentence>"],
  "demo": [
    {"title": "<step title>", "desc": "<step description>", "code": "<optional command or prompt>"}
  ],
  "prompts": [
    {"label": "<prompt category>", "text": "<example prompt>"}
  ],
  "pricing": {
    "note": "<1-2 sentence pricing context>",
    "plans": [
      {
        "name": "<plan name>",
        "price": "<price>",
        "per": "<per month|per year|forever>",
        "popular": <true|false>,
        "color": "<hex>",
        "features": ["<3-5 features>"]
      }
    ]
  },
  "link": "${tool.link}"
}`;

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    system,
    true
  );

  return parseJSON(text);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 AI Universe Auto-Update Bot starting...\n');

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const existingNames = data.tools.map(t => t.name);
  console.log(`📚 Existing tools: ${existingNames.length}`);

  const newTools = await findNewTools(existingNames);
  console.log(`\n✨ Found ${newTools.length} potential new tools`);

  if (newTools.length === 0) {
    console.log('Nothing new to add today.');
    data.lastChecked = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return;
  }

  let added = 0;
  for (const tool of newTools) {
    const alreadyExists = data.tools.some(t =>
      t.name.toLowerCase() === tool.name.toLowerCase() ||
      t.link === tool.link
    );
    if (alreadyExists) {
      console.log(`  ⏭  Skipping ${tool.name} (already exists)`);
      continue;
    }

    try {
      const toolData = await generateToolData(tool, data.categories);
      data.tools.push(toolData);
      added++;
      console.log(`  ✅ Added: ${toolData.name} (${toolData.category})`);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  ❌ Failed for ${tool.name}:`, e.message);
    }
  }

  data.lastUpdated = new Date().toISOString();
  data.lastChecked = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`\n🎉 Done! Added ${added} new tools. Total: ${data.tools.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
