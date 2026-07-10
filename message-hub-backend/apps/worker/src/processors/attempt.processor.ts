import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AttemptJobData, FailoverEngineService, QUEUE_ATTEMPT } from '@message-hub/failover';

@Processor(QUEUE_ATTEMPT)
export class AttemptProcessor extends WorkerHost {
  constructor(private readonly engine: FailoverEngineService) {
    super();
  }

  async process(job: Job<AttemptJobData>): Promise<void> {
    await this.engine.executeStep(job.data.messageRequestId, job.data.stepOrder);
  }
}
