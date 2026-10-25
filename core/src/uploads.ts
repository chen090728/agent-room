import {
  decodeText,
  extractPdfText,
  fileKey,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_REQUEST,
  MAX_TEXT_CHARS_PER_FILE,
  MAX_TEXT_CHARS_TOTAL,
  toBase64,
  type FileStore,
} from './files.js';
import type { SqlRoom } from './room.js';
import type { Attachment, Message } from './types.js';
import type { ResolvedAttachment } from './adapters/types.js';

/**
 * Records an uploaded file for a group. PDFs get their text extracted now, so a
 * conversation does not re-parse them every time the file is mentioned.
 */
export async function registerUpload(room: SqlRoom, files: FileStore, groupId: string, attachment: Attachment): Promise<Attachment> {
  let text: string | null = null;
  if (attachment.kind === 'pdf') {
    const stored = await files.get(fileKey(groupId, attachment.id));
    try {
      text = stored ? await extractPdfText(stored.data) : null;
    } catch {
      // A damaged or encrypted PDF is still stored; it just has no text.
      text = null;
    }
  }
  room.addUpload(groupId, attachment, text);
  return attachment;
}

const cap = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}\n…（太长，只发送了前 ${limit} 个字符）` : text);

/**
 * Prepares the attachments of recent messages for a model. The newest files
 * get priority when the limits (text size, number and size of images) run out;
 * anything left out is described in a note so the model knows it exists.
 */
export async function resolveForContext(
  room: SqlRoom,
  files: FileStore | null,
  groupId: string,
  messages: Message[],
  opts: { images: boolean },
): Promise<Map<string, ResolvedAttachment[]>> {
  const out = new Map<string, ResolvedAttachment[]>();
  let textBudget = MAX_TEXT_CHARS_TOTAL;
  let imageBudget = MAX_IMAGES_PER_REQUEST;

  for (const message of [...messages].reverse()) {
    if (!message.attachments?.length) continue;
    const resolved: ResolvedAttachment[] = [];
    for (const a of message.attachments) {
      const base: ResolvedAttachment = { name: a.name, kind: a.kind };
      const stored = files ? await files.get(fileKey(groupId, a.id)) : null;

      if (a.kind === 'image') {
        if (!opts.images) resolved.push({ ...base, note: '当前模型看不到图片' });
        else if (!stored) resolved.push({ ...base, note: '文件已经不在了' });
        else if (imageBudget <= 0) resolved.push({ ...base, note: '较早的图片，没有再发给模型' });
        else if (stored.data.length > MAX_IMAGE_BYTES) resolved.push({ ...base, note: '图片太大，没有发给模型' });
        else {
          imageBudget--;
          resolved.push({ ...base, image: { mime: a.mime, base64: toBase64(stored.data) } });
        }
        continue;
      }

      let text: string | null = null;
      if (a.kind === 'pdf') text = room.uploadText(a.id);
      else if (stored) text = decodeText(stored.data);
      else {
        resolved.push({ ...base, note: '文件已经不在了' });
        continue;
      }
      if (!text?.trim()) resolved.push({ ...base, note: a.kind === 'pdf' ? '没有提取到文字（可能是扫描件）' : '文件是空的' });
      else if (textBudget <= 0) resolved.push({ ...base, note: '较早的文件，没有再发给模型' });
      else {
        const clipped = cap(text, Math.min(MAX_TEXT_CHARS_PER_FILE, textBudget));
        textBudget -= clipped.length;
        resolved.push({ ...base, text: clipped });
      }
    }
    out.set(message.id, resolved);
  }
  return out;
}
