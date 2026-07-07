import { IsEmail, IsEnum, MinLength } from 'class-validator';
import { UserRole } from '@message-hub/domain';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
