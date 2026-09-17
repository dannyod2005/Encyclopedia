// src/seeds/seed-providers.ts
//
// #146 — creates Provider records and gives RequireCourseOwnerGuard real
// data to enforce against, by linking:
//   - the seeded trainers to providers (owners and members), and
//   - the seeded courses to those same providers via courses.owner_id /
//     courses.provider_id, matched against the course's existing
//     (plain-text) `provider` field.
//
// #500 — rewritten for the full reseed: every one of the 9 #500 trainers
// (3 per track) now belongs to exactly one team, and every one of the 40
// #109/#500 courses ends up owned by a real Provider. Each PROVIDER_PLAN
// entry represents one real team (one Provider row, one owner, 0+
// members) and can cover MULTIPLE course-provider text groups via
// `courseProviderNames` — e.g. the Technical track only has 3 trainers
// but 5 distinct provider names already baked into seed-courses.ts
// (Anthropic Academy, Dept. of Data Science, Encyclopedia Web Guild,
// Encyclopedia DevOps Guild, Encyclopedia Security Lab), so one team's
// owner ends up covering two of those groups rather than inventing a
// 4th/5th trainer per track. This also sidesteps a real constraint:
// profiles.provider_id is a single scalar (see Profile entity's own
// comment — "at most one provider per trainer" is a deliberate v1
// limit), so a trainer can only ever appear in ONE plan entry's
// owner/members — listing the same person across two entries would have
// the second UPDATE silently clobber the first with no error. Every
// trainer below appears exactly once for exactly that reason.
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
  // The new Provider row's name and the name shown in its invite-code
  // card. Doesn't have to equal every course's plain-text `provider`
  // field it owns — see courseProviderNames below.
  name: string;
  ownerEmail: string;
  memberEmails: string[];
  // Every course whose `provider` text column matches ANY of these
  // strings gets owner_id/provider_id stamped to this team. Almost
  // always a single-element array (the Provider's own name); a few
  // teams below cover more than one of seed-courses.ts's original
  // provider-name groups so every track's 3 trainers can own every one
  // of that track's courses without inventing extra accounts.
  courseProviderNames: string[];
}

// #500 — one team per track-trainer, covering every course in every
// track (unlike #146's original 3-of-8 "a handful" scope). 7 real teams
// total: 3 Technical, 2 Business, 2 Leadership — fewer teams than
// trainers in Technical only because that track's 3 trainers have to
// stretch across 5 pre-existing course-provider-name groups (see the
// file-header comment); Business and Leadership both split 1 team per
// 1-2 trainers with real membership.
const PROVIDER_PLAN: ProviderPlan[] = [
  // ---------------- Technical (3 teams / 3 trainers) ----------------
  {
    name: 'Anthropic Academy',
    ownerEmail: 'huy.dang@encyclopedia.example', // Đặng Quốc Huy
    memberEmails: [],
    courseProviderNames: ['Anthropic Academy', 'Dept. of Data Science'],
  },
  {
    name: 'Encyclopedia Web Guild',
    ownerEmail: 'ngoc.hoang@encyclopedia.example', // Hoàng Thị Ngọc
    memberEmails: [],
    courseProviderNames: ['Encyclopedia Web Guild'],
  },
  {
    name: 'Encyclopedia DevOps Guild',
    ownerEmail: 'hang.trinh@encyclopedia.example', // Trịnh Thị Hằng
    memberEmails: [],
    courseProviderNames: ['Encyclopedia DevOps Guild', 'Encyclopedia Security Lab'],
  },
  // ---------------- Business (2 teams / 3 trainers) ----------------
  {
    name: 'Encyclopedia Business School',
    ownerEmail: 'tuan.bui@encyclopedia.example', // Bùi Văn Tuấn
    memberEmails: ['phuong.do@encyclopedia.example'], // Đỗ Thị Phương
    courseProviderNames: ['Encyclopedia Business School'],
  },
  {
    name: 'Encyclopedia Growth Academy',
    ownerEmail: 'long.phan@encyclopedia.example', // Phan Văn Long
    memberEmails: [],
    courseProviderNames: ['Encyclopedia Growth Academy'],
  },
  // ---------------- Leadership (2 teams / 3 trainers) ----------------
  {
    name: 'Global Leadership Institute',
    ownerEmail: 'duc.ngo@encyclopedia.example', // Ngô Minh Đức
    memberEmails: ['son.dinh@encyclopedia.example'], // Đinh Văn Sơn
    courseProviderNames: ['Global Leadership Institute'],
  },
  {
    name: 'Encyclopedia Leadership Academy',
    ownerEmail: 'kimngan.ly@encyclopedia.example', // Lý Thị Kim Ngân
    memberEmails: [],
    courseProviderNames: ['Encyclopedia Leadership Academy'],
  },
];

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
      `UPDATE "courses" SET owner_id = $1, provider_id = $2 WHERE provider = ANY($3::text[]) RETURNING id`,
      [ownerId, provider.id, plan.courseProviderNames],
    );
    console.log(
      `  Assigned owner_id/provider_id on ${result.length} course(s) matching provider in [${plan.courseProviderNames.join(', ')}].`,
    );
  }

  // #500 — every trainer is now on a real team (unlike #146's original
  // "at least one trainer with no provider" edge case), so there's no
  // unlinked-trainer set to reconcile here anymore. That empty-state is
  // still exercisable in the live app any time — join a fresh trainer
  // signup and don't create/join a provider.

  console.log('\nDone.');
  await AppDataSource.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
