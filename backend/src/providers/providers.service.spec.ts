import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { Provider } from './entities/provider.entity';
import { Profile } from '../profiles/entities/profile.entity';

// #498 — covers the "one provider membership at a time" invariant
// (create/join both reject a profile that already has a providerId),
// the owner-only guard on regenerating the invite code, and the
// collision-retry loop that generates a unique invite code.
describe('ProvidersService', () => {
  let service: ProvidersService;

  const mockProvidersRepo = {
    save: jest.fn((x: Record<string, unknown>) => Promise.resolve(x)),
    create: jest.fn((x: Record<string, unknown>) => x),
    findOne: jest.fn(),
  };
  const mockProfilesRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: Record<string, unknown>) => Promise.resolve(x)),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: getRepositoryToken(Provider), useValue: mockProvidersRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws NotFoundException when the profile does not exist', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create('user-1', { name: 'Acme Training' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the caller already belongs to a provider', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: 'provider-existing' } as Profile);

      await expect(
        service.create('user-1', { name: 'Acme Training' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the provider and links the caller as owner+member', async () => {
      const profile = { id: 'user-1', providerId: null } as Profile;
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockProvidersRepo.findOne.mockResolvedValue(null); // invite code is unique first try
      mockProvidersRepo.save.mockResolvedValue({ id: 'provider-1', name: 'Acme Training' });

      const result = await service.create('user-1', { name: 'Acme Training' });

      expect(mockProvidersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Training', ownerId: 'user-1' }),
      );
      expect(profile.providerId).toBe('provider-1');
      expect(mockProfilesRepo.save).toHaveBeenCalledWith(profile);
      expect(result.id).toBe('provider-1');
    });

    it('retries invite-code generation on a collision', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null } as Profile);
      mockProvidersRepo.findOne
        .mockResolvedValueOnce({ id: 'taken' }) // first generated code collides
        .mockResolvedValueOnce(null); // second is unique
      mockProvidersRepo.save.mockResolvedValue({ id: 'provider-1' });

      await service.create('user-1', { name: 'Acme Training' });

      expect(mockProvidersRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('throws InternalServerErrorException after exhausting generation attempts', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null } as Profile);
      mockProvidersRepo.findOne.mockResolvedValue({ id: 'always-taken' });

      await expect(
        service.create('user-1', { name: 'Acme Training' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('regenerateInviteCode', () => {
    it('throws ForbiddenException when the caller does not own a provider', async () => {
      mockProvidersRepo.findOne.mockResolvedValue(null);

      await expect(service.regenerateInviteCode('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('regenerates and saves a new code for the owner', async () => {
      const provider = { id: 'provider-1', ownerId: 'user-1', inviteCode: 'OLDCODE1' };
      mockProvidersRepo.findOne
        .mockResolvedValueOnce(provider) // ownership lookup
        .mockResolvedValueOnce(null); // uniqueness check for the new code
      mockProvidersRepo.save.mockResolvedValue(provider);

      const result = await service.regenerateInviteCode('user-1');

      expect(result.inviteCode).not.toBe('OLDCODE1');
      expect(mockProvidersRepo.save).toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('throws ConflictException when the caller already belongs to a provider', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: 'provider-existing' } as Profile);

      await expect(
        service.join('user-1', { inviteCode: 'ABCD1234' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an invalid invite code', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null } as Profile);
      mockProvidersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.join('user-1', { inviteCode: 'BADCODE1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('links the caller to the provider on a valid code', async () => {
      const profile = { id: 'user-1', providerId: null } as Profile;
      mockProfilesRepo.findOne.mockResolvedValue(profile);
      mockProvidersRepo.findOne.mockResolvedValue({ id: 'provider-1', inviteCode: 'GOODCODE' });

      await service.join('user-1', { inviteCode: 'GOODCODE' });

      expect(profile.providerId).toBe('provider-1');
      expect(mockProfilesRepo.save).toHaveBeenCalledWith(profile);
    });
  });

  describe('leave', () => {
    it('throws ConflictException when the caller is not a member of any provider', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null } as Profile);

      await expect(service.leave('user-1')).rejects.toThrow(ConflictException);
    });

    it('clears providerId without touching ownership/course scoping', async () => {
      const profile = { id: 'user-1', providerId: 'provider-1' } as Profile;
      mockProfilesRepo.findOne.mockResolvedValue(profile);

      await service.leave('user-1');

      expect(profile.providerId).toBeNull();
      expect(mockProfilesRepo.save).toHaveBeenCalledWith(profile);
    });
  });

  describe('getMine', () => {
    it('throws NotFoundException when the caller has no providerId', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null } as Profile);

      await expect(service.getMine('user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when providerId points at a provider that no longer exists', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: 'provider-1' } as Profile);
      mockProvidersRepo.findOne.mockResolvedValue(null);

      await expect(service.getMine('user-1')).rejects.toThrow(NotFoundException);
    });

    it('flags the owner correctly among the members list', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: 'provider-1' } as Profile);
      mockProvidersRepo.findOne.mockResolvedValue({
        id: 'provider-1',
        name: 'Acme Training',
        inviteCode: 'CODE1234',
        ownerId: 'owner-1',
      });
      mockProfilesRepo.find.mockResolvedValue([
        { id: 'owner-1', name: 'Owner Person' },
        { id: 'user-1', name: 'Member Person' },
      ]);

      const result = await service.getMine('user-1');

      expect(result.members).toEqual([
        { id: 'owner-1', name: 'Owner Person', isOwner: true },
        { id: 'user-1', name: 'Member Person', isOwner: false },
      ]);
    });
  });
});
