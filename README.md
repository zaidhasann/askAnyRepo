# Ask Any Repo

Ask plain-English questions about a public GitHub repository and get a cited answer from a small multi-agent pipeline.

## What It Does

1. Shallow-clones a public GitHub repository with `git clone --depth 1`.
2. Filters dependencies, build output, lockfiles, and image assets.
3. Reads the retained file contents with a hard file-count cap.
4. Runs three cooperating agents:
   - **Planner** creates up to three focused sub-questions.
   - **Executor** finds likely files and drafts cited answers or a suggested diff.
   - **Critic** deterministically verifies citation paths and line numbers.
5. Displays the answer, locations, confidence, trace, consistency score, and optional approval gate.

The UI supports both **Ask a question** and **Paste an error** modes. Error mode uses a different Planner instruction to identify likely files and functions, then uses the same Executor and Critic pipeline.

## Setup

Requirements: Node.js, npm, Git, and a Groq API key.

```bash
npm install
```

Create `.env.local` in the project root:

```env
GROQ_API_KEY=your-groq-api-key
GROQ_API_KEY_FALLBACK=optional-fallback-groq-api-key
```

Never commit `.env.local`. It is ignored by Git.

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Paste a public repository URL such as `https://github.com/octocat/Hello-World`.
2. Set a file cap if needed and select **Map repository**.
3. Ask a question or paste an error/stack trace.
4. Select Planner, Executor, or Critic to inspect its audit trace.
5. For an error-mode suggested diff, use **Approve** or **Reject**. Approval is intentionally a stub and does not write to GitHub.

The system retries failed clones once, reports degraded snapshots instead of crashing, enforces a request step/time budget, retries invalid citations once, and explicitly reports unverified answers.

## API Routes

- `POST /api/inspect` maps a public GitHub repository.
- `POST /api/ask` accepts `{ snapshot, question, mode }` and returns the answer, citations, trace, confidence, consistency, refusal details, and optional diff.
- `POST /api/approve` logs an approval request and returns `{ applied: true }`; it performs no GitHub write.

## Evaluation Harness

The independent Python harness in `eval/` mirrors the bounded clone and file-walk behavior without calling the web app:

```bash
python eval/harness.py https://github.com/octocat/Hello-World --file-cap 100
```

## Validation

```bash
npm run lint
npm run build
```

The Supabase pgvector migration is retained in `supabase/migrations/` for future semantic indexing, but the current hackathon pipeline uses simple path/keyword matching and does not wire up vector search.