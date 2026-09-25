# Evaluation harness

The harness mirrors the app's repository boundary without requiring a running Next.js server. It shallow-clones a public GitHub URL into a temporary directory, skips dependencies, build output, lockfiles, and image assets, then emits a capped JSON file list.

```bash
python eval/harness.py https://github.com/vercel/next.js --file-cap 100
```

The temporary checkout is deleted automatically when the command exits.