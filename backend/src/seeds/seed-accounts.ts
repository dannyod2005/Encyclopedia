// src/seeds/seed-accounts.ts
//
// #145 — replaces ad-hoc test accounts with ~5 learner and ~5 trainer
// accounts using names recognisable to a Vietnamese audience, for demo
// use.
//
// #500 — expanded to 15 learners + 9 trainers (5 + 3 per track), each
// carrying a `track` matching one of Course.category's three values
// ('Technical' | 'Business' | 'Leadership' — already exactly the three
// catalogue pathways, no separate concept needed). `track` is this
// account's chosen pathway, not a hard restriction: seed-activity.ts
// enrols every learner mostly in their own track's courses (per #500's
// "signed up to a handful of courses in their own chosen pathway"), and
// makes each trainer an owner/member of a Provider (see
// seed-providers.ts) scoped to that same track. Every original #145
// account keeps its exact name/email (so re-running this after a partial
// #145-era seed stays idempotent) — only new accounts were added, plus a
// `track` assignment on all of them.
//
// Accounts are created via the Supabase Admin API
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

export type Track = 'Technical' | 'Business' | 'Leadership';

export interface SeedAccount {
  name: string;
  email: string;
  role: 'trainer' | 'learner';
  // #500 — this account's chosen pathway; matches Course.category exactly
  // (see the file-header comment above).
  track: Track;
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
  // ---------------- Learners — Technical (5) ----------------
  {
    name: 'Nguyễn Thị Lan Anh',
    email: 'lananh.nguyen@encyclopedia.example',
    role: 'learner',
    track: 'Technical',
  },
  {
    name: 'Trần Văn Minh',
    email: 'minh.tran@encyclopedia.example',
    role: 'learner',
    track: 'Technical',
  },
  {
    name: 'Nguyễn Văn Khoa',
    email: 'khoa.nguyen@encyclopedia.example',
    role: 'learner',
    track: 'Technical',
  },
  {
    name: 'Trần Thị Bích',
    email: 'bich.tran@encyclopedia.example',
    role: 'learner',
    track: 'Technical',
  },
  {
    name: 'Lê Văn Phúc',
    email: 'phuc.le@encyclopedia.example',
    role: 'learner',
    track: 'Technical',
  },
  // ---------------- Learners — Business (5) ----------------
  {
    name: 'Phạm Thị Mai',
    email: 'mai.pham@encyclopedia.example',
    role: 'learner',
    track: 'Business',
  },
  {
    name: 'Lê Hoàng Nam',
    email: 'nam.le@encyclopedia.example',
    role: 'learner',
    track: 'Business',
  },
  {
    name: 'Phạm Văn Đạt',
    email: 'dat.pham@encyclopedia.example',
    role: 'learner',
    track: 'Business',
  },
  {
    name: 'Vũ Thị Ngọc Anh',
    email: 'ngocanh.vu@encyclopedia.example',
    role: 'learner',
    track: 'Business',
  },
  {
    name: 'Hoàng Văn Thịnh',
    email: 'thinh.hoang@encyclopedia.example',
    role: 'learner',
    track: 'Business',
  },
  // ---------------- Learners — Leadership (5) ----------------
  {
    name: 'Vũ Thị Thu Hà',
    email: 'thuha.vu@encyclopedia.example',
    role: 'learner',
    track: 'Leadership',
  },
  {
    name: 'Đặng Thị Thảo',
    email: 'thao.dang@encyclopedia.example',
    role: 'learner',
    track: 'Leadership',
  },
  {
    name: 'Bùi Văn Hiếu',
    email: 'hieu.bui@encyclopedia.example',
    role: 'learner',
    track: 'Leadership',
  },
  {
    name: 'Ngô Thị Hương',
    email: 'huong.ngo@encyclopedia.example',
    role: 'learner',
    track: 'Leadership',
  },
  {
    name: 'Đỗ Văn Kiên',
    email: 'kien.do@encyclopedia.example',
    role: 'learner',
    track: 'Leadership',
  },
  // ---------------- Trainers — Technical (3) ----------------
  {
    name: 'Đặng Quốc Huy',
    email: 'huy.dang@encyclopedia.example',
    role: 'trainer',
    track: 'Technical',
  },
  {
    name: 'Hoàng Thị Ngọc',
    email: 'ngoc.hoang@encyclopedia.example',
    role: 'trainer',
    track: 'Technical',
  },
  {
    name: 'Trịnh Thị Hằng',
    email: 'hang.trinh@encyclopedia.example',
    role: 'trainer',
    track: 'Technical',
  },
  // ---------------- Trainers — Business (3) ----------------
  {
    name: 'Bùi Văn Tuấn',
    email: 'tuan.bui@encyclopedia.example',
    role: 'trainer',
    track: 'Business',
  },
  {
    name: 'Đỗ Thị Phương',
    email: 'phuong.do@encyclopedia.example',
    role: 'trainer',
    track: 'Business',
  },
  {
    name: 'Phan Văn Long',
    email: 'long.phan@encyclopedia.example',
    role: 'trainer',
    track: 'Business',
  },
  // ---------------- Trainers — Leadership (3) ----------------
  {
    name: 'Ngô Minh Đức',
    email: 'duc.ngo@encyclopedia.example',
    role: 'trainer',
    track: 'Leadership',
  },
  {
    name: 'Lý Thị Kim Ngân',
    email: 'kimngan.ly@encyclopedia.example',
    role: 'trainer',
    track: 'Leadership',
  },
  {
    name: 'Đinh Văn Sơn',
    email: 'son.dinh@encyclopedia.example',
    role: 'trainer',
    track: 'Leadership',
  },
];

interface AccountResult {
  name: string;
  email: string;
  role: string;
  track: Track;
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
        track: account.track,
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
      track: account.track,
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
        ? `${r.role.padEnd(8)} ${r.track.padEnd(11)} ${r.name.padEnd(20)} ${r.email.padEnd(30)} ${r.password}`
        : `${r.role.padEnd(8)} ${r.track.padEnd(11)} ${r.name.padEnd(20)} ${r.email.padEnd(30)} (already existed — password not available)`,
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
