import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from '@message-hub/domain';
import { TemplateRenderer } from '@message-hub/shared';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    private readonly orgs: OrganizationsService,
    private readonly renderer: TemplateRenderer,
  ) {}

  create(dto: CreateTemplateDto) {
    return this.templates.save(
      this.templates.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        name: dto.name,
        description: dto.description,
        channelType: dto.channelType,
        body: dto.body,
        variables: dto.variables ?? [],
        isActive: true,
        version: 1,
      }),
    );
  }

  list() {
    return this.templates.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const template = await this.templates.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  async preview(id: string, variables: Record<string, unknown>) {
    const template = await this.get(id);
    return { rendered: this.renderer.render(template.body, variables) };
  }
}
