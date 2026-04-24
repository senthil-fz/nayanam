import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthContext } from '../common/context';

export type AccessTokenPayload = {
  sub: string; // userId
  sid: string; // sessionId
  typ: 'access';
  iat: number;
  exp: number;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-me',
    });
  }

  validate(payload: AccessTokenPayload): AuthContext {
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
