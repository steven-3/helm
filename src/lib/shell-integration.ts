export const SHELL_INTEGRATION_ENV = "HELM_SHELL_INTEGRATION";
export const BASH_INTEGRATION_SNIPPET = "shim/helm-shell-integration.sh";
export const POWERSHELL_INTEGRATION_SNIPPET = "shim/helm-shell-integration.ps1";

interface PathFile extends File {
  path?: string;
}

function decodeFileUri(uri: string): string | null {
  const value = uri.trim();
  if (!value || value.startsWith("#")) return null;
  if (!value.toLowerCase().startsWith("file://")) return value;
  try {
    const url = new URL(value);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return path || null;
  } catch {
    return null;
  }
}

export function droppedPaths(dataTransfer: DataTransfer): string[] {
  const paths = Array.from(dataTransfer.files)
    .map((file) => (file as PathFile).path)
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0) return [...new Set(paths)];

  const uriList = dataTransfer.getData("text/uri-list");
  const uriPaths = uriList.split(/\r?\n/).map(decodeFileUri).filter((path): path is string => Boolean(path));
  if (uriPaths.length > 0) return [...new Set(uriPaths)];

  const plain = dataTransfer.getData("text/plain").trim();
  const plainPath = plain && !plain.includes("\n") ? decodeFileUri(plain) : null;
  return plainPath ? [plainPath] : [];
}

export function quoteShellPath(path: string, windows = false): string {
  if (windows) return `'${path.replace(/'/g, "''")}'`;
  return `'${path.replace(/'/g, `'"'"'`)}'`;
}

export function quoteDroppedPaths(paths: string[], windows = false): string {
  return paths.map((path) => quoteShellPath(path, windows)).join(" ");
}
