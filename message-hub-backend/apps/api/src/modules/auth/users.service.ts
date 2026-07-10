import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly orgs: OrganizationsService,
  ) {}

  /** Seeds one admin account so there's always a way to log in on a fresh deployment. */
  async onApplicationBootstrap() {
    const organizationId = this.orgs.getDefaultOrganizationId();
    const existing = await this.users.count({ where: { organizationId } });
    if (existing > 0) return;

    const email = process.env.ADMIN_EMAIL ?? 'admin@giftzone.vn';
    const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
    await this.users.save(
      this.users.create({
        organizationId,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.ADMIN,
      }),
    );
    this.logger.warn(
      `Seeded default admin account (${email}). Change ADMIN_PASSWORD / this account's password before any real deployment.`,
    );
  }

  async create(dto: CreateUserDto) {
    const user = await this.users.save(
      this.users.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role,
      }),
    );
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }

  async list() {
    const users = await this.users.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'ASC' },
    });
    return users.map((u) => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }));
  }

  findByEmail(email: string) {
    return this.users.findOne({ where: { email } });
  }
}
