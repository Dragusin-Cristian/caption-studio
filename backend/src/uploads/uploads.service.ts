import { Injectable } from '@nestjs/common';
import { CreateUploadDto } from './dto/create-upload.dto';
import { UpdateUploadDto } from './dto/update-upload.dto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadsService {
  private s3 = new S3Client({ region: process.env.AWS_REGION });

  async getPresignedUploadUrl() {
    const key = `videos/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(this.s3, command, { expiresIn: 300 });

    return { url, key };
  }

}
