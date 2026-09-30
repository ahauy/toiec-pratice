import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ToeicService } from './toeic.service';
import { AppTokenGuard } from './app-token.guard';
import { Part } from './tracker';
import { ToeicEvent } from './dto/events';

const SESSION_ID = /^[\w-]{8,64}$/;

@Controller('toeic')
@UseGuards(AppTokenGuard)
export class ToeicController {
  constructor(private readonly toeic: ToeicService) {}

  /** Set (or correct) the current position of a practice session. */
  @Post('session')
  session(@Body() body: { sessionId?: string; part?: number; question?: number }) {
    if (!body?.sessionId || !SESSION_ID.test(body.sessionId)) throw new BadRequestException('Invalid sessionId');
    const part = [1, 2, 3, 4].includes(Number(body.part)) ? (Number(body.part) as Part) : undefined;
    const question = Number.isInteger(body.question) ? Number(body.question) : undefined;
    return this.toeic.setPosition(body.sessionId, part, question);
  }

  /**
   * One utterance (16 kHz mono WAV) in, newline-delimited JSON events out:
   * transcript -> position -> item | set -> done. Events are flushed as soon as they exist.
   */
  @Post('chunk')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async chunk(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('seq') seq: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!file?.buffer?.length) throw new BadRequestException('Missing audio file');
    if (!sessionId || !SESSION_ID.test(sessionId)) throw new BadRequestException('Invalid sessionId');
    if (file.buffer.subarray(0, 4).toString('ascii') !== 'RIFF') throw new BadRequestException('Audio must be WAV');

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (e: ToeicEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(e) + '\n');
    };
    try {
      await this.toeic.handleChunk(sessionId, Number(seq) || undefined, file.buffer, emit);
    } catch (e) {
      emit({ type: 'error', seq: Number(seq) || 0, stage: 'llm', message: (e as Error).message });
    } finally {
      res.end();
    }
  }
}
