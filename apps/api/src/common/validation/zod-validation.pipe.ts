import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

// Validasi input di boundary memakai zod schema dari @exapay/shared.
// Pemakaian: @Body(new ZodValidationPipe(loginSchema)) body: LoginInput
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      throw new BadRequestException(firstIssue?.message ?? "Input tidak valid");
    }
    return result.data;
  }
}
