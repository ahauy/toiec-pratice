import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      groq: !!process.env.GROQ_API_KEY?.trim(),
      gemini: !!process.env.GEMINI_API_KEY?.trim(),
    };
  }
}
