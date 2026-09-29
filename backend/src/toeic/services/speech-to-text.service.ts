import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Uses Gemini's native audio understanding to transcribe spoken TOEIC questions.
 * No separate STT provider needed – same API key as the answer step.
 */
@Injectable()
export class SpeechToTextService {
  constructor(private readonly config: ConfigService) {}

  async transcribe(file: Express.Multer.File): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    // Convert audio buffer to base64 for Gemini inline data
    const audioB64 = file.buffer.toString('base64');

    // Detect MIME type from the uploaded file (webm, mp4, ogg, wav, …)
    const mimeType = (file.mimetype || 'audio/webm') as string;

    const body = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: audioB64,
              },
            },
            {
              text: `Listen to this audio clip carefully. It contains a TOEIC Speaking test question being read aloud by an examiner.
Transcribe EXACTLY what is spoken, word for word, including the question number if mentioned (e.g. "Question 1", "Question number 3").
Output ONLY the raw transcript. No labels, no punctuation changes, no explanations.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
      },
    };

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new UnprocessableEntityException(`Gemini STT failed: ${err}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) throw new UnprocessableEntityException('Gemini returned empty transcript');
    return text;
  }
}
