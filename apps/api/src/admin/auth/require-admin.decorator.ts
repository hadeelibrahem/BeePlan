import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ADMIN = 'require_admin';
export const RequireAdmin = () => SetMetadata(REQUIRE_ADMIN, true);
