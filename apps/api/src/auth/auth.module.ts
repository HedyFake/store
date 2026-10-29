import {
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Global,
  Injectable,
  Module,
  Post,
  Get,
  Body,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { loginSchema, createUserSchema, type UserRole } from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { env } from '../config/env';
import { parseOrThrow } from '../common/zod.pipe';
import { randomToken, safeEqual, sha256 } from '../common/crypto';

export const SESSION_COOKIE = 'store_session';
export const CSRF_COOKIE = 'store_csrf';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthedUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw new UnauthorizedException('Autentikasi diperlukan');
  return req.user;
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Constant-time comparison even when user is missing
    const dummyHash = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8p4K1.H8G7w7Z0vY7x6Q8p9K0L1M2N';
    const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
    if (!user || !valid || user.status !== 'ACTIVE') {
      await this.audit.log({
        actorLabel: email,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Email atau password tidak sesuai.');
    }

    const rawToken = randomToken(32);
    const tokenHash = sha256(`${rawToken}:${env().AUTH_SECRET}`);
    const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);

    const session = await this.prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 250) ?? null,
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'Session',
      entityId: session.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const csrfToken = sha256(`csrf:${tokenHash}:${env().AUTH_SECRET}`).slice(0, 32);
    return {
      rawToken,
      csrfToken,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role as UserRole },
    };
  }

  async resolveSession(rawToken: string | undefined): Promise<{ user: AuthedUser; csrfToken: string } | null> {
    if (!rawToken || rawToken.length < 16) return null;
    const tokenHash = sha256(`${rawToken}:${env().AUTH_SECRET}`);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now() || session.user.status !== 'ACTIVE') {
      return null;
    }
    const csrfToken = sha256(`csrf:${tokenHash}:${env().AUTH_SECRET}`).slice(0, 32);
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role as UserRole,
        sessionId: session.id,
      },
      csrfToken,
    };
  }

  async logout(sessionId: string, actor: AuthedUser, meta: { ip?: string; userAgent?: string }) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
    await this.audit.log({
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'AUTH_LOGOUT',
      entityType: 'Session',
      entityId: sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async createStaffOrAdmin(input: { email: string; name: string; password: string; role: UserRole }, actor: AuthedUser) {
    if (actor.role !== 'OWNER' && input.role === 'OWNER') {
      throw new ForbiddenException('Hanya OWNER yang dapat membuat akun OWNER.');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
        role: input.role,
        status: 'ACTIVE',
      },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    });
    await this.audit.log({
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      after: created,
    });
    return created;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawToken =
      (req.cookies?.[SESSION_COOKIE] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined);
    const resolved = await this.auth.resolveSession(rawToken);
    if (!resolved) throw new UnauthorizedException('Silakan login sebagai admin terlebih dahulu.');

    // Enforce CSRF token on mutating requests when authenticated via cookie
    const method = req.method.toUpperCase();
    const usingCookie = Boolean(req.cookies?.[SESSION_COOKIE]);
    if (usingCookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const headerCsrf = (req.headers['x-csrf-token'] as string | undefined) ?? '';
      if (!headerCsrf || !safeEqual(headerCsrf, resolved.csrfToken)) {
        throw new ForbiddenException('Token CSRF tidak valid atau hilang.');
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? ['OWNER', 'ADMIN', 'STAFF'];

    if (!requiredRoles.includes(resolved.user.role)) {
      throw new ForbiddenException('Peran akun Anda tidak memiliki izin untuk aksi ini.');
    }
    req.user = resolved.user;
    return true;
  }
}

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const data = parseOrThrow(loginSchema, body);
    const result = await this.auth.login(data.email, data.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const isProd = env().NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, result.rawToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      expires: result.expiresAt,
      path: '/',
    });
    res.cookie(CSRF_COOKIE, result.csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      expires: result.expiresAt,
      path: '/',
    });
    return { user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const resolved = await this.auth.resolveSession(rawToken);
    if (resolved) {
      await this.auth.logout(resolved.user.sessionId, resolved.user, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const rawToken =
      (req.cookies?.[SESSION_COOKIE] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined);
    const resolved = await this.auth.resolveSession(rawToken);
    if (!resolved) return { authenticated: false, user: null };
    return { authenticated: true, user: resolved.user, csrfToken: resolved.csrfToken };
  }

  @Post('users')
  async createUser(@Body() body: unknown, @Req() req: Request) {
    const rawToken =
      (req.cookies?.[SESSION_COOKIE] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined);
    const resolved = await this.auth.resolveSession(rawToken);
    if (!resolved || !['OWNER', 'ADMIN'].includes(resolved.user.role)) {
      throw new ForbiddenException('Hanya OWNER/ADMIN yang dapat menambah pengguna.');
    }
    const data = parseOrThrow(createUserSchema, body);
    return this.auth.createStaffOrAdmin(data, resolved.user);
  }

  @Get('users')
  async listUsers(@Req() req: Request) {
    const rawToken =
      (req.cookies?.[SESSION_COOKIE] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined);
    const resolved = await this.auth.resolveSession(rawToken);
    if (!resolved || !['OWNER', 'ADMIN'].includes(resolved.user.role)) {
      throw new ForbiddenException('Akses ditolak');
    }
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, status: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}

