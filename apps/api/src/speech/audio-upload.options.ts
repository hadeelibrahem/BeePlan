import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_AUDIO_EXTENSIONS = ['m4a', 'mp3', 'wav', 'webm'];

export const audioMulterOptions: MulterOptions = {
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_AUDIO_EXTENSIONS.includes(extension)) {
      callback(
        new BadRequestException(
          `Unsupported audio file type. Allowed types: ${ALLOWED_AUDIO_EXTENSIONS.join(', ')}`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
