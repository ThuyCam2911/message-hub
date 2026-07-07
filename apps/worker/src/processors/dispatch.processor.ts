import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DispatchJobData, FailoverEngineService, QUEUE_DISPATCH } from '@message-hub/failover';

@Processor(QUEUE_DISPATCH)
export class DispatchProcessor extends WorkerHost {
  constructor(private readonly engine: FailoverEngineService) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    await this.engine.dispatch(job.data.messageRequestId);
  }
}
