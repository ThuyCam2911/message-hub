import { Injectable } from '@nestjs/common';

/**
 * Minimal {{variable}} substitution shared by every channel type. Structured
 * bodies (e.g. WhatsApp/ZNS template params) are rendered field-by-field;
 * plain-text bodies (SMS/Telegram/Line/email) are rendered as a single string.
 */
@Injectable()
export class TemplateRenderer {
  render(body: string | Record<string, unknown>, variables: Record<string, unknown>): string | Record<string, unknown> {
    if (typeof body === 'string') {
      return this.renderString(body, variables);
    }
    return this.renderObject(body, variables);
  }

  private renderString(template: string, variables: Record<string, unknown>): string {
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key: string) => {
      const value = variables[key];
      return value === undefined || value === null ? match : String(value);
    });
  }

  private renderObject(
    obj: Record<string, unknown>,
    variables: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.renderString(value, variables);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.renderObject(value as Record<string, unknown>, variables);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
