// src/auth/supabase-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTPayload,
  FlattenedJWSInput,
  JWSHeaderParameters,
} from 'jose';

// #419 — this guard used to validate every request's token by calling
// `supabase.auth.getUser(token)`, which is a network round-trip out to
// Supabase's remote Auth API on every single authenticated request (this
// guard runs in front of nearly every endpoint in the app). Measuring live
// via the Network tab showed every authenticated request — regardless of
// what it actually did — taking roughly the same 1-2.5s, including
// trivial ones (a single-row profile lookup) and even 304 Not Modified
// responses; that uniform tax pointed straight at this remote call as the
// dominant bottleneck, well beyond anything query-shape fixes (#417)
// could address.
//
// First pass verified locally with the project's shared JWT secret
// (HS256, via `jsonwebtoken`). Supabase's own docs actively recommend
// against that: the dashboard's "Legacy JWT Secret" page now steers new
// projects toward "JWT Signing Keys" (asymmetric ES256/RS256), verified
// against the project's public JWKS endpoint instead of a shared secret —
// no secret to generate, store, share with a colleague, or rotate by
// hand, and a leaked/compromised secret can't be used to forge tokens.
// `createRemoteJWKSet` fetches and caches that public key set itself, so
// verification below still costs no per-request round trip to Supabase —
// same performance win as the shared-secret approach, just without a
// secret in the mix. `request.user` used to be Supabase's full User
// object (id, email, metadata, etc.), but a repo-wide check found every
// call site only ever reads `.id` off it — so the verified token's `sub`
// claim (the standard JWT subject, which Supabase sets to the user's id)
// covers every existing usage.
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly jwks: (
    protectedHeader?: JWSHeaderParameters,
    token?: FlattenedJWSInput,
  ) => Promise<CryptoKey>;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');

    if (!supabaseUrl) {
      throw new Error(
        'SUPABASE_URL must be set in .env for SupabaseAuthGuard to work',
      );
    }

    // #419 — createRemoteJWKSet caches the fetched key set in memory and
    // only re-fetches on a cache miss (e.g. Supabase rotating keys), so
    // this is not a per-request network call.
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1]; // "Bearer <token>"

    if (!token) throw new UnauthorizedException('No token provided');

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks);
      if (!result.payload.sub) {
        throw new UnauthorizedException('Invalid token');
      }
      payload = result.payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // #419 — `sub` is the standard JWT subject claim; Supabase sets it to
    // the authenticated user's id, matching what `data.user.id` used to
    // provide. Only `.id` is read off `request.user` anywhere in this
    // codebase (checked before making this change), so this minimal shape
    // is a safe drop-in replacement for the old full User object.
    request.user = { id: payload.sub };
    return true;
  }
}
