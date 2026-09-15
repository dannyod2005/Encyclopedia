import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CoursesService } from './courses.service';
import { CourseAnalyticsService } from './course-analytics.service';
import {
  VideoDurationService,
  VideoDurationLookup,
} from './video-duration.service';
import { ModulesService } from '../modules/modules.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseAnalyticsDto } from './dto/course-analytics.dto';
import { TrainerOverviewDto } from './dto/trainer-overview.dto';
import { VideoDurationQueryDto } from './dto/video-duration-query.dto';
import { ModuleQuizResultDto } from '../quiz/dto/module-quiz-result.dto';
import { ModuleQuizQuestionCountDto } from '../quiz/dto/module-quiz-question-count.dto';
import { CourseReviewDto } from '../enrollments/dto/course-review.dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RequireTrainerGuard } from '../auth/require-trainer.guard';
import { RequireCourseOwnerGuard } from './require-course-owner.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly courseAnalyticsService: CourseAnalyticsService,
    private readonly videoDurationService: VideoDurationService,
    private readonly modulesService: ModulesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  @Get()
  findAll(): Promise<Course[]> {
    return this.coursesService.findAll();
  }

  // #259 — a static segment, must be registered before the `:id` route
  // below or Nest would match "trainer-overview" as a course id instead.
  // Trainer + owner-of-something only: this exposes a headcount that's
  // arguably fine either way, but there's no learner-facing reason to hit
  // it, so it's gated the same as the per-course analytics route.
  @Get('trainer-overview')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard)
  getTrainerOverview(
    @Req() req: AuthenticatedRequest,
  ): Promise<TrainerOverviewDto> {
    return this.courseAnalyticsService.getOverviewForOwner(req.user.id);
  }

  // #275 — a static segment, same reasoning as trainer-overview above:
  // must be registered before the `:id` route or Nest would try to
  // match "video-duration" as a course id. Trainer-only: this is a
  // course-authoring helper for the create/edit form, not something a
  // learner-facing view has any reason to call.
  @Get('video-duration')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard)
  getVideoDuration(
    @Query() query: VideoDurationQueryDto,
  ): Promise<VideoDurationLookup> {
    return this.videoDurationService.lookup(query.url);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Course> {
    return this.coursesService.findOne(id);
  }

  @Get(':id/quiz-results')
  @UseGuards(SupabaseAuthGuard)
  getQuizResults(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ModuleQuizResultDto[]> {
    return this.modulesService.getQuizResultsForCourse(req.user.id, id);
  }

  // #228 — public like findOne() above: CourseDetailModal shows reviews to
  // anyone browsing the catalogue, enrolled or not, same as it already
  // shows the aggregate star rating.
  @Get(':id/reviews')
  getReviews(@Param('id') id: string): Promise<CourseReviewDto[]> {
    return this.enrollmentsService.getReviewsForCourse(id);
  }

  // #227 — trainer + owner only, unlike the public routes above: this
  // exposes individual learners' names and progress, which is legitimately
  // sensitive in a way the aggregate course rating/reviews above aren't.
  // Same guard stack as PUT/DELETE.
  @Get(':id/analytics')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard, RequireCourseOwnerGuard)
  getAnalytics(@Param('id') id: string): Promise<CourseAnalyticsDto> {
    return this.courseAnalyticsService.getAnalyticsForCourse(id);
  }

  // (module-estimate fix) — trainer + owner only, same guard stack as
  // analytics/PUT above: this is course-authoring data (per-module quiz
  // question counts), not something a learner-facing view has any reason
  // to see. Backs TrainerCourseEditor's on-load estimate preload — see
  // ModulesService.getQuizQuestionCountsForCourse for why this is a
  // separate, lightweight endpoint rather than reusing getQuizForEdit.
  @Get(':id/quiz-question-counts')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard, RequireCourseOwnerGuard)
  getQuizQuestionCounts(
    @Param('id') id: string,
  ): Promise<ModuleQuizQuestionCountDto[]> {
    return this.modulesService.getQuizQuestionCountsForCourse(id);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCourseDto,
  ): Promise<Course> {
    return this.coursesService.create(dto, req.user.id);
  }

  @Put(':id')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard, RequireCourseOwnerGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<Course> {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard, RequireTrainerGuard, RequireCourseOwnerGuard)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.coursesService.remove(id);
  }
}
