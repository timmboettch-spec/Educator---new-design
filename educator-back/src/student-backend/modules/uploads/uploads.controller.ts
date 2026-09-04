import * as path from 'path';

import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

import { UploadsService } from './uploads.service';

@ApiTags('Student-backend: Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post('image')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', new UploadsService().getMulterConfig()))
  @ApiOperation({ summary: 'Upload an image file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (jpeg, png, gif, webp) - Max 5MB',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image uploaded successfully',
    schema: {
      example: {
        success: true,
        filename: 'image-1234567890.jpg',
        url: '/uploads/image-1234567890.jpg',
        message: 'Image uploaded successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or file too large',
  })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const imageUrl = await this.uploadsService.uploadFileToAzure(file);

    return {
      success: true,
      filename: path.basename(imageUrl),
      url: imageUrl,
      message: 'Image uploaded successfully',
    };
  }

  @Post('file')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', new UploadsService().getFileMulterConfig()))
  @ApiOperation({ summary: 'Upload a document file (PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file (pdf) - Max 20MB',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File uploaded successfully',
    schema: {
      example: {
        success: true,
        filename: 'document-123.pdf',
        url: 'https://asaqarwai.blob.core.windows.net/local-pc-images/document-123.pdf',
        message: 'File uploaded successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or file too large',
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileUrl = await this.uploadsService.uploadFileToAzure(file);

    return {
      success: true,
      filename: path.basename(fileUrl),
      url: fileUrl,
      message: 'File uploaded successfully',
    };
  }

  @Delete('file')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an uploaded file' })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'File deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file URL or file not found',
  })
  async deleteFile(@Body() body: { url: string }) {
    if (!body.url) {
      throw new BadRequestException('File URL is required');
    }

    const result = await this.uploadsService.deleteFile(body.url);

    if (!result) {
      throw new BadRequestException('File not found or could not be deleted');
    }

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}
