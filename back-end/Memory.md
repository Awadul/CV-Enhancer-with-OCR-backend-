# Backend Project Memory: CV Customizer App
This file serves as a persistent memory record of key architectural decisions, resolved issues, and development constraints on the back-end to ensure future tasks avoid regressions.
---
## 1. Puppeteer Cache & Browser Persistence on Render.com
### The Issue
- Render.com wipes `/opt/render/.cache/` between the build container and the live runtime container.
- Consequently, running Puppeteer's default installer places Chrome in the global cache, which disappears at runtime, leading to:
  `Error: Could not find Chrome (ver. 150.x.x.x) ...`
### The Solution
- **Local Cache Config**: We created [\.puppeteerrc.cjs](file:///d:/CV%20Customizer%20App/CV-Enhancer-with-OCR-backend-/back-end/.puppeteerrc.cjs) to force Puppeteer to store its downloaded browser binaries inside the project directory:
  ```javascript
  const { join } = require('path');
  module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  };
  ```
- **Automatic Build Installation**: We updated `package.json`'s build command to:
  `"build": "tsc && npx puppeteer browsers install chrome"`
  This installs Chrome directly into the project folder (`back-end/.cache/puppeteer`) during the build step, ensuring it is committed to the runtime disk image.
- **Render Configuration**: Never add `PUPPETEER_CACHE_DIR` to Render's environment dashboard unless it points explicitly to the project's subfolder, as it will override `.puppeteerrc.cjs` and break the runtime paths.
---
## 2. Request Payload Size Limits
### The Issue
- When the frontend calls `/pdf/generate`, it sends the complete cloned HTML of the CV preview along with all compiled CSS rules (including Tailwind utility rules and font styling).
- By default, Express restricts JSON parsing payloads to `100kb`. Large styled CV HTML strings are usually **1MB to 3MB**, which triggered `PayloadTooLargeError: request entity too large`.
### The Solution
- We configured both `express.json` and `express.urlencoded` parsers in [app.ts](file:///d:/CV%20Customizer%20App/CV-Enhancer-with-OCR-backend-/back-end/src/app.ts) to support a safe maximum limit of **5MB**:
  ```typescript
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));
  ```
- **Constraint**: Do not increase this payload limit beyond 5MB–10MB in production to protect the server from Denial of Service (DoS) memory exhaustion vectors.
---
## 3. Server-Side Auto-Pagination Evaluation
### The Design
- Headless Chrome on the server executes the exact same auto-pagination script inside `page.evaluate()` as the client does in [CVPreview.tsx](file:///d:/CV%20Customizer%20App/CV-Enhancer-with-OCR-frontend/front-end/src/components/CVPreview.tsx).
- **Reason**: Client display DPI, operating system fonts, and browser zoom factors skew client-side `getBoundingClientRect()` measurements. Recalculating pagination server-side under a controlled 96 DPI viewport (`794px` x `1123px` A4) guarantees 100% vector accuracy in generated PDFs.
- **Constraint**: When making updates to the frontend pagination loop in `CVPreview.tsx`, the same logic MUST be applied to the Puppeteer evaluation block in [pdfController.ts](file:///d:/CV%20Customizer%20App/CV-Enhancer-with-OCR-backend-/back-end/src/controllers/pdfController.ts).

---

## 4. Supabase Database Schema & CLI Migrations

### Architecture
- **Stateless Backend**: The Node server is 100% stateless and does not handle database CRUD or authentication routing. All database writes/reads are conducted direct-to-BaaS from the client.
- **Authentication**: Secured via Supabase Auth and Row-Level Security (RLS) policies at the PostgreSQL layer.

### Directory structure & Migrations
- All database configuration files are managed in the `supabase` root directory of the workspace.
- **Single Source of Truth**: The full, complete database schema is kept in [supabase/schema.sql](file:///d:/CV%20Customizer%20App/supabase/schema.sql). Any updates to tables, triggers, or policies must be applied here first.
- **Timestamped Migrations**: History is tracked in the `supabase/migrations/` subfolder using timestamp-stamped SQL files:
  - [20260625201000_create_user_profiles.sql](file:///d:/CV%20Customizer%20App/supabase/migrations/20260625201000_create_user_profiles.sql): Initial profile table setup.
  - [20260625204500_create_saved_cvs.sql](file:///d:/CV%20Customizer%20App/supabase/migrations/20260625204500_create_saved_cvs.sql): Table setup for saving multiple CV projects.
- **Rule**: Do not create or retain redundant files (like `supabase_schema.sql` at the project root). Keep the database definitions isolated strictly to the `supabase` folder.

