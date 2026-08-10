import { validate } from 'class-validator';
import { CreateCommitmentDto, CreateFocusRoomDto, CreateRoomInviteDto } from './focus-rooms.dto';
describe('Focus Room invitation contract', () => {
  it('rejects an invalid email', async () => {
    const dto = Object.assign(new CreateRoomInviteDto(), {
      type: 'email',
      email: 'not-an-email',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it('accepts an explicit link invite without silently requiring email', async () => {
    const dto = Object.assign(new CreateRoomInviteDto(), {
      type: 'link',
      expiresInHours: 24,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
  it('rejects excessive expiry', async () => {
    const dto = Object.assign(new CreateRoomInviteDto(), {
      type: 'link',
      expiresInHours: 1000,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});

describe('Shared Focus Session creation contract', () => {
  it('requires a valid duration and accepts an optional short goal label', async () => {
    expect(await validate(Object.assign(new CreateCommitmentDto(), { goalLabel: 'Study for the exam' }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new CreateCommitmentDto(), { durationMinutes: 50, goalLabel: 'Study for the exam' }))).toHaveLength(0);
    expect(await validate(Object.assign(new CreateCommitmentDto(), { durationMinutes: 50 }))).toHaveLength(0);
  });
  it('accepts the one-shot commitment mode', async () => {
    const dto = Object.assign(new CreateFocusRoomDto(), {
      title: 'Study together',
      visibility: 'public',
      mode: 'commitment',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects persistent casual rooms', async () => {
    const dto = Object.assign(new CreateFocusRoomDto(), {
      title: 'Persistent room',
      visibility: 'public',
      mode: 'casual',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
