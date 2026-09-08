import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { ForumPost } from '../forum/entities/forum-post.entity';
import { Course } from '../courses/entities/course.entity';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { BADGE_DEFINITIONS_BY_KEY } from '../badges/badge-definitions';

const EXCERPT_MAX_LENGTH = 120;

// #229 — how many notifications the topbar shows. Not paginated in v1:
// a learner's reply-notification volume is inherently bounded (one per
// reply to one of their posts), so a flat recent-N cap is enough without
// needing real pagination yet.
const NOTIFICATION_LIST_LIMIT = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
  ) {}

  // #229 — takes already-loaded entities rather than ids: ModulesService.
  // createPost already has `profile` (the replier/actor) and the parent
  // post's `user` (the recipient) in hand from the lookups it already had
  // to do to validate/save the reply itself, so re-fetching them here
  // would just be redundant round trips.
  async createForReply(
    recipient: Profile,
    actor: Profile,
    forumPost: ForumPost,
  ): Promise<void> {
    const notification = this.notificationsRepo.create({
      recipient,
      actor,
      type: 'forum_reply',
      forumPost,
    });
    await this.notificationsRepo.save(notification);
  }

  // #257 — called from BadgesService.award, but only past the point where
  // that method has already confirmed this is a genuine new insert (its
  // 23505-caught idempotent-no-op branch returns before ever reaching
  // this call) — so this fires exactly once per learner per badge, same
  // guarantee award() already gives user_badges itself. Takes a bare
  // userId rather than a loaded Profile: award() only ever has the id in
  // hand (it's generic across every evaluate* caller, none of which pass
  // it a full Profile), and a partial `{ id }` reference is enough for
  // TypeORM to write the FK on both recipient and actor — no extra query
  // needed just to satisfy the relation's TypeScript type.
  async createForBadge(recipientId: string, badgeKey: string): Promise<void> {
    const notification = this.notificationsRepo.create({
      recipient: { id: recipientId } as Profile,
      actor: { id: recipientId } as Profile,
      type: 'badge_earned',
      badgeKey,
    });
    await this.notificationsRepo.save(notification);
  }

  // #257 — called from EnrollmentsService.updateProgress right after an
  // enrollment's status transitions to 'complete', which already has both
  // the learner's Profile (`enrollment.user`) and the just-completed
  // Course loaded from the query it needed for the completion check
  // itself — passed as already-loaded entities here rather than ids, same
  // reasoning as createForReply above.
  async createForCourseCompletion(
    recipient: Profile,
    course: Course,
  ): Promise<void> {
    const notification = this.notificationsRepo.create({
      recipient,
      actor: recipient,
      type: 'course_completed',
      course,
    });
    await this.notificationsRepo.save(notification);
  }

  async findAllForUser(userId: string): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationsRepo.find({
      where: { recipient: { id: userId } },
      relations: {
        actor: true,
        forumPost: { module: { course: true } },
        course: true,
      },
      order: { createdAt: 'DESC' },
      take: NOTIFICATION_LIST_LIMIT,
    });

    // #278 — a single row whose payload relation unexpectedly comes back
    // null (see toResponseDto's comment) used to throw and take down this
    // recipient's *entire* list. Drop just that row (toResponseDto returns
    // null for it) rather than letting one bad row 500 everything else.
    return notifications
      .map((n) => this.toResponseDto(n))
      .filter((dto): dto is NotificationResponseDto => dto !== null);
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsRepo.findOne({
      where: { id: notificationId },
      relations: {
        recipient: true,
        actor: true,
        forumPost: { module: { course: true } },
        course: true,
      },
    });
    if (!notification) {
      throw new NotFoundException(
        `Notification with id "${notificationId}" not found`,
      );
    }
    // Ownership check: a user can only mark their own notifications read —
    // never trust that the client only ever sends its own notification id,
    // same principle as EnrollmentsService.updateProgress.
    if (notification.recipient.id !== userId) {
      throw new ForbiddenException('This notification does not belong to you');
    }

    if (!notification.read) {
      notification.read = true;
      await this.notificationsRepo.save(notification);
    }

    // #278 — this notification is real and the read-state write above
    // already succeeded; a malformed payload relation (see toResponseDto)
    // shouldn't make the mark-read action itself fail. Fall back to the
    // base fields only rather than throwing, same "still show something
    // rather than nothing" reasoning as the badge_earned retired-definition
    // fallback below.
    return this.toResponseDto(notification) ?? this.toBase(notification);
  }

  private toBase(
    n: Notification,
  ): Pick<
    NotificationResponseDto,
    'id' | 'read' | 'createdAt' | 'type' | 'actorName'
  > {
    return {
      id: n.id,
      read: n.read,
      createdAt: n.createdAt,
      type: n.type,
      actorName: n.actor?.name || 'Encyclopedia Learner',
    };
  }

  // #257/#278 — originally branched on `type` alone, trusting the
  // migration's CHK_notifications_type_payload constraint to guarantee the
  // matching payload relation (forumPost/course/badgeKey) could never be
  // null, and used non-null assertions on that basis. That constraint is a
  // real guarantee for what the *database* will accept on insert, but it's
  // not a guarantee about what a relation lookup resolves to at read time
  // (e.g. data touched outside the app, an edge case in how a row was
  // written) — and a single row's non-null assertion throwing here used to
  // take down this recipient's entire notification list (see
  // findAllForUser). Every branch below now checks its relation instead of
  // asserting it, logs, and returns null rather than throwing when it's
  // unexpectedly missing — findAllForUser drops that one row from the
  // response instead of failing the whole request over it.
  private toResponseDto(n: Notification): NotificationResponseDto | null {
    const base = this.toBase(n);

    if (n.type === 'forum_reply') {
      if (!n.forumPost?.module?.course) {
        this.logger.warn(
          `Notification ${n.id} is type "forum_reply" but its forumPost/module/course relation is missing — dropping it instead of failing the whole list.`,
        );
        return null;
      }
      const course = n.forumPost.module.course;
      const content = n.forumPost.content;
      return {
        ...base,
        courseId: course.id,
        courseTitle: course.title,
        moduleId: n.forumPost.module.id,
        moduleTitle: n.forumPost.module.title,
        excerpt:
          content.length > EXCERPT_MAX_LENGTH
            ? `${content.slice(0, EXCERPT_MAX_LENGTH)}…`
            : content,
      };
    }

    if (n.type === 'badge_earned') {
      const def = BADGE_DEFINITIONS_BY_KEY.get(n.badgeKey ?? '');
      return {
        ...base,
        // Same "definition retired since it was earned" fallback as
        // BadgesService.getBadgesForUser, just surfaced instead of
        // dropped — a notification (unlike the badges list) has no
        // reasonable way to just omit itself. A missing/blank badgeKey
        // simply won't match anything in the map, which is handled the
        // same way as a retired definition — no separate null check
        // needed here.
        badgeLabel: def?.label ?? 'New badge',
        badgeDescription: def?.description ?? '',
      };
    }

    if (n.type === 'course_completed') {
      if (!n.course) {
        this.logger.warn(
          `Notification ${n.id} is type "course_completed" but its course relation is missing — dropping it instead of failing the whole list.`,
        );
        return null;
      }
      return {
        ...base,
        courseId: n.course.id,
        courseTitle: n.course.title,
      };
    }

    // Unrecognized type value. Shouldn't be reachable given the DB CHECK
    // constraint only allows the three types above, but this is exactly
    // the "don't trust the constraint alone at read time" case the rest
    // of this method now guards against — never crash the whole list over
    // a row this code doesn't know how to render.
    this.logger.warn(
      `Notification ${n.id} has unrecognized type "${String(n.type)}" — dropping it instead of failing the whole list.`,
    );
    return null;
  }
}
