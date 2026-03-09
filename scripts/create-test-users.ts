/**
 * Create test user accounts from a CSV file and add join requests for competition PN2026.
 *
 * CSV format: Name, Pin, ... (other columns ignored)
 * - Email: Name with spaces removed + "@test.ie"
 * - Username: Name with accents normalized. If taken, append " 1", " 2", etc.
 * - Password: "Pin-" + Pin
 *
 * Step 2: Adds competition_join_request (pending) for competition with access code PN2026.
 * You can then go to admin and approve each request.
 *
 * Re-run safe: skips users whose email exists; adds join requests for all users (created + skipped).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Run: npx tsx scripts/create-test-users.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CSV_PATH = path.join(process.cwd(), 'trial_data', 'Home_Welcome - Entry_SignUp.csv');
const COMPETITION_ACCESS_CODE = 'PN2026';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Parse simple CSV: first row = headers, find Name and Pin columns (case-insensitive) */
function parseCsv(content: string): { name: string; pin: string }[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim());
  const nameIdx = headers.findIndex((h) => h.toLowerCase() === 'name');
  const pinIdx = headers.findIndex((h) => h.toLowerCase() === 'pin');

  if (nameIdx < 0 || pinIdx < 0) {
    throw new Error(`CSV must have Name and Pin columns. Found headers: ${headers.join(', ')}`);
  }

  const rows: { name: string; pin: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const name = (parts[nameIdx] ?? '').trim();
    const pin = (parts[pinIdx] ?? '').trim();
    if (name && pin) {
      rows.push({ name, pin });
    }
  }
  return rows;
}

/** Normalize accented chars to ASCII (á -> a, é -> e, ñ -> n, etc.) */
function normalizeToAscii(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Email: normalize accents, remove spaces, append @test.ie */
function nameToEmail(name: string): string {
  const clean = normalizeToAscii(name).replace(/\s+/g, '') + '@test.ie';
  return clean;
}

/** Password: Pin- + pin */
function pinToPassword(pin: string): string {
  return 'Pin-' + pin;
}

async function getExistingUsernames(): Promise<Set<string>> {
  const { data, error } = await admin.from('profiles').select('username');
  if (error) throw error;
  return new Set((data ?? []).map((r: { username: string }) => r.username));
}

async function findAvailableUsername(base: string, existing: Set<string>): Promise<string> {
  let candidate = base.trim();
  if (!existing.has(candidate)) return candidate;
  let n = 1;
  while (existing.has(`${candidate} ${n}`)) n++;
  return `${candidate} ${n}`;
}

/** Build email -> userId map from auth users (for skipped users) */
async function buildEmailToUserIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < perPage) break;
    page++;
  }
  return map;
}

async function addJoinRequest(
  competitionId: string,
  userId: string,
  displayName: string
): Promise<'ok' | 'skipped' | 'error'> {
  const { error } = await admin.from('competition_join_requests').insert({
    competition_id: competitionId,
    user_id: userId,
    display_name: displayName,
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') return 'skipped'; // already has request
    console.error('  Join request error:', error.message);
    return 'error';
  }
  return 'ok';
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const { data: comp, error: compError } = await admin
    .from('competitions')
    .select('id, name')
    .eq('access_code', COMPETITION_ACCESS_CODE)
    .maybeSingle();

  if (compError) throw compError;
  if (!comp) {
    console.error(`Competition with access code "${COMPETITION_ACCESS_CODE}" not found.`);
    process.exit(1);
  }

  const competitionId = comp.id as string;
  const competitionName = comp.name as string;
  console.log(`Competition: ${competitionName} (${COMPETITION_ACCESS_CODE})`);

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(content);
  console.log(`Found ${rows.length} rows in CSV`);

  const existingUsernames = await getExistingUsernames();
  const emailToUserId = await buildEmailToUserIdMap();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let joinRequestsAdded = 0;

  for (let i = 0; i < rows.length; i++) {
    const { name, pin } = rows[i];
    const normalizedName = normalizeToAscii(name);
    const email = nameToEmail(name);
    const password = pinToPassword(pin);
    const username = await findAvailableUsername(normalizedName, existingUsernames);
    existingUsernames.add(username);

    try {
      const { data: user, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
          console.log(`  [${i + 1}/${rows.length}] Skipped (email exists): ${email}`);
          skipped++;
          const userId = emailToUserId.get(email.toLowerCase());
          if (userId) {
            const res = await addJoinRequest(competitionId, userId, normalizedName);
            if (res === 'ok') joinRequestsAdded++;
          }
        } else {
          console.error(`  [${i + 1}/${rows.length}] Auth error for ${email}:`, authError.message);
          failed++;
        }
        continue;
      }

      if (!user.user) {
        console.error(`  [${i + 1}/${rows.length}] No user returned for ${email}`);
        failed++;
        continue;
      }

      const { error: profileError } = await admin.from('profiles').insert({
        id: user.user.id,
        username,
      });

      if (profileError) {
        if (profileError.code === '23505') {
          console.log(`  [${i + 1}/${rows.length}] Username conflict for ${name}, used: ${username}`);
        }
        console.error(`  [${i + 1}/${rows.length}] Profile insert error for ${email}:`, profileError.message);
        await admin.auth.admin.deleteUser(user.user.id).catch(() => {});
        failed++;
        existingUsernames.delete(username);
        continue;
      }

      const res = await addJoinRequest(competitionId, user.user.id, username);
      if (res === 'ok') joinRequestsAdded++;

      console.log(`  [${i + 1}/${rows.length}] Created: ${email} (username: ${username})`);
      created++;
    } catch (e) {
      console.error(`  [${i + 1}/${rows.length}] Error for ${email}:`, e);
      failed++;
    }
  }

  console.log('\nDone:', { created, skipped, failed, joinRequestsAdded });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
