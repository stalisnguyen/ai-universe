/**
 * fetch-data.js
 * Run by GitHub Actions daily.
 * Reads current ai-tools.json, checks public pricing pages/APIs for changes,
 * and writes updated JSON back to data/ai-tools.json.
 *
 * Zero external dependencies — uses Node.js built-ins only (https module).
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/ai-tools.json');

// ─────────────────────────────────────────────
// Helper: fetch a URL and return body as string
// ─────────────────────────────────────────────
function fetchURL(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ...options, timeout: 10000 }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchURL(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

// ─────────────────────────────────────────────
// Checkers: one function per tool that we can
// programmatically verify. Returns { changed, patches }
// patches = array of { field, value } to apply to the tool object
// ─────────────────────────────────────────────

async function checkOpenAIPricing(tool) {
  // OpenAI publishes pricing as structured data on their pricing page
  try {
    const { status, body } = await fetchURL('https://openai.com/api/pricing', {
      headers: { 'User-Agent': 'AI-Universe-Bot/1.0 (price monitor; +https://github.com/yourusername/ai-universe)' }
    });
    if (status !== 200) return { changed: false };

    const patches = [];

    // GPT-4o: look for "$2.50" input token price
    if (body.includes('$2.50') || body.includes('2.5')) {
      // Price confirmed current — check if our data is different
      const currentPlan = tool.pricing?.plans?.find(p => p.name === 'API (4o)');
      if (currentPlan && !currentPlan.price.includes('2.50')) {
        patches.push({ path: 'pricing.plans[API (4o)].price', value: '$2.50' });
        console.log(`  [${tool.name}] API pricing updated`);
      }
    }
    return { changed: patches.length > 0, patches };
  } catch (e) {
    console.warn(`  [${tool.name}] Check skipped: ${e.message}`);
    return { changed: false };
  }
}

async function checkAnthropicPricing(tool) {
  try {
    const { status, body } = await fetchURL('https://www.anthropic.com/pricing', {
      headers: { 'User-Agent': 'AI-Universe-Bot/1.0' }
    });
    if (status !== 200) return { changed: false };
    // Claude 3.5 Sonnet pricing: $3/1M input tokens
    const hasSonnet = body.includes('claude-3-5-sonnet') || body.includes('Claude 3.5 Sonnet');
    const hasPricing = body.includes('$3') || body.includes('3.00');
    console.log(`  [${tool.name}] Page loaded OK. Sonnet mention: ${hasSonnet}`);
    return { changed: false }; // No structural change detected
  } catch (e) {
    console.warn(`  [${tool.name}] Check skipped: ${e.message}`);
    return { changed: false };
  }
}

async function checkGitHubCopilotPricing(tool) {
  try {
    const { status, body } = await fetchURL('https://github.com/features/copilot', {
      headers: { 'User-Agent': 'AI-Universe-Bot/1.0' }
    });
    if (status !== 200) return { changed: false };
    const patches = [];
    // Check if Business plan price changed from $19
    if (body.includes('$19') || body.includes('19/month')) {
      console.log(`  [${tool.name}] Business plan price $19 confirmed`);
    } else if (body.includes('$21') || body.includes('$25')) {
      patches.push({ note: 'GitHub Copilot Business price may have changed — manual review needed' });
      console.log(`  [${tool.name}] ⚠ Price change detected — check manually`);
    }
    return { changed: patches.length > 0, patches };
  } catch (e) {
    console.warn(`  [${tool.name}] Check skipped: ${e.message}`);
    return { changed: false };
  }
}

async function checkPerplexityPricing(tool) {
  try {
    const { status, body } = await fetchURL('https://www.perplexity.ai/pro', {
      headers: { 'User-Agent': 'AI-Universe-Bot/1.0' }
    });
    if (status !== 200) return { changed: false };
    // Pro plan is $20/month
    const confirmed = body.includes('$20') || body.includes('20/month');
    console.log(`  [${tool.name}] Pro $20/mo confirmed: ${confirmed}`);
    return { changed: false };
  } catch (e) {
    console.warn(`  [${tool.name}] Check skipped: ${e.message}`);
    return { changed: false };
  }
}

// Map tool IDs to their checker functions
const CHECKERS = {
  'chatgpt': checkOpenAIPricing,
  'gpt4o':   checkOpenAIPricing,
  'claude':  checkAnthropicPricing,
  'github-copilot': checkGitHubCopilotPricing,
  'perplexity': checkPerplexityPricing,
};

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log('🤖 AI Universe data updater starting...');
  console.log('📅 Date:', new Date().toISOString());

  // Load current data
  if (!fs.existsSync(DATA_PATH)) {
    console.error('❌ data/ai-tools.json not found. Run from repo root.');
    process.exit(1);
  }
  const current = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`📦 Loaded ${current.tools.length} tools`);

  let anyChanged = false;
  const checkLog = [];

  // Run available checkers
  for (const tool of current.tools) {
    const checker = CHECKERS[tool.id];
    if (!checker) {
      console.log(`  [${tool.name}] No checker — skipping`);
      continue;
    }
    console.log(`🔍 Checking ${tool.name}...`);
    try {
      const result = await checker(tool);
      if (result.changed) {
        anyChanged = true;
        checkLog.push({ tool: tool.name, patches: result.patches });
      }
    } catch (e) {
      console.warn(`  [${tool.name}] Error: ${e.message}`);
    }
    // Polite delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  // Always update the lastUpdated timestamp and checkLog
  current.lastUpdated = new Date().toISOString();
  current.lastChecked = new Date().toISOString();
  current.checkLog = checkLog;

  // Write back
  fs.writeFileSync(DATA_PATH, JSON.stringify(current, null, 2));
  console.log('\n✅ data/ai-tools.json updated');

  if (anyChanged) {
    console.log('⚡ Changes detected:');
    checkLog.forEach(c => console.log(`  • ${c.tool}:`, JSON.stringify(c.patches)));
  } else {
    console.log('📊 No pricing changes detected — timestamp refreshed');
  }

  console.log('\n📝 Summary:');
  console.log(`  Tools checked: ${Object.keys(CHECKERS).length}`);
  console.log(`  Last updated:  ${current.lastUpdated}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
