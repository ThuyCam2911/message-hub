import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  Channel,
  ChannelStrategy,
  ChannelType,
  ContactIdentifier,
  FailoverPolicyStep,
  MessageAttempt,
  MessageAttemptStatus,
  MessageRequest,
  MessageRequestStatus,
  Template,
  AdvanceOn,
} from '@message-hub/domain';
import { ChannelAdapter, ChannelAdapterRegistry, ParsedWebhookEvent, SendResult } from '@message-hub/adapters';
import { EncryptionService, RealtimeEventsPublisher, TemplateRenderer } from '@message-hub/shared';
import { AttemptJobData, QUEUE_ATTEMPT, QUEUE_TIMEOUT_CHECK, TimeoutCheckJobData } from './queue-names';
import { DEFAULT_TIMEOUT_SECONDS } from './default-timeouts';

/**
 * The failover state machine. Every mutation that decides whether to
 * advance/complete a MessageRequest goes through `advanceOrComplete`, which
 * uses a compare-and-swap UPDATE on (status, current_step_order) so a
 * late-arriving webhook racing against a timeout job can only advance the
 * request once.
 */
@Injectable()
export class FailoverEngineService {
  private readonly logger = new Logger(FailoverEngineService.name);

  constructor(
    @InjectRepository(MessageRequest) private readonly requests: Repository<MessageRequest>,
    @InjectRepository(MessageAttempt) private readonly attempts: Repository<MessageAttempt>,
    @InjectRepository(FailoverPolicyStep) private readonly steps: Repository<FailoverPolicyStep>,
    @InjectRepository(ChannelStrategy) private readonly channelStrategies: Repository<ChannelStrategy>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(ContactIdentifier) private readonly contactIdentifiers: Repository<ContactIdentifier>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    @InjectQueue(QUEUE_ATTEMPT) private readonly attemptQueue: Queue<AttemptJobData>,
    @InjectQueue(QUEUE_TIMEOUT_CHECK) private readonly timeoutQueue: Queue<TimeoutCheckJobData>,
    private readonly registry: ChannelAdapterRegistry,
    private readonly encryption: EncryptionService,
    private readonly renderer: TemplateRenderer,
    private readonly realtime: RealtimeEventsPublisher,
  ) {}

  /** Entry point: called by the dispatch.processor when a new MessageRequest is created. */
  async dispatch(messageRequestId: string): Promise<void> {
    const request = await this.requests.findOneByOrFail({ id: messageRequestId });
    const firstStep = await this.steps.findOneOrFail({
      where: { failoverPolicyId: request.failoverPolicyId, stepOrder: 0 },
    });
    await this.requests.update(request.id, {
      status: MessageRequestStatus.IN_PROGRESS,
      currentStepOrder: firstStep.stepOrder,
    });
    await this.realtime.publish({
      type: 'message-request-updated',
      messageRequestId,
      status: MessageRequestStatus.IN_PROGRESS,
      currentStepOrder: firstStep.stepOrder,
    });
    await this.attemptQueue.add('execute', { messageRequestId, stepOrder: firstStep.stepOrder });
  }

  /** Called by the attempt.processor: resolve identifier, decrypt config, render template, send. */
  async executeStep(messageRequestId: string, stepOrder: number): Promise<void> {
    const request = await this.requests.findOneByOrFail({ id: messageRequestId });
    if (request.status !== MessageRequestStatus.IN_PROGRESS || request.currentStepOrder !== stepOrder) {
      this.logger.warn(`Skipping stale attempt job for request ${messageRequestId} step ${stepOrder}`);
      return;
    }

    const step = await this.steps.findOneOrFail({
      where: { failoverPolicyId: request.failoverPolicyId, stepOrder },
    });
    const strategy = await this.channelStrategies.findOneOrFail({ where: { id: step.channelStrategyId } });
    const channel = await this.channels.findOneOrFail({ where: { id: strategy.channelId } });
    const template = await this.templates.findOneOrFail({ where: { id: request.templateId } });

    const identifier = await this.contactIdentifiers.findOne({
      where: {
        contactId: request.contactId,
        channelType: channel.channelType,
        identifierKind: this.registry.get(strategy.strategyKey).identifierKind,
      },
    });

    const attempt = await this.attempts.save(
      this.attempts.create({
        messageRequestId,
        failoverPolicyStepId: step.id,
        channelStrategyId: strategy.id,
        status: MessageAttemptStatus.QUEUED,
      }),
    );

    if (!identifier) {
      await this.attempts.update(attempt.id, {
        status: MessageAttemptStatus.PROVIDER_ERROR,
        errorCode: 'NO_IDENTIFIER',
        errorMessage: `Contact has no ${channel.channelType} identifier for strategy ${strategy.strategyKey}`,
        statusUpdatedAt: new Date(),
      });
      await this.advanceOrComplete(messageRequestId, stepOrder, false, strategy.id);
      return;
    }

    const adapter = this.registry.get(strategy.strategyKey);
    const channelConfig = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    const strategyConfig = strategy.configEncrypted ? this.encryption.decrypt(strategy.configEncrypted) : {};
    // Refresh/persist happens on the pure channel-level config only — it's
    // what gets written back to channels.config_encrypted, and strategy
    // overrides have no business ending up there.
    await this.refreshChannelCredentialsIfNeeded(adapter, channel, channelConfig);
    const renderedBody = this.renderer.render(template.body, request.templateVariables);
    const trackedBody = this.injectTracking(renderedBody, channel.channelType, attempt.id);

    // Almost every adapter reads only `channelConfig` (see SendInput),
    // trusting it to already be "the config to use" — so the merge with
    // strategy-level overrides has to happen here, once, rather than inside
    // each adapter. Without this, the "override riêng cho strategy này"
    // field in the UI is silently ignored by every adapter except the ones
    // that happen to read strategyConfig by hand (mock, sms_http).
    const mergedConfig = { ...channelConfig, ...strategyConfig };

    let result: SendResult;
    try {
      result = await adapter.send({
        recipientIdentifier: identifier.value,
        templateBody: trackedBody,
        variables: request.templateVariables,
        channelConfig: mergedConfig,
        strategyConfig,
        idempotencyKey: attempt.id,
      });
    } catch (err) {
      result = {
        status: 'provider_error',
        rawResponse: { message: (err as Error).message },
        errorCode: 'ADAPTER_THREW',
        errorMessage: (err as Error).message,
      };
    }

    await this.handleSendResult(attempt.id, step, strategy.id, channel.channelType, result);
  }

  /**
   * Providers like Zalo OA expire access tokens (~25h) — refresh here, right
   * before send(), so a routine background send never fails on an expired
   * token. Mutates channelConfig in place (the caller passes it straight
   * into adapter.send() next) and persists the refreshed token back onto the
   * channel so the next send reuses it instead of refreshing again (Zalo
   * rotates the refresh token itself on every use, so skipping the persist
   * would break the *next* refresh, not just waste an API call).
   */
  private async refreshChannelCredentialsIfNeeded(
    adapter: ChannelAdapter,
    channel: Channel,
    channelConfig: Record<string, unknown>,
  ): Promise<void> {
    if (!adapter.refreshCredentials) return;
    try {
      const refreshed = await adapter.refreshCredentials(channelConfig);
      if (!refreshed) return;
      Object.assign(channelConfig, refreshed);
      await this.channels.update(channel.id, { configEncrypted: this.encryption.encrypt(channelConfig) });
    } catch (err) {
      this.logger.warn(`Credential refresh failed for channel ${channel.id}: ${(err as Error).message}`);
      // Fall through with the existing (possibly stale) config — send() will
      // surface a normal provider_error if the token really is invalid,
      // which the failover chain already knows how to handle.
    }
  }

  /**
   * Rewrites plain http(s) links in the rendered body into `/t/c/:attemptId`
   * redirect links (click tracking) and, for email bodies, appends a hidden
   * `/t/o/:attemptId` open-pixel — both routes live in TrackingModule. Gated
   * entirely on `PUBLIC_API_URL`: unset (the default in every existing test
   * and any deployment that hasn't opted in) means this is a no-op, so
   * behavior for everyone not using tracking is unchanged.
   */
  private injectTracking(
    body: string | Record<string, unknown>,
    channelType: ChannelType,
    attemptId: string,
  ): string | Record<string, unknown> {
    const publicApiUrl = process.env.PUBLIC_API_URL;
    if (!publicApiUrl) return body;

    // Stops at whitespace *and* at `"`/`'`/`<`/`>` — plain \S+ (as a naive
    // spec would suggest) swallows the closing quote of an HTML
    // href="https://…" attribute plus everything up to the next space,
    // corrupting the tag. This still isn't a full HTML parser, but it
    // correctly handles the one case that actually matters here (email
    // bodies with <a href="...">) without adding a DOM dependency.
    const wrapLinks = (text: string): string =>
      text.replace(
        /https?:\/\/[^\s"'<>]+/g,
        (matchedUrl) => `${publicApiUrl}/t/c/${attemptId}?u=${encodeURIComponent(matchedUrl)}`,
      );

    if (typeof body === 'string') {
      return wrapLinks(body);
    }

    if (channelType === ChannelType.EMAIL && typeof body.html === 'string') {
      const wrappedHtml = wrapLinks(body.html);
      const pixel = `<img src="${publicApiUrl}/t/o/${attemptId}" width="1" height="1" style="display:none" alt="" />`;
      return { ...body, html: `${wrappedHtml}${pixel}` };
    }

    return body;
  }

  private async handleSendResult(
    attemptId: string,
    step: FailoverPolicyStep,
    channelStrategyId: string,
    channelType: string,
    result: SendResult,
  ): Promise<void> {
    if (result.status === 'provider_error') {
      // TypeORM's QueryDeepPartialEntity recurses into jsonb object types in a
      // way plain object literals can't structurally satisfy — cast is safe,
      // providerResponse is stored as opaque JSON either way.
      await this.attempts.update(attemptId, {
        status: MessageAttemptStatus.PROVIDER_ERROR,
        providerResponse: result.rawResponse,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        statusUpdatedAt: new Date(),
      } as any);
      const attempt = await this.attempts.findOneByOrFail({ id: attemptId });
      await this.realtime.publish({
        type: 'message-attempt-updated',
        messageRequestId: attempt.messageRequestId,
        attemptId,
        status: MessageAttemptStatus.PROVIDER_ERROR,
      });
      await this.advanceOrComplete(attempt.messageRequestId, step.stepOrder, false, channelStrategyId);
      return;
    }

    await this.attempts.update(attemptId, {
      status: MessageAttemptStatus.SENT,
      providerMessageId: result.providerMessageId,
      providerResponse: result.rawResponse,
      sentAt: new Date(),
    } as any);
    const sentAttempt = await this.attempts.findOneByOrFail({ id: attemptId });
    await this.realtime.publish({
      type: 'message-attempt-updated',
      messageRequestId: sentAttempt.messageRequestId,
      attemptId,
      status: MessageAttemptStatus.SENT,
    });

    if (step.advanceOn === AdvanceOn.PROVIDER_ERROR) {
      // No delivery confirmation is expected for this step — a successful
      // send() call is treated as final success immediately.
      await this.advanceOrComplete(sentAttempt.messageRequestId, step.stepOrder, true, channelStrategyId, sentAttempt.id);
      return;
    }

    const timeoutSeconds =
      step.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS[channelType as keyof typeof DEFAULT_TIMEOUT_SECONDS] ?? 30;
    const job = await this.timeoutQueue.add(
      'check',
      { messageAttemptId: attemptId },
      { delay: timeoutSeconds * 1000 },
    );
    await this.attempts.update(attemptId, {
      timeoutAt: new Date(Date.now() + timeoutSeconds * 1000),
      timeoutJobId: job.id,
    });
  }

  /** Called by the timeout-check.processor when a scheduled delayed job fires. */
  async handleTimeout(messageAttemptId: string): Promise<void> {
    const attempt = await this.attempts.findOneByOrFail({ id: messageAttemptId });
    if (attempt.status !== MessageAttemptStatus.SENT) {
      return; // already resolved by a webhook — no-op
    }
    await this.attempts.update(attempt.id, { status: MessageAttemptStatus.TIMED_OUT, statusUpdatedAt: new Date() });
    await this.realtime.publish({
      type: 'message-attempt-updated',
      messageRequestId: attempt.messageRequestId,
      attemptId: attempt.id,
      status: MessageAttemptStatus.TIMED_OUT,
    });
    const step = await this.steps.findOneByOrFail({ id: attempt.failoverPolicyStepId });
    await this.advanceOrComplete(attempt.messageRequestId, step.stepOrder, false, attempt.channelStrategyId);
  }

  /** Called by the webhook-in.processor once a raw payload has been parsed by the adapter. */
  async handleWebhookEvent(event: ParsedWebhookEvent): Promise<{ matchedAttemptId: string | null }> {
    const attempt = await this.attempts.findOne({ where: { providerMessageId: event.providerMessageId } });
    if (!attempt) return { matchedAttemptId: null };
    if (attempt.status !== MessageAttemptStatus.SENT) {
      // Already resolved (timeout fired first, or a duplicate webhook) — no-op.
      return { matchedAttemptId: attempt.id };
    }

    if (attempt.timeoutJobId) {
      try {
        const job = await this.timeoutQueue.getJob(attempt.timeoutJobId);
        await job?.remove();
      } catch {
        // job may already have started/finished — safe to ignore
      }
    }

    const succeeded = event.status === 'delivered' || event.status === 'read';
    const resolvedStatus = succeeded ? MessageAttemptStatus.DELIVERED : MessageAttemptStatus.UNDELIVERED;
    await this.attempts.update(attempt.id, {
      status: resolvedStatus,
      errorCode: event.errorCode,
      statusUpdatedAt: new Date(),
    });
    await this.realtime.publish({
      type: 'message-attempt-updated',
      messageRequestId: attempt.messageRequestId,
      attemptId: attempt.id,
      status: resolvedStatus,
    });

    const step = await this.steps.findOneByOrFail({ id: attempt.failoverPolicyStepId });
    await this.advanceOrComplete(attempt.messageRequestId, step.stepOrder, succeeded, attempt.channelStrategyId, attempt.id);
    return { matchedAttemptId: attempt.id };
  }

  /**
   * The single seam for state transitions. Uses a CAS UPDATE on
   * (status = in_progress AND current_step_order = expectedStepOrder) so a
   * timeout job and a webhook racing to resolve the same step can only
   * advance the request once — the loser's UPDATE affects zero rows.
   */
  private async advanceOrComplete(
    messageRequestId: string,
    finishedStepOrder: number,
    succeeded: boolean,
    channelStrategyId: string,
    winningAttemptId?: string,
  ): Promise<void> {
    if (succeeded) {
      const result = await this.requests
        .createQueryBuilder()
        .update(MessageRequest)
        .set({ status: MessageRequestStatus.DELIVERED, finalChannelStrategyId: channelStrategyId, completedAt: new Date() })
        .where('id = :id AND status = :status AND current_step_order = :step', {
          id: messageRequestId,
          status: MessageRequestStatus.IN_PROGRESS,
          step: finishedStepOrder,
        })
        .execute();
      if ((result.affected ?? 0) > 0) {
        await this.supersedeStrayAttempts(messageRequestId, winningAttemptId);
        await this.realtime.publish({
          type: 'message-request-updated',
          messageRequestId,
          status: MessageRequestStatus.DELIVERED,
          currentStepOrder: finishedStepOrder,
        });
      }
      return;
    }

    const request = await this.requests.findOneByOrFail({ id: messageRequestId });
    const nextStep = await this.steps.findOne({
      where: { failoverPolicyId: request.failoverPolicyId, stepOrder: finishedStepOrder + 1 },
    });

    if (!nextStep) {
      const result = await this.requests
        .createQueryBuilder()
        .update(MessageRequest)
        .set({ status: MessageRequestStatus.FAILED, completedAt: new Date() })
        .where('id = :id AND status = :status AND current_step_order = :step', {
          id: messageRequestId,
          status: MessageRequestStatus.IN_PROGRESS,
          step: finishedStepOrder,
        })
        .execute();
      if ((result.affected ?? 0) > 0) {
        await this.realtime.publish({
          type: 'message-request-updated',
          messageRequestId,
          status: MessageRequestStatus.FAILED,
          currentStepOrder: finishedStepOrder,
        });
      }
      return;
    }

    const result = await this.requests
      .createQueryBuilder()
      .update(MessageRequest)
      .set({ currentStepOrder: nextStep.stepOrder })
      .where('id = :id AND status = :status AND current_step_order = :step', {
        id: messageRequestId,
        status: MessageRequestStatus.IN_PROGRESS,
        step: finishedStepOrder,
      })
      .execute();

    if ((result.affected ?? 0) > 0) {
      await this.realtime.publish({
        type: 'message-request-updated',
        messageRequestId,
        status: MessageRequestStatus.IN_PROGRESS,
        currentStepOrder: nextStep.stepOrder,
      });
      await this.attemptQueue.add('execute', { messageRequestId, stepOrder: nextStep.stepOrder });
    }
  }

  private async supersedeStrayAttempts(messageRequestId: string, excludeAttemptId?: string): Promise<void> {
    const qb = this.attempts
      .createQueryBuilder()
      .update(MessageAttempt)
      .set({ status: MessageAttemptStatus.SUPERSEDED })
      .where('message_request_id = :id AND status IN (:...statuses)', {
        id: messageRequestId,
        statuses: [MessageAttemptStatus.QUEUED, MessageAttemptStatus.SENT],
      });
    if (excludeAttemptId) {
      qb.andWhere('id != :excludeAttemptId', { excludeAttemptId });
    }
    await qb.execute();
  }
}
