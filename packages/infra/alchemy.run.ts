/** Act 1: MinIO on the NAS, converged over ssh.
 *
 * Operator values come from .env (see .env.example) — host and user are
 * private topology and never belong in this file.
 */
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import { NasMinio, providers } from "./src/nas-minio.ts";

export default Alchemy.Stack(
  "git-in-a-bucket",
  {
    providers: providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* stack() {
    const minio = yield* NasMinio("nas-minio", {
      baseDir: yield* Config.string("GIAB_NAS_BASE_DIR"),
      consolePort: yield* Config.number("GIAB_NAS_CONSOLE_PORT").pipe(
        Config.withDefault(39_201)
      ),
      host: yield* Config.string("GIAB_NAS_HOST"),
      s3Port: yield* Config.number("GIAB_NAS_S3_PORT").pipe(
        Config.withDefault(39_200)
      ),
      user: yield* Config.string("GIAB_NAS_USER"),
    });
    return {
      endpoint: minio.endpoint,
      minioVersion: minio.version,
    };
  })
);
