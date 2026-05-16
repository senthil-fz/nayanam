import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthContext } from '../common/context';
import { PrismaService } from '../prisma/prisma.service';

export type AccessTokenPayload = {
  sub: string; // userId
  sid: string; // sessionId
  typ: 'access';
  iat: number;
  exp: number;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Pin the algorithm to prevent algorithm-confusion attacks (e.g. alg:none,
      // or a future key-change that inadvertently enables RS256/HS512 acceptance).
      algorithms: ['HS256'],
    });
  }

  /**
   * Called by Passport after the JWT signature is verified.
   * Additionally checks that the session has not been revoked or expired —
   * ensures that logout(), role downgrade, or account deletion takes effect
   * immediately rather than after the 15-minute JWT TTL.
   *
   * SECURITY: This adds one DB round-trip per authenticated request.
   * A Redis session-validity cache can be added later if p99 latency warrants it.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthContext> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session revoked or expired.');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
