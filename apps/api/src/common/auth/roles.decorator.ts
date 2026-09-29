import type { MembershipRole } from "@exapay/shared";
import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

// Peran tenant yang boleh mengakses endpoint. Memerlukan tenant aktif.
export const Roles = (...roles: MembershipRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
