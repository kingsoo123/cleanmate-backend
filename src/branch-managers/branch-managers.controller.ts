import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchesService } from '../branches/branches.service';
import { User } from '../users/user.entity';
import { BranchManagersService } from './branch-managers.service';
import { CreateBranchManagerDto } from './dto/create-branch-manager.dto';
import { UpdateBranchManagerDto } from './dto/update-branch-manager.dto';

@Controller('business')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('business')
export class BranchManagersController {
  constructor(
    private readonly branchManagers: BranchManagersService,
    private readonly branches: BranchesService,
  ) {}

  @Get('branches')
  listBranches(@CurrentUser() user: User) {
    return this.branches.listForBusiness(user.id);
  }

  @Get('branch-managers')
  listManagers(@CurrentUser() user: User) {
    return this.branchManagers.listForBusinessOwner(user);
  }

  @Post('branch-managers')
  createManager(
    @CurrentUser() user: User,
    @Body() dto: CreateBranchManagerDto,
  ) {
    return this.branchManagers.createForBusinessOwner(user, dto);
  }

  @Patch('branch-managers/:id')
  updateManager(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateBranchManagerDto,
  ) {
    return this.branchManagers.updateForBusinessOwner(user, id, dto);
  }

  @Delete('branch-managers/:id')
  @HttpCode(204)
  async removeManager(@CurrentUser() user: User, @Param('id') id: string) {
    await this.branchManagers.removeForBusinessOwner(user, id);
  }
}