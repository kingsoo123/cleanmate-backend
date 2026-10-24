import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPinDto } from './dto/forgot-pin.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.auth.signUp(dto);
  }

  @Post('sign-in')
  signIn(@Body() dto: SignInDto) {
    return this.auth.signIn(dto);
  }

  @Post('forgot-pin')
  forgotPin(@Body() dto: ForgotPinDto) {
    return this.auth.forgotPin(dto);
  }
}
