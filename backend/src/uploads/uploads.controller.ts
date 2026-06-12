import { Controller, Post, Body } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { CreateUploadDto } from './dto/create-upload.dto';

@Controller('/api/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presigned-url')
  getPresignedUrl() {
    return this.uploadsService.getPresignedUploadUrl();
  }

}
