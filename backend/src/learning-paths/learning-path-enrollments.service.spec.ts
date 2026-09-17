import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { LearningPathEnrollmentsService } from './learning-path-enrollments.service';
import { LearningPathEnrollment } from './entities/learning-path-enrollment.entity';
import { LearningPath } from './entities/learning-path.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';

// #498 — covers the cascade-enroll-into-every-course behavior on path
// enrollment (including the "already individually enrolled in one of
// these courses" no-op case) and the derived completedCount/status
// math in toResponseDto, which is never stored and recomputed live
// against the learner's own Enrollment rows every time.
describe('LearningPathEnrollmentsService', () => {
  let service: LearningPathEnrollmentsService;

  const mockPathEnrollmentsRepo = {
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(),
    find: jest.fn(),
  };
  const mockPathsRepo = { findOne: jest.fn() };
  const mockProfilesRepo = { findOne: jest.fn() };
  const mockEnrollmentsRepo = { count: jest.fn() };
  const mockEnrollmentsService = { create: jest.fn() };

  const profile = { id: 'user-1' } as Profile;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningPathEnrollmentsService,
        {
          provide: getRepositoryToken(LearningPathEnrollment),
          useValue: mockPathEnrollmentsRepo,
        },
        { provide: getRepositoryToken(LearningPath), useValue: mockPathsRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
        { provide: getRepositoryToken(Enrollment), useValue: mockEnrollmentsRepo },
        { provide: EnrollmentsService, useValue: mockEnrollmentsService },
      ],
    }).compile();

    service = module.get<LearningPathEnrollmentsService>(
      LearningPathEnrollmentsService,
    );

    mockEnrollmentsRepo.count.mockResolvedValue(0);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const path = {
      id: 'path-1',
      title: 'Onboarding',
      description: null,
      pathCourses: [
        { position: 0, course: { id: 'c1' } },
        { position: 1, course: { id: 'c2' } },
      ],
      createdAt: new Date('2026-01-01'),
    };

    it('throws NotFoundException when the profile does not exist', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('user-1', { pathId: 'path-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the path does not exist', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockPathsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('user-1', { pathId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('translates a duplicate path enrollment into a 409', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockPathsRepo.findOne.mockResolvedValue(path);
      const conflict = Object.create(QueryFailedError.prototype);
      conflict.code = '23505';
      mockPathEnrollmentsRepo.save.mockRejectedValue(conflict);

      await expect(
        service.create('user-1', { pathId: 'path-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('cascade-enrolls the learner in every constituent course', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockPathsRepo.findOne.mockResolvedValue(path);
      mockPathEnrollmentsRepo.save.mockResolvedValue({});
      mockEnrollmentsService.create.mockResolvedValue({});

      await service.create('user-1', { pathId: 'path-1' });

      expect(mockEnrollmentsService.create).toHaveBeenCalledWith('user-1', {
        courseId: 'c1',
      });
      expect(mockEnrollmentsService.create).toHaveBeenCalledWith('user-1', {
        courseId: 'c2',
      });
      expect(mockEnrollmentsService.create).toHaveBeenCalledTimes(2);
    });

    it('treats "already enrolled in that course" as a no-op, not an error', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockPathsRepo.findOne.mockResolvedValue(path);
      mockPathEnrollmentsRepo.save.mockResolvedValue({});
      mockEnrollmentsService.create
        .mockRejectedValueOnce(new ConflictException('already enrolled'))
        .mockResolvedValueOnce({});

      await expect(
        service.create('user-1', { pathId: 'path-1' }),
      ).resolves.toBeDefined();
    });

    it('propagates a non-conflict error from the per-course enrollment', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockPathsRepo.findOne.mockResolvedValue(path);
      mockPathEnrollmentsRepo.save.mockResolvedValue({});
      mockEnrollmentsService.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create('user-1', { pathId: 'path-1' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('derived progress (toResponseDto)', () => {
    function pathEnrollment(courses: { id: string }[]) {
      return {
        id: 'pe-1',
        createdAt: new Date('2026-01-01'),
        learningPath: {
          id: 'path-1',
          title: 'Onboarding',
          description: null,
          pathCourses: courses.map((c, i) => ({ position: i, course: c })),
        },
      };
    }

    it('reports status "in-progress" when fewer courses are complete than total', async () => {
      mockPathEnrollmentsRepo.find.mockResolvedValue([
        pathEnrollment([{ id: 'c1' }, { id: 'c2' }]),
      ]);
      mockEnrollmentsRepo.count.mockResolvedValue(1);

      const [result] = await service.findAllForUser('user-1');

      expect(result.completedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.status).toBe('in-progress');
    });

    it('reports status "complete" once completedCount reaches totalCount', async () => {
      mockPathEnrollmentsRepo.find.mockResolvedValue([
        pathEnrollment([{ id: 'c1' }, { id: 'c2' }]),
      ]);
      mockEnrollmentsRepo.count.mockResolvedValue(2);

      const [result] = await service.findAllForUser('user-1');

      expect(result.status).toBe('complete');
    });

    it('does not report a 0-course path as complete', async () => {
      mockPathEnrollmentsRepo.find.mockResolvedValue([pathEnrollment([])]);

      const [result] = await service.findAllForUser('user-1');

      expect(result.totalCount).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.status).toBe('in-progress');
      expect(mockEnrollmentsRepo.count).not.toHaveBeenCalled();
    });

    it('orders the returned course list by position', async () => {
      mockPathEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'pe-1',
          createdAt: new Date(),
          learningPath: {
            id: 'path-1',
            title: 'Onboarding',
            description: null,
            pathCourses: [
              { position: 1, course: { id: 'c2' } },
              { position: 0, course: { id: 'c1' } },
            ],
          },
        },
      ]);

      const [result] = await service.findAllForUser('user-1');

      expect(result.courses.map((c: { id: string }) => c.id)).toEqual([
        'c1',
        'c2',
      ]);
    });
  });
});
