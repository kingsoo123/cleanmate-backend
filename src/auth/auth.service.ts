import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BranchesService } from '../branches/branches.service';
import { User, UserRole } from '../users/user.entity';
import { ForgotPinDto } from './dto/forgot-pin.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import {
  isEmailIdentifier,
  normalizeEmail,
  normalizePhone,
} from './normalize';

export type AuthUserPayload = {
  id: string;
  role: UserRole;
  fullName: string;
  businessName: string | null;
  email: string | null;
  phone: string;
};

@Injectable()
export class AuthService {
  private readonly pinRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly branches: BranchesService,
  ) {}

  async signUp(dto: SignUpDto) {
    const email = normalizeEmail(dto.email);
    const phoneNormalized = normalizePhone(dto.phone);

    if (phoneNormalized.length < 10 || phoneNormalized.length > 15) {
      throw new ConflictException('Enter a valid phone number.');
    }

    const existingEmail = await this.users.findOne({ where: { email } });
    if (existingEmail) {
      throw new ConflictException('An account with this email already exists.');
    }

    const existingPhone = await this.users.findOne({
      where: { phoneNormalized, role: 'business' },
    });
    if (existingPhone) {
      throw new ConflictException(
        'An account with this phone number already exists.',
      );
    }

    const pinHash = await bcrypt.hash(dto.pin, this.pinRounds);
    const user = this.users.create({
      role: 'business',
      email,
      phone: dto.phone.trim(),
      phoneNormalized,
      pinHash,
      fullName: dto.fullName.trim(),
      businessName: dto.businessName.trim(),
    });
    await this.users.save(user);

    await this.branches.createMany(
      user.id,
      (dto.branches ?? []).map((branch) => ({
        name: branch.name,
        address: branch.address,
      })),
    );

    return this.buildAuthResponse(user);
  }

  async signIn(dto: SignInDto) {
    const user = await this.findByIdentifier(dto.identifier, dto.role);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const pinOk = await bcrypt.compare(dto.pin, user.pinHash);
    if (!pinOk) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.buildAuthResponse(user);
  }

  async forgotPin(dto: ForgotPinDto) {
    if (dto.newPin !== dto.confirmPin) {
      throw new ConflictException('PINs do not match.');
    }

    const user = await this.findByIdentifier(dto.identifier, dto.role);
    if (!user) {
      throw new UnauthorizedException(
        'No account found for that phone or email.',
      );
    }

    user.pinHash = await bcrypt.hash(dto.newPin, this.pinRounds);
    await this.users.save(user);

    return { message: 'PIN updated. You can sign in with your new PIN.' };
  }

  private async findByIdentifier(
    identifier: string,
    role: UserRole,
  ): Promise<User | null> {
    const trimmed = identifier.trim();
    if (isEmailIdentifier(trimmed)) {
      return this.users.findOne({
        where: { email: normalizeEmail(trimmed), role },
      });
    }
    const phoneNormalized = normalizePhone(trimmed);
    return this.users.findOne({ where: { phoneNormalized, role } });
  }

  private buildAuthResponse(user: User) {
    const payload: AuthUserPayload = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      businessName: user.businessName,
      email: user.email,
      phone: user.phone,
    };
    const accessToken = this.jwt.sign({
      sub: user.id,
      role: user.role,
    });
    return { accessToken, user: payload };
  }
}
