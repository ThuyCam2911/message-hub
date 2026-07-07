import {
  Organization,
  User,
  Channel,
  ChannelStrategy,
  Template,
  Contact,
  ContactIdentifier,
  FailoverPolicy,
  FailoverPolicyStep,
  Campaign,
  MessageRequest,
  MessageAttempt,
  WebhookEvent,
  AuditLog,
} from './entities';

/** Passed to TypeOrmModule.forRoot({ entities: ALL_ENTITIES }) and to the CLI DataSource. */
export const ALL_ENTITIES = [
  Organization,
  User,
  Channel,
  ChannelStrategy,
  Template,
  Contact,
  ContactIdentifier,
  FailoverPolicy,
  FailoverPolicyStep,
  Campaign,
  MessageRequest,
  MessageAttempt,
  WebhookEvent,
  AuditLog,
];
