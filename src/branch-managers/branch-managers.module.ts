import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BranchesModule } from '../branches/branches.module';
import { BusinessBranch } from '../entities/business-branch.entity';
import { User } from '../users/user.entity';
import { BranchManagersController } from './branch-managers.controller';
import { BranchManagersService } from './branch-managers.service';

@Module({
  imports: [
    AuthModule,
    BranchesModule,
    TypeOrmModule.forFeature([User, BusinessBranch]),
  ],
  controllers: [BranchManagersController],
  providers: [BranchManagersService],
})
export class BranchManagersModule {}