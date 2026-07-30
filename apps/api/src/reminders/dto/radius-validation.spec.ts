import { validate } from 'class-validator';
import { ReminderLocationDto } from './reminder-shared.dto';
import { CreatePersonReminderDto } from '../../social/dto/social.dto';

describe('reminder radius DTO validation', () => {
  it.each([10, 347, 5000])(
    'accepts radius %s unchanged',
    async (radiusMeters) => {
      const dto = Object.assign(new ReminderLocationDto(), {
        mode: 'specific',
        placeName: 'Office',
        latitude: 31.9,
        longitude: 35.2,
        radiusMeters,
        triggerType: 'arrive',
      });

      expect(await validate(dto)).toEqual([]);
      expect(dto.radiusMeters).toBe(radiusMeters);
    },
  );

  it.each([9, 5001, 10.5, -20])(
    'rejects invalid radius %s',
    async (radiusMeters) => {
      const dto = Object.assign(new CreatePersonReminderDto(), {
        title: 'Meet Sara',
        targetUserId: '22222222-2222-2222-2222-222222222222',
        expiration: '1w',
        radiusMeters,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'radiusMeters')).toBe(
        true,
      );
    },
  );
});
