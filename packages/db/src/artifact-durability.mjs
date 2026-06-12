import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const artifactDurabilityContract = {
  managedLocalFile: {
    storageMode: "managed_local_file",
    copyPolicy: "created_by_floop",
    cleanupPolicy: "retain_until_project_delete",
  },
  referencedUri: {
    storageMode: "referenced_uri",
    copyPolicy: "not_copied",
    cleanupPolicy: "not_managed",
  },
};

export function projectArtifactRoot(workspaceRoot) {
  return resolve(workspaceRoot, ".floop", "artifacts");
}

export function normalizeArtifactForStorage(artifact, { artifactRoot }) {
  const uri = validateArtifactUri(artifact.uri);
  const durability = classifyArtifactUri(uri, artifactRoot);
  return {
    ...artifact,
    uri,
    metadata: {
      ...(artifact.metadata || {}),
      floopDurability: durability,
    },
  };
}

function validateArtifactUri(uri) {
  try {
    return new URL(uri).href;
  } catch {
    throw new Error(`Invalid artifact URI: ${uri}`);
  }
}

function classifyArtifactUri(uri, artifactRoot) {
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") {
    return artifactDurabilityContract.referencedUri;
  }

  const filePath = resolve(fileURLToPath(parsed));
  const rootPath = resolve(artifactRoot);
  const relativePath = relative(rootPath, filePath);
  const isInsideRoot = relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  if (!isInsideRoot) {
    return artifactDurabilityContract.referencedUri;
  }

  return {
    ...artifactDurabilityContract.managedLocalFile,
    artifactRoot: rootPath,
  };
}
