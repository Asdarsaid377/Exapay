import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// JwtAuthGuard berlaku global; endpoint tanpa login wajib ditandai eksplisit dengan @Public()
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
