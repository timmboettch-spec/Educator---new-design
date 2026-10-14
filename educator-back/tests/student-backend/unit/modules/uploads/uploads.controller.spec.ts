import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { UploadsController } from '@/modules/uploads/uploads.controller';
import { UploadsService } from '@/modules/uploads/uploads.service';
import { BadRequestException } from '@nestjs/common';
import { Stream } from 'stream';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

describe('UploadsController', () => {
  let controller: UploadsController;
  let service: UploadsService;

  // Define mock file
  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    destination: './public/uploads',
    filename: 'test-1234.pdf',
    path: './public/uploads/test-1234.pdf',
    buffer: Buffer.from([]),
    stream: new Stream.Readable(),
  };

  const mockUploadsService = {
    uploadFileToAzure: jest.fn().mockResolvedValue('https://mock-azure.com/test-1234.pdf'),
    getMulterConfig: jest.fn(),
    getFileMulterConfig: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        {
          provide: UploadsService,
          useValue: mockUploadsService,
        },
      ],
    })
      .compile();

    controller = module.get<UploadsController>(UploadsController);
    service = module.get<UploadsService>(UploadsService);
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload a valid PDF file successfully', async () => {
      mockUploadsService.uploadFileToAzure.mockResolvedValue(
        'https://mock-azure.com/test-1234.pdf',
      );

      const result = await controller.uploadFile(mockFile);

      expect(result).toEqual({
        success: true,
        filename: 'test-1234.pdf',
        url: 'https://mock-azure.com/test-1234.pdf',
        message: 'File uploaded successfully',
      });
      expect(service.uploadFileToAzure).toHaveBeenCalledWith(mockFile);
    });

    it('should throw BadRequestException if no file is uploaded', async () => {
      await expect(
        controller.uploadFile(undefined as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadImage', () => {
    const mockImageFile = {
      ...mockFile,
      originalname: 'test.png',
      mimetype: 'image/png',
      filename: 'test-1234.png',
    };

    it('should upload a valid image file successfully', async () => {
      mockUploadsService.uploadFileToAzure.mockResolvedValue(
        'https://mock-azure.com/test-1234.png',
      );

      const result = await controller.uploadImage(mockImageFile);

      expect(result).toEqual({
        success: true,
        filename: 'test-1234.png',
        url: 'https://mock-azure.com/test-1234.png',
        message: 'Image uploaded successfully',
      });
      expect(service.uploadFileToAzure).toHaveBeenCalledWith(mockImageFile);
    });

    it('should throw BadRequestException if no file is uploaded', async () => {
      await expect(
        controller.uploadImage(undefined as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      const result = await controller.deleteFile({
        url: 'https://mock-azure.com/test.pdf',
      });
      expect(result).toEqual({
        success: true,
        message: 'File deleted successfully',
      });
      expect(service.deleteFile).toHaveBeenCalledWith('https://mock-azure.com/test.pdf');
    });

    it('should throw error if service fails to delete', async () => {
      mockUploadsService.deleteFile.mockResolvedValue(false);
      await expect(controller.deleteFile({ url: 'invalid' })).rejects.toThrow(BadRequestException);
    });
  });
});
