# Vision

**git-in-a-bucket** is a content demo rig that proves one idea from two angles: infrastructure can live in the same language, idiom, and repo as the application it serves — and a git server can live in an S3 bucket with a 263-byte manifest as its whole consensus.

The subject is [walgit](https://github.com/tobi/walgit). The method is [alchemy](https://alchemy.run): Effect-based IaC where a custom provider is three functions, not a plugin SDK. The rig converges a MinIO server on a NAS over ssh and an R2 bucket on Cloudflare from one codebase, and walgit treats both as the same thing — a bucket that honors compare-and-swap.

## Who it serves

- Joel, producing a howto/demo (article and/or video) from a rig that actually runs.
- Readers who want to see IaC-as-plain-code and CAS-as-consensus with receipts, not diagrams.

## Boundaries

- Operator topology (hosts, users, tailnet addresses) lives in `.env` and on the NAS — never in the repo.
- Credentials are created by hand and checked for existence only. IaC state never contains a secret.
- Destroy stops processes; it never deletes repo data. Deleting bytes is a human decision.
- The fence (typecheck, lint, format, hooks) is inherited from ts-cli-template and stays on.
