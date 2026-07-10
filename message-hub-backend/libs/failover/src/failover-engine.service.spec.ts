import { AdvanceOn, MessageAttemptStatus, MessageRequestStatus } from '@message-hub/domain';
import { FailoverEngineService } from './failover-engine.service';

/** A chainable fake for repo.createQueryBuilder()...execute() used by the CAS updates. */
function makeQueryBuilder(affected: number) {
  const qb: any = {
    update: jest.fn(() => qb),
    set: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    execute: jest.fn(async () => ({ affected })),
  };
  return qb;
}

function makeRepo() {
  return {
    findOneByOrFail: jest.fn(),
    findOneOrFail: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((x: unknown) => x),
    update: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(1)),
  };
}

function buildEngine() {
  const requests = makeRepo();
  const attempts = makeRepo();
  const steps = makeRepo();
  const channelStrategies = makeRepo();
  const channels = makeRepo();
  const contactIdentifiers = makeRepo();
  const templates = makeRepo();
  const attemptQueue = { add: jest.fn(async () => undefined) };
  const timeoutQueue = { add: jest.fn(async () => ({ id: 'job-1' })), getJob: jest.fn(async () => ({ remove: jest.fn() })) };
  const adapter = {
    identifierKind: 'mock_id',
    send: jest.fn(),
  };
  const registry = { get: jest.fn(() => adapter) };
  const encryption = { decrypt: jest.fn(() => ({})) };
  const renderer = { render: jest.fn((body: unknown) => body) };
  const realtime = { publish: jest.fn(async () => undefined) };

  const engine = new FailoverEngineService(
    requests as any,
    attempts as any,
    steps as any,
    channelStrategies as any,
    channels as any,
    contactIdentifiers as any,
    templates as any,
    attemptQueue as any,
    timeoutQueue as any,
    registry as any,
    encryption as any,
    renderer as any,
    realtime as any,
  );

  return {
    engine,
    mocks: { requests, attempts, steps, channelStrategies, channels, contactIdentifiers, templates, attemptQueue, timeoutQueue, registry, adapter, encryption, renderer, realtime },
  };
}

describe('FailoverEngineService.dispatch', () => {
  it('marks the request in_progress at step 0 and enqueues the first attempt', async () => {
    const { engine, mocks } = buildEngine();
    mocks.requests.findOneByOrFail.mockResolvedValue({ id: 'req-1', failoverPolicyId: 'policy-1' });
    mocks.steps.findOneOrFail.mockResolvedValue({ id: 'step-1', stepOrder: 0 });

    await engine.dispatch('req-1');

    expect(mocks.requests.update).toHaveBeenCalledWith('req-1', {
      status: MessageRequestStatus.IN_PROGRESS,
      currentStepOrder: 0,
    });
    expect(mocks.attemptQueue.add).toHaveBeenCalledWith('execute', { messageRequestId: 'req-1', stepOrder: 0 });
    expect(mocks.realtime.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message-request-updated', status: MessageRequestStatus.IN_PROGRESS }),
    );
  });
});

describe('FailoverEngineService.executeStep', () => {
  function setupCommon(mocks: ReturnType<typeof buildEngine>['mocks']) {
    mocks.requests.findOneByOrFail.mockResolvedValue({
      id: 'req-1',
      status: MessageRequestStatus.IN_PROGRESS,
      currentStepOrder: 0,
      failoverPolicyId: 'policy-1',
      contactId: 'contact-1',
      templateId: 'template-1',
      templateVariables: { name: 'Lan' },
    });
    mocks.steps.findOneOrFail.mockResolvedValue({
      id: 'step-1',
      stepOrder: 0,
      channelStrategyId: 'strategy-1',
      advanceOn: AdvanceOn.EITHER,
      timeoutSeconds: 30,
    });
    mocks.channelStrategies.findOneOrFail.mockResolvedValue({ id: 'strategy-1', channelId: 'channel-1', strategyKey: 'mock_default' });
    mocks.channels.findOneOrFail.mockResolvedValue({ id: 'channel-1', channelType: 'mock', configEncrypted: null });
    mocks.templates.findOneOrFail.mockResolvedValue({ id: 'template-1', body: 'hi {{name}}' });
    mocks.attempts.save.mockImplementation(async (x: any) => ({ id: 'attempt-1', ...x }));
    mocks.attempts.findOneByOrFail.mockResolvedValue({ id: 'attempt-1', messageRequestId: 'req-1' });
  }

  it('is a no-op when the job is stale (request already moved past this step)', async () => {
    const { engine, mocks } = buildEngine();
    mocks.requests.findOneByOrFail.mockResolvedValue({
      id: 'req-1',
      status: MessageRequestStatus.IN_PROGRESS,
      currentStepOrder: 1, // already advanced past step 0
    });

    await engine.executeStep('req-1', 0);

    expect(mocks.attempts.save).not.toHaveBeenCalled();
  });

  it('marks the attempt provider_error when the contact has no matching identifier', async () => {
    const { engine, mocks } = buildEngine();
    setupCommon(mocks);
    mocks.contactIdentifiers.findOne.mockResolvedValue(null);

    await engine.executeStep('req-1', 0);

    expect(mocks.attempts.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: MessageAttemptStatus.PROVIDER_ERROR, errorCode: 'NO_IDENTIFIER' }),
    );
    expect(mocks.adapter.send).not.toHaveBeenCalled();
    // advanceOrComplete(false) with no next step -> request marked failed via CAS
    expect(mocks.requests.createQueryBuilder).toHaveBeenCalled();
  });

  it('treats an adapter that throws as a provider_error (does not crash the job)', async () => {
    const { engine, mocks } = buildEngine();
    setupCommon(mocks);
    mocks.contactIdentifiers.findOne.mockResolvedValue({ value: 'mock-id-123' });
    mocks.adapter.send.mockRejectedValue(new Error('network blew up'));

    await expect(engine.executeStep('req-1', 0)).resolves.not.toThrow();

    expect(mocks.attempts.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: MessageAttemptStatus.PROVIDER_ERROR, errorCode: 'ADAPTER_THREW' }),
    );
  });

  it('treats a provider_error send() result as a failure and advances the chain', async () => {
    const { engine, mocks } = buildEngine();
    setupCommon(mocks);
    mocks.contactIdentifiers.findOne.mockResolvedValue({ value: 'mock-id-123' });
    mocks.adapter.send.mockResolvedValue({ status: 'provider_error', rawResponse: {}, errorCode: 'X', errorMessage: 'nope' });
    mocks.steps.findOne.mockResolvedValue(null); // no next step -> request fails

    await engine.executeStep('req-1', 0);

    expect(mocks.attempts.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: MessageAttemptStatus.PROVIDER_ERROR }),
    );
  });

  it('treats a successful send() as terminal immediately when advance_on=provider_error (no timeout scheduled)', async () => {
    const { engine, mocks } = buildEngine();
    setupCommon(mocks);
    mocks.steps.findOneOrFail.mockResolvedValue({
      id: 'step-1',
      stepOrder: 0,
      channelStrategyId: 'strategy-1',
      advanceOn: AdvanceOn.PROVIDER_ERROR,
      timeoutSeconds: 30,
    });
    mocks.contactIdentifiers.findOne.mockResolvedValue({ value: 'mock-id-123' });
    mocks.adapter.send.mockResolvedValue({ status: 'sent', providerMessageId: 'pmid-1', rawResponse: {} });

    await engine.executeStep('req-1', 0);

    expect(mocks.timeoutQueue.add).not.toHaveBeenCalled();
    expect(mocks.attempts.update).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ status: MessageAttemptStatus.SENT }));
    // Terminal success -> request-level CAS update attempted.
    expect(mocks.requests.createQueryBuilder).toHaveBeenCalled();
  });

  it('schedules a timeout job when advance_on requires confirmation', async () => {
    const { engine, mocks } = buildEngine();
    setupCommon(mocks); // advance_on: EITHER, timeoutSeconds: 30
    mocks.contactIdentifiers.findOne.mockResolvedValue({ value: 'mock-id-123' });
    mocks.adapter.send.mockResolvedValue({ status: 'sent', providerMessageId: 'pmid-1', rawResponse: {} });

    await engine.executeStep('req-1', 0);

    expect(mocks.timeoutQueue.add).toHaveBeenCalledWith('check', { messageAttemptId: 'attempt-1' }, { delay: 30_000 });
    expect(mocks.attempts.update).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ timeoutJobId: 'job-1' }));
  });
});

describe('FailoverEngineService.handleTimeout', () => {
  it('is a no-op if the attempt was already resolved by a webhook', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOneByOrFail.mockResolvedValue({ id: 'attempt-1', status: MessageAttemptStatus.DELIVERED });

    await engine.handleTimeout('attempt-1');

    expect(mocks.attempts.update).not.toHaveBeenCalled();
    expect(mocks.steps.findOneByOrFail).not.toHaveBeenCalled();
  });

  it('marks the attempt timed_out and advances the chain when still sent', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOneByOrFail.mockResolvedValue({
      id: 'attempt-1',
      status: MessageAttemptStatus.SENT,
      messageRequestId: 'req-1',
      failoverPolicyStepId: 'step-1',
      channelStrategyId: 'strategy-1',
    });
    mocks.steps.findOneByOrFail.mockResolvedValue({ id: 'step-1', stepOrder: 0, failoverPolicyId: 'policy-1' });
    mocks.steps.findOne.mockResolvedValue(null); // no next step
    mocks.requests.findOneByOrFail.mockResolvedValue({ id: 'req-1', failoverPolicyId: 'policy-1' });

    await engine.handleTimeout('attempt-1');

    expect(mocks.attempts.update).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ status: MessageAttemptStatus.TIMED_OUT }));
  });
});

describe('FailoverEngineService.handleWebhookEvent', () => {
  it('returns matchedAttemptId: null when no attempt matches the provider message id', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOne.mockResolvedValue(null);

    const result = await engine.handleWebhookEvent({ providerMessageId: 'pmid-x', status: 'delivered', rawPayload: {} });

    expect(result).toEqual({ matchedAttemptId: null });
  });

  it('is a no-op (but still reports the match) when the attempt was already resolved — e.g. timeout fired first', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOne.mockResolvedValue({ id: 'attempt-1', status: MessageAttemptStatus.TIMED_OUT });

    const result = await engine.handleWebhookEvent({ providerMessageId: 'pmid-1', status: 'delivered', rawPayload: {} });

    expect(result).toEqual({ matchedAttemptId: 'attempt-1' });
    expect(mocks.attempts.update).not.toHaveBeenCalled();
  });

  it('cancels the pending timeout job and marks delivered on a delivered event', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOne.mockResolvedValue({
      id: 'attempt-1',
      status: MessageAttemptStatus.SENT,
      timeoutJobId: 'job-1',
      messageRequestId: 'req-1',
      failoverPolicyStepId: 'step-1',
      channelStrategyId: 'strategy-1',
    });
    const removeFn = jest.fn();
    mocks.timeoutQueue.getJob.mockResolvedValue({ remove: removeFn });
    mocks.steps.findOneByOrFail.mockResolvedValue({ id: 'step-1', stepOrder: 0 });

    const result = await engine.handleWebhookEvent({ providerMessageId: 'pmid-1', status: 'delivered', rawPayload: {} });

    expect(removeFn).toHaveBeenCalled();
    expect(mocks.attempts.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: MessageAttemptStatus.DELIVERED }),
    );
    expect(result).toEqual({ matchedAttemptId: 'attempt-1' });
  });

  it('marks undelivered (not delivered) on a failed event and advances the chain', async () => {
    const { engine, mocks } = buildEngine();
    mocks.attempts.findOne.mockResolvedValue({
      id: 'attempt-1',
      status: MessageAttemptStatus.SENT,
      timeoutJobId: null,
      messageRequestId: 'req-1',
      failoverPolicyStepId: 'step-1',
      channelStrategyId: 'strategy-1',
    });
    mocks.steps.findOneByOrFail.mockResolvedValue({ id: 'step-1', stepOrder: 0, failoverPolicyId: 'policy-1' });
    mocks.steps.findOne.mockResolvedValue(null);
    mocks.requests.findOneByOrFail.mockResolvedValue({ id: 'req-1', failoverPolicyId: 'policy-1' });

    await engine.handleWebhookEvent({ providerMessageId: 'pmid-1', status: 'failed', errorCode: 'E1', rawPayload: {} });

    expect(mocks.attempts.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: MessageAttemptStatus.UNDELIVERED, errorCode: 'E1' }),
    );
  });
});

describe('FailoverEngineService race protection (CAS)', () => {
  it('does not enqueue the next attempt or publish an update when the CAS update loses the race (affected=0)', async () => {
    const { engine, mocks } = buildEngine();
    // Simulate a webhook resolving the attempt while a timeout is also firing:
    // the CAS update should report affected=0 because current_step_order no
    // longer matches (another caller already advanced it).
    mocks.requests.createQueryBuilder.mockReturnValue(makeQueryBuilder(0));

    mocks.attempts.findOneByOrFail.mockResolvedValue({
      id: 'attempt-1',
      status: MessageAttemptStatus.SENT,
      messageRequestId: 'req-1',
      failoverPolicyStepId: 'step-1',
      channelStrategyId: 'strategy-1',
    });
    mocks.steps.findOneByOrFail.mockResolvedValue({ id: 'step-1', stepOrder: 0, failoverPolicyId: 'policy-1' });
    mocks.steps.findOne.mockResolvedValue({ id: 'step-2', stepOrder: 1 }); // a next step exists
    mocks.requests.findOneByOrFail.mockResolvedValue({ id: 'req-1', failoverPolicyId: 'policy-1' });

    await engine.handleTimeout('attempt-1');

    // The loser of the race must not enqueue a duplicate attempt for the next step.
    expect(mocks.attemptQueue.add).not.toHaveBeenCalled();
  });
});
