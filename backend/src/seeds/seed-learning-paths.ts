// src/seeds/seed-learning-paths.ts
//
// #500 — bundles the #109/#500 course catalogue into a handful of real
// Learning Paths (see LearningPath/#224), a few per track, so the
// Catalogue/Discover "Learning paths to explore" sections and the
// Trainer Studio path editor all have real, browsable content instead of
// an empty state. Each path is owned by one of the #500 trainers and
// scoped to their team's Provider (courses.provider_id) — matching how a
// real trainer would build a path only from courses their own team (or
// they personally) can already edit.
//
// Only touches Postgres directly (profiles, courses, providers,
// learning_paths, learning_path_courses) via AppDataSource — no
// Supabase Admin API needed. Profile/provider/course ids are looked up
// by name/title rather than duplicating the #145/#146/#109 data here.
//
// Depends on #145 (seed:accounts), #146/#500 (seed:providers), and #109
// (seed:courses) having already run — fails fast if any referenced
// profile/provider/course is missing.
//
// Idempotent at the table level, matching seed-courses.ts/seed-forum-posts.ts:
// skips entirely if learning_paths already has any rows. Run the #144
// wipe script first to reseed.
//
//   npm run seed:learning-paths
//
// Requires DATABASE_URL in .env (same as every other seed/migration).

import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { LearningPath } from '../learning-paths/entities/learning-path.entity';
import { LearningPathCourse } from '../learning-paths/entities/learning-path-course.entity';

interface PathPlan {
  title: string;
  description: string;
  // Which trainer (by profile name, from seed-accounts.ts) owns this
  // path, and which provider (by name, from seed-providers.ts) it's
  // scoped to — mirrors how CoursesService stamps owner_id/provider_id
  // on a real trainer-created course.
  ownerName: string;
  providerName: string;
  // Course titles in the order a learner should take them — position is
  // derived from array order, same as LearningPathsService.update()
  // always re-deriving position server-side rather than trusting a
  // client-sent value.
  courseTitles: string[];
}

const PATH_PLAN: PathPlan[] = [
  // ---------------- Technical (3 paths) ----------------
  {
    title: 'AI & Data Foundations',
    description:
      'Go from Python basics to shipping real AI features — data structures, visualization, SQL, machine learning, and building with Claude.',
    ownerName: 'Đặng Quốc Huy',
    providerName: 'Anthropic Academy',
    courseTitles: [
      'Python for Everybody',
      'Data Visualization with Python',
      'Introduction to SQL & Databases',
      'Machine Learning Foundations',
      'AI Engineering with Claude',
    ],
  },
  {
    title: 'Full-Stack Web Development',
    description:
      'Learn the full path from JavaScript fundamentals to a working full-stack app: React on the frontend, Node.js and REST APIs on the backend.',
    ownerName: 'Hoàng Thị Ngọc',
    providerName: 'Encyclopedia Web Guild',
    courseTitles: [
      'JavaScript Fundamentals',
      'Modern Web Development with React',
      'Backend Engineering with Node.js',
      'API Design & REST Fundamentals',
    ],
  },
  {
    title: 'Cloud & DevOps Track',
    description:
      'Build the practical skills to ship and operate software safely: version control, cloud infrastructure, CI/CD pipelines, and security basics.',
    ownerName: 'Trịnh Thị Hằng',
    providerName: 'Encyclopedia DevOps Guild',
    courseTitles: [
      'Git & Version Control for Teams',
      'Cloud Computing Foundations (AWS)',
      'DevOps & CI/CD Pipelines',
      'Cybersecurity Essentials',
    ],
  },
  // ---------------- Business (2 paths) ----------------
  {
    title: 'Growth & Marketing Path',
    description:
      'Everything you need to plan, launch, and improve a growth engine — marketing strategy, digital channels, sales, and customer retention.',
    ownerName: 'Phan Văn Long',
    providerName: 'Encyclopedia Growth Academy',
    courseTitles: [
      'Marketing Strategy Foundations',
      'Introduction to Digital Marketing',
      'Sales Fundamentals',
      'Customer Success Strategy',
    ],
  },
  {
    title: 'Business Fundamentals Path',
    description:
      'A well-rounded foundation for anyone stepping into a broader business role: strategy, financial literacy, agile delivery, and decision-making.',
    ownerName: 'Bùi Văn Tuấn',
    providerName: 'Encyclopedia Business School',
    courseTitles: [
      'Business Model Design',
      'Financial Literacy for Managers',
      'Agile Project Management',
      'Data-Driven Decision Making',
      'Negotiation Essentials',
    ],
  },
  // ---------------- Leadership (2 paths) ----------------
  {
    title: 'New Manager Essentials',
    description:
      "The first-90-days path for anyone newly leading a team: setting direction, giving feedback, managing your time, and handling conflict.",
    ownerName: 'Ngô Minh Đức',
    providerName: 'Global Leadership Institute',
    courseTitles: [
      'Leading High-Performing Teams',
      'Giving and Receiving Feedback',
      'Time Management for Leaders',
      'Conflict Resolution at Work',
    ],
  },
  {
    title: 'Executive Leadership Path',
    description:
      'For experienced leaders ready to operate at a higher level — strategic thinking, deciding under uncertainty, executive presence, and leading change.',
    ownerName: 'Lý Thị Kim Ngân',
    providerName: 'Encyclopedia Leadership Academy',
    courseTitles: [
      'Strategic Thinking for Leaders',
      'Decision-Making Under Uncertainty',
      'Public Speaking & Executive Presence',
      'Change Management Essentials',
      'Building a Coaching Culture',
    ],
  },
];

async function main() {
  await AppDataSource.initialize();

  const pathRepo = AppDataSource.getRepository(LearningPath);
  const pathCourseRepo = AppDataSource.getRepository(LearningPathCourse);

  const existingCount = await pathRepo.count();
  if (existingCount > 0) {
    console.log(
      `Skipping seed: ${existingCount} learning path(s) already exist. ` +
        'This script only seeds an empty table — run the #144 wipe script first if you want to reseed.',
    );
    await AppDataSource.destroy();
    return;
  }

  const ownerNames = [...new Set(PATH_PLAN.map((p) => p.ownerName))];
  const providerNames = [...new Set(PATH_PLAN.map((p) => p.providerName))];
  const courseTitles = [...new Set(PATH_PLAN.flatMap((p) => p.courseTitles))];

  const profileRows = await AppDataSource.query<{ id: string; name: string }[]>(
    'SELECT id, name FROM "profiles" WHERE name = ANY($1)',
    [ownerNames],
  );
  const ownerIdByName = new Map(profileRows.map((p) => [p.name, p.id]));

  const providerRows = await AppDataSource.query<{ id: string; name: string }[]>(
    'SELECT id, name FROM "providers" WHERE name = ANY($1)',
    [providerNames],
  );
  const providerIdByName = new Map(providerRows.map((p) => [p.name, p.id]));

  const courseRows = await AppDataSource.query<{ id: string; title: string }[]>(
    'SELECT id, title FROM "courses" WHERE title = ANY($1)',
    [courseTitles],
  );
  const courseIdByTitle = new Map(courseRows.map((c) => [c.title, c.id]));

  const missingOwners = ownerNames.filter((n) => !ownerIdByName.has(n));
  const missingProviders = providerNames.filter((n) => !providerIdByName.has(n));
  const missingCourses = courseTitles.filter((t) => !courseIdByTitle.has(t));
  if (missingOwners.length || missingProviders.length || missingCourses.length) {
    throw new Error(
      'Missing seeded data — run seed:accounts, seed:providers, and seed:courses first.\n' +
        (missingOwners.length ? `  Missing profile(s): ${missingOwners.join(', ')}\n` : '') +
        (missingProviders.length ? `  Missing provider(s): ${missingProviders.join(', ')}\n` : '') +
        (missingCourses.length ? `  Missing course(s): ${missingCourses.join(', ')}\n` : ''),
    );
  }

  for (const plan of PATH_PLAN) {
    const path = await pathRepo.save(
      pathRepo.create({
        title: plan.title,
        description: plan.description,
        ownerId: ownerIdByName.get(plan.ownerName)!,
        providerId: providerIdByName.get(plan.providerName)!,
      }),
    );

    const pathCourses = plan.courseTitles.map((title, position) =>
      pathCourseRepo.create({
        learningPath: path,
        course: { id: courseIdByTitle.get(title)! } as any,
        position,
      }),
    );
    await pathCourseRepo.save(pathCourses);

    console.log(
      `Seeded path "${plan.title}" — ${pathCourses.length} course(s), owner ${plan.ownerName}.`,
    );
  }

  console.log(`\nDone. Seeded ${PATH_PLAN.length} learning path(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
