import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3UploadResult {
  bucket: string;
  key: string;
  filename: string;
  sizeBytes: number;
  downloadUrl: string;
  expiresInSeconds: number;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly configured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucketName =
      this.configService.get<string>('AWS_S3_ARTIFACTS_BUCKET') ||
      this.configService.get<string>('AWS_S3_BUCKET_NAME') ||
      '';

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (this.bucketName) {
      try {
        this.s3Client = new S3Client({
          region: this.region,
          ...(accessKeyId && secretAccessKey
            ? {
                credentials: {
                  accessKeyId,
                  secretAccessKey,
                },
              }
            : {}), // Si no hay llaves explícitas, el SDK usará automáticamente el IAM Role de la instancia EC2
        });
        this.configured = true;
        this.logger.log(`Amazon S3 configurado para bucket: '${this.bucketName}' en región '${this.region}'`);
      } catch (err: any) {
        this.logger.warn(`Error al inicializar cliente de Amazon S3: ${err?.message || err}`);
        this.s3Client = null;
        this.configured = false;
      }
    } else {
      this.logger.warn(
        'Variable AWS_S3_ARTIFACTS_BUCKET no configurada. El servicio de almacenamiento S3 operará en modo simulación/deshabilitado.',
      );
    }
  }

  /**
   * Indica si el cliente S3 está listo y configurado.
   */
  isConfigured(): boolean {
    return this.configured && this.s3Client !== null;
  }

  /**
   * Sube un archivo ZIP generado a Amazon S3 y devuelve su clave y URL prefirmada de descarga.
   * @param filename Nombre original del archivo (ej: uml-studio-export.zip)
   * @param buffer Buffer binario en memoria del ZIP
   * @param expiresInSeconds Tiempo de validez de la URL firmada (por defecto 15 minutos = 900s)
   */
  async uploadZip(filename: string, buffer: Buffer, expiresInSeconds = 900): Promise<S3UploadResult> {
    if (!this.isConfigured() || !this.s3Client) {
      throw new ServiceUnavailableException(
        'El almacenamiento en Amazon S3 no está configurado. Verifique las variables AWS_S3_ARTIFACTS_BUCKET y AWS_REGION en su archivo .env.',
      );
    }

    const timestamp = Date.now();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `exports/${timestamp}_${cleanFilename}`;

    try {
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'application/zip',
        Metadata: {
          originalFilename: cleanFilename,
          generatedAt: new Date().toISOString(),
          source: 'UML-Studio-CodeGenerator',
        },
      });

      await this.s3Client.send(putCommand);
      this.logger.log(`Artefacto ZIP subido exitosamente a S3: s3://${this.bucketName}/${key} (${buffer.length} bytes)`);

      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: expiresInSeconds,
      });

      return {
        bucket: this.bucketName,
        key,
        filename: cleanFilename,
        sizeBytes: buffer.length,
        downloadUrl,
        expiresInSeconds,
      };
    } catch (error: any) {
      this.logger.error(`Fallo al subir archivo a Amazon S3: ${error?.message || error}`, error?.stack);
      throw new BadRequestException(`No se pudo subir el archivo al almacenamiento S3: ${error?.message || error}`);
    }
  }

  /**
   * Genera una URL prefirmada de descarga para un archivo existente en S3.
   */
  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    if (!this.isConfigured() || !this.s3Client) {
      throw new ServiceUnavailableException('Amazon S3 no está configurado.');
    }

    const getCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, getCommand, { expiresIn: expiresInSeconds });
  }
}
