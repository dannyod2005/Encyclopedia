import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../profiles/entities/profile.entity';
import { ActivityService } from '../activity/activity.service';
import { LeaderboardEntryDto } from './dto/leaderboard-entry.dto';

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepo: Repository<Profile>,
    private readonly activityService: ActivityService,
  ) {}

  // #231 — the query itself is the enforcement point for "opted-out
  // learners never appear": only rows with leaderboard_opt_in = true are
  // ever fetched, so there's no separate filter step downstream that a
  // future change could accidentally skip.
  async getRankings(requestingUserId: string): Promise<LeaderboardEntryDto[]> {
    const optedIn = await this.profilesRepo.find({
      where: { leaderboardOptIn: true },
    });
    if (optedIn.length === 0) return [];

    const pointsByUser = await this.activityService.getWeeklyPointsForUsers(
      optedIn.map((p) => p.id),
    );

    // #231/#246 — weekly points descending; ties broken by name so the
    // order is at least stable/deterministic rather than depending on
    // however the DB happened to return rows.
    const ranked = optedIn
      .map((p) => ({
        id: p.id,
        name: p.name || 'Encyclopedia Learner',
        weeklyPoints: pointsByUser.get(p.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.weeklyPoints - a.weeklyPoints || a.name.localeCompare(b.name),
      );

    return ranked.map((entry, index) => ({
      rank: index + 1,
      id: entry.id,
      name: entry.name,
      weeklyPoints: entry.weeklyPoints,
      isSelf: entry.id === requestingUserId,
    }));
  }
}
