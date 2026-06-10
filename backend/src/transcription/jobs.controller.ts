import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JOB_STATUS } from './job-status';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('Job not found.');
    if (job.status === JOB_STATUS.DONE || job.status === JOB_STATUS.ERROR) {
      this.jobs.scheduleCleanup(id);
    }
    return job;
  }
}
