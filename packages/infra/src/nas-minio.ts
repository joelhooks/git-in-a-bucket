import { spawn } from "node:child_process";

import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface NasMinioProps {
  /** Base directory on the NAS: bin/, data/, logs/, minio.env live under it. */
  baseDir: string;
  /** MinIO console port. */
  consolePort: number;
  /** MinIO server binary download URL. */
  downloadUrl?: string;
  /** SSH destination host. Operator config — never commit a real value. */
  host: string;
  /** S3 API port. */
  s3Port: number;
  /** SSH user on the NAS. */
  user: string;
}

export interface NasMinioAttrs {
  /** S3 endpoint as reachable from the machine running the deploy. */
  endpoint: string;
  version: string;
}

const DEFAULT_DOWNLOAD_URL =
  "https://dl.min.io/server/minio/release/linux-amd64/minio";

export class NasSshError extends Data.TaggedError("NasSshError")<{
  readonly host: string;
  readonly stderr: string;
}> {}

interface SshResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const runSsh = (args: readonly string[]): Effect.Effect<SshResult> =>
  Effect.callback<SshResult>((resume) => {
    const child = spawn("ssh", [...args], { timeout: 120_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resume(Effect.succeed({ code, stderr, stdout }));
    });
  });

const sshExec = (props: {
  host: string;
  script: string;
  user: string;
}): Effect.Effect<string, NasSshError> =>
  runSsh([
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    `${props.user}@${props.host}`,
    props.script,
  ]).pipe(
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.succeed(result.stdout.trim())
        : Effect.fail(
            new NasSshError({ host: props.host, stderr: result.stderr })
          )
    )
  );

const readVersion = (props: NasMinioProps) =>
  sshExec({
    host: props.host,
    script: `${props.baseDir}/bin/minio --version 2>/dev/null | head -1 || echo unknown`,
    user: props.user,
  });

export const attrsOf = (
  props: NasMinioProps,
  version: string
): NasMinioAttrs => ({
  endpoint: `http://${props.host}:${props.s3Port}`,
  version,
});

/** Idempotent converge script. Credentials are operator-owned: the resource
 * requires `minio.env` to already exist on the NAS and never reads, writes,
 * or stores its contents — so no secret ever lands in alchemy state. */
export const convergeScript = (props: NasMinioProps) => {
  const base = props.baseDir;
  const url = props.downloadUrl ?? DEFAULT_DOWNLOAD_URL;
  return [
    "set -e",
    `mkdir -p ${base}/bin ${base}/data ${base}/logs`,
    `[ -x ${base}/bin/minio ] || { curl -fSsLo ${base}/bin/minio ${url} && chmod +x ${base}/bin/minio; }`,
    `[ -f ${base}/minio.env ] || { echo "MISSING_ENV_FILE" >&2; exit 42; }`,
    `if ! curl -s -m 3 -o /dev/null http://localhost:${props.s3Port}/minio/health/live; then`,
    `  cd ${base}`,
    "  set -a; . ./minio.env; set +a",
    `  nohup ./bin/minio server ./data --address :${props.s3Port} --console-address :${props.consolePort} >> logs/minio.log 2>&1 &`,
    `  echo $! > ${base}/minio.pid`,
    "  for _ in 1 2 3 4 5 6 7 8 9 10; do",
    "    sleep 1",
    `    curl -s -m 2 -o /dev/null http://localhost:${props.s3Port}/minio/health/live && break`,
    "  done",
    "fi",
    `curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:${props.s3Port}/minio/health/live`,
  ].join("\n");
};

/** Stops the process by recorded PID (never by name: other sessions may run
 * their own workers on the same box). Data and binary are retained — deleting
 * repo bytes is a human decision, not an IaC side effect. */
export const stopScript = (props: NasMinioProps) => {
  const pid = `${props.baseDir}/minio.pid`;
  return [
    `if [ -f ${pid} ] && kill -0 "$(cat ${pid})" 2>/dev/null; then`,
    `  kill "$(cat ${pid})"`,
    "fi",
    `rm -f ${pid}`,
  ].join("\n");
};

export type NasMinio = Resource<
  "GitInABucket.NasMinio",
  NasMinioProps,
  NasMinioAttrs
>;

export const NasMinio = Resource<NasMinio>("GitInABucket.NasMinio");

const missingEnvFileMessage = (props: NasMinioProps) =>
  `${props.baseDir}/minio.env does not exist on ${props.host}. ` +
  "Create it by hand (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD, chmod 600). " +
  "This resource refuses to mint or store credentials.";

export const NasMinioProvider = () =>
  Provider.succeed(NasMinio, {
    delete: ({ olds }) =>
      Effect.gen(function* stopMinio() {
        const props = olds;
        yield* sshExec({
          host: props.host,
          script: stopScript(props),
          user: props.user,
        }).pipe(Effect.ignore);
      }),
    list: () => Effect.succeed([]),
    read: ({ output }) => Effect.succeed(output),
    reconcile: ({ news }) =>
      Effect.gen(function* convergeMinio() {
        const props = news;
        const status = yield* sshExec({
          host: props.host,
          script: convergeScript(props),
          user: props.user,
        }).pipe(
          Effect.mapError((error) =>
            error.stderr.includes("MISSING_ENV_FILE")
              ? new NasSshError({
                  host: props.host,
                  stderr: missingEnvFileMessage(props),
                })
              : error
          )
        );
        if (!status.endsWith("200")) {
          return yield* Effect.fail(
            new NasSshError({
              host: props.host,
              stderr: `minio did not become healthy on :${props.s3Port} (last probe: ${status})`,
            })
          );
        }
        const version = yield* readVersion(props);
        return attrsOf(props, version);
      }),
  });

export const providers = () => Layer.mergeAll(NasMinioProvider());
