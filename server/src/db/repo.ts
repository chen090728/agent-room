import { randomUUID } from 'node:crypto';
import type { SecretBox } from '../crypto.js';
import type { Group, Member, MemberColor, MemberWithSecrets, Message, SenderKind } from '../types.js';
import type { DB } from './schema.js';

interface MemberRow {
  id: string;
  name: string;
  type: string;
  color: string;
  persona: string;
  config_json: string;
  secrets_enc: string | null;
  created_at: number;
}

interface MessageRow {
  id: string;
  group_id: string;
  sender_kind: string;
  sender_id: string | null;
  sender_name: string;
  content: string;
  root_id: string;
  hop: number;
  created_at: number;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color as MemberColor,
    persona: row.persona,
    config: JSON.parse(row.config_json),
    createdAt: row.created_at,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    groupId: row.group_id,
    senderKind: row.sender_kind as SenderKind,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: row.content,
    rootId: row.root_id,
    hop: row.hop,
    createdAt: row.created_at,
  };
}

export interface NewMember {
  name: string;
  type: string;
  color: MemberColor;
  persona: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export interface NewMessage {
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  /** Defaults to the new message's own id (an original message). */
  rootId?: string;
  hop?: number;
}

export class Repo {
  constructor(
    private db: DB,
    private box: SecretBox,
  ) {}

  isEmpty(): boolean {
    const g = this.db.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number };
    const m = this.db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number };
    return g.n === 0 && m.n === 0;
  }

  // ---- members ----

  createMember(input: NewMember): Member {
    const id = randomUUID();
    const hasSecrets = Object.keys(input.secrets).length > 0;
    this.db
      .prepare(
        `INSERT INTO members (id, name, type, color, persona, config_json, secrets_enc, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.type,
        input.color,
        input.persona,
        JSON.stringify(input.config),
        hasSecrets ? this.box.encrypt(JSON.stringify(input.secrets)) : null,
        Date.now(),
      );
    return this.getMember(id)!;
  }

  getMember(id: string): Member | undefined {
    const row = this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow | undefined;
    return row && toMember(row);
  }

  getMemberWithSecrets(id: string): MemberWithSecrets | undefined {
    const row = this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow | undefined;
    if (!row) return undefined;
    const secrets = row.secrets_enc ? JSON.parse(this.box.decrypt(row.secrets_enc)) : {};
    return { ...toMember(row), secrets };
  }

  /** Names of secret fields that have a stored value, with masked previews. */
  getSecretPreview(id: string, mask: (v: string) => string): Record<string, string> {
    const m = this.getMemberWithSecrets(id);
    if (!m) return {};
    return Object.fromEntries(Object.entries(m.secrets).map(([k, v]) => [k, mask(v)]));
  }

  memberNameTaken(name: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM members WHERE name = ? COLLATE NOCASE').get(name);
  }

  listMembers(): Member[] {
    const rows = this.db.prepare('SELECT * FROM members ORDER BY created_at, name').all() as MemberRow[];
    return rows.map(toMember);
  }

  deleteMember(id: string): boolean {
    return this.db.prepare('DELETE FROM members WHERE id = ?').run(id).changes > 0;
  }

  // ---- groups ----

  createGroup(name: string, memberIds: string[]): Group {
    const id = randomUUID();
    const tx = this.db.transaction(() => {
      this.db.prepare('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());
      this.insertGroupMembers(id, memberIds);
    });
    tx();
    return this.getGroup(id)!;
  }

  private insertGroupMembers(groupId: string, memberIds: string[]) {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO group_members (group_id, member_id, position) VALUES (?, ?, ?)');
    memberIds.forEach((mid, i) => stmt.run(groupId, mid, i));
  }

  setGroupMembers(groupId: string, memberIds: string[]) {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
      this.insertGroupMembers(groupId, memberIds);
    });
    tx();
  }

  getGroup(id: string): Group | undefined {
    const row = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as
      | { id: string; name: string; created_at: number }
      | undefined;
    return row && { id: row.id, name: row.name, createdAt: row.created_at };
  }

  listGroups(): Group[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY created_at').all() as {
      id: string;
      name: string;
      created_at: number;
    }[];
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  groupMembers(groupId: string): Member[] {
    const rows = this.db
      .prepare(
        `SELECT m.* FROM members m JOIN group_members gm ON gm.member_id = m.id
         WHERE gm.group_id = ? ORDER BY gm.position, m.created_at`,
      )
      .all(groupId) as MemberRow[];
    return rows.map(toMember);
  }

  // ---- messages ----

  addMessage(input: NewMessage): Message {
    const id = randomUUID();
    const seq = (this.db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM messages').get() as { s: number }).s;
    this.db
      .prepare(
        `INSERT INTO messages (id, group_id, seq, sender_kind, sender_id, sender_name, content, root_id, hop, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.groupId,
        seq,
        input.senderKind,
        input.senderId,
        input.senderName,
        input.content,
        input.rootId ?? id,
        input.hop ?? 0,
        Date.now(),
      );
    return toMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow);
  }

  /** Most recent messages in chronological order; `beforeId` pages further back. */
  recentMessages(groupId: string, limit: number, beforeId?: string): Message[] {
    const before = beforeId
      ? (this.db.prepare('SELECT seq FROM messages WHERE id = ?').get(beforeId) as { seq: number } | undefined)
      : undefined;
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE group_id = ? AND seq < ?
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(groupId, before?.seq ?? Number.MAX_SAFE_INTEGER, limit) as MessageRow[];
    return rows.reverse().map(toMessage);
  }

  /** Recent messages excluding system notices, used as model context. */
  contextMessages(groupId: string, limit: number): Message[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE group_id = ? AND sender_kind != 'system'
         ORDER BY seq DESC LIMIT ?`,
      )
      .all(groupId, limit) as MessageRow[];
    return rows.reverse().map(toMessage);
  }

  lastMessage(groupId: string): Message | undefined {
    return this.recentMessages(groupId, 1)[0];
  }
}
