import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LearningPathsService } from './learning-paths.service';
import { LearningPath } from './entities/learning-path.entity';
import { LearningPathCourse } from './entities/learning-path-course.entity';
import { Course } from '../courses/entities/course.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreateLearningPathDto } from './dto/create-learning-path.dto';

// #498 — covers the course-id validation shared by create/update (no
// duplicates, every id must resolve to a real, non-deleted course — a
// path that skips this could silently break the "X of Y complete"
// progress math LearningPathEnrollmentsService relies on one-to-one)
// and the response shape's course ordering.
describe('LearningPathsService', () => {
  let service: LearningPathsService;

  const mockManager = { delete: jest.fn(), save: jest.fn() };
  const mockPathsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(),
    update: jest.fn(),
    manager: { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(mockManager)) },
  };
  const mockCoursesRepo = { find: jest.fn() };
  const mockProfilesRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningPathsService,
        { provide: getRepositoryToken(LearningPath), useValue: mockPathsRepo },
        { provide: getRepositoryToken(Course), useValue: mockCoursesRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
      ],
    }).compile();

    service = module.get<LearningPathsService>(LearningPathsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create — course id validation', () => {
    const dto: CreateLearningPathDto = {
      title: 'Onboarding',
      courseIds: ['c1', 'c2'],
    } as CreateLearningPathDto;

    it('throws BadRequestException when the same course id is listed twice', async () => {
      const dupeDto = { ...dto, courseIds: ['c1', 'c1'] } as CreateLearningPathDto;

      await expect(service.create(dupeDto, 'owner-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCoursesRepo.find).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a course id does not resolve to a real course', async () => {
      mockCoursesRepo.find.mockResolvedValue([{ id: 'c1' }]); // c2 missing

      await expect(service.create(dto, 'owner-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('create — success', () => {
    it('stamps ownerId from the caller and providerId from the owner\'s own profile', async () => {
      const dto: CreateLearningPathDto = {
        title: 'Onboarding',
        courseIds: ['c1'],
      } as CreateLearningPathDto;
      mockCoursesRepo.find.mockResolvedValue([{ id: 'c1' }]);
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'owner-1', providerId: 'provider-9' });
      mockPathsRepo.save.mockResolvedValue({ id: 'path-1' });
      mockPathsRepo.findOne.mockResolvedValue({
        id: 'path-1',
        title: 'Onboarding',
        description: null,
        ownerId: 'owner-1',
        providerId: 'provider-9',
        pathCourses: [{ position: 0, course: { id: 'c1' } }],
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.create(dto, 'owner-1');

      expect(mockPathsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-1', providerId: 'provider-9' }),
      );
      expect(result.providerId).toBe('provider-9');
    });

    it('defaults providerId to null when the owner has none', async () => {
      const dto: CreateLearningPathDto = {
        title: 'Onboarding',
        courseIds: ['c1'],
      } as CreateLearningPathDto;
      mockCoursesRepo.find.mockResolvedValue([{ id: 'c1' }]);
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'owner-1', providerId: null });
      mockPathsRepo.save.mockResolvedValue({ id: 'path-1' });
      mockPathsRepo.findOne.mockResolvedValue({
        id: 'path-1',
        pathCourses: [],
        createdAt: new Date(),
      });

      await service.create(dto, 'owner-1');

      expect(mockPathsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: null }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the path does not exist', async () => {
      mockPathsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', {
          title: 'X',
          courseIds: ['c1'],
        } as CreateLearningPathDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the old ordered course set before saving the new one', async () => {
      mockPathsRepo.findOne.mockResolvedValue({
        id: 'path-1',
        pathCourses: [{ id: 'pc-1' }, { id: 'pc-2' }],
      });
      mockCoursesRepo.find.mockResolvedValue([{ id: 'c1' }]);

      await service.update('path-1', {
        title: 'Updated',
        courseIds: ['c1'],
      } as CreateLearningPathDto);

      expect(mockManager.delete).toHaveBeenCalledWith(
        LearningPathCourse,
        { id: expect.anything() },
      );
      expect(mockManager.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when nothing was affected (already deleted / missing)', async () => {
      mockPathsRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.remove('path-1')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes on success', async () => {
      mockPathsRepo.update.mockResolvedValue({ affected: 1 });

      await expect(service.remove('path-1')).resolves.toBeUndefined();
    });
  });

  describe('response shape — course ordering', () => {
    it('sorts courses by position regardless of the relation load order', async () => {
      mockPathsRepo.find.mockResolvedValue([
        {
          id: 'path-1',
          pathCourses: [
            { position: 2, course: { id: 'c3' } },
            { position: 0, course: { id: 'c1' } },
            { position: 1, course: { id: 'c2' } },
          ],
        },
      ]);

      const result = await service.findAll();

      expect(result[0].courses.map((c: { id: string }) => c.id)).toEqual([
        'c1',
        'c2',
        'c3',
      ]);
    });
  });
});
