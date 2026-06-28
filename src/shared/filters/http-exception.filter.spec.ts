import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ url: '/test' }),
      }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it('formats HttpException responses with standard envelope', () => {
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException('Invalid payload'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid payload',
        path: '/test',
        timestamp: expect.any(String),
      }),
    );
  });

  it('maps generic Error to 500', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('database exploded'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: expect.any(String),
      }),
    );
  });

  it('preserves HttpException status codes', () => {
    const { host, status } = createHost();

    filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
  });
});
