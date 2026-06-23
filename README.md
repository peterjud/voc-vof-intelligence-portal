# Customer & Field Intelligence Portal

Voice of Customer / Voice of Field signal portal for Intuit Commercial Sales. A single, self-contained dashboard that brings disparate field and customer signals into one view — built to a fixed schema so new query outputs render automatically instead of being hand-built into slides.

**Confidential — internal use only.** Contains real customer firm names, executive verbatims, and churn analysis.

## What it shows

- **Signal at a glance (KPI):** customer-facing time, post-sale drag, CRM tax, Heartbeat sentiment, Top-100 call volume.
- **What's moving:** three-wave Time-in-Motion trend paired with a term word cloud.
- **Where the week goes:** time-allocation mix by segment.
- **Trending:** Top-100 churn drivers, capability demand, and migration paths from Gong.
- **What they actually said:** every verbatim carries its count ("n similar"), filterable by segment, product, source, theme, sentiment, and free-text search.
- **Source coverage:** breadth of signal behind the findings.

## Run locally

No build step, no dependencies. Either open `index.html` directly, or serve it:

```bash
python3 -m http.server 8099
# then open http://localhost:8099
```

## Structure

```
index.html          # shell: masthead, tabs, filter bar, panels
assets/styles.css   # design system (neutral Intuit palette)
assets/app.js        # rendering + filtering (vanilla JS, inline SVG charts)
assets/data.js       # window.VOC_DATA — the data layer (curated panels + classified signals)
```

The data layer (`assets/data.js`) is the contract. It holds curated panel data plus every classified signal, each tagged with source, segment, product, theme, sentiment, period, and count. Regenerating that file refreshes the whole dashboard — which is where the ingestion agents will write in a later phase.

## Data sources

Heartbeat survey · Time in Motion · Gong (Top-100 firm calls) · Executive Customer Engagements · Seller Roundtables · Account-Manager experience surveys. Jun 2025 – Jun 2026.
