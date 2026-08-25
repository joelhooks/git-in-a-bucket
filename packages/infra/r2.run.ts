/** Act 2: the same walgit config, pointed at Cloudflare R2.
 *
 * Requires Cloudflare auth: `pnpm exec alchemy login` (or CLOUDFLARE_API_TOKEN).
 * Deploy with: pnpm exec alchemy deploy r2.run.ts
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "git-in-a-bucket-r2",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* stack() {
    const bucket = yield* Cloudflare.R2.Bucket("walgit");
    return {
      accountId: bucket.accountId,
      bucketName: bucket.bucketName,
    };
  })
);
