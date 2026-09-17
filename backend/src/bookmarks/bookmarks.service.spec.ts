import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { BookmarksService } from './bookmarks.service';
import { Bookmark } from './entities/bookmark.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Course } from '../courses/entities/course.entity';

// #498 — covers create/list/remove, including the two "not found" guards
// (missing profile, missing/soft-deleted course) and the unique-
// constraint-to-409 translation on a duplicate bookmark, mirroring how
// EnrollmentsService.create handles the same shape of problem.
describe('BookmarksService', () => {
  let service: BookmarksService;

  const mockBookmarksRepo = {
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const mockProfilesRepo = { findOne: jest.fn() };
  const mockCoursesRepo = { findOne: jest.fn() };

  const profile = { id: 'user-1' } as Profile;
  const course = { id: 'course-1' } as Course;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: getRepositoryToken(Bookmark), useValue: mockBookmarksRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
        { provide: getRepositoryToken(Course), useValue: mockCoursesRepo },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws NotFoundException when the profile does not exist', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(null);

      await expect(service.create('user-1', 'course-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockCoursesRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the course does not exist (or is soft-deleted)', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockCoursesRepo.findOne.mockResolvedValue(null);

      await expect(service.create('user-1', 'course-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('saves and returns a bookmark response dto on success', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockCoursesRepo.findOne.mockResolvedValue(course);
      mockBookmarksRepo.save.mockResolvedValue({
        id: 'bm-1',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.create('user-1', 'course-1');

      expect(result).toEqual({
        id: 'bm-1',
        courseId: 'course-1',
        createdAt: new Date('2026-01-01'),
      });
    });

    it('translates a unique-constraint violation into a 409 ConflictException', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockCoursesRepo.findOne.mockResolvedValue(course);
      const conflict = Object.create(QueryFailedError.prototype);
      conflict.code = '23505';
      mockBookmarksRepo.save.mockRejectedValue(conflict);

      await expect(service.create('user-1', 'course-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows an unrelated database error', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockCoursesRepo.findOne.mockResolvedValue(course);
      const otherError = Object.create(QueryFailedError.prototype);
      otherError.code = '23502';
      mockBookmarksRepo.save.mockRejectedValue(otherError);

      await expect(service.create('user-1', 'course-1')).rejects.toBe(otherError);
    });
  });

  describe('findAllForUser', () => {
    it('returns bookmarks newest first, mapped to response dtos', async () => {
      mockBookmarksRepo.find.mockResolvedValue([
        { id: 'bm-2', course: { id: 'course-2' }, createdAt: new Date('2026-02-01') },
        { id: 'bm-1', course: { id: 'course-1' }, createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.findAllForUser('user-1');

      expect(mockBookmarksRepo.find).toHaveBeenCalledWith({
        where: { user: { id: 'user-1' } },
        relations: { course: true },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([
        { id: 'bm-2', courseId: 'course-2', createdAt: new Date('2026-02-01') },
        { id: 'bm-1', courseId: 'course-1', createdAt: new Date('2026-01-01') },
      ]);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when no bookmark exists for that user+course', async () => {
      mockBookmarksRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('user-1', 'course-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockBookmarksRepo.remove).not.toHaveBeenCalled();
    });

    it('looks the bookmark up by courseId (not bookmark id) and removes it', async () => {
      const bookmark = { id: 'bm-1' };
      mockBookmarksRepo.findOne.mockResolvedValue(bookmark);

      await service.remove('user-1', 'course-1');

      expect(mockBookmarksRepo.findOne).toHaveBeenCalledWith({
        where: { user: { id: 'user-1' }, course: { id: 'course-1' } },
      });
      expect(mockBookmarksRepo.remove).toHaveBeenCalledWith(bookmark);
    });
  });
});
