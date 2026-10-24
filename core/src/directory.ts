import { maskSecret, type SecretBox } from './crypto.js';
import { first, runSchema, type SqlDriver } from './sql.js';
import type { GroupSummary, ListEvent, Member, MemberColor, Message, RelayState } from './types.js';

export interface NewMember {
  name: string;
  type: string;
  color: MemberColor;
  persona: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ActivityPatch {
  lastMessage?: Message;
  /** null when the relay has finished. */
  relay?: RelayState | null;
}

/**
 * Members and groups. On Node it lives in the main database; on Cloudflare in
 * the single DirectoryDO. Methods are async so the Worker can call it over RPC.
 */
export interface Directory {
  isEmpty(): Promise<boolean>;
  listMembers(): Promise<Member[]>;
  getMemberSecrets(id: string): Promise<Record<string, string>>;
  createMember(input: NewMember): Promise<Result<Member>>;
  deleteMember(id: string): Promise<boolean>;
  listGroups(): Promise<GroupSummary[]>;
  getGroup(id: string): Promise<GroupSummary | null>;
  createGroup(name: string, memberIds: string[]): Promise<Result<GroupSummary>>;
  setGroupMembers(id: string, memberIds: string[]): Promise<Result<GroupSummary>>;
  groupMembers(groupId: string): Promise<Member[]>;
  recordActivity(groupId: string, patch: ActivityPatch): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  secrets_enc TEXT,
  secret_preview_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_json TEXT,
  last_activity_at INTEGER NOT NULL,
  relay_json TEXT
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, member_id)
)`;

interface MemberRow {
  id: string;
  name: string;
  type: string;
  color: string;
  persona: string;
  config_json: string;
  secrets_enc: string | null;
  secret_preview_json: string;
  created_at: number;
}

interface GroupRow {
  id: string;
  name: string;
  created_at: number;
  last_message_json: string | null;
  last_activity_at: number;
  relay_json: string | null;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color as MemberColor,
    persona: row.persona,
    config: JSON.parse(row.config_json),
    secretPreview: JSON.parse(row.secret_preview_json),
    createdAt: row.created_at,
  };
}

export class SqlDirectory implements Directory {
  constructor(
    private db: SqlDriver,
    /** Missing when AGENTHUB_SECRET is not configured; storing keys then fails. */
    private box: SecretBox | null,
    private emit: (event: ListEvent) => void = () => {},
  ) {
    runSchema(db, SCHEMA);
  }

  async isEmpty() {
    const g = first<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM groups')!;
    const m = first<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM members')!;
    return g.n === 0 && m.n === 0;
  }

  // ---- members ----

  async listMembers() {
    return this.db.all<MemberRow>('SELECT * FROM members ORDER BY created_at, name').map(toMember);
  }

  private member(id: string): Member | undefined {
    const row = first<MemberRow>(this.db, 'SELECT * FROM members WHERE id = ?', id);
    return row && toMember(row);
  }

  async getMemberSecrets(id: string) {
    const row = first<MemberRow>(this.db, 'SELECT secrets_enc FROM members WHERE id = ?', id);
    if (!row?.secrets_enc) return {};
    if (!this.box) throw new Error('服务器没有配置 AGENTHUB_SECRET');
    return JSON.parse(await this.box.decrypt(row.secrets_enc));
  }

  async createMember(input: NewMember): Promise<Result<Member>> {
    const hasSecrets = Object.keys(input.secrets).length > 0;
    if (hasSecrets && !this.box) return { ok: false, error: '服务器没有配置 AGENTHUB_SECRET，无法保存 Key' };
    // Encrypt first: everything after this await runs without interruption.
    const sealed = hasSecrets ? await this.box!.encrypt(JSON.stringify(input.secrets)) : null;
    if (first(this.db, 'SELECT 1 FROM members WHERE name = ? COLLATE NOCASE', input.name)) {
      return { ok: false, error: `已经有叫「${input.name}」的成员了` };
    }
    const id = crypto.randomUUID();
    const preview = Object.fromEntries(Object.entries(input.secrets).map(([k, v]) => [k, maskSecret(v)]));
    this.db.run(
      `INSERT INTO members (id, name, type, color, persona, config_json, secrets_enc, secret_preview_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.type,
      input.color,
      input.persona,
      JSON.stringify(input.config),
      sealed,
      JSON.stringify(preview),
      Date.now(),
    );
    this.emit({ type: 'members_changed' });
    return { ok: true, value: this.member(id)! };
  }

  async deleteMember(id: string) {
    const removed = this.db.transaction(() => {
      if (!first(this.db, 'SELECT 1 FROM members WHERE id = ?', id)) return false;
      this.db.run('DELETE FROM group_members WHERE member_id = ?', id);
      this.db.run('DELETE FROM members WHERE id = ?', id);
      return true;
    });
    if (removed) {
      this.emit({ type: 'members_changed' });
      this.emit({ type: 'groups_changed' });
    }
    return removed;
  }

  // ---- groups ----

  private summary(row: GroupRow): GroupSummary {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      members: this.membersOf(row.id).map((m) => ({ id: m.id, name: m.name, color: m.color, type: m.type })),
      lastMessage: row.last_message_json ? JSON.parse(row.last_message_json) : null,
      lastActivityAt: row.last_activity_at,
      relay: row.relay_json ? JSON.parse(row.relay_json) : null,
    };
  }

  private membersOf(groupId: string): Member[] {
    return this.db
      .all<MemberRow>(
        `SELECT m.* FROM members m JOIN group_members gm ON gm.member_id = m.id
         WHERE gm.group_id = ? ORDER BY gm.position, m.created_at`,
        groupId,
      )
      .map(toMember);
  }

  private groupRow(id: string) {
    return first<GroupRow>(this.db, 'SELECT * FROM groups WHERE id = ?', id);
  }

  async listGroups() {
    return this.db.all<GroupRow>('SELECT * FROM groups ORDER BY last_activity_at DESC').map((r) => this.summary(r));
  }

  async getGroup(id: string) {
    const row = this.groupRow(id);
    return row ? this.summary(row) : null;
  }

  private unknownMember(memberIds: string[]) {
    return memberIds.find((mid) => !first(this.db, 'SELECT 1 FROM members WHERE id = ?', mid));
  }

  private writeGroupMembers(groupId: string, memberIds: string[]) {
    this.db.run('DELETE FROM group_members WHERE group_id = ?', groupId);
    [...new Set(memberIds)].forEach((mid, i) =>
      this.db.run('INSERT INTO group_members (group_id, member_id, position) VALUES (?, ?, ?)', groupId, mid, i),
    );
  }

  async createGroup(name: string, memberIds: string[]): Promise<Result<GroupSummary>> {
    if (this.unknownMember(memberIds)) return { ok: false, error: '有成员不存在' };
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.transaction(() => {
      this.db.run('INSERT INTO groups (id, name, created_at, last_activity_at) VALUES (?, ?, ?, ?)', id, name, now, now);
      this.writeGroupMembers(id, memberIds);
    });
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: (await this.getGroup(id))! };
  }

  async setGroupMembers(id: string, memberIds: string[]): Promise<Result<GroupSummary>> {
    if (!this.groupRow(id)) return { ok: false, error: '群聊不存在' };
    if (this.unknownMember(memberIds)) return { ok: false, error: '有成员不存在' };
    this.db.transaction(() => this.writeGroupMembers(id, memberIds));
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: (await this.getGroup(id))! };
  }

  async groupMembers(groupId: string) {
    return this.membersOf(groupId);
  }

  async recordActivity(groupId: string, patch: ActivityPatch) {
    const row = this.groupRow(groupId);
    if (!row) return;
    if (patch.lastMessage) {
      this.db.run(
        'UPDATE groups SET last_message_json = ?, last_activity_at = ? WHERE id = ?',
        JSON.stringify(patch.lastMessage),
        patch.lastMessage.createdAt,
        groupId,
      );
    }
    if (patch.relay !== undefined) {
      this.db.run('UPDATE groups SET relay_json = ? WHERE id = ?', patch.relay ? JSON.stringify(patch.relay) : null, groupId);
    }
    this.emit({ type: 'group_updated', group: this.summary(this.groupRow(groupId)!) });
  }
}
