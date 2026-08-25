# git-in-a-bucket

A git server whose entire consensus is a 263-byte protobuf in an S3 bucket, updated by compare-and-swap. This repo is the demo rig around [walgit](https://github.com/tobi/walgit): infrastructure as TypeScript via [alchemy](https://alchemy.run), same Effect idiom as the app code.

Two acts, one config shape:

1. **NAS act** — a custom alchemy resource (`NasMinio`) converges a MinIO server on a NAS over ssh: binary present, process healthy, credentials operator-owned. walgit points at it.
2. **R2 act** — the same walgit config pointed at a Cloudflare R2 bucket. Zero egress, conditional writes, nothing else changes.

The interesting part is `packages/infra/src/nas-minio.ts`: an IaC provider is just `reconcile`/`read`/`delete` in plain Effect. It adopts an already-running server instead of restarting it, refuses to mint or store credentials, and retains data on destroy.

## Layout

| Path             | Role                                     |
| ---------------- | ---------------------------------------- |
| `packages/infra` | alchemy stacks + the `NasMinio` provider |
| `packages/core`  | template core (unused by the demo yet)   |
| `apps/cli`       | template CLI (unused by the demo yet)    |

## Run it

```bash
pnpm install
cd packages/infra
cp .env.example .env   # fill in your NAS host/user — private, stays out of git
pnpm exec alchemy deploy            # act 1: NAS
pnpm exec alchemy deploy r2.run.ts  # act 2: R2 (needs `alchemy login`)
```

Credentials never live in this repo or in alchemy state: `minio.env` on the NAS is created by hand and the provider only checks that it exists.

## Survive a NAS reboot

The deploy installs an idempotent `bin/start-minio.sh` on the NAS. Wiring it to boot needs root once — the provider never runs as root, the same stance it takes on credentials. On a Synology, copy `packages/infra/assets/install-boot-hook.sh` to the NAS and run:

```bash
sudo sh install-boot-hook.sh /path/to/walgit-demo <run-as-user>
```

That writes `/usr/local/etc/rc.d/S99walgit-demo.sh` (DSM preserves that directory across updates), which waits for the volume at boot and runs the start script as the named user. Boot log: `/var/log/walgit-demo-boot.log`.

## Provenance

Scaffolded from [ts-cli-template](https://github.com/joelhooks/ts-cli-template). walgit built from source; MinIO runs as a plain static binary on the NAS — no Docker required.
