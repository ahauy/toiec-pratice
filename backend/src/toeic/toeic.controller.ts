import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ToeicService } from './toeic.service';
import { ToeicResponseDto } from './dto/toeic-response.dto';

@Controller('toeic')
export class ToeicController {
  constructor(private readonly toeic: ToeicService) {}

  @Post('listen')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  listen(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId?: string,
  ): Promise<ToeicResponseDto> {
    if (!file) throw new BadRequestException('Missing audio file');
    return this.toeic.listen(file, sessionId || 'default');
  }
}
