/**
 * Google Drive backup transport.
 *
 * Uploads a backup JSON document into `Project Phoenix Backups/<Daily|Weekly|Monthly>`
 * on the connected Google account, through the Lovable connector gateway.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_FOLDER = "Project Phoenix Backups";

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Drive is not connected for this app.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function driveFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive request failed [${res.status}]: ${body}`);
    throw new Error(`Google Drive request failed [${res.status}]: ${body}`);
  }
  return res;
}

async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const res = await driveFetch(
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1`,
  );
  const found = (await res.json()) as { files?: { id: string }[] };
  if (found.files?.[0]?.id) return found.files[0].id;

  const created = await driveFetch(`/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const folder = (await created.json()) as { id: string };
  return folder.id;
}

export interface DriveUploadResult {
  file_id: string;
  file_name: string;
  folder: string;
  uploaded_at: string;
  web_link?: string;
}

export async function uploadBackupToDrive(
  cadence: string,
  fileName: string,
  content: string,
): Promise<DriveUploadResult> {
  const folderLabel = cadence.charAt(0).toUpperCase() + cadence.slice(1);
  const rootId = await ensureFolder(ROOT_FOLDER);
  const folderId = await ensureFolder(folderLabel, rootId);

  const boundary = `phoenix-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(
    `/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent("id,name,webViewLink")}`,
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const file = (await res.json()) as { id: string; name: string; webViewLink?: string };
  return {
    file_id: file.id,
    file_name: file.name,
    folder: `${ROOT_FOLDER}/${folderLabel}`,
    uploaded_at: new Date().toISOString(),
    web_link: file.webViewLink,
  };
}
