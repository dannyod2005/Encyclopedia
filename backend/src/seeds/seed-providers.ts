// src/seeds/seed-providers.ts
//
// #146 — creates a handful of Provider records and gives
// RequireCourseOwnerGuard real data to enforce against, by linking:
//   - the #145 seeded trainers to providers (a mix of owners, a plain
//     member, and at least one trainer with no provider at all), and
//   - the #109 seeded courses to those same providers via
//     courses.owner_id / courses.provider_id, matched against the
//     course's existing (plain-text) `provider` field.
//
// Depends on #145 having already run (npm run seed:accounts) — this
// script looks up the seeded trainers by the email addresses defined
// in seed-accounts.ts and fails fast with a clear error if any are
// missing, rather than silently creating providers with no owner.
//
// Idempotent: reuses an existing Provider row if one with the same
// name already exists (rather than generating a second invite code
// and duplicating it), and unconditionally re-applies the
// owner/member/course links either way — safe to re-run after a
// partial failure.
//
//   npm run seed:providers
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (same as
// wipe-test-data.ts / seed-accounts.ts).

import 'dotenv/config';
import { randomInt } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { AppDataSource } from '../data-source';
import { Provider } from '../providers/entities/provider.entity';
import { ACCOUNTS } from './seed-accounts';

// Mirrors ProvidersService's invite code generation exactly (same
// alphabet, length, and uniqueness-retry approach) so seeded providers
// look identical to ones created through the real API.
const INVITE_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 5;

interface ProviderPlan {
  // Must exactly match the `provider` text already set on courses in
  // seed-courses.ts (#109) — that's how seeded courses get linked to
  // this provider. Also becomes the new Provider row's name.
  name: string;
  ownerEmail: string;
  memberEmails: string[];
}

// 3 of the 8 provider names used across the #109 course set, chosen to
// cover all three catalogue categories (Business, Leadership,
// Technical) and to give a meaningful number of courses to each ("Encyclopedia
// Business School" and "Global Leadership Institute" are the two
// largest groups in seed-courses.ts). The other 5 provider-name groups
// (Anthropic Academy, Dept. of Data Science, Encyclopedia DevOps Guild,
// Encyclopedia Security Lab, Encyclopedia Growth Academy) are left unlinked —
// #146 only asks for "a handful" (2-3), not full coverage.
//
// Of the 5 trainers seeded in #145: 3 own a provider, 1 is a plain
// member (not owner) of one, and 1 (phuong.do@encyclopedia.example — Đỗ
// Thị Phương) is deliberately left with no provider at all, per #146's
// "at least one trainer with no provider" requirement.
const PROVIDER_PLAN: ProviderPlan[] = [
  {
    name: 'Encyclopedia Business School',
    ownerEmail: 'huy.dang@encyclopedia.example', // Đặng Quốc Huy
    memberEmails: ['ngoc.hoang@encyclopedia.example'], // Hoàng Thị Ngọc
  },
  {
    name: 'Global Leadership Institute',
    ownerEmail: 'tuan.bui@encyclopedia.example', // Bùi Văn Tuấn
    memberEmails: [],
  },
  {
    name: 'Encyclopedia Web Guild',
    ownerEmail: 'duc.ngo@encyclopedia.example', // Ngô Minh Đức
    memberEmails: [],
  },
];

// phuong.do@encyclopedia.example (Đỗ Thị Phương) — intentionally not
// referenced in PROVIDER_PLAN above. Explicitly nulled out below
// rather than just "never touched", so re-running this script after
// any manual testing (e.g. someone joined her to a provider by hand)
// puts her back in the "no provider" state #146 asks for.
const UNLINKED_TRAINER_EMAILS = ['phuong.do@encyclopedia.example'];

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

async function generateUniqueInviteCode(
  providerRepo: ReturnType<typeof AppDataSource.getRepository<Provider>>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_CODE_CHARS[randomInt(INVITE_CODE_CHARS.length)];
    }
    const existing = await providerRepo.findOne({
      where: { inviteCode: code },
    });
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique invite code after 5 attempts.');
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to run this script.',
    );
  }

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

  const authUsers = await listAllAuthUsers(supabaseAdmin);
  const idByEmail = new Map(
    authUsers.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]),
  );

  // Fail fast with a clear message rather than creating providers with
  // a missing/undefined owner if #145 hasn't been run yet.
  const trainerEmails = ACCOUNTS.filter((a) => a.role === 'trainer').map(
    (a) => a.email,
  );
  const missing = trainerEmails.filter(
    (email) => !idByEmail.has(email.toLowerCase()),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing seeded trainer account(s): ${missing.join(', ')}. ` +
        'Run "npm run seed:accounts" (#145) before seeding providers.',
    );
  }

  const providerRepo = AppDataSource.getRepository(Provider);

  for (const plan of PROVIDER_PLAN) {
    const ownerId = idByEmail.get(plan.ownerEmail.toLowerCase())!;

    let provider = await providerRepo.findOne({ where: { name: plan.name } });
    if (provider) {
      console.log(`Provider "${plan.name}" already exists — reusing it.`);
    } else {
      const inviteCode = await generateUniqueInviteCode(providerRepo);
      provider = await providerRepo.save(
        providerRepo.create({ name: plan.name, inviteCode, ownerId }),
      );
      console.log(
        `Created provider "${plan.name}" (invite code: ${inviteCode}).`,
      );
    }

    const memberIds = plan.memberEmails.map((email) =>
      idByEmail.get(email.toLowerCase())!,
    );
    const linkedProfileIds = [ownerId, ...memberIds];

    await AppDataSource.query(
      `UPDATE "profiles" SET provider_id = $1 WHERE id = ANY($2::uuid[])`,
      [provider.id, linkedProfileIds],
    );
    console.log(
      `  Linked owner + ${memberIds.length} member(s) to "${plan.name}".`,
    );

    const result = await AppDataSource.query<{ count: string }[]>(
      `UPDATE "courses" SET owner_id = $1, provider_id = $2 WHERE provider = $3 RETURNING id`,
      [ownerId, provider.id, plan.name],
    );
    console.log(
      `  Assigned owner_id/provider_id on ${result.length} course(s) with provider = "${plan.name}".`,
    );
  }

  const unlinkedIds = UNLINKED_TRAINER_EMAILS.map((email) =>
    idByEmail.get(email.toLowerCase())!,
  );
  await AppDataSource.query(
    `UPDATE "profiles" SET provider_id = NULL WHERE id = ANY($1::uuid[])`,
    [unlinkedIds],
  );
  console.log(
    `\nConfirmed ${unlinkedIds.length} trainer(s) have no provider: ${UNLINKED_TRAINER_EMAILS.join(', ')}.`,
  );

  console.log('\nDone.');
  await AppDataSource.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
