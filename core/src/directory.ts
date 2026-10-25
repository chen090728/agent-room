import { maskSecret, safeEqual, type SecretBox } from './crypto.js';
import { first, runSchema, type SqlDriver } from './sql.js';
import type {
  Avatar,
  AvatarColor,
  AvatarShape,
  GroupBinding,
  GroupKind,
  GroupSummary,
  IntegrationView,
  ListEvent,
  Member,
  Message,
  RelayState,
} from './types.js';

export interface NewMember {
  name: string;
  type: string;
  avatar: Avatar;
  role: string;
  persona: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export interface NewIntegration {
  type: string;
  typeLabel: string;
  name: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

/** A connection with its decrypted secrets; only for server-side use. */
export interface IntegrationWithSecrets {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

/** A bridge program paired with this server (running on one of the user's computers). */
export interface BridgeInfo {
  id: string;
  /** Usually the computer's name. */
  name: string;
  /** Tools it reported (see BRIDGE_TOOLS). */
  tools: string[];
  lastSeen: number | null;
}

export interface PairingResult {
  bridgeId: string;
  /** Shown to the bridge once; only a hash is stored. */
  token: string;
  memberName: string;
  tool: string;
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
 *
 * Every member automatically gets a direct chat (a group with only that member).
 */
export interface Directory {
  isEmpty(): Promise<boolean>;
  listMembers(): Promise<Member[]>;
  getMemberSecrets(id: string): Promise<Record<string, string>>;
  createMember(input: NewMember): Promise<Result<Member>>;
  deleteMember(id: string): Promise<boolean>;
  /** Sets (or clears, with null) the uploaded picture shown as a member's avatar. */
  setMemberAvatarImage(id: string, image: { groupId: string; fileId: string } | null): Promise<Result<Member>>;
  listGroups(): Promise<GroupSummary[]>;
  getGroup(id: string): Promise<GroupSummary | null>;
  createGroup(name: string, memberIds: string[]): Promise<Result<GroupSummary>>;
  setGroupMembers(id: string, memberIds: string[]): Promise<Result<GroupSummary>>;
  groupMembers(groupId: string): Promise<Member[]>;
  recordActivity(groupId: string, patch: ActivityPatch): Promise<void>;
  listIntegrations(): Promise<IntegrationView[]>;
  createIntegration(input: NewIntegration): Promise<Result<IntegrationView>>;
  deleteIntegration(id: string): Promise<boolean>;
  /** Decrypted; never expose this over the HTTP API. */
  getIntegration(id: string): Promise<IntegrationWithSecrets | null>;
  setBinding(groupId: string, binding: GroupBinding | null): Promise<Result<GroupSummary>>;
  /** A short-lived code that pairs a bridge with a work assistant. */
  createPairing(memberId: string): Promise<Result<{ code: string; expiresAt: number }>>;
  /** Exchanges a pairing code for bridge credentials, or reuses the bridge when its own are given. */
  completePairing(input: { code: string; name: string; tools: string[]; bridgeId?: string; token?: string }): Promise<Result<PairingResult>>;
  /** Checks a bridge's credentials and records what it can run. */
  authenticateBridge(bridgeId: string, token: string, tools?: string[]): Promise<boolean>;
  getBridge(bridgeId: string): Promise<BridgeInfo | null>;
  /** Records the tools a connected bridge reports. */
  setBridgeTools(bridgeId: string, tools: string[]): Promise<void>;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I/L, which are easy to confuse when typing a code from a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Codes are shown as ABCD-EFGH; people may type them with spaces or in lower case. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `ahb_${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  shape TEXT NOT NULL DEFAULT 'cloud',
  role TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  secrets_enc TEXT,
  secret_preview_json TEXT NOT NULL DEFAULT '{}',
  avatar_image TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'group',
  direct_member_id TEXT,
  created_at INTEGER NOT NULL,
  last_message_json TEXT,
  last_activity_at INTEGER NOT NULL,
  relay_json TEXT,
  binding_json TEXT
);
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  type_label TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  secrets_enc TEXT,
  secret_preview_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bridges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  tools_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS pairings (
  code TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, member_id)
)`;

/**
 * Upgrades a database created by the first release (members without shape and
 * role, groups without kind). Safe to run on a current database.
 */
function migrate(db: SqlDriver) {
  const has = (table: string, column: string) => {
    try {
      db.all(`SELECT ${column} FROM ${table} LIMIT 0`);
      return true;
    } catch {
      return false;
    }
  };
  if (!has('members', 'shape')) {
    db.run(`ALTER TABLE members ADD COLUMN shape TEXT NOT NULL DEFAULT 'cloud'`);
    db.run(`ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
    // Old colours were a smaller palette; give each a matching shape so members stay distinguishable.
    db.run(
      `UPDATE members SET shape = CASE color
         WHEN 'blue' THEN 'square' WHEN 'green' THEN 'egg' WHEN 'purple' THEN 'flower'
         WHEN 'red' THEN 'circle' WHEN 'graphite' THEN 'hexagon' ELSE 'cloud' END`,
    );
    db.run(`UPDATE members SET color = 'gray' WHERE color = 'graphite'`);
    db.run(`UPDATE members SET role = '产品经理' WHERE type = 'mock' AND name = '小橙' AND role = ''`);
    db.run(`UPDATE members SET role = '安全顾问' WHERE type = 'mock' AND name = '阿蓝' AND role = ''`);
    db.run(`UPDATE members SET role = '交互设计' WHERE type = 'mock' AND name = '小绿' AND role = ''`);
  }
  if (!has('groups', 'kind')) {
    db.run(`ALTER TABLE groups ADD COLUMN kind TEXT NOT NULL DEFAULT 'group'`);
    db.run(`ALTER TABLE groups ADD COLUMN direct_member_id TEXT`);
  }
  if (!has('members', 'avatar_image')) db.run(`ALTER TABLE members ADD COLUMN avatar_image TEXT`);
  if (!has('groups', 'binding_json')) db.run(`ALTER TABLE groups ADD COLUMN binding_json TEXT`);
}

interface MemberRow {
  id: string;
  name: string;
  type: string;
  color: string;
  shape: string;
  role: string;
  persona: string;
  config_json: string;
  secrets_enc: string | null;
  secret_preview_json: string;
  avatar_image: string | null;
  created_at: number;
}

interface GroupRow {
  id: string;
  name: string;
  kind: string;
  direct_member_id: string | null;
  created_at: number;
  last_message_json: string | null;
  last_activity_at: number;
  relay_json: string | null;
  binding_json: string | null;
}

interface IntegrationRow {
  id: string;
  type: string;
  type_label: string;
  name: string;
  config_json: string;
  secrets_enc: string | null;
  secret_preview_json: string;
  created_at: number;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    avatar: { shape: row.shape as AvatarShape, color: row.color as AvatarColor, ...(row.avatar_image ? { image: JSON.parse(row.avatar_image) } : {}) },
    role: row.role,
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
    migrate(db);
    // Members created before direct chats existed get theirs now.
    for (const m of db.all<{ id: string; name: string }>(
      `SELECT id, name FROM members WHERE id NOT IN (SELECT direct_member_id FROM groups WHERE direct_member_id IS NOT NULL)`,
    )) {
      this.insertDirect(m.id, m.name);
    }
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
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO members (id, name, type, color, shape, role, persona, config_json, secrets_enc, secret_preview_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.name,
        input.type,
        input.avatar.color,
        input.avatar.shape,
        input.role,
        input.persona,
        JSON.stringify(input.config),
        sealed,
        JSON.stringify(preview),
        Date.now(),
      );
      this.insertDirect(id, input.name);
    });
    this.emit({ type: 'members_changed' });
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: this.member(id)! };
  }

  async setMemberAvatarImage(id: string, image: { groupId: string; fileId: string } | null): Promise<Result<Member>> {
    if (!this.member(id)) return { ok: false, error: '成员不存在' };
    this.db.run('UPDATE members SET avatar_image = ? WHERE id = ?', image ? JSON.stringify(image) : null, id);
    this.emit({ type: 'members_changed' });
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: this.member(id)! };
  }

  async deleteMember(id: string) {
    const removed = this.db.transaction(() => {
      if (!first(this.db, 'SELECT 1 FROM members WHERE id = ?', id)) return false;
      this.db.run('DELETE FROM pairings WHERE member_id = ?', id);
      const direct = first<{ id: string }>(this.db, 'SELECT id FROM groups WHERE direct_member_id = ?', id);
      if (direct) {
        this.db.run('DELETE FROM group_members WHERE group_id = ?', direct.id);
        this.db.run('DELETE FROM groups WHERE id = ?', direct.id);
      }
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
      kind: row.kind as GroupKind,
      createdAt: row.created_at,
      members: this.membersOf(row.id).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, role: m.role, type: m.type })),
      lastMessage: row.last_message_json ? JSON.parse(row.last_message_json) : null,
      lastActivityAt: row.last_activity_at,
      relay: row.relay_json ? JSON.parse(row.relay_json) : null,
      binding: row.binding_json ? JSON.parse(row.binding_json) : null,
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

  /** Creates the one-to-one chat of a member; call inside a transaction when creating the member. */
  private insertDirect(memberId: string, name: string) {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO groups (id, name, kind, direct_member_id, created_at, last_activity_at) VALUES (?, ?, 'direct', ?, ?, ?)`,
      id,
      name,
      memberId,
      now,
      now,
    );
    this.db.run('INSERT INTO group_members (group_id, member_id, position) VALUES (?, ?, 0)', id, memberId);
  }

  async listGroups() {
    return this.db.all<GroupRow>('SELECT * FROM groups ORDER BY last_activity_at DESC, rowid ASC').map((r) => this.summary(r));
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
      this.db.run(
        `INSERT INTO groups (id, name, kind, created_at, last_activity_at) VALUES (?, ?, 'group', ?, ?)`,
        id,
        name,
        now,
        now,
      );
      this.writeGroupMembers(id, memberIds);
    });
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: (await this.getGroup(id))! };
  }

  async setGroupMembers(id: string, memberIds: string[]): Promise<Result<GroupSummary>> {
    const row = this.groupRow(id);
    if (!row) return { ok: false, error: '群聊不存在' };
    if (row.kind === 'direct') return { ok: false, error: '单聊的成员不能修改' };
    if (this.unknownMember(memberIds)) return { ok: false, error: '有成员不存在' };
    this.db.transaction(() => this.writeGroupMembers(id, memberIds));
    this.emit({ type: 'groups_changed' });
    return { ok: true, value: (await this.getGroup(id))! };
  }

  async groupMembers(groupId: string) {
    return this.membersOf(groupId);
  }

  // ---- integrations ----

  private integrationView(row: IntegrationRow): IntegrationView {
    return {
      id: row.id,
      type: row.type,
      typeLabel: row.type_label,
      name: row.name,
      config: JSON.parse(row.config_json),
      secrets: JSON.parse(row.secret_preview_json),
      createdAt: row.created_at,
    };
  }

  async listIntegrations() {
    return this.db.all<IntegrationRow>('SELECT * FROM integrations ORDER BY created_at, rowid').map((r) => this.integrationView(r));
  }

  async createIntegration(input: NewIntegration): Promise<Result<IntegrationView>> {
    const hasSecrets = Object.keys(input.secrets).length > 0;
    if (hasSecrets && !this.box) return { ok: false, error: '服务器没有配置 AGENTHUB_SECRET，无法保存令牌' };
    const sealed = hasSecrets ? await this.box!.encrypt(JSON.stringify(input.secrets)) : null;
    const id = crypto.randomUUID();
    const preview = Object.fromEntries(Object.entries(input.secrets).map(([k, v]) => [k, maskSecret(v)]));
    this.db.run(
      `INSERT INTO integrations (id, type, type_label, name, config_json, secrets_enc, secret_preview_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.type,
      input.typeLabel,
      input.name,
      JSON.stringify(input.config),
      sealed,
      JSON.stringify(preview),
      Date.now(),
    );
    return { ok: true, value: this.integrationView(first<IntegrationRow>(this.db, 'SELECT * FROM integrations WHERE id = ?', id)!) };
  }

  async deleteIntegration(id: string) {
    const removed = this.db.transaction(() => {
      if (!first(this.db, 'SELECT 1 FROM integrations WHERE id = ?', id)) return false;
      this.db.run('DELETE FROM integrations WHERE id = ?', id);
      // Conversations bound through this connection lose their binding.
      for (const g of this.db.all<GroupRow>('SELECT * FROM groups WHERE binding_json IS NOT NULL')) {
        const binding: GroupBinding = JSON.parse(g.binding_json!);
        if (binding.repo?.integrationId === id) delete binding.repo;
        if (binding.deploy?.integrationId === id) delete binding.deploy;
        const empty = !binding.repo && !binding.deploy;
        this.db.run('UPDATE groups SET binding_json = ? WHERE id = ?', empty ? null : JSON.stringify(binding), g.id);
      }
      return true;
    });
    if (removed) this.emit({ type: 'groups_changed' });
    return removed;
  }

  async getIntegration(id: string): Promise<IntegrationWithSecrets | null> {
    const row = first<IntegrationRow>(this.db, 'SELECT * FROM integrations WHERE id = ?', id);
    if (!row) return null;
    let secrets: Record<string, string> = {};
    if (row.secrets_enc) {
      if (!this.box) throw new Error('服务器没有配置 AGENTHUB_SECRET');
      secrets = JSON.parse(await this.box.decrypt(row.secrets_enc));
    }
    return { id: row.id, type: row.type, name: row.name, config: JSON.parse(row.config_json), secrets };
  }

  async setBinding(groupId: string, binding: GroupBinding | null): Promise<Result<GroupSummary>> {
    if (!this.groupRow(groupId)) return { ok: false, error: '群聊不存在' };
    if (binding?.repo && !first(this.db, 'SELECT 1 FROM integrations WHERE id = ?', binding.repo.integrationId)) {
      return { ok: false, error: '这个连接不存在' };
    }
    if (binding?.deploy && !first(this.db, 'SELECT 1 FROM integrations WHERE id = ?', binding.deploy.integrationId)) {
      return { ok: false, error: '这个部署平台的连接不存在' };
    }
    const kept: GroupBinding = {};
    if (binding?.repo) kept.repo = binding.repo;
    if (binding?.deploy) kept.deploy = binding.deploy;
    const empty = !kept.repo && !kept.deploy;
    this.db.run('UPDATE groups SET binding_json = ? WHERE id = ?', empty ? null : JSON.stringify(kept), groupId);
    this.emit({ type: 'group_updated', group: this.summary(this.groupRow(groupId)!) });
    return { ok: true, value: (await this.getGroup(groupId))! };
  }

  // ---- bridges ----

  async createPairing(memberId: string): Promise<Result<{ code: string; expiresAt: number }>> {
    const member = this.member(memberId);
    if (!member) return { ok: false, error: '成员不存在' };
    if (member.type !== 'bridge') return { ok: false, error: '只有工作助手需要配对' };
    const now = Date.now();
    const expiresAt = now + PAIRING_TTL_MS;
    this.db.run('DELETE FROM pairings WHERE member_id = ? OR expires_at < ?', memberId, now);
    const code = randomCode();
    this.db.run('INSERT INTO pairings (code, member_id, expires_at) VALUES (?, ?, ?)', code, memberId, expiresAt);
    return { ok: true, value: { code, expiresAt } };
  }

  async completePairing(input: { code: string; name: string; tools: string[]; bridgeId?: string; token?: string }): Promise<Result<PairingResult>> {
    const code = normalizeCode(input.code);
    const row = first<{ member_id: string; expires_at: number }>(this.db, 'SELECT member_id, expires_at FROM pairings WHERE code = ?', code);
    // One answer for "wrong" and "expired", so guessing learns nothing.
    if (!row || row.expires_at < Date.now()) return { ok: false, error: '配对码无效或已过期，请回到 App 重新获取' };
    const member = this.member(row.member_id);
    if (!member) return { ok: false, error: '配对码无效或已过期，请回到 App 重新获取' };

    const reuse = input.bridgeId && input.token && (await this.authenticateBridge(input.bridgeId, input.token, input.tools));
    const name = input.name.trim().slice(0, 40) || '我的电脑';
    let bridgeId: string;
    let token: string;
    if (reuse) {
      bridgeId = input.bridgeId!;
      token = input.token!;
    } else {
      bridgeId = crypto.randomUUID();
      token = randomToken();
      const hash = await sha256Hex(token);
      this.db.run('INSERT INTO bridges (id, name, token_hash, tools_json, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)', bridgeId, name, hash, JSON.stringify(input.tools), Date.now(), Date.now());
    }
    this.db.transaction(() => {
      this.db.run('UPDATE members SET config_json = ? WHERE id = ?', JSON.stringify({ ...member.config, bridgeId }), member.id);
      this.db.run('DELETE FROM pairings WHERE code = ?', code);
    });
    this.emit({ type: 'members_changed' });
    return { ok: true, value: { bridgeId, token, memberName: member.name, tool: member.config.tool ?? '' } };
  }

  async authenticateBridge(bridgeId: string, token: string, tools?: string[]): Promise<boolean> {
    const row = first<{ token_hash: string }>(this.db, 'SELECT token_hash FROM bridges WHERE id = ?', bridgeId);
    if (!row || !safeEqual(await sha256Hex(token), row.token_hash)) return false;
    if (tools) this.db.run('UPDATE bridges SET tools_json = ?, last_seen = ? WHERE id = ?', JSON.stringify(tools), Date.now(), bridgeId);
    else this.db.run('UPDATE bridges SET last_seen = ? WHERE id = ?', Date.now(), bridgeId);
    return true;
  }

  async setBridgeTools(bridgeId: string, tools: string[]) {
    this.db.run('UPDATE bridges SET tools_json = ?, last_seen = ? WHERE id = ?', JSON.stringify(tools), Date.now(), bridgeId);
  }

  async getBridge(bridgeId: string): Promise<BridgeInfo | null> {
    const row = first<{ id: string; name: string; tools_json: string; last_seen: number | null }>(this.db, 'SELECT id, name, tools_json, last_seen FROM bridges WHERE id = ?', bridgeId);
    return row ? { id: row.id, name: row.name, tools: JSON.parse(row.tools_json), lastSeen: row.last_seen } : null;
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
