import { describe, expect, it } from "vitest";

import { attrsOf, convergeScript, stopScript } from "../src/nas-minio.ts";

const props = {
  baseDir: "/volume1/example/walgit-demo",
  consolePort: 39_201,
  host: "nas.example.internal",
  s3Port: 39_200,
  user: "operator",
};

describe("convergeScript", () => {
  const script = convergeScript(props);

  it("refuses to run without an operator-owned env file", () => {
    expect(script).toContain("MISSING_ENV_FILE");
    expect(script).toContain(`[ -f ${props.baseDir}/minio.env ]`);
  });

  it("never writes credentials", () => {
    expect(script).not.toContain("MINIO_ROOT_USER=");
    expect(script).not.toContain("MINIO_ROOT_PASSWORD=");
  });

  it("records the pid it starts", () => {
    expect(script).toContain(`echo $! > ${props.baseDir}/minio.pid`);
  });

  it("ends with a health probe on the S3 port", () => {
    const lastLine = script.split("\n").at(-1);
    expect(lastLine).toContain(`localhost:${props.s3Port}/minio/health/live`);
  });
});

describe("stopScript", () => {
  const script = stopScript(props);

  it("kills only the recorded pid, never by process name", () => {
    expect(script).toContain(`kill "$(cat ${props.baseDir}/minio.pid)"`);
    expect(script).not.toContain("pkill");
    expect(script).not.toContain("killall");
  });

  it("retains data and binary on destroy", () => {
    expect(script).not.toContain("rm -rf");
    expect(script).not.toContain(`${props.baseDir}/data`);
    expect(script).not.toContain(`${props.baseDir}/bin`);
  });
});

describe("attrsOf", () => {
  it("derives the endpoint from host and port", () => {
    expect(attrsOf(props, "some-version")).toEqual({
      endpoint: "http://nas.example.internal:39200",
      version: "some-version",
    });
  });
});
