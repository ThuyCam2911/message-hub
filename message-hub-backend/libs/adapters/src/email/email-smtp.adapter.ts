import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { ChannelType } from '@message-hub/domain';
import {
  AdapterConfigSchema,
  ChannelAdapter,
  ParsedWebhookEvent,
  SendInput,
  SendResult,
} from '../channel-adapter.interface';

interface SmtpChannelConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromAddress: string;
}

/**
 * Generic SMTP sender (works with Mailtrap/Gmail app-password/SES-SMTP/any
 * SMTP host). No bounce webhook support here, so failover policies using this
 * strategy should set advance_on = 'provider_error': a 250 OK from SMTP is
 * treated as final success (it is not a delivery guarantee, but this adapter
 * has no visibility beyond submission).
 */
@Injectable()
export class EmailSmtpAdapter implements ChannelAdapter {
  readonly strategyKey = 'email_smtp';
  readonly channelType = ChannelType.EMAIL;
  readonly identifierKind = 'email';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as SmtpChannelConfig;
    const body = input.templateBody as { subject?: string; html?: string };
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });

    try {
      const info = await transporter.sendMail({
        from: config.fromAddress,
        to: input.recipientIdentifier,
        subject: body.subject ?? '(no subject)',
        html: body.html ?? '',
        headers: { 'X-Idempotency-Key': input.idempotencyKey },
      });
      return {
        status: 'sent',
        providerMessageId: info.messageId,
        rawResponse: info,
      };
    } catch (err) {
      const error = err as Error;
      return {
        status: 'provider_error',
        rawResponse: { message: error.message },
        errorCode: 'SMTP_SEND_FAILED',
        errorMessage: error.message,
      };
    }
  }

  async parseWebhook(): Promise<ParsedWebhookEvent | null> {
    // Plain SMTP has no delivery webhook. Swap this adapter for an
    // email_sendgrid/email_ses variant later to get bounce/complaint events.
    return null;
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as SmtpChannelConfig;
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    try {
      await transporter.verify();
      return { valid: true };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        host: { type: 'string', title: 'SMTP Host' },
        port: { type: 'number', title: 'SMTP Port' },
        secure: { type: 'boolean', title: 'Use TLS' },
        user: { type: 'string', title: 'Username' },
        pass: { type: 'string', title: 'Password', secret: true },
        fromAddress: { type: 'string', title: 'From address' },
      },
      required: ['host', 'port', 'user', 'pass', 'fromAddress'],
    };
  }
}
