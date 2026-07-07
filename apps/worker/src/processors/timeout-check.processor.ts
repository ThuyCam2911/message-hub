import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FailoverEngineService, QUEUE_TIMEOUT_CHECK, TimeoutCheckJobData } from '@message-hub/failover';

@Processor(QUEUE_TIMEOUT_CHECK)
export class TimeoutCheckProcessor extends WorkerHost {
  constructor(private readonly engine: FailoverEngineService) {
    super();
  }

  async process(job: Job<TimeoutCheckJobData>): Promise<void> {
    await this.engine.handleTimeout(job.data.messageAttemptId);
  }
}
