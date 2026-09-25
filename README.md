## Ask Any Repo

This is a Next.js + TypeScript repository mapping tool. Enter a public GitHub URL to perform a depth-one clone, filter the file tree, and enforce a file-count cap.

### Supabase

Create a Supabase project, copy `.env.example` to `.env.local`, and run the SQL in `supabase/migrations/20260925000000_enable_pgvector.sql` in the Supabase SQL editor. It enables the `vector` extension and creates the `repository_chunks` table for future semantic indexing.

### Evaluation harness

The independent Python harness lives in `eval/`. Run `python eval/harness.py <github-url> --file-cap 100` to produce the same bounded repository snapshot without the web app.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
