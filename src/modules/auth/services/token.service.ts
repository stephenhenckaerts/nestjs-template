import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { v4 as uuidv4 } from 'uuid'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { RefreshToken, type RefreshTokenInterface, type RefreshTokenPayload } from '../entities/refreshtoken.entity.js'
import { type AccessTokenInterface, type AccessTokenPayload } from '../entities/accesstoken.entity.js'
import { type Client } from '../entities/client.entity.js'
import { type User } from '../../users/user.entity.js'

@Injectable()
export class TokenService {
  constructor (
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService
  ) {}

  private parseLifetime (lifetime?: string): number {
    const value = Number(lifetime)

    if (isNaN(value)) return 3600
    else return value
  }

  public getAccessTokenLifetime (): number {
    return this.parseLifetime(process.env.ACCESS_TOKEN_LIFETIME)
  }

  public getRefreshTokenLifetime (): number {
    return this.parseLifetime(process.env.REFRESH_TOKEN_LIFETIME)
  }

  async getAccessToken (token: string): Promise<AccessTokenInterface | false> {
    try {
      const decoded = this.jwtService.verify<AccessTokenPayload>(token)

      return {
        uid: decoded.uid,
        cid: decoded.cid,
        scope: decoded.scope,
        user: {
          uuid: decoded.uid,
          role: decoded.role
        },
        client: {
          uuid: decoded.cid,
          id: decoded.cid,
          scopes: decoded.scope,
          grants: ['password', 'refresh_token']
        },
        accessToken: token,
        accessTokenExpiresAt: new Date(decoded.exp * 1000)
      }
    } catch (e) {
      return false
    }
  }

  async generateAccessToken (
    client: Client, user: User, scope: string | string[]
  ): Promise<string> {
    if (typeof scope === 'string') scope = scope.split(' ')

    const payload: Omit<AccessTokenPayload, 'exp'> = {
      uid: user.uuid,
      cid: client.uuid,
      role: user.role,
      scope
    }

    return this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenLifetime(),
      algorithm: 'RS256'
    })
  }

  async getRefreshToken (token: string): Promise<RefreshTokenInterface | false> {
    try {
      const decoded = this.jwtService.verify<RefreshTokenPayload>(token)

      const refreshToken = await this.refreshTokenRepository.findOneOrFail({
        where: {
          uuid: decoded.tid
        },
        relations: {
          user: true,
          client: true
        }
      })

      return {
        tid: refreshToken.uuid,
        uid: refreshToken.user.uuid,
        cid: refreshToken.client.uuid,
        client: refreshToken.client,
        user: refreshToken.user,
        refreshToken: token,
        refreshTokenExpiresAt: new Date(decoded.exp * 1000)
      }
    } catch (e) {
      return false
    }
  }

  async generateRefreshToken (
    client: Client, user: User, scope: string | string[]
  ): Promise<string> {
    console.log('scope', scope)

    if (typeof scope === 'string') scope = scope.split(' ')

    const payload: Omit<RefreshTokenPayload, 'exp'> = {
      tid: uuidv4(),
      uid: user.uuid,
      cid: client.uuid,
      scope: scope ?? []
    }

    return this.jwtService.sign(payload, {
      expiresIn: this.getRefreshTokenLifetime(),
      algorithm: 'RS256'
    })
  }

  async revokeToken (token: RefreshTokenInterface): Promise<boolean> {
    await this.refreshTokenRepository.delete({
      uuid: token.tid
    })

    return true
  }

  async saveRefreshToken (token: string): Promise<void> {
    const decoded = this.jwtService.verify<RefreshTokenPayload>(token)

    await this.refreshTokenRepository.insert({
      uuid: decoded.tid,
      expiresAt: new Date(decoded.exp * 1000),
      userUuid: decoded.uid,
      clientUuid: decoded.cid,
      scope: decoded.scope
    })
  }
}