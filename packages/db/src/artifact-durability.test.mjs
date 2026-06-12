import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { normalizeArtifactForStorage } from "./artifact-durability.mjs";

test("artifact durability classifies managed local files under the artifact root", () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), "floop-artifacts-"));
  const artifact = normalizeArtifactForStorage(
    {
      kind: "log",
      label: "stdout",
      uri: pathToFileURL(join(artifactRoot, "executions", "execution_1", "stdout.log")).href,
      metadata: { stream: "stdout" },
    },
    { artifactRoot },
  );

  assert.equal(artifact.metadata.stream, "stdout");
  assert.equal(artifact.metadata.floopDurability.storageMode, "managed_local_file");
  assert.equal(artifact.metadata.floopDurability.copyPolicy, "created_by_floop");
  assert.equal(artifact.metadata.floopDurability.cleanupPolicy, "retain_until_project_delete");
});

test("artifact durability treats external file and remote URIs as references", () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), "floop-artifacts-"));
  const externalFile = normalizeArtifactForStorage(
    {
      kind: "report",
      label: "external report",
      uri: pathToFileURL(join(tmpdir(), "external-report.md")).href,
    },
    { artifactRoot },
  );
  const remote = normalizeArtifactForStorage(
    {
      kind: "record",
      label: "remote commit",
      uri: "https://example.com/floop/commit/123",
    },
    { artifactRoot },
  );

  assert.equal(externalFile.metadata.floopDurability.storageMode, "referenced_uri");
  assert.equal(remote.metadata.floopDurability.storageMode, "referenced_uri");
  assert.equal(remote.metadata.floopDurability.copyPolicy, "not_copied");
  assert.equal(remote.metadata.floopDurability.cleanupPolicy, "not_managed");
});

test("artifact durability rejects invalid artifact URIs", () => {
  assert.throws(
    () =>
      normalizeArtifactForStorage(
        {
          kind: "log",
          label: "invalid",
          uri: "not a uri",
        },
        { artifactRoot: tmpdir() },
      ),
    /Invalid artifact URI/,
  );
});
