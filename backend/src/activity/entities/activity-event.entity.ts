import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Profile } from '../../profiles/entities/profile.entity';
import { CourseModule } from '../../courses/entities/course-module.entity';

// One row per real learning action (module completed, quiz submitted,
// note saved, forum post made) — see #37. There is no session
// heartbeat/timer; `points` is a weighted estimate assigned by whichever
// service logs the event, not a measured duration. #246 — used to be a
// straight minutes count; a module-completion event's points are now
// additionally scaled by that module's quiz grade (see
// EnrollmentsService.updateProgress and ActivityService.POINTS_PER_MINUTE),
// so this column is no longer 1:1 with any real-world time unit.
@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Profile;

  // #417/#421-hotfix — this used to also be dual-mapped as a plain
  // `userId: string` @Column (insert/update disabled) pointing at the
  // same physical `user_id` column, so callers needing just the id could
  // filter/select on it without joining/hydrating the full Profile row.
  // That broke every single activity_events insert silently: TypeORM
  // appears to collapse two metadata entries mapping to the same
  // physical column into one, and picked up the dual-mapped column's
  // `insert: false` globally — so even inserts going through this `user`
  // relation stopped writing `user_id` at all, and every module_view/
  // quiz_submit/module_complete event started failing its NOT NULL
  // constraint (caught and logged by ActivityService.logEvent's
  // try/catch, so it failed silently rather than erroring visibly).
  // Reverted; the join-avoidance optimization needs a different approach
  // (e.g. @RelationId, or a raw query) if revisited later — correctness
  // over that optimization for now.

  // 'module_complete' | 'quiz_submit' | 'note_save' | 'forum_post' |
  // 'module_view'. Server-side only — not exposed to the client, just
  // useful for debugging/analytics later.
  @Column({ type: 'text' })
  source: string;

  @Column({ type: 'int' })
  points: number;

  // #124 — which module this event is about, when relevant. Only actually
  // populated for 'module_view' and 'module_complete' (used to work out
  // which distinct days a module was engaged with, to split completion
  // points across them — see ActivityService.logModuleCompletion).
  // Nullable: 'quiz_submit'/'note_save'/'forum_post' don't set it, and an
  // older event predating this column won't have it either.
  @ManyToOne(() => CourseModule, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'module_id' })
  module: CourseModule | null;

  // #124 — normally the moment the event is logged (DB default now()),
  // but logModuleCompletion explicitly backdates this to the day a
  // module was actually viewed, rather than always today. TypeORM only
  // auto-fills this when it's left undefined at insert time, so an
  // explicit assignment beforehand (see ActivityService.logEvent) takes
  // precedence over the column default.
  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;
}
