# AI Universe 🌐

> A self-updating directory of AI tools, models, and pricing — hosted for free.

## Stack (all free)

| Layer | Service | Cost |
|---|---|---|
| Hosting | Cloudflare Pages | $0 |
| Repo & CI | GitHub + GitHub Actions | $0 |
| Data | `data/ai-tools.json` in repo | $0 |
| Auto-updates | GitHub Actions cron (daily) | $0 |
| **Total** | | **$0/month** |

---

## 🚀 Deploy in 5 steps

### Step 1 — Create GitHub repo

1. Go to **github.com → New repository**
2. Name it `ai-universe` (or anything you like)
3. Set to **Public** (required for free Cloudflare Pages)
4. Click **Create repository**

### Step 2 — Push this project

```bash
# In this project folder:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-universe.git
git push -u origin main
```

### Step 3 — Connect to Cloudflare Pages

1. Go to **dash.cloudflare.com** → Create account (free)
2. Click **Workers & Pages → Create → Pages**
3. Click **Connect to Git → GitHub**
4. Authorize Cloudflare, select your `ai-universe` repo
5. Configure build:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` *(root)*
6. Click **Save and Deploy**

✅ Your site is now live at `your-project.pages.dev`

### Step 4 — (Optional) Add custom domain

1. In Cloudflare Pages → your project → **Custom domains**
2. Add your domain (e.g. `aiuniverse.dev`)
3. Cloudflare handles DNS + HTTPS automatically — free

### Step 5 — Verify auto-update works

1. In your GitHub repo, go to **Actions** tab
2. Click **🤖 Daily AI Data Update**
3. Click **Run workflow → Run** to test manually
4. You should see a green checkmark after ~30 seconds
5. Check if `data/ai-tools.json` was updated (commit history)

That's it. Every day at 06:00 UTC, GitHub Actions will:
- Run `scripts/fetch-data.js`
- Update `data/ai-tools.json` with a new `lastChecked` timestamp
- Commit and push → Cloudflare Pages redeploys in ~30 seconds

---

## 📁 Project structure

```
ai-universe/
├── index.html                  ← Main website (fetches data dynamically)
├── data/
│   └── ai-tools.json           ← All AI tool data (auto-updated daily)
├── scripts/
│   └── fetch-data.js           ← Node.js updater script
├── .github/
│   └── workflows/
│       └── update.yml          ← GitHub Actions cron job
├── .gitignore
└── README.md
```

---

## ✏️ How to manually update tool data

The simplest way to add or edit tools is directly in `data/ai-tools.json`.

### Add a new tool

1. Open `data/ai-tools.json`
2. Find the `"tools"` array
3. Copy an existing tool object and modify it:

```json
{
  "id": "my-new-tool",
  "name": "My New Tool",
  "company": "Some Company",
  "category": "llm",
  "icon": "✨",
  "badge": "new",
  "color": "#00f5c4",
  "price": "freemium",
  "priceLabel": "Freemium",
  "tags": ["Chat", "API"],
  "shortDesc": "Short description for the card.",
  "fullDesc": "Longer description shown in the modal.",
  "info": [
    { "label": "Version", "value": "v1.0" },
    { "label": "Context", "value": "128K tokens" },
    { "label": "Released", "value": "2025" },
    { "label": "Pricing", "value": "Free / $20/mo" }
  ],
  "features": [
    "Feature one",
    "Feature two"
  ],
  "demo": [
    { "title": "Step 1", "desc": "How to get started.", "code": null }
  ],
  "prompts": [
    { "label": "Example prompt", "text": "Your prompt here" }
  ],
  "pricing": {
    "note": "Billing note here.",
    "plans": [
      {
        "name": "Free",
        "price": "$0",
        "per": "/month",
        "popular": false,
        "color": "#6b7280",
        "features": ["Feature A", "Feature B"]
      }
    ]
  },
  "link": "https://example.com"
}
```

4. Commit and push → site updates in ~30 seconds

### Valid `category` values
`llm` · `image` · `video` · `audio` · `code` · `search` · `agent` · `multimodal`

### Valid `price` values (controls card color)
`free` · `freemium` · `paid`

### Valid `badge` values
`hot` · `new` · `pro` · `null`

---

## 🔧 Extend the auto-updater

`scripts/fetch-data.js` has a `CHECKERS` map. Add a checker for any tool:

```js
async function checkMyCoolTool(tool) {
  const { status, body } = await fetchURL('https://mycooltool.com/pricing');
  if (status !== 200) return { changed: false };

  const patches = [];
  // Parse the page and detect if price changed
  if (body.includes('$25') && tool.pricing?.plans?.[0]?.price !== '$25') {
    patches.push({ field: 'pricing.plans[0].price', value: '$25' });
  }
  return { changed: patches.length > 0, patches };
}

// Then add to the CHECKERS map:
const CHECKERS = {
  ...
  'my-cool-tool': checkMyCoolTool,
};
```

---

## 🆙 Upgrade paths (still mostly free)

| Need | Solution | Cost |
|---|---|---|
| Real-time pricing data | Integrate with ScrapingBee or Browserless APIs | ~$30/mo |
| User submissions | Add Airtable form as CMS | Free tier |
| Comments / ratings | Integrate Giscus (GitHub Discussions) | Free |
| Analytics | Cloudflare Web Analytics | Free |
| Search across tools | Add Pagefind (static search) | Free |
