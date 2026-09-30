import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Optional shared secret. When APP_TOKEN is set on the server, every request must send the
 * same value in the `x-app-token` header. It only keeps strangers from burning your free quota;
 * it is not real authentication (the token ships inside the frontend bundle).
 */
@Injectable()
export class AppTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.APP_TOKEN?.trim();
    if (!expected) return true;
    const got = ctx.switchToHttp().getRequest().headers['x-app-token'];
    if (got !== expected) throw new UnauthorizedException('Bad app token');
    return true;
  }
}
