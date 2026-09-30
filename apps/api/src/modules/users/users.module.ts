import { Module } from "@nestjs/common";

import { InvitationsModule } from "../invitations/invitations.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [InvitationsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
