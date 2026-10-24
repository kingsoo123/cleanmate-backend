import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessBranch } from '../entities/business-branch.entity';
import { BranchesService } from './branches.service';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessBranch])],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
