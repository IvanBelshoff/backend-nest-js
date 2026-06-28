import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';

import { UsersService } from './user.service';
import { createUserSchema, type CreateUserDto } from './dto/create-user.dto';
import { updateUserSchema, type UpdateUserDto } from './dto/update-user.dto';
import {
  updatePasswordSchema,
  type UpdatePasswordDto,
} from './dto/update-password.dto';
import {
  updateAuthenticationSchema,
  type UpdateAuthenticationDto,
} from './dto/update-authentication.dto';
import {
  copyAuthenticationSchema,
  type CopyAuthenticationDto,
} from './dto/copy-authentication.dto';
import {
  copyDashboardsSchema,
  type CopyDashboardsDto,
} from './dto/copy-dashboards.dto';
import {
  updateFavoritesSchema,
  type UpdateFavoritesDto,
} from './dto/update-favorites.dto';
import {
  assignDashboardsSchema,
  type AssignDashboardsDto,
} from './dto/assign-dashboards.dto';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { UploadPhoto } from 'src/shared/decorators/upload-photo.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
import { parsePagination, setTotalCount } from 'src/shared/dto/pagination.dto';

@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/')
  @Authorization('role', ['REGRA_ADMIN'])
  @ZodValidation(createUserSchema)
  @UploadPhoto('foto')
  async create(
    @Body() dto: CreateUserDto,
    @Request() req: UserRequest.UserRequest,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.usersService.create(dto, req.user, foto);
  }

  @Get('/')
  @Authorization('role', ['REGRA_USUARIO'])
  async findAll(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit, filter } = parsePagination(query, {
      defaultLimit: 7,
    });

    const { data, total } = await this.usersService.findAllPaginated(
      page,
      limit,
      filter,
    );

    setTotalCount(response, total);

    return data;
  }

  @Get('/ids')
  @Authorization('role', ['REGRA_USUARIO'])
  async getUserIds(@Query('id') id?: string) {
    const excludeId = id ? Number(id) : undefined;

    return this.usersService.getUserIds(excludeId);
  }

  @Get('/dashboards/:id')
  @Authorization('role', ['REGRA_DASHBOARD'])
  async getUsersByDashboard(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUsersByDashboard(id);
  }

  @Get('/:id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findByIdWithRelations(id);
  }

  @Public()
  @Get('/:id/foto')
  async findPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    const photo = await this.usersService.findPhotoFileByUserId(id);

    response.set({
      'Content-Type': photo.type,
    });

    return new StreamableFile(createReadStream(photo.path));
  }

  @Patch('/copy/authentication')
  @Authorization('role', ['REGRA_ADMIN'])
  @ZodValidation(copyAuthenticationSchema)
  async copyAuthentication(@Body() dto: CopyAuthenticationDto) {
    await this.usersService.copyRolesAndPermissions(
      dto.id_usuario,
      dto.id_copiado,
    );
  }

  @Patch('/copy/dashboards')
  @Authorization('role', ['REGRA_ADMIN'])
  @ZodValidation(copyDashboardsSchema)
  @HttpCode(204)
  async copyDashboards(@Body() dto: CopyDashboardsDto) {
    await this.usersService.copyDashboards(dto.id_usuario, dto.id_copiado);
  }

  @Patch('/dashboards/favorites/:id')
  @ZodValidation(updateFavoritesSchema)
  @HttpCode(204)
  async updateFavorites(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFavoritesDto,
  ) {
    await this.usersService.updateFavorites(id, dto.favoritos);
  }

  @Patch('/dashboards/:id')
  @Authorization('permission', ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'])
  @ZodValidation(assignDashboardsSchema)
  @HttpCode(204)
  async assignDashboards(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignDashboardsDto,
  ) {
    await this.usersService.assignDashboards(id, dto.dashboards);
  }

  @Patch('/authentication/:id')
  @Authorization('role', ['REGRA_ADMIN'])
  @ZodValidation(updateAuthenticationSchema)
  async updateAuthentication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAuthenticationDto,
  ) {
    await this.usersService.updateRolesAndPermissions(
      id,
      dto.regras,
      dto.permissoes,
    );
  }

  @Patch('/password/:id')
  @ZodValidation(updatePasswordSchema)
  async updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePasswordDto,
  ) {
    await this.usersService.updatePassword(id, dto.senha);
  }

  @Patch('/:id')
  @Authorization('permission', ['PERMISSAO_ATUALIZAR_USUARIO'])
  @ZodValidation(updateUserSchema)
  @UploadPhoto('foto')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Request() req: UserRequest.UserRequest,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.usersService.update(id, dto, req.user, foto);
  }

  @Delete('/photo/:id')
  @HttpCode(204)
  async deletePhoto(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.deletePhoto(id);
  }

  @Delete('/:id')
  @Authorization('permission', ['PERMISSAO_DELETAR_USUARIO'])
  @HttpCode(204)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.delete(id);
  }
}
