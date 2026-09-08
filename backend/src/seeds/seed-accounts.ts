// src/seeds/seed-accounts.ts
//
// #145 — replaces ad-hoc test accounts with ~5 learner and ~5 trainer
// accounts using names recognisable to a Vietnamese audience, for demo
// use. Accounts are created via the Supabase Admin API
// (auth.admin.createUser), NOT by inserting into `profiles` directly —
// that's deliberate: the `handle_new_user` trigger (see migration
// 1785815653079-AddProfileCreationTrigger) is what populates the
// `profiles` row from `raw_user_meta_data`, and it only fires on a real
// `auth.users` INSERT. Passing `user_metadata: { name, role }` to
// createUser() is what the trigger reads to set profiles.name and
// profiles.role — this script relies on that trigger firing normally,
// exactly like real sign-up would, rather than bypassing it.
//
// Idempotent: checks existing auth users by email first and skips ones
// that already exist, so re-running after a partial failure (or after
// #146 has already run) doesn't error out or generate duplicate
// accounts with new random passwords.
//
// Deliberately does NOT set profiles.provider_id — linking trainers to
// providers is #146's job (provider creation + invite-code linking),
// kept decoupled from account creation here.
//
// Credentials handling: the generated password per account is only
// ever shown once, at creation time (Supabase's Admin API doesn't let
// you read a password back later). Per #145, this reference is
// deliberately kept OUT of the repo — written to
// backend/seed-credentials.local.txt, which is gitignored, and printed
// to the console. Hand the file off to whoever needs it for the demo,
// then delete it; don't commit it or paste it anywhere persistent.
//
//   npm run seed:accounts
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (same as
// wipe-test-data.ts — the service_role key, not the anon key).

import 'dotenv/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { AppDataSource } from '../data-source';

export interface SeedAccount {
  name: string;
  email: string;
  role: 'trainer' | 'learner';
}

// Vietnamese-recognisable full names, per #145. Emails use the
// RFC 2606-reserved `.example` TLD (permanently reserved for
// documentation/demo use, never resolves to a real mailbox) rather
// than a real-looking domain, so there's no risk of these looking like
// or colliding with genuine addresses.
//
// Exported so #146 (seed-providers.ts) can look up the same trainer
// accounts by email instead of hand-copying this list a second time.
export const ACCOUNTS: SeedAccount[] = [
  // Learners
  {
    name: 'Nguyễn Thị Lan Anh',
    email: 'lananh.nguyen@keystone.example',
    role: 'learner',
  },
  {
    name: 'Trần Văn Minh',
    email: 'minh.tran@keystone.example',
    role: 'learner',
  },
  { name: 'Phạm Thị Mai', email: 'mai.pham@keystone.example', role: 'learner' },
  { name: 'Lê Hoàng Nam', email: 'nam.le@keystone.example', role: 'learner' },
  {
    name: 'Vũ Thị Thu Hà',
    email: 'thuha.vu@keystone.example',
    role: 'learner',
  },
  // Trainers
  {
    name: 'Đặng Quốc Huy',
    email: 'huy.dang@keystone.example',
    role: 'trainer',
  },
  {
    name: 'Hoàng Thị Ngọc',
    email: 'ngoc.hoang@keystone.example',
    role: 'trainer',
  },
  { name: 'Bùi Văn Tuấn', email: 'tuan.bui@keystone.example', role: 'trainer' },
  {
    name: 'Đỗ Thị Phương',
    email: 'phuong.do@keystone.example',
    role: 'trainer',
  },
  { name: 'Ngô Minh Đức', email: 'duc.ngo@keystone.example', role: 'trainer' },
];

interface AccountResult {
  name: string;
  email: string;
  role: string;
  password: string | null; // null when skipped (account already existed)
  status: 'created' | 'skipped (already exists)';
}

function generatePassword(): string {
  // Not trying to be memorable — this is a demo credential handed off
  // once via the generated reference file, not something anyone types
  // from memory. Mixes alnum (base64url) with an extra symbol + digits
  // to comfortably clear any password policy Supabase enforces.
  const random = crypto.randomBytes(9).toString('base64url');
  return `${random}-Ks${crypto.randomInt(10, 99)}!`;
}

async function listAllAuthUsers(
  supabaseAdmin: SupabaseClient,
): Promise<{ id: string; email: string | undefined }[]> {
  const users: { id: string; email: string | undefined }[] = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    users.push(...data.users.map((u) => ({ id: u.id, email: u.email })));

    if (data.users.length < perPage) break;
    page++;
  }

  return users;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to run this script — ' +
        'the service_role key (not the anon key) is required to create auth users.',
    );
  }

  // Same fix as wipe-test-data.ts / SupabaseAuthGuard: supabase-js
  // builds a realtime client at construction time regardless of use,
  // and Node < 22 has no native WebSocket global for it to fall back
  // to.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const supabaseAdmin: SupabaseClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      realtime: { transport: ws as any },
    },
  );

  await AppDataSource.initialize();

  const existingUsers = await listAllAuthUsers(supabaseAdmin);
  const existingEmails = new Set(
    existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean),
  );

  const results: AccountResult[] = [];

  for (const account of ACCOUNTS) {
    if (existingEmails.has(account.email.toLowerCase())) {
      console.log(`Skipping ${account.email} — account already exists.`);
      results.push({
        name: account.name,
        email: account.email,
        role: account.role,
        password: null,
        status: 'skipped (already exists)',
      });
      continue;
    }

    const password = generatePassword();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: account.name,
        role: account.role,
      },
    });

    if (error) {
      console.error(`Failed to create ${account.email}: ${error.message}`);
      continue;
    }

    console.log(`Created ${account.role} account: ${account.email}`);
    results.push({
      name: account.name,
      email: account.email,
      role: account.role,
      password,
      status: 'created',
    });

    // Sanity check the handle_new_user trigger actually populated the
    // profile with the right name/role, rather than assuming it did.
    if (data.user) {
      const rows = await AppDataSource.query<
        { name: string | null; role: string }[]
      >('SELECT name, role FROM "profiles" WHERE id = $1', [data.user.id]);
      const profile = rows[0];
      if (
        !profile ||
        profile.name !== account.name ||
        profile.role !== account.role
      ) {
        console.warn(
          `  Warning: profile for ${account.email} does not match expected name/role ` +
            `(got ${JSON.stringify(profile)}) — check the handle_new_user trigger.`,
        );
      }
    }
  }

  const createdCount = results.filter((r) => r.status === 'created').length;
  console.log(
    `\nDone. ${createdCount} account(s) created, ${results.length - createdCount} skipped.`,
  );

  // Credentials reference — deliberately written outside the repo's
  // tracked files (gitignored) rather than committed, per #145.
  const outPath = path.join(
    __dirname,
    '..',
    '..',
    'seed-credentials.local.txt',
  );
  const lines = [
    '#145 — Encyclopedia demo account credentials',
    'Generated: ' + new Date().toISOString(),
    'This file is gitignored — do not commit it or paste it anywhere persistent.',
    'Hand it off separately to whoever needs it for the demo, then delete it.',
    '',
    ...results.map((r) =>
      r.status === 'created'
        ? `${r.role.padEnd(8)} ${r.name.padEnd(20)} ${r.email.padEnd(30)} ${r.password}`
        : `${r.role.padEnd(8)} ${r.name.padEnd(20)} ${r.email.padEnd(30)} (already existed — password not available)`,
    ),
    '',
  ];
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`\nCredentials reference written to ${outPath}`);

  await AppDataSource.destroy();
}

// Guarded so #146 (seed-providers.ts) can `import { ACCOUNTS } from
// './seed-accounts'` without also triggering this script's side
// effects (creating accounts, writing the credentials file) just by
// importing the constant.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
